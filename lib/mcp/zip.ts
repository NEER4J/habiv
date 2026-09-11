import "server-only";
import { zipSync, strToU8 } from "fflate";

/** Builds a zip in memory from {path: bytes}. Paths are normalised to forward slashes. */
export function buildZip(files: Record<string, Uint8Array | string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [path, body] of Object.entries(files)) {
    const clean = path.replace(/\\/g, "/").replace(/^\.?\//, "");
    entries[clean] = typeof body === "string" ? strToU8(body) : body;
  }
  return zipSync(entries, { level: 6 });
}
