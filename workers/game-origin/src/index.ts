import { ONE_YEAR, SHORT, applySecurityHeaders, contentEncodingFor, guessContentType, sdkHeaders } from "./headers";
import { readObject } from "./storage";
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
    // A version's files never change, so HTML is edge-cached too (the checks above still run first).
    if (!request.headers.has("range")) {
      const hit = await cache.match(cacheKey);
      if (hit && isHtml) {
        const res = new Response(request.method === "HEAD" ? null : hit.body, hit);
        res.headers.set("cache-control", SHORT);
        return res;
      }
      if (hit) return request.method === "HEAD" ? new Response(null, { status: hit.status, headers: hit.headers }) : hit;
    }

    const key = `${meta.g}/${versionId}/${path}`;
    const upstream = await readObject(env, key, request.method === "HEAD" ? "HEAD" : "GET", request.headers);
    // Storage answers a missing object with 400 or 404 depending on its version.
    if (upstream.status === 400 || upstream.status === 404) return json({ error: "not_found" }, 404);
    if (!upstream.ok && upstream.status !== 304) return json({ error: "storage_unavailable" }, 502);

    const h = new Headers();
    for (const name of ["etag", "last-modified", "content-range"]) {
      const v = upstream.headers.get(name);
      if (v) h.set(name, v);
    }
    // The upstream length only matches the body when fetch() did not decode it on the way in.
    const length = upstream.headers.get("content-length");
    if (length && !upstream.headers.get("content-encoding")) h.set("content-length", length);
    h.set("accept-ranges", "bytes");
    // Supabase Storage serves HTML as text/plain on purpose, so the file extension always wins.
    h.set("content-type", guessContentType(path) ?? upstream.headers.get("content-type") ?? "application/octet-stream");
    const enc = contentEncodingFor(path);
    if (enc) h.set("content-encoding", enc);
    applySecurityHeaders(h, meta, path, env.FRAME_ANCESTORS);

    // A conditional request (If-None-Match etc.) matched: no body.
    if (upstream.status === 304) {
      return new Response(null, { status: 304, headers: h });
    }
    const status = upstream.status === 206 ? 206 : 200;

    const response = new Response(request.method === "HEAD" ? null : upstream.body, {
      status,
      headers: h,
      // Do not let the runtime re-compress bodies that are already br/gzip on disk.
      encodeBody: enc ? "manual" : "automatic",
    });

    if (status === 200 && request.method === "GET") {
      // The edge keeps HTML long; browsers still get SHORT (restored on the cache hit above).
      const stored = isHtml ? new Response(response.clone().body, response) : response.clone();
      if (isHtml) stored.headers.set("cache-control", ONE_YEAR);
      ctx.waitUntil(cache.put(cacheKey, stored));
    }
    return response;
  },
} satisfies ExportedHandler<Env>;
