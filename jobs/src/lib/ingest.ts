import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile, unlink } from "node:fs/promises";
import pLimit from "p-limit";
import type { EngineId, GameMeta, IngestManifest, IngestPayload, ManifestFile } from "../contracts/ingest";
import { admin, loadVersion, notify, setVersionStatus, type VersionRow } from "./supabase";
import { copyObject, deleteKeys, downloadToFile, NotFoundError, listPrefix, putBuffer, putStream } from "./storage";
import { jobEnv } from "./env";
import { entryBuffer, entryStream, openZip, type ZipEntry } from "./zip";
import { RejectError, validateEntries, extOf } from "./validate";
import { reroot } from "./reroot";
import { detectEngine } from "./detect";
import { normalizeHtml, planNormalization, scanJsForNetwork } from "./normalize";
import { cacheControlFor, contentTypeFor } from "./mime";
import { MAX_FILES, MAX_SINGLE_FILE } from "./limits";
import { needsConversion, type ConvertFn } from "./convert/needs";
import { SdkScanner } from "./sdk";
import { MAX_META_BYTES, META_FILE, readGameMeta } from "./game-meta";

/**
 * Turns an uploaded bundle into a servable game: validate, re-root, detect the engine, normalize
 * the entry html, write the files to the games bucket, then mark the version ready (and publish
 * it when auto_publish is set).
 *
 * Runs in the app (Vercel, via after() in lib/jobs/trigger.ts) and in the GitHub Actions jobs
 * workflow (src/cli.ts). Only the workflow has the engine converters, so `convert` is optional:
 * without it, a bundle that needs one comes back "deferred" and the version stays processing.
 */

export type IngestOptions = { convert?: ConvertFn; attempts?: number };

export type IngestResult =
  | { status: "ready"; engine: EngineId; files: number; bytes: number; already?: boolean }
  | { status: "rejected"; reason: string }
  | { status: "deferred"; engine: EngineId }
  | { status: "missing" };

type Outcome = {
  engine: EngineId;
  needsIsolation: boolean;
  usesNetwork: boolean;
  manifest: IngestManifest;
  sizeBytes: number;
  fileCount: number;
};

class DeferError extends Error {
  constructor(public engine: EngineId) {
    super(`${engine} bundle needs a conversion`);
  }
}

