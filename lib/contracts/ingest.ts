/** Shared between the Next app and jobs/ (copied to jobs/src/contracts/ingest.ts; keep identical). */

export type IngestPayload = {
  versionId: string;
  /** Reuse an already-ingested bundle of the same creator (same sha256). */
  dedupeFromVersionId?: string;
};

export type EngineId =
  | "single_html"
  | "generic"
  | "unity"
  | "godot4"
  | "godot3"
  | "defold"
  | "construct"
  | "gdevelop"
  | "renpy"
  | "pico8"
  | "tic80"
  | "love"
  | "rpgmaker"
  | "scratch"
  | "flash"
  | "pygbag"
  | "twine"
  | "bitsy"
  | "unknown";

export type ManifestFile = {
  /** path relative to the bundle root */
  p: string;
  /** bytes as stored */
  b: number;
  /** content type served */
  t: string;
  /** content encoding served, if any */
  e?: "br" | "gzip";
};

export type IngestManifest = {
  entry: string;
  files: ManifestFile[];
  warnings: string[];
  engine: EngineId;
  notes?: string[];
};

export type RejectReason =
  | "no_entry"
  | "too_many_files"
  | "too_large"
  | "file_too_large"
  | "zip_bomb"
  | "banned_file"
  | "bad_path"
  | "http_reference"
  | "corrupt_zip"
  | "source_expired"
  | "quota_exceeded"
  | "aborted"
  | "internal_error";
