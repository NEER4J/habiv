import { task, logger } from "@trigger.dev/sdk";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlink } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import pLimit from "p-limit";
import type { EngineId, IngestManifest, IngestPayload, ManifestFile } from "../contracts/ingest";
import { admin, loadVersion, notify, setVersionStatus, type VersionRow } from "../lib/supabase";
import { copyObject, downloadToFile, NotFoundError, listPrefix, putBuffer, putStream } from "../lib/r2";
import { jobEnv } from "../lib/env";
import { entryBuffer, entryStream, openZip, type ZipEntry } from "../lib/zip";
import { RejectError, validateEntries, extOf } from "../lib/validate";
import { reroot } from "../lib/reroot";
import { detectEngine } from "../lib/detect";
import { normalizeHtml, planNormalization, scanJsForNetwork } from "../lib/normalize";
import { cacheControlFor, contentTypeFor } from "../lib/mime";
import { MAX_FILES, MAX_SINGLE_FILE } from "../lib/limits";
import { smokeVersion } from "./smoke-version";
import { convert, needsConversion } from "../lib/convert";

type Outcome = {
  engine: EngineId;
  needsIsolation: boolean;
  usesNetwork: boolean;
  manifest: IngestManifest;
  sizeBytes: number;
  fileCount: number;
};

const MAX_ATTEMPTS = 2;

export const ingestVersion = task({
  id: "ingest-version",
  retry: { maxAttempts: MAX_ATTEMPTS },
  run: async (payload: IngestPayload, { ctx }) => {
    const v = await loadVersion(payload.versionId);
    if (!v) {
      logger.warn("version not found", payload);
      return { status: "missing" };
    }
    if (v.status === "ready") return { status: "ready", already: true };
    if (v.games?.status === "removed") {
      await reject(v, "aborted", "Game was removed.");
      return { status: "rejected" };
    }
    await setVersionStatus(v.id, { status: "processing" });

    try {
      const outcome = payload.dedupeFromVersionId ? await copyBundle(v, payload.dedupeFromVersionId) : await processUpload(v);
      await finalize(v, outcome);
      return { status: "ready", engine: outcome.engine, files: outcome.fileCount, bytes: outcome.sizeBytes };
    } catch (e) {
      if (e instanceof RejectError) {
        await reject(v, e.reason, e.message);
        return { status: "rejected", reason: e.reason };
      }
      const last = ctx.attempt.number >= MAX_ATTEMPTS;
      logger.error("ingest failed", { error: String(e), attempt: ctx.attempt.number, last });
      if (last) {
        await reject(v, "internal_error", "Something went wrong while processing the bundle. Try again.");
        return { status: "rejected", reason: "internal_error" };
      }
      throw e;
    }
  },
});

