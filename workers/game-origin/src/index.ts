import { applySecurityHeaders, contentEncodingFor, guessContentType, sdkHeaders } from "./headers";
import { applyHook, getVersion, isGameBlocked, isUuid, type Env, type HookPayload } from "./versions";

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === "/" || pathname === "/health") {
      return json({ ok: true, service: "habiv-play" });
    }

    if (pathname.startsWith("/sdk/")) {
      if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405 });
      const asset = await env.ASSETS.fetch(new Request(url.origin + pathname, { method: "GET" }));
      if (!asset.ok) return new Response("not found", { status: 404 });
      return new Response(request.method === "HEAD" ? null : asset.body, { status: 200, headers: sdkHeaders() });
    }

    if (pathname === "/__hooks/version") {
      if (request.method !== "POST") return new Response(null, { status: 405 });
      const secret = request.headers.get("x-habiv-hook-secret");
      if (!env.HOOK_SECRET || secret !== env.HOOK_SECRET) return json({ error: "unauthorized" }, 401);
      let payload: HookPayload;
      try {
        payload = (await request.json()) as HookPayload;
      } catch {
        return json({ error: "bad_json" }, 400);
      }
      await applyHook(env, payload);
      return json({ ok: true });
    }

    const m = pathname.match(/^\/v\/([^/]+)(\/(.*))?$/);
    if (!m) return json({ error: "not_found" }, 404);
    if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405 });

    const versionId = m[1];
    if (!isUuid(versionId)) return json({ error: "bad_version_id" }, 400);

    // Relative asset URLs inside the game only resolve under a trailing slash.
    if (m[2] === undefined) {
      return Response.redirect(`${url.origin}/v/${versionId}/${url.search}`, 301);
    }

    let rel: string;
    try {
      rel = decodeURIComponent(m[3] ?? "");
    } catch {
      return json({ error: "bad_path" }, 400);
    }
    if (rel.includes("..") || rel.includes("\\") || rel.includes("\0") || rel.startsWith("/")) {
      return json({ error: "bad_path" }, 400);
    }

    const meta = await getVersion(env, versionId);
    if (!meta || meta.s !== "ready") return json({ error: "unknown_version" }, 404);
    if (await isGameBlocked(env, meta.g)) return json({ error: "unavailable" }, 410);

    const path = rel === "" || rel.endsWith("/") ? rel + meta.e : rel;
    const isHtml = /\.html?$/i.test(path);

    const cache = caches.default;
    const cacheKey = new Request(`${url.origin}/v/${versionId}/${path}`, { method: "GET" });
    if (!isHtml && !request.headers.has("range")) {
      const hit = await cache.match(cacheKey);
      if (hit) return request.method === "HEAD" ? new Response(null, { status: hit.status, headers: hit.headers }) : hit;
    }

    const key = `${meta.g}/${versionId}/${path}`;
    const obj = await env.GAMES.get(key, { range: request.headers, onlyIf: request.headers });
    if (!obj) return json({ error: "not_found" }, 404);

    const h = new Headers();
    obj.writeHttpMetadata(h);
    h.set("etag", obj.httpEtag);
    h.set("accept-ranges", "bytes");
    const guessed = guessContentType(path);
    if (guessed && (!h.get("content-type") || h.get("content-type") === "application/octet-stream")) {
      h.set("content-type", guessed);
    }
    const enc = contentEncodingFor(path);
    if (enc) h.set("content-encoding", enc);
    applySecurityHeaders(h, meta, path, env.FRAME_ANCESTORS);

    // onlyIf matched (If-None-Match etc.): body is absent.
    if (!("body" in obj) || !obj.body) {
      return new Response(null, { status: 304, headers: h });
    }

    let status = 200;
    if (obj.range && "offset" in obj.range) {
      const start = obj.range.offset ?? 0;
      const length = obj.range.length ?? obj.size - start;
      const end = start + length - 1;
      h.set("content-range", `bytes ${start}-${end}/${obj.size}`);
      h.set("content-length", String(length));
      status = 206;
    } else {
      h.set("content-length", String(obj.size));
    }

    const response = new Response(request.method === "HEAD" ? null : obj.body, {
      status,
      headers: h,
      // Do not let the runtime re-compress bodies that are already br/gzip on disk.
      encodeBody: enc ? "manual" : "automatic",
    });

    if (status === 200 && !isHtml && request.method === "GET") {
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }
    return response;
  },
} satisfies ExportedHandler<Env>;
