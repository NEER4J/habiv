import mime from "mime-types";
import { extOf, innerExt } from "./validate";

const OVERRIDES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  mjs: "application/javascript; charset=utf-8",
  cjs: "application/javascript; charset=utf-8",
  wasm: "application/wasm",
  pck: "application/octet-stream",
  data: "application/octet-stream",
  unityweb: "application/octet-stream",
  apk: "application/octet-stream",
  bin: "application/octet-stream",
  mem: "application/octet-stream",
  symbols: "application/octet-stream",
  swf: "application/x-shockwave-flash",
  tic: "application/octet-stream",
  p8: "text/plain; charset=utf-8",
  love: "application/zip",
  sb3: "application/zip",
  rpgmvp: "application/octet-stream",
  rpgmvo: "application/octet-stream",
  rpgmvm: "application/octet-stream",
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  webmanifest: "application/manifest+json",
  rpy: "text/plain; charset=utf-8",
  rpyc: "application/octet-stream",
  pyc: "application/octet-stream",
};

export function contentTypeFor(path: string): { type: string; encoding?: "br" | "gzip" } {
  const outer = extOf(path);
  const encoding = outer === "br" ? "br" : outer === "gz" ? "gzip" : undefined;
  const ext = encoding ? innerExt(path) : outer;
  const type = OVERRIDES[ext] ?? (mime.lookup(ext) || "application/octet-stream");
  return encoding ? { type, encoding } : { type };
}

export function cacheControlFor(path: string): string {
  return /\.html?$/i.test(path) ? "public, max-age=60" : "public, max-age=31536000, immutable";
}
