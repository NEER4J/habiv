/**
 * Game origin on Vercel: serves extracted bundles from Supabase Storage on habiv-play.vercel.app.
 * vercel.app is on the Public Suffix List, so game code can never read habiv.com cookies or storage.
 * A port of workers/game-origin without KV: version rows are looked up directly (with a short
 * in-memory cache), which also covers removed games and banned creators without a database hook.
 */

declare const process: { env: Record<string, string | undefined> };

const SUPABASE_URL = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const BUCKET = process.env.GAMES_BUCKET || "habiv-games";
const FRAME_ANCESTORS =
  process.env.FRAME_ANCESTORS || "https://habiv.com https://*.habiv.com https://*.vercel.app http://localhost:3000";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const META_TTL_MS = 60_000;
const ONE_YEAR = "public, max-age=31536000, immutable";
const SHORT = "public, max-age=60";

type VersionMeta = { prefix: string; entry: string; iso: boolean; net: boolean };

const metaCache = new Map<string, { meta: VersionMeta; at: number }>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/** The version if it is ready and playable: its game is not removed and its creator is not banned. */
async function getVersion(versionId: string): Promise<VersionMeta | null> {
  const hit = metaCache.get(versionId);
  if (hit && Date.now() - hit.at < META_TTL_MS) return hit.meta;
  const url = new URL(`${SUPABASE_URL}/rest/v1/game_versions`);
  url.searchParams.set("id", `eq.${versionId}`);
  url.searchParams.set(
    "select",
    "id,game_id,status,needs_isolation,uses_network,entry_path,bundle_prefix,game:games!game_versions_game_id_fkey(status,creator:profiles!games_creator_id_fkey(banned_at))",
  );
  const res = await fetch(url, { headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, accept: "application/json" } });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{
    id: string;
    game_id: string;
    status: string;
    needs_isolation: boolean;
    uses_network: boolean;
    entry_path: string | null;
    bundle_prefix: string | null;
    game: { status: string; creator: { banned_at: string | null } | null } | null;
  }>;
  const row = rows[0];
  if (!row || row.status !== "ready" || !row.game || row.game.status === "removed" || !row.game.creator || row.game.creator.banned_at) {
    metaCache.delete(versionId);
    return null;
  }
  const meta: VersionMeta = {
    prefix: row.bundle_prefix || `${row.game_id}/${row.id}`,
    entry: row.entry_path || "index.html",
    iso: !!row.needs_isolation,
    net: !!row.uses_network,
  };
  if (metaCache.size > 500) metaCache.clear();
  metaCache.set(versionId, { meta, at: Date.now() });
  return meta;
}

const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8",
  js: "application/javascript; charset=utf-8", mjs: "application/javascript; charset=utf-8", cjs: "application/javascript; charset=utf-8",
  css: "text/css; charset=utf-8", json: "application/json; charset=utf-8", webmanifest: "application/manifest+json",
  wasm: "application/wasm", pck: "application/octet-stream", data: "application/octet-stream",
  unityweb: "application/octet-stream", bin: "application/octet-stream", apk: "application/octet-stream", mem: "application/octet-stream",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp", avif: "image/avif", ico: "image/x-icon", bmp: "image/bmp",
  mp3: "audio/mpeg", ogg: "audio/ogg", oga: "audio/ogg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac", flac: "audio/flac", mp4: "video/mp4", webm: "video/webm",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
  txt: "text/plain; charset=utf-8", xml: "application/xml", csv: "text/csv", glb: "model/gltf-binary", gltf: "model/gltf+json", swf: "application/x-shockwave-flash",
};

/** Supabase Storage serves HTML as text/plain on purpose, so the file extension always wins. */
function contentType(path: string): string | null {
  const bare = path.toLowerCase().replace(/\.(br|gz)$/, "");
  return MIME[bare.slice(bare.lastIndexOf(".") + 1)] ?? null;
}

function contentEncoding(path: string): "br" | "gzip" | null {
  if (path.endsWith(".br")) return "br";
  if (path.endsWith(".gz")) return "gzip";
  return null;
}

