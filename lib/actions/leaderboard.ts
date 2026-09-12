"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { PLAYER_COOKIE } from "@/lib/supabase/proxy";
import { getViewerRank, readLeaderboard, type LeaderboardView } from "@/lib/db/leaderboards";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LiveBoard = { leaderboard: LeaderboardView | null; rank: Awaited<ReturnType<typeof getViewerRank>> };

/** Today's board and the viewer's place on it, read fresh for the watch page's live refresh. */
export async function refreshLeaderboard(gameId: string): Promise<LiveBoard | null> {
  if (!UUID_RE.test(gameId)) return null;
  const supabase = await createClient();
  const [{ data }, cookieStore] = await Promise.all([supabase.auth.getClaims(), cookies()]);
  const playerId = cookieStore.get(PLAYER_COOKIE)?.value ?? null;
  const [leaderboard, rank] = await Promise.all([
    readLeaderboard(gameId, "main", "daily", 50),
    getViewerRank(gameId, playerId, data?.claims?.sub ?? null, "main", "daily"),
  ]);
  return { leaderboard, rank };
}
