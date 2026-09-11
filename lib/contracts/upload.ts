/** Upload limits while on free tiers (platform-plan §4.1). Raise once R2 storage is paid. */
export const MiB = 1024 * 1024;
export const MAX_UPLOAD_BYTES = 100 * MiB;
export const SINGLE_PUT_THRESHOLD = 20 * MiB;
export const PART_SIZE = 8 * MiB;
export const MAX_PARTS = Math.ceil(MAX_UPLOAD_BYTES / PART_SIZE);
export const CREATOR_QUOTA_BYTES = 250 * MiB;
export const KEEP_VERSIONS_PER_GAME = 3;
export const ACCEPTED_UPLOAD_EXT = [".zip", ".html", ".htm"] as const;
export const UPLOAD_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export type UploadMode = "multipart" | "single" | "dedupe";

export type CreateUploadRequest = {
  filename: string;
  size: number;
  sha256: string;
  gameId?: string;
  title?: string;
};

export type CreateUploadResponse =
  | {
      ok: true;
      mode: UploadMode;
      gameId: string;
      versionId: string;
      version: number;
      key: string;
      uploadId?: string;
      putUrl?: string;
      partSize: number;
      expiresAt: string;
    }
  | { ok: false; code: string; error: string };

export type VersionStatusResponse =
  | {
      ok: true;
      versionId: string;
      gameId: string;
      version: number;
      status: "uploaded" | "processing" | "ready" | "rejected";
      engine: string | null;
      needsIsolation: boolean;
      usesNetwork: boolean;
      sizeBytes: number | null;
      fileCount: number | null;
      rejectReason: string | null;
      warnings: string[];
      previewUrl: string | null;
    }
  | { ok: false; code: string; error: string };

export function extensionOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i === -1 ? "" : filename.slice(i).toLowerCase();
}

export function safeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "upload";
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return (cleaned || "upload").slice(0, 120);
}
