import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ART_MAX_BYTES, saveGameArt } from "@/lib/art";
import { buckets, deleteObject, getObjectBytes, presignPut } from "@/lib/storage";
import { cdnUrl } from "@/lib/site";
import { CARD, COVER, THUMB_MODES, THUMB_STYLES, THUMB_THEMES, hexToThumbColor, renderThumb, type ThumbOptions, type ThumbStyleId } from "@/lib/thumbs/styles";
import { queueThumbJob, readThumbJob, writeThumbJob } from "@/lib/thumbs/jobs";
import { THUMB_SIZES, type ThumbKind } from "@/lib/contracts/thumb-job";
import { relayUrl } from "@/lib/uploads/relay";
import type { TokenAuth } from "@/lib/mcp/auth";
import { guarded, handleOf, ok, ownedGame, refreshGame, ToolError } from "@/lib/mcp/tools/shared";

const PICKABLE = THUMB_STYLES.filter((s) => s.group !== "baseline");
const styleIds = PICKABLE.map((s) => s.id) as [ThumbStyleId, ...ThumbStyleId[]];
const themeIds = THUMB_THEMES.map((t) => t.id) as [string, ...string[]];
const MAX_HTML_CHARS = 200_000;
/** A request still queued after this is reported as failed (the workflow itself stops at 15 minutes). */
const STALE_MS = 20 * 60_000;
const UPLOAD_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const;
const UPLOAD_TTL_S = 900;

const artUploadPrefix = (userId: string, gameId: string) => `art-uploads/${userId}/${gameId}/`;
const UPLOAD_KEY = /^art-uploads\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|webp)$/;

async function fetchImage(raw: string): Promise<Uint8Array> {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new ToolError("image_url must be an https URL.", "invalid");
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!res?.ok) throw new ToolError("Could not fetch image_url.", "fetch_failed");
  if (Number(res.headers.get("content-length") ?? 0) > ART_MAX_BYTES) throw new ToolError("Art is capped at 3 MB.", "too_large");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > ART_MAX_BYTES) throw new ToolError("Art is capped at 3 MB.", "too_large");
  return bytes;
}

