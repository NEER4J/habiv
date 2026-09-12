import { zipSync, type Zippable } from "fflate";

/**
 * Turns a dropped or picked folder (or a handful of loose files) into one zip in the browser, so a
 * game that isn't zipped yet goes through the normal upload: same size cap, checks and resume.
 * The zip is deterministic (sorted paths, each file's own modified time), so picking the same
 * folder again gives the same bytes: the resume check and the server's dedupe both still match.
 */

export type PickedFile = { path: string; file: File };

/** Same as the ingest's strip lists (jobs/src/lib/limits.ts), so we don't upload what it throws away. */
const SKIP_DIRS = ["__MACOSX/", ".git/", "node_modules/", ".svn/", ".hg/", ".idea/", ".vscode/"];
const SKIP_FILES = new Set([".DS_Store", "Thumbs.db", "desktop.ini", ".gitignore", ".gitattributes"]);
/** Already compressed: stored as-is, which is faster and no bigger. */
const STORED = /\.(png|jpe?g|webp|gif|avif|mp3|ogg|oga|m4a|aac|mp4|webm|woff2?|zip|br|gz|unityweb|glb)$/i;
const MAX_FILES = 1000;
const MAX_RAW_BYTES = 300 * 1024 * 1024;
/** Zip dates start in 1980. */
const MIN_MTIME = Date.UTC(1980, 0, 2);

/**
 * Files from a drop, walking into folders. Must be called inside the drop handler, before any
 * await: the browser empties dataTransfer once the event is over.
 */
export function filesFromDrop(dt: DataTransfer): Promise<PickedFile[]> {
  const entries = Array.from(dt.items)
    .map((i) => (i.kind === "file" ? i.webkitGetAsEntry?.() : null))
    .filter((e): e is FileSystemEntry => !!e);
  const loose = Array.from(dt.files).map((file) => ({ path: file.name, file }));
  if (!entries.length) return Promise.resolve(loose);
  return (async () => {
    const out: PickedFile[] = [];
    await Promise.all(entries.map((e) => walk(e, out)));
    return out;
  })();
}

/** Files from an <input type="file" multiple> or a folder picker (webkitdirectory). */
export function filesFromInput(list: FileList): PickedFile[] {
  return Array.from(list).map((file) => ({ path: file.webkitRelativePath || file.name, file }));
}

/** True when the pick is one .zip or .html that can be uploaded as it is. */
export function isSingleBuild(picked: PickedFile[], accepted: readonly string[]) {
  if (picked.length !== 1) return false;
  const name = picked[0].file.name.toLowerCase();
  return accepted.some((ext) => name.endsWith(ext));
}

/** Zips the picked files. A single top folder becomes the zip's name and is dropped from the paths, so index.html sits at the root. */
export async function packFiles(picked: PickedFile[]): Promise<{ file: File; count: number }> {
  const kept = picked
    .map((p) => ({ ...p, path: p.path.replace(/\\/g, "/").replace(/^(\.?\/)+/, "") }))
    .filter((p) => p.path && !skip(p.path));
  if (!kept.length) throw new Error("There was nothing to upload in that selection.");
  if (kept.length > MAX_FILES) throw new Error(`That's ${kept.length.toLocaleString()} files. A game can have up to ${MAX_FILES.toLocaleString()}.`);
  const raw = kept.reduce((n, p) => n + p.file.size, 0);
  if (raw > MAX_RAW_BYTES) throw new Error("Those files add up to more than 300 MB. Leave out source files and anything the game doesn't load.");

  const top = commonTop(kept.map((p) => p.path));
  const rel = (p: string) => (top ? p.slice(top.length + 1) : p);
  if (!kept.some((p) => /\.html?$/i.test(p.path))) throw new Error("There's no HTML file in there. A game needs an index.html.");

  const entries: Zippable = {};
  for (const p of [...kept].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    const path = rel(p.path);
    entries[path] = [new Uint8Array(await p.file.arrayBuffer()), { level: STORED.test(path) ? 0 : 6, mtime: Math.max(p.file.lastModified || 0, MIN_MTIME) }];
  }
  const bytes = zipSync(entries);
  const lastModified = Math.max(...kept.map((p) => p.file.lastModified || 0));
  const name = `${(top || "game").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "game"}.zip`;
  return { file: new File([bytes as BlobPart], name, { type: "application/zip", lastModified }), count: kept.length };
}

function skip(path: string) {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return SKIP_FILES.has(name) || SKIP_DIRS.some((d) => path.startsWith(d) || path.includes(`/${d}`));
}

/** "my-game" when every path starts with "my-game/", else "". */
function commonTop(paths: string[]): string {
  const first = paths[0].split("/")[0];
  return paths.every((p) => p.includes("/") && p.split("/")[0] === first) ? first : "";
}

async function walk(entry: FileSystemEntry, out: PickedFile[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    out.push({ path: entry.fullPath.replace(/^\/+/, "") || file.name, file });
    return;
  }
  if (!entry.isDirectory) return;
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  // readEntries hands back folders in batches (about 100 in Chrome) until it returns none.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    await Promise.all(batch.map((e) => walk(e, out)));
  }
}
