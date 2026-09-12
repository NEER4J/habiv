import "server-only";
import { unzipSync } from "fflate";

const depth = (p: string) => p.split("/").length;
const dirOf = (p: string) => p.slice(0, p.lastIndexOf("/") + 1);

/**
 * An uploaded bundle as {path: bytes}, so an update can change a few files and keep the rest.
 * A lone html file becomes index.html. A zip is re-rooted the way ingest does it
 * (jobs/src/lib/reroot.ts), so paths match what get_game_files lists: the shallowest folder with
 * an index.html, else the shallowest html file's folder; files outside that folder are dropped.
 * Throws past `maxBytes` unzipped.
 */
export function readBundle(bytes: Uint8Array, isZip: boolean, maxBytes: number): Record<string, Uint8Array> {
  if (!isZip) return { "index.html": bytes };
  let total = 0;
  const files = unzipSync(bytes, {
    filter: (f) => {
      if (f.name.endsWith("/") || f.name.startsWith("__MACOSX/")) return false;
      total += f.originalSize;
      if (total > maxBytes) throw new Error("Bundle too large to merge.");
      return true;
    },
  });
  const names = Object.keys(files);
  if (names.some((n) => /^index\.html?$/i.test(n))) return files;

  const under = (dir: string) => names.filter((n) => n.startsWith(dir)).length;
  const indexDirs = Array.from(new Set(names.filter((n) => /\/index\.html?$/i.test(n)).map(dirOf)));
  const htmls = names.filter((n) => /\.html?$/i.test(n)).sort((a, b) => depth(a) - depth(b));
  const root = indexDirs.sort((a, b) => depth(a) - depth(b) || under(b) - under(a))[0] ?? (htmls[0] ? dirOf(htmls[0]) : "");
  if (!root) return files;
  return Object.fromEntries(names.filter((n) => n.startsWith(root)).map((n) => [n.slice(root.length), files[n]]));
}
