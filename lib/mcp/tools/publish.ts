import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buckets, completeMultipart, headObject, presignPart, putObject } from "@/lib/r2";
import { createVersionForUpload, UploadError } from "@/lib/upload/create";
import { enqueueIngest } from "@/lib/jobs/trigger";
import { MAX_UPLOAD_BYTES, PART_SIZE, SINGLE_PUT_THRESHOLD, extensionOf } from "@/lib/contracts/upload";
import { buildZip } from "@/lib/mcp/zip";
import type { TokenAuth } from "@/lib/mcp/auth";
import { assertPublishRate, gameUrls, guarded, handleOf, ok, ownedGame, previewUrl, ToolError } from "@/lib/mcp/tools/shared";

const MAX_INLINE_BYTES = 3 * 1024 * 1024;
const MAX_URL_BYTES = 25 * 1024 * 1024;

const category = z.enum(["arcade", "puzzle", "reaction", "ambient", "rhythm", "racing", "cozy", "horror", "experimental", "other"]);
const orientation = z.enum(["portrait", "landscape", "any"]);

const publishInput = z
  .object({
    title: z.string().min(1).max(80).describe("Game title"),
    tagline: z.string().max(140).optional(),
    description: z.string().max(4000).optional(),
    category: category.optional(),
    tags: z.array(z.string().max(24)).max(5).optional(),
    orientation: orientation.default("any"),
    prompt: z.string().max(8000).optional().describe("The prompt that generated the game (shown on the game page)"),
    model: z.string().max(80).optional().describe("Model used, e.g. 'Claude Sonnet 4.5'"),
    agent: z.string().max(80).optional().describe("Tool used, e.g. 'Claude Code'"),
    game_id: z.string().uuid().optional().describe("Publish as a new version of an existing game"),
    changelog: z.string().max(500).optional(),
    publish_when_ready: z.boolean().default(true).describe("Publish automatically once processing succeeds"),
    files: z
      .array(z.object({ path: z.string().regex(/^[\w\-./ ]{1,240}$/), content_base64: z.string() }))
      .min(1)
      .max(40)
      .optional()
      .describe("Inline files (total under 3 MB decoded). Use create_upload for bigger bundles."),
    upload_id: z.string().uuid().optional().describe("An upload session from create_upload"),
    upload_parts: z.array(z.object({ part_number: z.number().int().min(1), etag: z.string() })).optional().describe("ETags returned by the multipart PUTs"),
    bundle_url: z.string().url().optional().describe("Public https URL of a .zip or .html (under 25 MB)"),
  })
  .refine((v) => [v.files, v.upload_id, v.bundle_url].filter(Boolean).length === 1, { message: "Provide exactly one of files, upload_id or bundle_url." });

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function applyMeta(gameId: string, versionId: string, input: z.infer<typeof publishInput>) {
  const admin = createAdminClient();
  await admin
    .from("games")
    .update({
      title: input.title,
      tagline: input.tagline ?? null,
      description: input.description ?? null,
      category: input.category ?? "arcade",
      orientation: input.orientation,
    })
    .eq("id", gameId);
  await admin.from("game_versions").update({ prompt: input.prompt ?? null, model: input.model ?? null, agent: input.agent ?? null, changelog: input.changelog ?? null, auto_publish: input.publish_when_ready }).eq("id", versionId);
  if (input.tags?.length) {
    const names = Array.from(new Set(input.tags.map((t) => t.toLowerCase().trim()).filter((t) => /^[a-z0-9][a-z0-9 -]{0,23}$/.test(t))));
    if (names.length) {
      await admin.from("tags").upsert(names.map((name) => ({ name })), { onConflict: "name", ignoreDuplicates: true });
      const { data: rows } = await admin.from("tags").select("id").in("name", names);
      await admin.from("game_tags").delete().eq("game_id", gameId);
      if (rows?.length) await admin.from("game_tags").insert(rows.map((r) => ({ game_id: gameId, tag_id: r.id })));
    }
  }
}

