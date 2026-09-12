import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json, TablesUpdate } from "@/lib/supabase/database.types";
import { controlsSchema, toStoredControls } from "@/lib/contracts/game-details";
import { normalizeAgent, normalizeModel } from "@/lib/ai/catalog";
import { readSdk } from "@/lib/habiv/sdk";
import { buildDetailsForTools, readBuildDetails } from "@/lib/habiv/build-details";
import { readControls } from "@/lib/habiv/game-details";
import { siteUrl } from "@/lib/site";
import { buckets, completeMultipart, getObjectBytes, headObject, presignPart, putObject } from "@/lib/storage";
import { createVersionForUpload, UploadError } from "@/lib/upload/create";
import { enqueueIngest } from "@/lib/jobs/trigger";
import { MAX_UPLOAD_BYTES, PART_SIZE, SINGLE_PUT_THRESHOLD, extensionOf } from "@/lib/contracts/upload";
import { buildZip } from "@/lib/mcp/zip";
import { readBundle } from "@/lib/mcp/bundle";
import type { TokenAuth } from "@/lib/mcp/auth";
import { assertPublishRate, gameUrls, guarded, handleOf, ok, ownedGame, previewUrl, ToolError } from "@/lib/mcp/tools/shared";
import { RELAY_MAX_BYTES, relayUrl } from "@/lib/uploads/relay";

const MAX_INLINE_BYTES = 3 * 1024 * 1024;
const MAX_URL_BYTES = 25 * 1024 * 1024;
/** Unzipped size of a current version that keep_other_files will rebuild in memory. */
const MAX_MERGE_BYTES = 60 * 1024 * 1024;

const category = z.enum(["arcade", "puzzle", "reaction", "ambient", "rhythm", "racing", "cozy", "horror", "experimental", "other"]);
const orientation = z.enum(["portrait", "landscape", "any"]);

const publishInput = z
  .object({
    title: z.string().min(1).max(80).describe("Game title"),
    tagline: z.string().max(140).optional(),
    description: z.string().max(4000).optional().describe("About the game, shown on its page: the goal, how a round goes, tips and credits. Plain text; line breaks are kept"),
    category: category.optional(),
    categories: z.array(category).min(1).max(3).optional().describe("Up to 3 categories, main one first, for games that fit more than one. Wins over category"),
    tags: z.array(z.string().max(24)).max(5).optional(),
    orientation: orientation.optional(),
    prompt: z.string().max(8000).optional().describe("The prompt that generated the game (shown on the game page)"),
    model: z
      .string()
      .max(80)
      .optional()
      .describe("Model used, by name, e.g. 'Claude Sonnet 4.5'. Ids like 'claude-sonnet-4-5' are matched to Habiv's model list; anything else is saved as written"),
    agent: z.string().max(80).optional().describe("Tool or agent used, e.g. 'Claude Code', 'Codex', 'Cursor'. Matched to Habiv's tool list the same way"),
    controls: controlsSchema
      .optional()
      .describe("How to play: up to 6 { key, action } rows, e.g. { key: 'Space', action: 'Jump' }, plus an optional touch hint"),
    duration_sec: z.number().int().min(1).max(3600).optional().describe("Typical run length in seconds (3600 = endless). Runs of 45 s or less appear in Quick play"),
    game_id: z.string().uuid().optional().describe("Publish as a new version of an existing game"),
    changelog: z.string().max(500).optional(),
    publish_when_ready: z
      .boolean()
      .default(false)
      .describe("Make the game public automatically once processing succeeds. Leave false (the default) to save it as a draft the creator reviews and publishes; pass true only when the user asked for it to go live"),
    files: z
      .array(
        z
          .object({
            path: z.string().regex(/^[\w\-./ ]{1,240}$/),
            content: z.string().optional().describe("A text file (html, js, css, json, svg) exactly as written: no encoding"),
            content_base64: z.string().optional().describe("A binary file (image, audio, font) as base64"),
          })
          .refine((f) => (f.content === undefined) !== (f.content_base64 === undefined), { message: "Give each file either content (text) or content_base64 (binary)." }),
      )
      .min(1)
      .max(40)
      .optional()
      .describe(
        "Inline files, 3 MB in total. Put text files in content as they are; only binary files need content_base64. A single .zip (base64) is taken as the whole bundle. " +
          "Use create_upload for bigger bundles.",
      ),
    keep_other_files: z
      .boolean()
      .default(false)
      .describe("With game_id: send only the files you added or changed; every other file is copied from the current version"),
    delete_paths: z.array(z.string().max(240)).max(100).optional().describe("With keep_other_files: files to remove from the current version"),
    upload_id: z.string().uuid().optional().describe("An upload session from create_upload"),
    upload_parts: z.array(z.object({ part_number: z.number().int().min(1), etag: z.string() })).optional().describe("ETags returned by the multipart PUTs"),
    bundle_url: z.string().url().optional().describe("Public https URL of a .zip or .html (under 25 MB)"),
  })
  .refine((v) => [v.files, v.upload_id, v.bundle_url].filter(Boolean).length === 1, { message: "Provide exactly one of files, upload_id or bundle_url." })
  .refine((v) => !v.keep_other_files || (!!v.game_id && !!v.files), { message: "keep_other_files needs game_id and files." });

