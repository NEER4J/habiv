"use server";

import { revalidateTag, updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buckets } from "@/lib/storage";
import { enqueueIngest } from "@/lib/jobs/trigger";
import { FEED_TAG, gameTag } from "@/lib/db/games";
import { closeSessions, deleteVersionForCreator, removeFiles } from "@/lib/versions/cleanup";

/**
 * Controls for uploads and versions: stop, retry, delete (My games and the edit page's Versions list).
 * Ownership is checked against the caller's session; writes use the service role because
 * versions, upload sessions and game deletes have no client write policies.
 */

type Result = { ok: true } | { ok: false; error: string };

/** Same threshold as the sweeper (lib/jobs/trigger.ts): a check this quiet has died. */
const STUCK_AFTER_MS = 10 * 60_000;
/** Failures on our side that a plain re-run can fix; anything else needs a new build. */
const RETRYABLE = new Set(["internal_error"]);

async function callerId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ?? null;
}

type OwnedVersion = { id: string; game_id: string; status: string; upload_key: string | null; updated_at: string; reject_reason: string | null };

async function loadOwnedVersion(uid: string, versionId: string): Promise<OwnedVersion | null> {
  const { data } = await createAdminClient()
    .from("game_versions")
    // games is linked twice (game_id and games.current_version_id), so the embed names its FK.
    .select("id, game_id, status, upload_key, updated_at, reject_reason, games!game_versions_game_id_fkey!inner(creator_id)")
    .eq("id", versionId)
    .maybeSingle();
  const row = data as unknown as (OwnedVersion & { games: { creator_id: string } }) | null;
  if (!row || row.games.creator_id !== uid) return null;
  return row;
}

function refresh(uid: string, gameId: string) {
  updateTag(gameTag(gameId));
  revalidateTag(`creator-games:${uid}`, "max");
}

/** Stops an upload or a build check. An ingest already running sees the stop when it ends and drops its output. */
export async function stopUpload(versionId: string): Promise<Result> {
  const uid = await callerId();
  if (!uid) return { ok: false, error: "Sign in first." };
  const v = await loadOwnedVersion(uid, versionId);
  if (!v) return { ok: false, error: "Version not found." };
  if (v.status !== "uploaded" && v.status !== "processing") return { ok: false, error: "This version is not uploading or being checked any more." };
  await closeSessions([v.id]);
  const { data: stopped } = await createAdminClient()
    .from("game_versions")
    .update({ status: "rejected", reject_reason: "aborted" })
    .eq("id", v.id)
    .in("status", ["uploaded", "processing"])
    .select("id");
  if (!stopped?.length) return { ok: false, error: "It finished just now. Refresh to see it." };
  if (v.upload_key) await removeFiles(buckets().uploads, [], [v.upload_key]);
  refresh(uid, v.game_id);
  return { ok: true };
}

/** Runs the checks again on the same upload: for a stuck check, or one that failed on our side. */
export async function retryProcessing(versionId: string): Promise<Result> {
  const uid = await callerId();
  if (!uid) return { ok: false, error: "Sign in first." };
  const v = await loadOwnedVersion(uid, versionId);
  if (!v) return { ok: false, error: "Version not found." };
  const stuck = v.status === "processing" && Date.now() - Date.parse(v.updated_at) > STUCK_AFTER_MS;
  const retryable = v.status === "rejected" && RETRYABLE.has(v.reject_reason ?? "");
  if (!stuck && !retryable) return { ok: false, error: "Only a stuck or failed check can be retried. Upload the game again instead." };
  if (!v.upload_key) return { ok: false, error: "The upload is gone. Upload the game again." };
  await createAdminClient()
    .from("game_versions")
    .update({ status: "processing", reject_reason: null, ingest_run_id: `retry:${crypto.randomUUID()}` })
    .eq("id", v.id);
  await enqueueIngest(v.id);
  refresh(uid, v.game_id);
  return { ok: true };
}

/** Deletes a game that never went public, with every version, upload and stored file. */
export async function deleteUnpublishedGame(gameId: string): Promise<Result> {
  const uid = await callerId();
  if (!uid) return { ok: false, error: "Sign in first." };
  const admin = createAdminClient();
  const { data: g } = await admin.from("games").select("id, creator_id, status, published_at").eq("id", gameId).maybeSingle();
  if (!g || g.creator_id !== uid) return { ok: false, error: "Game not found." };
  if (g.published_at || (g.status !== "draft" && g.status !== "processing")) {
    return { ok: false, error: "Only games that never went public can be deleted. Hide this one instead." };
  }

  const { data: versions } = await admin.from("game_versions").select("id").eq("game_id", gameId);
  const ids = (versions ?? []).map((v) => v.id);
  if (ids.length) {
    await closeSessions(ids);
    // A late ingest finds its version gone or stopped and drops what it wrote.
    await admin.from("game_versions").update({ status: "rejected", reject_reason: "aborted" }).in("id", ids).in("status", ["uploaded", "processing"]);
  }
  const { error } = await admin.from("games").delete().eq("id", gameId);
  if (error) return { ok: false, error: error.message };

  const b = buckets();
  await Promise.all([
    removeFiles(b.uploads, ids.map((id) => `uploads/${uid}/${id}/`)),
    removeFiles(b.games, [`${gameId}/`]),
    removeFiles(b.public, [`covers/${gameId}/`, `cards/${gameId}/`]),
  ]);
  refresh(uid, gameId);
  return { ok: true };
}

/** Deletes any version except the current one: a failed upload, or an old build nobody should play any more. */
export async function deleteVersion(versionId: string): Promise<Result> {
  const uid = await callerId();
  if (!uid) return { ok: false, error: "Sign in first." };
  const res = await deleteVersionForCreator(uid, versionId);
  if (!res.ok) return { ok: false, error: res.error };
  refresh(uid, res.gameId);
  // The game page's version list is part of the cached game detail.
  revalidateTag(FEED_TAG, "max");
  return { ok: true };
}