export function registerPublishTools(server: McpServer, auth: TokenAuth) {
  server.registerTool(
    "publish_game",
    {
      title: "Publish a game to Habiv",
      description:
        "Uploads a game (single index.html or a zip of html/js/assets) and publishes it under your handle once processing succeeds. " +
        "Inline `files` must total under 3 MB decoded; for bigger bundles call create_upload first and pass its upload_id. " +
        "Returns ids and the canonical URL; poll get_publish_status until status is 'ready'.",
      inputSchema: publishInput,
    },
    (args) =>
      guarded(async () => {
        await assertPublishRate(auth);
        const admin = createAdminClient();
        const b = buckets();

        if (args.upload_id) {
          const { data: session } = await admin.from("upload_sessions").select("*").eq("id", args.upload_id).eq("user_id", auth.userId).maybeSingle();
          if (!session) throw new ToolError("Upload session not found.", "not_found");
          if (session.status !== "open") throw new ToolError(`Upload session is ${session.status}.`, "closed");
          if (session.mode === "multipart") {
            if (!args.upload_parts?.length || !session.r2_upload_id) throw new ToolError("upload_parts (part_number + etag) are required to finish a multipart upload.", "invalid");
            await completeMultipart(b.uploads, session.key, session.r2_upload_id, args.upload_parts.map((p) => ({ PartNumber: p.part_number, ETag: p.etag })));
          }
          const head = await headObject(b.uploads, session.key);
          if (!head) throw new ToolError("The file has not arrived in storage yet. PUT it to the URL from create_upload first.", "missing_object");
          if (head.size > MAX_UPLOAD_BYTES) throw new ToolError("The uploaded file is over the size cap.", "too_large");
          await admin.from("upload_sessions").update({ status: "completed", size_bytes: head.size }).eq("id", session.id);
          await applyMeta(session.game_id, session.version_id, args);
          await admin.from("game_versions").update({ status: "processing", size_bytes: head.size, source: "mcp" }).eq("id", session.version_id);
          const run = await enqueueIngest(session.version_id);
          await admin.from("game_versions").update({ ingest_run_id: run.id }).eq("id", session.version_id);
          const g = await ownedGame(auth, session.game_id);
          return ok({ game_id: g.id, version_id: session.version_id, short_id: g.short_id, status: "processing", ...gameUrls(await handleOf(auth.userId), g.slug, g.short_id), status_hint: "Call get_publish_status with version_id until status is 'ready'." });
        }

        let bytes: Uint8Array;
        let filename: string;
        if (args.files) {
          const decoded = args.files.map((f) => ({ path: f.path.replace(/^\.?\//, ""), body: Buffer.from(f.content_base64, "base64") }));
          const total = decoded.reduce((n, f) => n + f.body.length, 0);
          if (total > MAX_INLINE_BYTES) throw new ToolError("Inline files are capped at 3 MB decoded. Use create_upload for bigger bundles.", "too_large");
          if (decoded.length === 1 && /\.html?$/i.test(decoded[0].path)) {
            bytes = decoded[0].body;
            filename = "index.html";
          } else {
            if (!decoded.some((f) => /(^|\/)index\.html?$/i.test(f.path))) throw new ToolError("Include an index.html in files.", "no_entry");
            bytes = buildZip(Object.fromEntries(decoded.map((f) => [f.path, new Uint8Array(f.body)])));
            filename = "bundle.zip";
          }
        } else {
          const url = args.bundle_url!;
          const head = await fetch(url, { method: "HEAD", redirect: "follow" }).catch(() => null);
          const len = Number(head?.headers.get("content-length") ?? 0);
          if (!head?.ok) throw new ToolError("Could not fetch bundle_url.", "fetch_failed");
          if (len > MAX_URL_BYTES) throw new ToolError("bundle_url files are capped at 25 MB. Use create_upload instead.", "too_large");
          const res = await fetch(url, { redirect: "follow" });
          if (!res.ok) throw new ToolError("Could not fetch bundle_url.", "fetch_failed");
          const buf = new Uint8Array(await res.arrayBuffer());
          if (buf.length > MAX_URL_BYTES) throw new ToolError("bundle_url files are capped at 25 MB.", "too_large");
          bytes = buf;
          const ext = extensionOf(new URL(url).pathname) || (buf[0] === 0x50 && buf[1] === 0x4b ? ".zip" : ".html");
          filename = ext === ".zip" ? "bundle.zip" : "index.html";
        }

        let created;
        try {
          created = await createVersionForUpload({
            userId: auth.userId,
            filename,
            sizeBytes: bytes.length,
            sha256: sha256(bytes),
            gameId: args.game_id ?? null,
            title: args.title,
            source: "mcp",
            agent: args.agent,
            model: args.model,
            prompt: args.prompt,
            changelog: args.changelog,
            autoPublish: args.publish_when_ready,
            serverWritesObject: true,
          });
        } catch (e) {
          if (e instanceof UploadError) throw new ToolError(e.message, e.code);
          throw e;
        }
        await applyMeta(created.gameId, created.versionId, args);
        if (created.mode !== "dedupe") {
          await putObject(b.uploads, created.key, bytes, filename.endsWith(".zip") ? "application/zip" : "text/html");
          await admin.from("game_versions").update({ status: "processing" }).eq("id", created.versionId);
          const run = await enqueueIngest(created.versionId);
          await admin.from("game_versions").update({ ingest_run_id: run.id }).eq("id", created.versionId);
        }
        const g = await ownedGame(auth, created.gameId);
        return ok({
          game_id: g.id,
          version_id: created.versionId,
          version: created.version,
          short_id: g.short_id,
          status: "processing",
          ...gameUrls(await handleOf(auth.userId), g.slug, g.short_id),
          status_hint: "Call get_publish_status with version_id until status is 'ready' (usually under a minute).",
        });
      }),
  );

  server.registerTool(
    "create_upload",
    {
      title: "Create an upload session for a large bundle",
      description:
        "Returns presigned URLs to PUT a zip (or html) up to 100 MB directly into storage. Single PUT under 20 MB; " +
        "multipart (8 MB parts, keep each response's ETag) above. Then call publish_game with upload_id (and upload_parts for multipart).",
      inputSchema: z.object({
        filename: z.string().min(1).max(255).describe("e.g. game.zip"),
        size_bytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
        sha256: z.string().regex(/^[0-9a-f]{64}$/).describe("Hex sha256 of the file"),
        game_id: z.string().uuid().optional().describe("Attach to an existing game as a new version"),
        title: z.string().min(1).max(80).optional(),
      }),
    },
    (args) =>
      guarded(async () => {
        let created;
        try {
          created = await createVersionForUpload({ userId: auth.userId, filename: args.filename, sizeBytes: args.size_bytes, sha256: args.sha256, gameId: args.game_id ?? null, title: args.title, source: "mcp" });
        } catch (e) {
          if (e instanceof UploadError) throw new ToolError(e.message, e.code);
          throw e;
        }
        if (created.mode === "dedupe") {
          return ok({ deduplicated: true, game_id: created.gameId, version_id: created.versionId, status: "processing", hint: "Identical bytes were already ingested; call publish_game with game_id to set metadata, or get_publish_status." });
        }
        const admin = createAdminClient();
        const { data: session } = await admin.from("upload_sessions").select("id, r2_upload_id").eq("version_id", created.versionId).maybeSingle();
        if (!session) throw new ToolError("Could not open an upload session.", "internal");
        if (created.mode === "single") {
          return ok({ upload_id: session.id, game_id: created.gameId, version_id: created.versionId, key: created.key, method: "put", url: created.putUrl, expires_at: created.expiresAt });
        }
        const n = Math.ceil(args.size_bytes / PART_SIZE);
        const parts = await Promise.all(Array.from({ length: n }, async (_, i) => ({ part_number: i + 1, url: await presignPart(buckets().uploads, created.key, session.r2_upload_id!, i + 1, 3600) })));
        return ok({ upload_id: session.id, game_id: created.gameId, version_id: created.versionId, key: created.key, method: "multipart", part_size: PART_SIZE, single_put_threshold: SINGLE_PUT_THRESHOLD, parts, expires_at: created.expiresAt });
      }),
  );

  server.registerTool(
    "get_publish_status",
    {
      title: "Check processing status of a version",
      description: "Returns the ingest status (uploaded, processing, ready, rejected), detected engine, warnings and URLs.",
      inputSchema: z.object({ version_id: z.string().uuid().optional(), game_id: z.string().uuid().optional() }).refine((v) => v.version_id || v.game_id, { message: "Pass version_id or game_id." }),
    },
    (args) =>
      guarded(async () => {
        const admin = createAdminClient();
        let q = admin.from("game_versions").select("id, game_id, version, status, engine, reject_reason, manifest, needs_isolation, uses_network, size_bytes, file_count").order("version", { ascending: false }).limit(1);
        q = args.version_id ? q.eq("id", args.version_id) : q.eq("game_id", args.game_id!);
        const { data: v } = await q.maybeSingle();
        if (!v) throw new ToolError("Version not found.", "not_found");
        const g = await ownedGame(auth, v.game_id);
        const manifest = (v.manifest ?? null) as { warnings?: string[]; notes?: string[] } | null;
        return ok({
          version_id: v.id,
          game_id: v.game_id,
          version: v.version,
          status: v.status,
          engine: v.engine,
          warnings: manifest?.warnings ?? [],
          notes: manifest?.notes ?? [],
          reject_reason: v.reject_reason,
          size_bytes: v.size_bytes,
          file_count: v.file_count,
          uses_network: v.uses_network,
          needs_isolation: v.needs_isolation,
          game_status: g.status,
          preview_url: v.status === "ready" ? previewUrl(v.id) : null,
          ...gameUrls(await handleOf(auth.userId), g.slug, g.short_id),
        });
      }),
  );
}