export function registerArtTools(server: McpServer, auth: TokenAuth) {
  server.registerTool(
    "set_game_art",
    {
      title: "Set a game's cover or card image",
      description:
        "Sets store art from an image file (PNG, JPEG or WebP, max 3 MB) that you made or generated. kind 'cover' is the 16:9 landscape image for feed tiles, " +
        "the player and link previews (1280x720 works best); 'card' is the 3:4 portrait poster (600x800). It is centre-cropped, resized and compressed to WebP, " +
        "replaces the current art and is kept when new versions are published. Pass exactly one of: upload_key from create_art_upload (best for a file on disk), " +
        "image_url (a public https image), or image_base64 (small images only). To design a thumbnail without an image file, use make_thumbnail.",
      inputSchema: z
        .object({
          game_id: z.string().uuid(),
          kind: z.enum(["cover", "card"]),
          upload_key: z.string().regex(UPLOAD_KEY).optional().describe("From create_art_upload, after the file was PUT to its url"),
          image_url: z.string().url().max(2000).optional().describe("Public https URL of the image"),
          image_base64: z
            .string()
            .min(1)
            .max(Math.ceil((ART_MAX_BYTES * 4) / 3) + 200)
            .optional()
            .describe("The image file as base64 (a data: URL prefix is accepted)"),
        })
        .refine((v) => [v.upload_key, v.image_url, v.image_base64].filter(Boolean).length === 1, { message: "Pass exactly one of upload_key, image_url or image_base64." }),
    },
    (args) =>
      guarded(async () => {
        const g = await ownedGame(auth, args.game_id);
        let bytes: Uint8Array;
        if (args.upload_key) {
          if (!args.upload_key.startsWith(artUploadPrefix(auth.userId, g.id))) throw new ToolError("That upload_key belongs to another game. Call create_art_upload for this one.", "invalid");
          const uploaded = await getObjectBytes(buckets().uploads, args.upload_key);
          if (!uploaded) throw new ToolError("Nothing has been uploaded to that key yet. PUT the file to the url from create_art_upload first.", "missing_object");
          bytes = uploaded;
        } else if (args.image_url) {
          bytes = await fetchImage(args.image_url);
        } else {
          bytes = new Uint8Array(Buffer.from(args.image_base64!.replace(/^data:[^,]*,/, "").replace(/\s+/g, ""), "base64"));
        }
        const res = await saveGameArt(auth.userId, g.id, args.kind, bytes);
        if (args.upload_key) await deleteObject(buckets().uploads, args.upload_key).catch(() => {});
        if (!res.ok) throw new ToolError(res.error, res.code);
        return ok({ game_id: g.id, kind: args.kind, url: res.url });
      }),
  );

  server.registerTool(
    "create_art_upload",
    {
      title: "Get an upload URL for a cover or card image",
      description:
        "For an image file you made or generated (PNG, JPEG or WebP, max 3 MB). Returns a url on habiv.com to PUT the file to, for example " +
        "curl -X PUT -H 'content-type: image/png' --data-binary @cover.png '<url>', then call set_game_art with game_id, kind and the upload_key. " +
        "If your sandbox only reaches allowed domains, www.habiv.com is the one to allow; storage_url is a direct alternative. " +
        "The urls work for 15 minutes; use one per image.",
      inputSchema: z.object({ game_id: z.string().uuid(), content_type: z.enum(["image/png", "image/jpeg", "image/webp"]) }),
    },
    (args) =>
      guarded(async () => {
        const g = await ownedGame(auth, args.game_id);
        const key = `${artUploadPrefix(auth.userId, g.id)}${crypto.randomUUID()}.${UPLOAD_TYPES[args.content_type]}`;
        const storageUrl = await presignPut(buckets().uploads, key, args.content_type, UPLOAD_TTL_S);
        return ok({
          game_id: g.id,
          upload_key: key,
          method: "PUT",
          url: relayUrl({ key, contentType: args.content_type, maxBytes: ART_MAX_BYTES, ttlSec: UPLOAD_TTL_S }),
          storage_url: storageUrl,
          headers: { "content-type": args.content_type },
          max_bytes: ART_MAX_BYTES,
          expires_in_sec: UPLOAD_TTL_S,
          next: "PUT the file to url with that content-type header, then call set_game_art with game_id, kind ('cover' or 'card') and upload_key.",
        });
      }),
  );

  server.registerTool(
    "list_thumbnail_designs",
    {
      title: "List Habiv's ready-made thumbnail designs",
      description:
        "The built-in text-only thumbnail styles (modern and retro), colour themes and modes that make_thumbnail accepts. " +
        "They are the same designs as the picker on Habiv's publish and edit pages.",
      inputSchema: z.object({}),
    },
    () =>
      guarded(async () =>
        ok({
          styles: PICKABLE.map(({ id, group, name, blurb }) => ({ id, group, name, blurb })),
          themes: THUMB_THEMES.map(({ id, name }) => ({ id, name })),
          custom_color: "Pass color as #rrggbb instead of a theme for any other colour.",
          modes: THUMB_MODES,
          sizes: THUMB_SIZES,
        }),
      ),
  );

  server.registerTool(
    "make_thumbnail",
    {
      title: "Make a cover and card thumbnail",
      description:
        "Designs the game's store art and saves it as the cover (1280x720) and card (600x800), replacing the current art. Either pick a built-in design " +
        "(a style from list_thumbnail_designs, plus theme or color, and mode; it shows the game's title, tagline and category and your handle, so update_game first if those change), " +
        "or design it yourself: html_cover and/or html_card, each a complete self-contained HTML document laid out at exactly that size " +
        "(inline CSS, SVG and data: URIs; Google Fonts <link> tags are the only network allowed and scripts don't run). " +
        "Rendering happens in a headless browser and takes 1-3 minutes: call get_thumbnail_status with the request_id. " +
        "For an image file you already have, use create_art_upload and set_game_art instead.",
      inputSchema: z
        .object({
          game_id: z.string().uuid(),
          style: z.enum(styleIds).optional().describe("Built-in design id, e.g. 'mesh', 'crt' or 'synthwave'"),
          theme: z.enum(themeIds).optional().describe("Colour theme for a built-in design; 'auto' (the default) uses the game's own colour"),
          color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe("Custom colour as #rrggbb, instead of theme"),
          mode: z.enum(["light", "dark", "vivid"]).optional().describe("Built-in designs only; default light"),
          html_cover: z.string().min(20).max(MAX_HTML_CHARS).optional().describe("Your own 1280x720 design as a full HTML document"),
          html_card: z.string().min(20).max(MAX_HTML_CHARS).optional().describe("Your own 600x800 design as a full HTML document"),
        })
        .refine((v) => !!v.style !== !!(v.html_cover || v.html_card), { message: "Pass style for a built-in design, or html_cover / html_card for your own design, not both." }),
    },
    (args) =>
      guarded(async () => {
        const g = await ownedGame(auth, args.game_id);
        const { data: allowed } = await createAdminClient().rpc("rate_limit_hit", { p_key: `thumb:${auth.userId}`, p_window: "1 hour", p_limit: 10 });
        if (allowed === false) throw new ToolError("That's 10 thumbnails in the last hour. Wait a bit before making another.", "rate_limited");

        let docs: Partial<Record<ThumbKind, string>>;
        if (args.style) {
          const handle = await handleOf(auth.userId);
          const input = { title: g.title, tagline: g.tagline, category: g.category.charAt(0).toUpperCase() + g.category.slice(1), creator: handle || null, hue: g.accent_hue };
          const opts: ThumbOptions = args.color ? { theme: "custom", mode: args.mode, custom: hexToThumbColor(args.color) } : { theme: args.theme ?? "auto", mode: args.mode };
          docs = { cover: renderThumb(args.style, input, COVER, opts), card: renderThumb(args.style, input, CARD, opts) };
        } else {
          docs = { ...(args.html_cover ? { cover: args.html_cover } : {}), ...(args.html_card ? { card: args.html_card } : {}) };
        }

        const job = await queueThumbJob({ gameId: g.id, userId: auth.userId, docs });
        if (!job) throw new ToolError("Thumbnail rendering isn't available right now. Upload an image with create_art_upload and set_game_art instead.", "unavailable");
        return ok({
          request_id: job.id,
          game_id: g.id,
          status: "rendering",
          kinds: Object.keys(docs),
          status_hint: "Call get_thumbnail_status with request_id in about a minute; renders usually take 1-3 minutes.",
        });
      }),
  );

  server.registerTool(
    "get_thumbnail_status",
    {
      title: "Check a thumbnail render",
      description: "Status of a make_thumbnail request: rendering, done (with the new cover_url and card_url) or failed (with the reason).",
      inputSchema: z.object({ request_id: z.string().uuid() }),
    },
    (args) =>
      guarded(async () => {
        const job = await readThumbJob(args.request_id);
        if (!job || job.userId !== auth.userId) throw new ToolError("Thumbnail request not found.", "not_found");
        const base = { request_id: job.id, game_id: job.gameId };
        if (job.status === "queued") {
          if (Date.now() - Date.parse(job.createdAt) < STALE_MS) return ok({ ...base, status: "rendering", status_hint: "Still rendering. Check again in a minute." });
          return ok({ ...base, status: "failed", error: "The render never finished. Call make_thumbnail again." });
        }
        if (job.status === "failed") return ok({ ...base, status: "failed", error: job.error ?? "The render failed." });
        if (!job.settled) {
          // The job can't expire the site's caches, so the first read after it finishes does, then removes the art it replaced.
          await refreshGame(auth, job.gameId);
          await Promise.all((job.replaced ?? []).map((path) => deleteObject(buckets().public, path).catch(() => {})));
          await writeThumbJob({ ...job, settled: true });
        }
        return ok({ ...base, status: "done", cover_url: cdnUrl(job.paths?.cover), card_url: cdnUrl(job.paths?.card) });
      }),
  );
}
