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

/** Habiv SDK features a build uses; each unlocks something on the site (scores → leaderboards). */
export type SdkFeature = "scores" | "runs" | "levels" | "beat" | "saves" | "happytime";
/** Where the calls come from: the Habiv SDK itself or a third-party SDK our shims forward. */
export type SdkSource = "habiv" | "poki" | "crazygames" | "newgrounds";

export type SdkInfo = {
  /** found in the build's html/js at ingest, plus any seen at runtime by the smoke run */
  features: SdkFeature[];
  via: SdkSource[];
  /** bridge event types the smoke run saw the game post */
  seen?: string[];
};

/** Where the details came from, strongest first: a habiv.json at the bundle root, a <script type="application/habiv+json"> block, or <title>/<meta>. */
export type GameMetaSource = "habiv.json" | "inline" | "html";

/** Game details the build describes about itself (usually written by the AI that made it), cleaned to the site's limits. */
export type GameMeta = {
  sources: GameMetaSource[];
  title?: string;
  tagline?: string;
  description?: string;
  /** Lower-case slugs as written; the app keeps only categories it knows. */
  categories?: string[];
  tags?: string[];
  orientation?: "portrait" | "landscape" | "any";
  durationSec?: number;
  controls?: { keys: { key: string; action: string }[]; touch: string | null };
  model?: string;
  agent?: string;
  prompt?: string;
  changelog?: string;
};

export type IngestManifest = {
  entry: string;
  files: ManifestFile[];
  warnings: string[];
  engine: EngineId;
  notes?: string[];
  /** Absent on versions processed before SDK detection. */
  sdk?: SdkInfo;
  /** Details found in the build; absent when it describes nothing (or was processed before detection). */
  meta?: GameMeta;
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