async function processUpload(v: VersionRow): Promise<Outcome> {
  if (!v.upload_key) throw new RejectError("source_expired", "No upload found for this version.");
  const uploads = jobEnv.uploadsBucket();
  const games = jobEnv.gamesBucket();
  const prefix = `${v.game_id}/${v.id}`;
  const tmp = join(tmpdir(), `habiv-${v.id}${extOf(v.upload_key) === "zip" ? ".zip" : ".html"}`);

  let uploadBytes: number;
  try {
    uploadBytes = await downloadToFile(uploads, v.upload_key, tmp);
  } catch (e) {
    if (e instanceof NotFoundError) throw new RejectError("source_expired", "The uploaded file expired before processing. Upload it again.");
    throw e;
  }

  try {
    if (extOf(v.upload_key) !== "zip") {
      const raw = await readFile(tmp);
      if (raw.length > MAX_SINGLE_FILE) throw new RejectError("file_too_large", "The html file is too large.");
      const html = raw.toString("utf8");
      const det = detectEngine(["index.html"], "index.html", html);
      const norm = normalizeHtml(html, { paths: ["index.html"] });
      const body = Buffer.from(norm.html, "utf8");
      const ct = contentTypeFor("index.html");
      await putBuffer(games, `${prefix}/index.html`, body, { contentType: ct.type, cacheControl: cacheControlFor("index.html") });
      const files: ManifestFile[] = [{ p: "index.html", b: body.length, t: ct.type }];
      return {
        engine: det.engine,
        needsIsolation: det.needsIsolation,
        usesNetwork: norm.usesNetwork,
        manifest: { entry: "index.html", files, warnings: norm.warnings, engine: det.engine, notes: [...det.notes, ...hostNotes(norm.externalHosts)] },
        sizeBytes: body.length,
        fileCount: 1,
      };
    }

    let opened;
    try {
      opened = await openZip(tmp);
    } catch (e) {
      throw new RejectError("corrupt_zip", `Could not read the zip: ${(e as Error).message}`);
    }
    try {
      const { kept, warnings } = validateEntries(opened.entries, uploadBytes);
      const rooted = reroot(kept);
      const byPath = new Map(rooted.files.map((f) => [f.path, f.entry]));
      const entryZip = byPath.get(rooted.entry)!;
      const entryHtml = (await entryBuffer(opened.zip, entryZip, MAX_SINGLE_FILE)).toString("utf8");
      const paths = rooted.files.map((f) => f.path);
      const det = detectEngine(paths, rooted.entry, entryHtml);
      const plan = planNormalization(paths, rooted.entry, det.engine);
      const norm = normalizeHtml(entryHtml, { paths });
      if (rooted.rerooted) warnings.push(`Used "${rooted.rerooted}" as the bundle root.`);
      for (const d of plan.drops) if (d !== "index.html") warnings.push(`Removed ${d} (service workers are not allowed).`);

      const finalPaths = rooted.files.filter((f) => !plan.drops.has(f.path)).map((f) => plan.renames.get(f.path) ?? f.path);
      if (finalPaths.length > MAX_FILES) throw new RejectError("too_many_files", `Bundles are capped at ${MAX_FILES} files.`);

      const hosts = new Set(norm.externalHosts);
      const limit = pLimit(8);
      const files: ManifestFile[] = [];
      let total = 0;

      // Engine conversions (Flash -> Ruffle, Scratch -> TurboWarp, .love -> love.js) may generate the entry.
      let sourceFiles = rooted.files;
      let entryHtmlOut = norm.html;
      if (needsConversion(det.engine, paths)) {
        const conv = await convert(det.engine, paths, (p) => entryBuffer(opened.zip, byPath.get(p)!, MAX_SINGLE_FILE), v.games?.title ?? "Game");
        warnings.push(...conv.notes);
        if (conv.replaceAll) sourceFiles = [];
        if (conv.indexHtml) {
          const n2 = normalizeHtml(conv.indexHtml, { paths: [...paths, ...conv.extra.map((e) => e.path)] });
          entryHtmlOut = n2.html;
          for (const h of n2.externalHosts) hosts.add(h);
          const body = Buffer.from(entryHtmlOut, "utf8");
          await putBuffer(games, `${prefix}/index.html`, body, { contentType: "text/html; charset=utf-8", cacheControl: cacheControlFor("index.html") });
          files.push({ p: "index.html", b: body.length, t: "text/html; charset=utf-8" });
          total += body.length;
          sourceFiles = sourceFiles.filter((f) => f.path !== rooted.entry && !/^index\.html?$/i.test(f.path));
        }
        await Promise.all(
          conv.extra.map((e) =>
            limit(async () => {
              const ct = contentTypeFor(e.path);
              await putBuffer(games, `${prefix}/${e.path}`, e.body, { contentType: ct.type, cacheControl: cacheControlFor(e.path), contentEncoding: ct.encoding });
              files.push({ p: e.path, b: e.body.length, t: ct.type, ...(ct.encoding ? { e: ct.encoding } : {}) });
              total += e.body.length;
            }),
          ),
        );
      }

      await Promise.all(
        sourceFiles.map((f) =>
          limit(async () => {
            if (plan.drops.has(f.path)) return;
            const path = plan.renames.get(f.path) ?? f.path;
            const ct = contentTypeFor(path);
            const cache = cacheControlFor(path);
            if (f.path === rooted.entry) {
              const body = Buffer.from(entryHtmlOut, "utf8");
              await putBuffer(games, `${prefix}/${path}`, body, { contentType: ct.type, cacheControl: cache });
              files.push({ p: path, b: body.length, t: ct.type });
              total += body.length;
              return;
            }
            const isJs = /\.(m?js|cjs)$/i.test(path);
            if (isJs && f.entry.size <= 4 * 1024 * 1024) {
              const buf = await entryBuffer(opened.zip, f.entry, MAX_SINGLE_FILE);
              for (const h of scanJsForNetwork(buf.toString("utf8"))) hosts.add(h);
              await putBuffer(games, `${prefix}/${path}`, buf, { contentType: ct.type, cacheControl: cache, contentEncoding: ct.encoding });
              files.push({ p: path, b: buf.length, t: ct.type, ...(ct.encoding ? { e: ct.encoding } : {}) });
              total += buf.length;
              return;
            }
            const stream = await entryStream(opened.zip, f.entry as ZipEntry);
            await putStream(games, `${prefix}/${path}`, stream, { contentType: ct.type, cacheControl: cache, contentEncoding: ct.encoding });
            files.push({ p: path, b: f.entry.size, t: ct.type, ...(ct.encoding ? { e: ct.encoding } : {}) });
            total += f.entry.size;
          }),
        ),
      );

      files.sort((a, b) => a.p.localeCompare(b.p));
      const externalHosts = [...hosts].sort();
      return {
        engine: det.engine,
        needsIsolation: det.needsIsolation,
        usesNetwork: externalHosts.length > 0,
        manifest: { entry: "index.html", files, warnings: [...warnings, ...norm.warnings], engine: det.engine, notes: [...det.notes, ...hostNotes(externalHosts)] },
        sizeBytes: total,
        fileCount: files.length,
      };
    } finally {
      opened.close();
    }
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

/** Same bytes were already ingested for this creator: copy the extracted bundle instead of re-processing. */
async function copyBundle(v: VersionRow, sourceVersionId: string): Promise<Outcome> {
  const src = await loadVersion(sourceVersionId);
  if (!src || src.status !== "ready" || !src.bundle_prefix) throw new RejectError("source_expired", "The original bundle is no longer available.");
  const games = jobEnv.gamesBucket();
  const prefix = `${v.game_id}/${v.id}`;
  const manifest = (src.manifest ?? null) as IngestManifest | null;
  const keys = manifest?.files?.length ? manifest.files.map((f) => `${src.bundle_prefix}/${f.p}`) : await listPrefix(games, `${src.bundle_prefix}/`);
  const limit = pLimit(8);
  await Promise.all(keys.map((k) => limit(() => copyObject(games, k, `${prefix}/${k.slice(src.bundle_prefix!.length + 1)}`))));
  const files: ManifestFile[] = manifest?.files ?? keys.map((k) => ({ p: k.slice(src.bundle_prefix!.length + 1), b: 0, t: contentTypeFor(k).type }));
  return {
    engine: (src.engine as EngineId) ?? "unknown",
    needsIsolation: src.needs_isolation,
    usesNetwork: src.uses_network,
    manifest: { entry: manifest?.entry ?? "index.html", files, warnings: ["Reused an identical bundle you uploaded before."], engine: (src.engine as EngineId) ?? "unknown", notes: manifest?.notes },
    sizeBytes: src.size_bytes ?? files.reduce((n, f) => n + f.b, 0),
    fileCount: files.length,
  };
}

async function finalize(v: VersionRow, o: Outcome) {
  await setVersionStatus(v.id, {
    status: "ready",
    engine: o.engine,
    entry_path: o.manifest.entry,
    bundle_prefix: `${v.game_id}/${v.id}`,
    size_bytes: o.sizeBytes,
    file_count: o.fileCount,
    needs_isolation: o.needsIsolation,
    uses_network: o.usesNetwork,
    manifest: o.manifest,
    reject_reason: null,
  });

  if (v.auto_publish) {
    const { data: g } = await admin().from("games").select("status, hidden_reason, published_at").eq("id", v.game_id).maybeSingle();
    const blocked = !g || g.status === "removed" || (g.status === "hidden" && g.hidden_reason && g.hidden_reason !== "creator");
    if (blocked) logger.warn("auto publish skipped", { gameId: v.game_id, status: g?.status, reason: g?.hidden_reason });
    else {
      const { error } = await admin()
        .from("games")
        .update({ status: "published", current_version_id: v.id, published_at: g.published_at ?? new Date().toISOString(), hidden_reason: null })
        .eq("id", v.game_id);
      if (error) logger.warn("auto publish failed", { error: error.message });
    }
  }

  if (v.games?.creator_id) await notify(v.games.creator_id, "version_ready", v.game_id);

  try {
    await smokeVersion.trigger({ versionId: v.id });
  } catch (e) {
    logger.warn("could not trigger follow-up tasks", { error: String(e) });
  }
}

async function reject(v: VersionRow, reason: string, message: string) {
  logger.warn("rejecting version", { versionId: v.id, reason, message });
  await setVersionStatus(v.id, { status: "rejected", reject_reason: reason, manifest: { entry: "index.html", files: [], warnings: [message], engine: "unknown" } });
  if (v.games?.creator_id) await notify(v.games.creator_id, "version_rejected", v.game_id);
}

function hostNotes(hosts: string[]): string[] {
  return hosts.length ? [`Talks to: ${hosts.slice(0, 8).join(", ")}${hosts.length > 8 ? "…" : ""}`] : [];
}
