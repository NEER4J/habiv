import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Same-origin game serving (stopgap until the game-origin Worker is deployed on its own site).
 *
 * SECURITY: because this runs on habiv.com, a bundle's JavaScript would otherwise share the
 * viewer's cookies, localStorage and API access. Untrusted uploads are therefore served with a
 * CSP `sandbox` directive WITHOUT allow-same-origin, which gives the document an opaque origin:
 * no cookies, no storage, and API calls go out without credentials. Only games owned by an
 * admin account (the first-party catalogue) run with a real origin here. The Worker on
 * workers.dev remains the correct home for user uploads (see workers/game-origin).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8", cjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8", json: "application/json; charset=utf-8", webmanifest: "application/manifest+json",
  wasm: "application/wasm", pck: "application/octet-stream", data: "application/octet-stream",
  unityweb: "application/octet-stream", bin: "application/octet-stream", apk: "application/octet-stream", mem: "application/octet-stream",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp", avif: "image/avif", ico: "image/x-icon", bmp: "image/bmp",
  mp3: "audio/mpeg", ogg: "audio/ogg", oga: "audio/ogg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac", flac: "audio/flac", mp4: "video/mp4", webm: "video/webm",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
  txt: "text/plain; charset=utf-8", xml: "application/xml", csv: "text/csv", glb: "model/gltf-binary", gltf: "model/gltf+json", swf: "application/x-shockwave-flash",
};

function contentType(path: string) {
  const bare = path.toLowerCase().replace(/\.(br|gz)$/, "");
  const ext = bare.split(".").pop() ?? "";
  return MIME[ext] ?? "application/octet-stream";
}

function contentEncoding(path: string): "br" | "gzip" | null {
  if (path.endsWith(".br")) return "br";
  if (path.endsWith(".gz")) return "gzip";
  return null;
}

function badPath(path: string) {
  return path.includes("..") || path.includes("\\") || path.includes("\0") || path.startsWith("/");
}

const FRAME_ANCESTORS = ["'self'", "https://habiv.com", "https://*.habiv.com", "https://*.vercel.app", "http://localhost:3000"].join(" ");

function securityHeaders(h: Headers, opts: { trusted: boolean; isolate: boolean; network: boolean; isHtml: boolean }) {
  h.set("x-content-type-options", "nosniff");
  // Sandboxed (opaque-origin) documents fetch their own assets as cross-origin requests with
  // `Origin: null`, so bundle bytes must be readable cross-origin. They are public, uncredentialed.
  h.set("cross-origin-resource-policy", "cross-origin");
  h.set("access-control-allow-origin", "*");
  h.set("access-control-allow-methods", "GET, HEAD, OPTIONS");
  h.set("access-control-allow-headers", "range, content-type");
  h.set("access-control-expose-headers", "content-length, content-range, etag, content-encoding");
  h.set("timing-allow-origin", "*");
  h.set("referrer-policy", "strict-origin-when-cross-origin");
  h.set("x-robots-tag", "noindex");
  const src = opts.network
    ? "'self' https: wss: data: blob: 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'"
    : "'self' data: blob: 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'";
  const directives = [
    `default-src ${src}`,
    `connect-src ${opts.network ? "'self' https: wss: data: blob:" : "'self' data: blob:"}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${FRAME_ANCESTORS}`,
  ];
  // Opaque origin for anything not first-party: the decisive control on a shared origin.
  if (!opts.trusted) directives.push("sandbox allow-scripts allow-forms allow-pointer-lock allow-modals allow-orientation-lock allow-popups-to-escape-sandbox");
  h.set("content-security-policy", directives.join("; "));
  if (opts.isolate) {
    h.set("cross-origin-opener-policy", "same-origin");
    h.set("cross-origin-embedder-policy", "require-corp");
  }
  h.set("cache-control", opts.isHtml ? "public, max-age=60" : "public, max-age=31536000, immutable");
}

async function serve(request: Request, { params }: { params: Promise<{ versionId: string; path?: string[] }> }) {
  const { versionId, path } = await params;
  if (!UUID_RE.test(versionId)) return new Response("Not found", { status: 404 });

  const admin = createAdminClient();
  const { data: version } = await admin
    .from("game_versions")
    .select("id, game_id, status, entry_path, bundle_prefix, needs_isolation, uses_network")
    .eq("id", versionId)
    .maybeSingle();
  if (!version || version.status !== "ready") return new Response("Not found", { status: 404 });

  const { data: game } = await admin.from("games").select("status, creator_id").eq("id", version.game_id).maybeSingle();
  if (!game || game.status === "removed") return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const preview = url.searchParams.get("mode") === "preview" || url.searchParams.get("mode") === "smoke";
  if (game.status !== "published" && !preview) return new Response("Not found", { status: 404 });

  const { data: creator } = await admin.from("profiles").select("is_admin, banned_at").eq("id", game.creator_id).maybeSingle();
  if (!creator || creator.banned_at) return new Response("Not found", { status: 404 });
  const trusted = creator.is_admin === true;

  const rel = (path ?? []).join("/") || version.entry_path || "index.html";
  if (badPath(rel)) return new Response("Bad path", { status: 400 });
  const isHtml = /\.html?$/i.test(rel);
  // Relative asset URLs only resolve under a trailing slash on the entry document.
  if (!path?.length && !url.pathname.endsWith("/")) {
    return Response.redirect(`${url.origin}${url.pathname}/${url.search}`, 301);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return new Response("Storage is not configured", { status: 503 });
  const bucket = process.env.STORAGE_GAMES_BUCKET || "habiv-games";
  const prefix = version.bundle_prefix || `${version.game_id}/${version.id}`;
  const objectPath = `${prefix}/${rel}`.split("/").map(encodeURIComponent).join("/");
  const range = request.headers.get("range");
  const upstream = await fetch(`${supabaseUrl}/storage/v1/object/authenticated/${bucket}/${objectPath}`, {
    method: request.method,
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, ...(range ? { range } : {}) },
    cache: "no-store",
  });
  if (!upstream.ok && upstream.status !== 206) return new Response("Not found", { status: upstream.status === 404 ? 404 : 502 });

  const headers = new Headers({ "content-type": contentType(rel), "accept-ranges": "bytes" });
  const enc = contentEncoding(rel);
  if (enc) headers.set("content-encoding", enc);
  for (const name of ["etag", "content-length", "content-range", "last-modified"]) {
    const v = upstream.headers.get(name);
    if (v) headers.set(name, v);
  }
  securityHeaders(headers, { trusted, isolate: !!version.needs_isolation, network: !!version.uses_network, isHtml });
  return new Response(request.method === "HEAD" ? null : upstream.body, { status: upstream.status === 206 ? 206 : 200, headers });
}

export async function GET(request: Request, context: { params: Promise<{ versionId: string; path?: string[] }> }) {
  return serve(request, context);
}

export async function HEAD(request: Request, context: { params: Promise<{ versionId: string; path?: string[] }> }) {
  return serve(request, context);
}

/** CORS preflight (ranged fetches from a sandboxed game trigger one). */
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
