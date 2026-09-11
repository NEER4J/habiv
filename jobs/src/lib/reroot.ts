import type { ZipEntry } from "./zip";
import { RejectError } from "./validate";

export type RootedEntry = { path: string; entry: ZipEntry };

const ENTRY_CANDIDATES = ["index.html", "index.htm"];

/**
 * Finds the bundle root: the directory holding index.html when the archive was zipped
 * with a wrapping folder. Falls back to the only .html file at the shallowest depth.
 * Returns entries re-keyed relative to that root plus the entry file name.
 */
export function reroot(entries: ZipEntry[]): { files: RootedEntry[]; entry: string; rerooted: string | null } {
  const names = entries.map((e) => e.name);

  const rootIndex = names.find((n) => ENTRY_CANDIDATES.includes(n.toLowerCase()));
  if (rootIndex) {
    return { files: entries.map((e) => ({ path: e.name, entry: e })), entry: rootIndex, rerooted: null };
  }

  // Directories containing an index.html
  const dirs = new Map<string, string>();
  for (const n of names) {
    const i = n.lastIndexOf("/");
    if (i === -1) continue;
    const base = n.slice(i + 1).toLowerCase();
    if (ENTRY_CANDIDATES.includes(base)) dirs.set(n.slice(0, i + 1), n.slice(i + 1));
  }
  if (dirs.size >= 1) {
    // Prefer the shallowest; if several at the same depth, prefer the one with the most files under it.
    const ranked = [...dirs.keys()].sort((a, b) => a.split("/").length - b.split("/").length || countUnder(names, b) - countUnder(names, a));
    const root = ranked[0];
    const entry = dirs.get(root)!;
    const files = entries.filter((e) => e.name.startsWith(root)).map((e) => ({ path: e.name.slice(root.length), entry: e }));
    return { files, entry, rerooted: root };
  }

  // Single html anywhere (AI single-file games saved under any name)
  const htmls = names.filter((n) => /\.html?$/i.test(n)).sort((a, b) => a.split("/").length - b.split("/").length);
  if (htmls.length >= 1) {
    const chosen = htmls[0];
    const i = chosen.lastIndexOf("/");
    const root = i === -1 ? "" : chosen.slice(0, i + 1);
    const files = entries.filter((e) => e.name.startsWith(root)).map((e) => ({ path: e.name.slice(root.length), entry: e }));
    return { files, entry: chosen.slice(root.length), rerooted: root || null };
  }

  throw new RejectError("no_entry", "No index.html found in the archive.");
}

function countUnder(names: string[], prefix: string): number {
  let n = 0;
  for (const x of names) if (x.startsWith(prefix)) n++;
  return n;
}
