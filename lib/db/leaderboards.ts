import { cacheLife, cacheTag } from "next/cache";
import { createAnonClient } from "@/lib/supabase/anon";
import { avatarUrlOf } from "@/lib/site";
import { nullable } from "@/lib/supabase/helpers";

export const leaderboardTag = (gameId: string) => `lb:${gameId}`;
export type BoardPeriod = "daily" | "weekly" | "alltime";

export type LeaderboardEntry = {
  rank: number;
  score: number;
  playerId: string;
  user: { id: string; handle: string; displayName: string; avatarUrl: string | null } | null;
  isBot: boolean;
  botLabel: string | null;
  at: string;
};

export type LeaderboardView = { id: string; key: string; period: BoardPeriod; sort: "asc" | "desc"; periodStart: string; entries: LeaderboardEntry[]; total: number };

function periodStart(period: BoardPeriod): string {
  const now = new Date();
  if (period === "alltime") return "1970-01-01";
  if (period === "weekly") {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const day = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - day);
    return d.toISOString().slice(0, 10);
  }
  return now.toISOString().slice(0, 10);
}

/** Top entries for a board. Cached ~30 s; invalidated on accepted scores. */
export async function getLeaderboard(gameId: string, key = "main", period: BoardPeriod = "daily", limit = 10): Promise<LeaderboardView | null> {
  "use cache";
  cacheTag(leaderboardTag(gameId));
  cacheLife({ stale: 30, revalidate: 30, expire: 300 });
  return readLeaderboard(gameId, key, period, limit);
}

/** Top entries for a board, read fresh (the watch page's live refresh). */
export async function readLeaderboard(gameId: string, key = "main", period: BoardPeriod = "daily", limit = 10): Promise<LeaderboardView | null> {
  const supabase = createAnonClient();
  const { data: board } = await supabase.from("leaderboards").select("id, key, period, sort").eq("game_id", gameId).eq("key", key).eq("period", period).maybeSingle();
  if (!board) return null;
  const ps = periodStart(period);
  const { data: entries, count } = await supabase
    .from("leaderboard_entries")
    .select("player_id, user_id, score, is_bot, bot_label, created_at", { count: "exact" })
    .eq("leaderboard_id", board.id)
    .eq("period_start", ps)
    .is("flagged", null)
    .order("score", { ascending: board.sort === "asc" })
    .order("created_at", { ascending: true })
    .limit(limit);
  const userIds = Array.from(new Set((entries ?? []).map((e) => e.user_id).filter((x): x is string => !!x)));
  const { data: users } = userIds.length ? await supabase.from("profiles").select("id, handle, display_name, avatar_path").in("id", userIds) : { data: [] as { id: string; handle: string; display_name: string | null; avatar_path: string | null }[] };
  const userMap = new Map((users ?? []).map((u) => [u.id, u]));
  return {
    id: board.id,
    key: board.key,
    period: board.period as BoardPeriod,
    sort: board.sort as "asc" | "desc",
    periodStart: ps,
    total: count ?? 0,
    entries: (entries ?? []).map((e, i) => {
      const u = e.user_id ? userMap.get(e.user_id) : null;
      return {
        rank: i + 1,
        score: Number(e.score),
        playerId: e.player_id,
        user: u ? { id: u.id, handle: u.handle, displayName: u.display_name ?? u.handle, avatarUrl: avatarUrlOf(u.avatar_path) } : null,
        isBot: e.is_bot,
        botLabel: e.bot_label,
        at: e.created_at,
      };
    }),
  };
}

/** The viewer's own rank (by player cookie or account). Never cached. */
export async function getViewerRank(gameId: string, playerId: string | null, userId: string | null, key = "main", period: BoardPeriod = "daily") {
  if (!playerId && !userId) return null;
  const { data } = await createAnonClient().rpc("leaderboard_rank", { p_game_id: gameId, p_key: key, p_period: period, p_player_id: nullable(playerId), p_user_id: nullable(userId) });
  const r = data?.[0];
  return r ? { rank: Number(r.rank), score: Number(r.score), total: Number(r.total) } : null;
}
