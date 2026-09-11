import { cacheLife, cacheTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createAnonClient } from "@/lib/supabase/anon";
import { asFeedRow, toFeedGame } from "@/lib/db/games";
import type { FeedGame } from "@/lib/db/types";

export type ViewerState = { liked: Set<string>; saved: Set<string>; following: Set<string> };

/** Per-viewer flags for a set of games. Never cached; call inside Suspense. */
export async function getViewerState(supabase: SupabaseClient<Database>, gameIds: string[], creatorIds: string[] = []): Promise<ViewerState> {
  const empty: ViewerState = { liked: new Set(), saved: new Set(), following: new Set() };
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid || (!gameIds.length && !creatorIds.length)) return empty;
  const [likes, saves, follows] = await Promise.all([
    gameIds.length ? supabase.from("likes").select("game_id").eq("user_id", uid).in("game_id", gameIds) : Promise.resolve({ data: [] as { game_id: string }[] }),
    gameIds.length ? supabase.from("saves").select("game_id").eq("user_id", uid).in("game_id", gameIds) : Promise.resolve({ data: [] as { game_id: string }[] }),
    creatorIds.length ? supabase.from("follows").select("creator_id").eq("follower_id", uid).in("creator_id", creatorIds) : Promise.resolve({ data: [] as { creator_id: string }[] }),
  ]);
  return {
    liked: new Set((likes.data ?? []).map((r) => r.game_id)),
    saved: new Set((saves.data ?? []).map((r) => r.game_id)),
    following: new Set((follows.data ?? []).map((r) => r.creator_id)),
  };
}

export async function isFollowing(supabase: SupabaseClient<Database>, creatorId: string): Promise<boolean> {
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return false;
  const { data } = await supabase.from("follows").select("creator_id").eq("follower_id", uid).eq("creator_id", creatorId).maybeSingle();
  return !!data;
}

/** The viewer's saved games, newest first. Never cached. */
export async function getSavedGames(supabase: SupabaseClient<Database>, limit = 60): Promise<FeedGame[]> {
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return [];
  const { data: saves } = await supabase.from("saves").select("game_id, created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(limit);
  const ids = (saves ?? []).map((s) => s.game_id);
  if (!ids.length) return [];
  const { data: rows } = await supabase.from("game_feed_v").select("*").in("id", ids);
  const byId = new Map((rows ?? []).map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r).map((r) => toFeedGame(asFeedRow(r)));
}

/** Creators the viewer follows (ids), for "from people you follow" rails. */
export async function getFollowingIds(supabase: SupabaseClient<Database>): Promise<string[]> {
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return [];
  const { data } = await supabase.from("follows").select("creator_id").eq("follower_id", uid);
  return (data ?? []).map((r) => r.creator_id);
}

/** Public followers/following lists for a profile (cached briefly). */
export async function getFollowers(userId: string, limit = 50) {
  "use cache";
  cacheTag(`followers:${userId}`);
  cacheLife("minutes");
  const supabase = createAnonClient();
  const { data } = await supabase.from("follows").select("follower_id, created_at").eq("creator_id", userId).order("created_at", { ascending: false }).limit(limit);
  const ids = (data ?? []).map((r) => r.follower_id);
  if (!ids.length) return [];
  const { data: profiles } = await supabase.from("profiles").select("id, handle, display_name, avatar_path, is_verified").in("id", ids);
  return profiles ?? [];
}
