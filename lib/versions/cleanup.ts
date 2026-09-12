import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { abortMultipart, buckets } from "@/lib/storage";
import { deleteKeys, listPrefix } from "@/jobs/src/lib/storage";

/**
 * Storage and row cleanup for versions, shared by the My games / edit page actions
 * (lib/actions/uploads.ts) and the MCP delete_version tool. Server-only, so none of it is
 * callable from the browser; callers check ownership first or go through deleteVersionForCreator.
 */

/** Best effort: a storage hiccup must never keep a creator from stopping or deleting. */
export async function removeFiles(bucket: string, prefixes: string[], keys: string[] = []) {
  try {
    const all = [...keys];
    for (const p of prefixes) all.push(...(await listPrefix(bucket, p)));
    if (all.length) await deleteKeys(bucket, all);
  } catch (e) {
    console.warn("storage cleanup failed", bucket, e);
  }
}

/** Cancels any storage upload still open for these versions. */
export async function closeSessions(versionIds: string[]) {
  const admin = createAdminClient();
  const { data: open } = await admin.from("upload_sessions").select("id, key, mode, r2_upload_id").in("version_id", versionIds).eq("status", "open");
  if (!open?.length) return;
  for (const s of open) {
    if (s.mode === "multipart" && s.r2_upload_id) {
      await abortMultipart(buckets().uploads, s.key, s.r2_upload_id).catch((e) => console.warn("abortMultipart", e));
    }
  }
  await admin.from("upload_sessions").update({ status: "aborted" }).in("id", open.map((s) => s.id));
}

export type DeleteVersionResult = { ok: true; gameId: string; version: number } | { ok: false; code: "not_found" | "live" | "failed"; error: string };

/**
 * Deletes one version of a creator's game with its upload and bundle files, whatever its status.
 * The current version stays: switch to another one first. A check still running finds the row
 * gone and drops what it wrote (jobs/src/lib/ingest.ts finalize).
 */
export async function deleteVersionForCreator(uid: string, versionId: string): Promise<DeleteVersionResult> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("game_versions")
    // games is linked twice (game_id and games.current_version_id), so the embed names its FK.
    .select("id, game_id, version, games!game_versions_game_id_fkey!inner(creator_id, current_version_id)")
    .eq("id", versionId)
    .maybeSingle();
  const row = data as unknown as { id: string; game_id: string; version: number; games: { creator_id: string; current_version_id: string | null } } | null;
  if (!row || row.games.creator_id !== uid) return { ok: false, code: "not_found", error: "Version not found." };
  if (row.games.current_version_id === row.id) {
    return { ok: false, code: "live", error: "This is the version players get. Make another version live first." };
  }
  await closeSessions([row.id]);
  const { error } = await admin.from("game_versions").delete().eq("id", row.id);
  if (error) return { ok: false, code: "failed", error: error.message };
  const b = buckets();
  await Promise.all([removeFiles(b.uploads, [`uploads/${uid}/${row.id}/`]), removeFiles(b.games, [`${row.game_id}/${row.id}/`])]);
  return { ok: true, gameId: row.game_id, version: row.version };
}