function securityHeaders(h: Headers, meta: VersionMeta, isHtml: boolean) {
  h.set("cross-origin-resource-policy", "cross-origin");
  h.set("access-control-allow-origin", "*");
  h.set("access-control-expose-headers", "content-length, content-range, etag, content-encoding");
  h.set("x-content-type-options", "nosniff");
  h.set("referrer-policy", "strict-origin-when-cross-origin");
  h.set("x-robots-tag", "noindex");
  const src = meta.net
    ? "'self' https: wss: data: blob: 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'"
    : "'self' data: blob: 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'";
  h.set(
    "content-security-policy",
    [
      `default-src ${src}`,
      `connect-src ${meta.net ? "'self' https: wss: data: blob:" : "'self' data: blob:"}`,
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      `frame-ancestors ${FRAME_ANCESTORS}`,
    ].join("; "),
  );
  if (meta.iso) {
    h.set("cross-origin-opener-policy", "same-origin");
    h.set("cross-origin-embedder-policy", "require-corp");
  }
  // Bundles are immutable per version id; the entry document stays short so removals land fast.
  h.set("cache-control", isHtml ? SHORT : ONE_YEAR);
  h.set("vercel-cdn-cache-control", isHtml ? "max-age=60" : "max-age=31536000");
}

async function serve(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // vercel.json rewrites /v/:version/:path* here as ?__v=&__p=; fall back to the raw path.
  let versionId = url.searchParams.get("__v");
  let rel = url.searchParams.get("__p") ?? "";
  if (versionId === null) {
    const m = url.pathname.match(/^\/v\/([^/]+)(?:\/(.*))?$/);
    if (!m) return json({ ok: true, service: "habiv-play" });
    versionId = m[1];
    try {
      rel = decodeURIComponent(m[2] ?? "");
    } catch {
      return json({ error: "bad_path" }, 400);
    }
  }
  if (!UUID_RE.test(versionId)) return json({ error: "bad_version_id" }, 400);
  if (rel.includes("..") || rel.includes("\\") || rel.includes("\0") || rel.startsWith("/")) return json({ error: "bad_path" }, 400);
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "storage_not_configured" }, 503);

  const meta = await getVersion(versionId);
  if (!meta) return json({ error: "unknown_version" }, 404);

  // A bare version URL goes to its entry document so relative asset URLs resolve inside the version folder.
  if (rel === "" || rel.endsWith("/")) {
    // Vercel also appends the rewrite's named segments (version, path) to the query.
    const search = new URLSearchParams(url.searchParams);
    for (const name of ["__v", "__p", "version", "path"]) search.delete(name);
    const entry = (rel + meta.entry).split("/").map(encodeURIComponent).join("/");
    const qs = search.toString();
    return new Response(null, { status: 307, headers: { location: `/v/${versionId}/${entry}${qs ? `?${qs}` : ""}`, "cache-control": "no-store" } });
  }

  const method = request.method === "HEAD" ? "HEAD" : "GET";
  const upstreamHeaders = new Headers({ apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` });
  for (const name of ["range", "if-none-match", "if-modified-since"]) {
    const v = request.headers.get(name);
    if (v) upstreamHeaders.set(name, v);
  }
  const objectPath = `${meta.prefix}/${rel}`.split("/").map(encodeURIComponent).join("/");
  const upstream = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/${BUCKET}/${objectPath}`, {
    method,
    headers: upstreamHeaders,
    cache: "no-store",
  });
  // Storage answers a missing object with 400 or 404 depending on its version.
  if (upstream.status === 400 || upstream.status === 404) return json({ error: "not_found" }, 404);
  if (!upstream.ok && upstream.status !== 304) return json({ error: "storage_unavailable" }, 502);

  const isHtml = /\.html?$/i.test(rel);
  const h = new Headers({ "accept-ranges": "bytes" });
  for (const name of ["etag", "last-modified", "content-range"]) {
    const v = upstream.headers.get(name);
    if (v) h.set(name, v);
  }
  // The upstream length only matches the body when fetch() did not decode it on the way in.
  const length = upstream.headers.get("content-length");
  if (length && !upstream.headers.get("content-encoding")) h.set("content-length", length);
  h.set("content-type", contentType(rel) ?? upstream.headers.get("content-type") ?? "application/octet-stream");
  const enc = contentEncoding(rel);
  if (enc) h.set("content-encoding", enc);
  securityHeaders(h, meta, isHtml);

  if (upstream.status === 304) return new Response(null, { status: 304, headers: h });
  return new Response(method === "HEAD" ? null : upstream.body, { status: upstream.status === 206 ? 206 : 200, headers: h });
}

export function GET(request: Request) {
  return serve(request);
}

export function HEAD(request: Request) {
  return serve(request);
}

/** CORS preflight (ranged fetches from an isolated game can trigger one). */
export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, HEAD, OPTIONS",
      "access-control-allow-headers": "range, content-type",
      "access-control-max-age": "86400",
    },
  });
}
