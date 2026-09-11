import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
  webp: "image/webp",
  ico: "image/x-icon",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  mp4: "video/mp4",
  webm: "video/webm",
};

function contentType(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME[ext] ?? "application/octet-stream";
}

function badPath(path: string) {
  return path.includes("..") || path.includes("\\") || path.includes("\0") || path.startsWith("/");
}

async function serve(request: Request, { params }: { params: Promise<{ versionId: string; path?: string[] }> }) {
  const { versionId, path } = await params;
  if (!UUID_RE.test(versionId)) return new Response("Not found", { status: 404 });

  const admin = createAdminClient();
  const { data: version } = await admin
    .from("game_versions")
    .select("id, game_id, status, entry_path, bundle_prefix")
    .eq("id", versionId)
    .maybeSingle();
  if (!version || version.status !== "ready") return new Response("Not found", { status: 404 });

  const { data: game } = await admin.from("games").select("status").eq("id", version.game_id).maybeSingle();
  if (!game || game.status !== "published") return new Response("Not found", { status: 404 });

  const rel = (path ?? []).join("/") || version.entry_path || "index.html";
  if (badPath(rel)) return new Response("Bad path", { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return new Response("Storage is not configured", { status: 503 });
  const bucket = process.env.STORAGE_GAMES_BUCKET || "habiv-games";
  const prefix = version.bundle_prefix || `${version.game_id}/${version.id}`;
  const objectPath = `${prefix}/${rel}`.split("/").map(encodeURIComponent).join("/");
  const upstream = await fetch(`${supabaseUrl}/storage/v1/object/authenticated/${bucket}/${objectPath}`, {
    method: request.method,
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
    cache: "no-store",
  });
  if (!upstream.ok) return new Response("Not found", { status: upstream.status === 404 ? 404 : 502 });

  const headers = new Headers({
    "content-type": contentType(rel),
    "cache-control": "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
  });
  const etag = upstream.headers.get("etag");
  if (etag) headers.set("etag", etag);
  return new Response(request.method === "HEAD" ? null : upstream.body, { status: 200, headers });
}

export async function GET(request: Request, context: { params: Promise<{ versionId: string; path?: string[] }> }) {
  return serve(request, context);
}

export async function HEAD(request: Request, context: { params: Promise<{ versionId: string; path?: string[] }> }) {
  return serve(request, context);
}
