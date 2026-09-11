import type { VersionMeta } from "./versions";

const ONE_YEAR = "public, max-age=31536000, immutable";
const SHORT = "public, max-age=60";

/** Content types we override regardless of what R2 stored (belt and braces for .br/.gz). */
export function guessContentType(path: string): string | null {
  const p = path.toLowerCase();
  const bare = p.replace(/\.(br|gz)$/, "");
  const ext = bare.slice(bare.lastIndexOf(".") + 1);
  const map: Record<string, string> = {
    html: "text/html; charset=utf-8",
    htm: "text/html; charset=utf-8",
    js: "application/javascript; charset=utf-8",
    mjs: "application/javascript; charset=utf-8",
    css: "text/css; charset=utf-8",
    json: "application/json; charset=utf-8",
    wasm: "application/wasm",
    pck: "application/octet-stream",
    data: "application/octet-stream",
    unityweb: "application/octet-stream",
    bin: "application/octet-stream",
    apk: "application/octet-stream",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    svg: "image/svg+xml",
    avif: "image/avif",
    ico: "image/x-icon",
    mp3: "audio/mpeg",
    ogg: "audio/ogg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    webm: "video/webm",
    mp4: "video/mp4",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    otf: "font/otf",
    txt: "text/plain; charset=utf-8",
    xml: "application/xml",
    csv: "text/csv",
    glb: "model/gltf-binary",
    gltf: "model/gltf+json",
    swf: "application/x-shockwave-flash",
  };
  return map[ext] ?? null;
}

export function contentEncodingFor(path: string): "br" | "gzip" | null {
  if (path.endsWith(".br")) return "br";
  if (path.endsWith(".gz")) return "gzip";
  return null;
}

export function applySecurityHeaders(h: Headers, meta: VersionMeta, path: string, frameAncestors: string): void {
  h.set("cross-origin-resource-policy", "cross-origin");
  h.set("x-content-type-options", "nosniff");
  h.set("referrer-policy", "strict-origin-when-cross-origin");
  h.set("x-robots-tag", "noindex");
  const src = meta.net
    ? "'self' https: wss: data: blob: 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'"
    : "'self' data: blob: 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'";
  const csp = [
    `default-src ${src}`,
    `connect-src ${meta.net ? "'self' https: wss: data: blob:" : "'self' data: blob:"}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    `frame-ancestors ${frameAncestors}`,
  ].join("; ");
  h.set("content-security-policy", csp);
  if (meta.iso) {
    h.set("cross-origin-opener-policy", "same-origin");
    h.set("cross-origin-embedder-policy", "require-corp");
  }
  const isHtml = /\.html?$/i.test(path);
  h.set("cache-control", isHtml ? SHORT : ONE_YEAR);
  if (isHtml) {
    h.set("x-frame-options", "SAMEORIGIN"); // superseded by frame-ancestors in modern browsers
  }
}

export function sdkHeaders(): HeadersInit {
  return {
    "cross-origin-resource-policy": "cross-origin",
    "x-content-type-options": "nosniff",
    "cache-control": "public, max-age=300",
    "content-type": "application/javascript; charset=utf-8",
  };
}
