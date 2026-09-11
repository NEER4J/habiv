import type { ZipEntry } from "./zip";
import {
  ALLOWED_EXT, BANNED_EXT, MAX_BUNDLE_RATIO, MAX_ENTRY_RATIO, MAX_EXTRACTED_BYTES, MAX_FILES,
  MAX_PATH_LENGTH, MAX_SINGLE_FILE, MAX_SOURCEMAP_BYTES, STRIP_DIRS, STRIP_FILES,
} from "./limits";
import type { RejectReason } from "../contracts/ingest";

export class RejectError extends Error {
  constructor(public reason: RejectReason, message: string) {
    super(message);
  }
}

export function extOf(name: string): string {
  const base = name.slice(name.lastIndexOf("/") + 1);
  const i = base.lastIndexOf(".");
  return i === -1 ? "" : base.slice(i + 1).toLowerCase();
}

/** Extension of the underlying file for .br/.gz wrapped assets (foo.wasm.br -> wasm). */
export function innerExt(name: string): string {
  const e = extOf(name);
  if (e === "br" || e === "gz") return extOf(name.slice(0, name.length - e.length - 1));
  return e;
}

export type ValidatedEntry = ZipEntry;

/** Applies the §4.1 rules. Returns the entries to keep plus warnings for dropped files. */
export function validateEntries(entries: ZipEntry[], uploadBytes: number): { kept: ValidatedEntry[]; warnings: string[] } {
  const warnings: string[] = [];
  const kept: ValidatedEntry[] = [];
  let extracted = 0;

  for (const e of entries) {
    if (e.isDir) continue;
    const name = e.name;
    if (name.startsWith("/") || /(^|\/)\.\.(\/|$)/.test(name) || name.includes("\0") || /^[A-Za-z]:/.test(name)) {
      throw new RejectError("bad_path", `Unsafe path in archive: ${name.slice(0, 120)}`);
    }
    if (e.isSymlink) throw new RejectError("bad_path", `Symlinks are not allowed: ${name}`);
    if (name.length > MAX_PATH_LENGTH) throw new RejectError("bad_path", `Path longer than ${MAX_PATH_LENGTH} chars: ${name.slice(0, 60)}…`);

    const base = name.slice(name.lastIndexOf("/") + 1);
    if (STRIP_DIRS.some((d) => name.startsWith(d) || name.includes(`/${d}`)) || STRIP_FILES.has(base)) continue;

    const ext = extOf(name);
    if (BANNED_EXT.has(ext) || BANNED_EXT.has(innerExt(name))) {
      throw new RejectError("banned_file", `Executable or library files are not allowed: ${name}`);
    }
    if (ext === "map" && e.size > MAX_SOURCEMAP_BYTES) {
      warnings.push(`Dropped large source map ${name}`);
      continue;
    }
    if (ext && !ALLOWED_EXT.has(ext)) {
      warnings.push(`Dropped unsupported file type: ${name}`);
      continue;
    }
    if (e.size > MAX_SINGLE_FILE) throw new RejectError("file_too_large", `${name} is over ${MAX_SINGLE_FILE / 1048576} MB`);
    if (e.compressed > 0 && e.size / e.compressed > MAX_ENTRY_RATIO && e.size > 1024 * 1024) {
      throw new RejectError("zip_bomb", `Suspicious compression ratio on ${name}`);
    }
    extracted += e.size;
    kept.push(e);
  }

  if (kept.length === 0) throw new RejectError("no_entry", "The archive has no usable files.");
  if (kept.length > MAX_FILES) throw new RejectError("too_many_files", `Bundles are capped at ${MAX_FILES} files (this one has ${kept.length}).`);
  if (extracted > MAX_EXTRACTED_BYTES) throw new RejectError("too_large", `Extracted size ${(extracted / 1048576).toFixed(0)} MB is over the ${MAX_EXTRACTED_BYTES / 1048576} MB cap.`);
  if (uploadBytes > 0 && extracted / uploadBytes > MAX_BUNDLE_RATIO && extracted > 10 * 1024 * 1024) {
    throw new RejectError("zip_bomb", "Suspicious overall compression ratio.");
  }
  return { kept, warnings };
}