export async function runIngest(payload: IngestPayload, opts: IngestOptions = {}): Promise<IngestResult> {
  const attempts = opts.attempts ?? 2;
  const v = await loadVersion(payload.versionId);
  if (!v) {
    console.warn("ingest: version not found", payload);
    return { status: "missing" };
  }
  if (v.status === "ready") return { status: "ready", already: true, engine: (v.engine as EngineId) ?? "unknown", files: 0, bytes: v.size_bytes ?? 0 };
  // Stopped from My games (lib/actions/uploads.ts) before this run began. A retry sets "processing" first.
  if (v.status === "rejected") return { status: "rejected", reason: "aborted" };
  if (v.games?.status === "removed") {
    await reject(v, "aborted", "Game was removed.");
    return { status: "rejected", reason: "aborted" };
  }
  await setVersionStatus(v.id, { status: "processing" });

  for (let attempt = 1; ; attempt++) {
    try {
      const outcome = payload.dedupeFromVersionId ? await copyBundle(v, payload.dedupeFromVersionId) : await processUpload(v, opts.convert);
      if (!(await finalize(v, outcome))) return { status: "rejected", reason: "aborted" };
      return { status: "ready", engine: outcome.engine, files: outcome.fileCount, bytes: outcome.sizeBytes };
    } catch (e) {
      if (e instanceof DeferError) return { status: "deferred", engine: e.engine };
      if (e instanceof RejectError) {
        await reject(v, e.reason, e.message);
        return { status: "rejected", reason: e.reason };
      }
      const last = attempt >= attempts;
      console.error("ingest failed", { versionId: v.id, attempt, last, error: String(e) });
      if (last) {
        await reject(v, "internal_error", "Something went wrong while processing the bundle. Try again.");
        return { status: "rejected", reason: "internal_error" };
      }
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

/** Rejects a version by id, e.g. when the converter it needs is unavailable. */
export async function rejectVersion(versionId: string, reason: string, message: string) {
  const v = await loadVersion(versionId);
  if (v) await reject(v, reason, message);
}

async function processUpload(v: VersionRow, convert: ConvertFn | undefined): Promise<Outcome> {
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
      const sdk = new SdkScanner();
      sdk.scan(html, "index.html");
      const details = readGameMeta({ html });
      const norm = normalizeHtml(html, { paths: ["index.html"] });
      const body = Buffer.from(norm.html, "utf8");
      const ct = contentTypeFor("index.html");
      await putBuffer(games, `${prefix}/index.html`, body, { contentType: ct.type, cacheControl: cacheControlFor("index.html") });
      const files: ManifestFile[] = [{ p: "index.html", b: body.length, t: ct.type }];
      return {
        engine: det.engine,
        needsIsolation: det.needsIsolation,
        usesNetwork: norm.usesNetwork,
        manifest: {
          entry: "index.html",
          files,
          warnings: [...norm.warnings, ...details.warnings],
          engine: det.engine,
          notes: [...det.notes, ...hostNotes(norm.externalHosts)],
          sdk: sdk.result(),
          ...(details.meta ? { meta: details.meta } : {}),
        },
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
      // Scan the entry as uploaded, before the bridge tag is injected.
      const sdk = new SdkScanner();
      sdk.scan(entryHtml, rooted.entry);
      const metaFile = rooted.files.find((f) => f.path.toLowerCase() === META_FILE);
      let metaJson: string | null = null;
      if (metaFile && metaFile.entry.size > MAX_META_BYTES) warnings.push(`${META_FILE} is over ${MAX_META_BYTES / 1024} KB, so its game details were skipped.`);
      else if (metaFile) metaJson = (await entryBuffer(opened.zip, metaFile.entry, MAX_META_BYTES)).toString("utf8");
      const details = readGameMeta({ json: metaJson, html: entryHtml });
      warnings.push(...details.warnings);
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
        if (!convert) throw new DeferError(det.engine);
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
              const text = buf.toString("utf8");
              for (const h of scanJsForNetwork(text)) hosts.add(h);
              sdk.scan(text, path);
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
        manifest: {
          entry: "index.html",
          files,
          warnings: [...warnings, ...norm.warnings],
          engine: det.engine,
          notes: [...det.notes, ...hostNotes(externalHosts)],
          sdk: sdk.result(),
          ...(details.meta ? { meta: details.meta } : {}),
        },
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
    manifest: { entry: manifest?.entry ?? "index.html", files, warnings: ["Reused an identical bundle you uploaded before."], engine: (src.engine as EngineId) ?? "unknown", notes: manifest?.notes, sdk: manifest?.sdk, meta: manifest?.meta },
    sizeBytes: src.size_bytes ?? files.reduce((n, f) => n + f.b, 0),
    fileCount: files.length,
  };
}

/** False when the version was stopped or deleted while this run worked; its files are then removed. */
async function finalize(v: VersionRow, o: Outcome): Promise<boolean> {
  // Only a version still "processing" becomes ready, so Stop in My games wins over a run that was mid-way.
  const { data: marked, error } = await admin()
    .from("game_versions")
    .update({
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
    })
    .eq("id", v.id)
    .eq("status", "processing")
    .select("id");
  if (error) throw error;
  if (!marked?.length) {
    console.warn("ingest: version was stopped or deleted mid-run, dropping its files", { versionId: v.id });
    const keys = await listPrefix(jobEnv.gamesBucket(), `${v.game_id}/${v.id}/`).catch(() => [] as string[]);
    if (keys.length) await deleteKeys(jobEnv.gamesBucket(), keys).catch(() => undefined);
    return false;
  }

  // Before auto publish, so a game that goes live straight away already has its details.
  if (o.manifest.meta) await fillBlanks(v, o.manifest.meta).catch((e) => console.warn("filling details from the build failed", { versionId: v.id, error: String(e) }));

  if (v.auto_publish) {
    const { data: g } = await admin().from("games").select("status, hidden_reason, published_at").eq("id", v.game_id).maybeSingle();
    const blocked = !g || g.status === "removed" || (g.status === "hidden" && g.hidden_reason && g.hidden_reason !== "creator");
    if (blocked) console.warn("auto publish skipped", { gameId: v.game_id, status: g?.status, reason: g?.hidden_reason });
    else {
      const { error } = await admin()
        .from("games")
        .update({ status: "published", current_version_id: v.id, published_at: g.published_at ?? new Date().toISOString(), hidden_reason: null })
        .eq("id", v.game_id);
      if (error) console.warn("auto publish failed", { error: error.message });
    }
  }

  if (v.games?.creator_id) await notify(v.games.creator_id, "version_ready", v.game_id);
  return true;
}

/**
 * Copies the details a build declares (habiv.json, see game-meta.ts) into the game where it has
 * none yet. It never overwrites: whatever the creator typed or an MCP call passed wins, and a new
 * version's changed habiv.json is offered in the publish form rather than applied here.
 * Orientation and categories always hold a value, so they are only taken on a game's first version
 * while still at the column defaults.
 */
async function fillBlanks(v: VersionRow, meta: GameMeta) {
  const db = admin();
  const { data: g } = await db.from("games").select("tagline, description, controls, duration_sec, orientation, categories").eq("id", v.game_id).maybeSingle();
  if (!g) return;
  const patch: Record<string, unknown> = {};
  if (!g.tagline && meta.tagline) patch.tagline = meta.tagline;
  if (!g.description && meta.description) patch.description = meta.description;
  const c = (g.controls ?? {}) as { keys?: unknown[]; touch?: string | null };
  if (meta.controls && !c.keys?.length && !c.touch) patch.controls = meta.controls;
  if (g.duration_sec == null && meta.durationSec) patch.duration_sec = meta.durationSec;
  if (v.version === 1) {
    if (meta.orientation && g.orientation === "any") patch.orientation = meta.orientation;
    const current = (g.categories ?? []) as string[];
    if (meta.categories?.length && current.length <= 1 && (current[0] ?? "arcade") === "arcade") {
      const { data: known } = await db.from("categories").select("slug").in("slug", meta.categories).eq("active", true);
      const cats = meta.categories.filter((s) => known?.some((k) => k.slug === s));
      if (cats.length) Object.assign(patch, { categories: cats, category: cats[0] });
    }
  }
  if (Object.keys(patch).length) {
    const { error } = await db.from("games").update(patch).eq("id", v.game_id);
    if (error) throw error;
  }

  if (meta.tags?.length) {
    const { count } = await db.from("game_tags").select("tag_id", { count: "exact", head: true }).eq("game_id", v.game_id);
    if (!count) {
      await db.from("tags").upsert(meta.tags.map((name) => ({ name })), { onConflict: "name", ignoreDuplicates: true });
      const { data: rows } = await db.from("tags").select("id").in("name", meta.tags);
      if (rows?.length) await db.from("game_tags").insert(rows.map((r) => ({ game_id: v.game_id, tag_id: r.id })));
    }
  }

  const { data: ver } = await db.from("game_versions").select("model, agent, prompt, changelog").eq("id", v.id).maybeSingle();
  if (!ver) return;
  const vpatch: Record<string, unknown> = {};
  if (!ver.model && meta.model) vpatch.model = meta.model;
  if (!ver.agent && meta.agent) vpatch.agent = meta.agent;
  if (!ver.prompt && meta.prompt) vpatch.prompt = meta.prompt;
  if (!ver.changelog && meta.changelog && v.version > 1) vpatch.changelog = meta.changelog;
  if (Object.keys(vpatch).length) await db.from("game_versions").update(vpatch).eq("id", v.id);
}

async function reject(v: VersionRow, reason: string, message: string) {
  console.warn("rejecting version", { versionId: v.id, reason, message });
  await setVersionStatus(v.id, { status: "rejected", reject_reason: reason, manifest: { entry: "index.html", files: [], warnings: [message], engine: "unknown" } });
  if (v.games?.creator_id) await notify(v.games.creator_id, "version_rejected", v.game_id);
}

function hostNotes(hosts: string[]): string[] {
  return hosts.length ? [`Talks to: ${hosts.slice(0, 8).join(", ")}${hosts.length > 8 ? "…" : ""}`] : [];
}
