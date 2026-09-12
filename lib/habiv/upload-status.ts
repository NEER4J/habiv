/** Short labels for game_versions.reject_reason (set by ingest, the smoke run and Stop). */
export const rejectReasonLabel: Record<string, string> = {
  no_entry: "No index.html found",
  too_many_files: "Over 1,000 files",
  too_large: "Over the size limit",
  file_too_large: "A file is too large",
  banned_file: "Contains executables",
  http_reference: "Uses insecure http:// resources",
  zip_bomb: "Suspicious compression",
  corrupt_zip: "Could not read the zip",
  source_expired: "Upload expired before the check",
  internal_error: "The check failed on our side",
  conversion_unavailable: "Engine conversion unavailable",
  never_painted: "The game never drew anything",
  aborted: "Stopped",
};

export function rejectLabel(reason: string | null): string {
  if (!reason) return "Failed";
  return rejectReasonLabel[reason] ?? reason.replace(/_/g, " ");
}