type InlineFile = { path: string; body: Uint8Array };
type Bundle = { bytes: Uint8Array; filename: string };
const isEntry = (p: string) => /(^|\/)index\.html?$/i.test(p);

/** Inline files as an upload: one html file as is, one zip as the bundle, anything else zipped (it needs an index.html). */
function inlineBundle(files: InlineFile[]): Bundle {
  if (files.length === 1 && /\.html?$/i.test(files[0].path)) return { bytes: files[0].body, filename: "index.html" };
  if (files.length === 1 && /\.zip$/i.test(files[0].path)) return { bytes: files[0].body, filename: "bundle.zip" };
  if (!files.some((f) => isEntry(f.path))) throw new ToolError("Include an index.html in files, or send the whole game as a single .zip.", "no_entry");
  return { bytes: buildZip(Object.fromEntries(files.map((f) => [f.path, f.body]))), filename: "bundle.zip" };
}

/**
 * The game's current version as it was uploaded, with `files` added or replaced and `remove`
 * deleted, so an update only sends what changed. It goes through ingest like any upload.
 */
async function mergedBundle(auth: TokenAuth, gameId: string, files: InlineFile[], remove: string[]): Promise<Bundle> {
  const g = await ownedGame(auth, gameId);
  const q = createAdminClient().from("game_versions").select("upload_key").eq("game_id", g.id);
  const { data: v } = g.current_version_id
    ? await q.eq("id", g.current_version_id).maybeSingle()
    : await q.eq("status", "ready").order("version", { ascending: false }).limit(1).maybeSingle();
  const stored = v?.upload_key ? await getObjectBytes(buckets().uploads, v.upload_key) : null;
  if (!v?.upload_key || !stored) throw new ToolError("The current version's original files aren't available. Send every file, without keep_other_files.", "no_base");
  let base: Record<string, Uint8Array>;
  try {
    base = readBundle(stored, /\.zip$/i.test(v.upload_key), MAX_MERGE_BYTES);
  } catch {
    throw new ToolError("The current version is too big to update file by file. Upload a full zip with create_upload.", "too_large");
  }
  for (const p of remove) delete base[p.replace(/^\.?\//, "")];
  for (const f of files) base[f.path] = f.body;
  const paths = Object.keys(base);
  if (!paths.some((p) => /\.html?$/i.test(p))) throw new ToolError("After the changes the game has no html file.", "no_entry");
  const out = paths.length === 1 ? { bytes: base[paths[0]], filename: "index.html" } : { bytes: buildZip(base), filename: "bundle.zip" };
  if (out.bytes.length > MAX_UPLOAD_BYTES) throw new ToolError("The updated bundle is over the 50 MB cap.", "too_large");
  return out;
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function applyMeta(gameId: string, versionId: string, input: z.infer<typeof publishInput>) {
  const admin = createAdminClient();
  // Only fields the call sets: a new version of an existing game keeps the rest (new games get column defaults).
  const patch: TablesUpdate<"games"> = { title: input.title };
  if (input.tagline !== undefined) patch.tagline = input.tagline;
  if (input.description !== undefined) patch.description = input.description;
  if (input.category !== undefined) patch.category = input.category;
  if (input.categories?.length) patch.categories = input.categories;
  if (input.orientation !== undefined) patch.orientation = input.orientation;
  if (input.controls !== undefined) patch.controls = toStoredControls(input.controls) as Json;
  if (input.duration_sec !== undefined) patch.duration_sec = input.duration_sec;
  await admin.from("games").update(patch).eq("id", gameId);
  await admin
    .from("game_versions")
    .update({ prompt: input.prompt ?? null, model: normalizeModel(input.model), agent: normalizeAgent(input.agent), changelog: input.changelog ?? null, auto_publish: input.publish_when_ready })
    .eq("id", versionId);
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
        "Uploads a game (single index.html or a zip of html/js/assets) as a private draft under your handle. " +
        "It goes public only with publish_when_ready: true, the publish_version tool, or the creator publishing it from My games. " +
        "Inline `files` must total under 3 MB: put html/js/css/json in `content` as plain text (no base64); only images and audio need content_base64. " +
        "For bigger bundles, or a zip already on disk, call create_upload first and pass its upload_id. " +
        "To update a game, pass game_id with keep_other_files: true and send only the files you changed (delete_paths removes files); the rest are copied from the current version. " +
        "Describe the game for its page: pass tagline, description (the goal, how a round goes, tips) and controls, and also put the same details in a habiv.json " +
        `at the bundle root (or a <script type="application/habiv+json"> block in index.html) so they travel with the code (${siteUrl}/docs/details). ` +
        "Arguments you pass win; habiv.json only fills fields that are still empty. " +
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
          if (session.status === "completed") {
            // Idempotent: a retry after a lost response, or after ingest never started, re-kicks ingest.
            await applyMeta(session.game_id, session.version_id, args);
            const { data: v } = await admin.from("game_versions").select("status, ingest_run_id").eq("id", session.version_id).maybeSingle();
            if (v && !v.ingest_run_id && (v.status === "processing" || v.status === "uploaded")) {
              const run = await enqueueIngest(session.version_id);
              await admin.from("game_versions").update({ status: "processing", ingest_run_id: run.id }).eq("id", session.version_id);
            }
            const status = !v || v.status === "uploaded" ? "processing" : v.status;
            const g = await ownedGame(auth, session.game_id);
            return ok({ game_id: g.id, version_id: session.version_id, short_id: g.short_id, status, ...gameUrls(await handleOf(auth.userId), g.slug, g.short_id), status_hint: "Call get_publish_status with version_id until status is 'ready'." });
          }
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
          const decoded = args.files.map((f) => ({
            path: f.path.replace(/^\.?\//, ""),
            body: f.content !== undefined ? Buffer.from(f.content, "utf8") : Buffer.from(f.content_base64!, "base64"),
          }));
          const total = decoded.reduce((n, f) => n + f.body.length, 0);
          if (total > MAX_INLINE_BYTES) throw new ToolError("Inline files are capped at 3 MB decoded. Use create_upload for bigger bundles.", "too_large");
          ({ bytes, filename } = args.keep_other_files ? await mergedBundle(auth, args.game_id!, decoded, args.delete_paths ?? []) : inlineBundle(decoded));
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
        "Returns URLs to PUT a zip (or html) up to 50 MB, so a file on disk never has to be pasted into a tool call. Up to 4 MB the url is on " +
        "habiv.com, which works from sandboxes that only reach allowed domains (allow www.habiv.com); storage_url is the direct alternative. " +
        "Above that the URLs go straight to storage: a single PUT under 20 MB, multipart (8 MB parts, keep each response's ETag) above. " +
        "Then call publish_game with upload_id (and upload_parts for multipart).",
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
          const viaHabiv =
            args.size_bytes <= RELAY_MAX_BYTES
              ? relayUrl({ key: created.key, contentType: extensionOf(args.filename) === ".zip" ? "application/zip" : "text/html", maxBytes: args.size_bytes, ttlSec: 3600 })
              : null;
          return ok({
            upload_id: session.id,
            game_id: created.gameId,
            version_id: created.versionId,
            key: created.key,
            method: "put",
            url: viaHabiv ?? created.putUrl,
            ...(viaHabiv ? { storage_url: created.putUrl } : {}),
            expires_at: created.expiresAt,
            next: "PUT the file to url (curl -X PUT --data-binary @game.zip '<url>'), then call publish_game with upload_id.",
          });
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
      description:
        "Returns the ingest status (uploaded, processing, ready, rejected), detected engine, warnings, the Habiv SDK features found in the build " +
        "(scores, runs, levels, beat, saves, happytime), the game details found in the build (habiv.json, or the page title and description) and URLs.",
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
        const sdk = readSdk(v.manifest);
        const sdkHint =
          v.status !== "ready" || !sdk
            ? undefined
            : sdk.features.includes("scores")
              ? g.leaderboard_enabled
                ? undefined
                : "The build sends scores: turn the leaderboard on with update_game { leaderboard: { enabled: true } }."
              : `No Habiv SDK score calls found, so a leaderboard would stay empty. To add one, call Habiv.scoreSubmit (see ${siteUrl}/docs/sdk).`;
        const missing = [!g.description && "description", !readControls(g.controls).keys.length && "how-to-play controls", !g.tagline && "tagline"].filter(Boolean);
        const detailsHint =
          v.status !== "ready" || !missing.length
            ? undefined
            : `The game page has no ${missing.join(", ")} yet. Write them from what you know about the game and call update_game, ` +
              `and add a habiv.json to the bundle so the next version carries them (${siteUrl}/docs/details).`;
        // Art the creator uploaded or picked is stored as u-*.webp or t-*.webp; anything else is the smoke screenshot.
        const artHint =
          v.status === "ready" && !/\/[ut]-\d+\.webp$/.test(g.cover_path ?? "")
            ? "The cover is an automatic screenshot. Offer designed store art: make_thumbnail with a ready-made design (list_thumbnail_designs) or your own HTML, " +
              "or an image you made via create_art_upload and set_game_art."
            : undefined;
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
          sdk_features: sdk?.features ?? null,
          ...(sdkHint ? { sdk_hint: sdkHint } : {}),
          build_details: buildDetailsForTools(readBuildDetails(v.manifest)),
          ...(detailsHint ? { details_hint: detailsHint } : {}),
          ...(artHint ? { art_hint: artHint } : {}),
          game_status: g.status,
          preview_url: v.status === "ready" ? previewUrl(v.id) : null,
          ...gameUrls(await handleOf(auth.userId), g.slug, g.short_id),
        });
      }),
  );
}
