import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAnonClient } from "@/lib/supabase/anon";
import { nullable } from "@/lib/supabase/helpers";
import { asFeedRow, toFeedGame } from "@/lib/db/games";
import type { FeedGame } from "@/lib/db/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PlayHistoryEntry = {
  game: FeedGame;
  rounds: number;
  firstPlayedAt: string;
  lastPlayedAt: string;
  playedMs: number;
  lastScore: number | null;
  /** Best ranked score on the all-time board, or the highest run score when the game has no board. */
  bestScore: number | null;
  rank: number | null;
  boardTotal: number | null;
};

export type MyRun = { id: string; at: string; durationMs: number | null; score: number };

/** The viewer's recent scored runs on one game, newest first. Same trust rules as getPlayHistory. */
export async function getMyRuns(userId: string | null, playerId: string | null, gameId: string, limit = 20): Promise<MyRun[]> {
  const pid = playerId && UUID_RE.test(playerId) ? playerId.toLowerCase() : null;
  if ((!userId && !pid) || !UUID_RE.test(gameId)) return [];
  const { data, error } = await createAdminClient().rpc("my_runs", { p_user: nullable(userId), p_pid: nullable(pid), p_game: gameId, p_limit: limit });
  if (error) {
    console.error("my_runs", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ id: r.id, at: r.started_at, durationMs: r.duration_ms == null ? null : Number(r.duration_ms), score: Number(r.score) }));
}

/**
 * Games the viewer played (by account and by this browser's hv_pid), last played first. Runs live in
 * the unexposed analytics schema, so this reads through a service-role RPC: pass only ids the server
 * verified itself (auth claims, the hv_pid cookie). Never cached.
 */
export async function getPlayHistory(userId: string | null, playerId: string | null, limit = 60): Promise<PlayHistoryEntry[]> {
  const pid = playerId && UUID_RE.test(playerId) ? playerId.toLowerCase() : null;
  if (!userId && !pid) return [];
  const { data: rows, error } = await createAdminClient().rpc("play_history", { p_user: nullable(userId), p_pid: nullable(pid), p_limit: limit });
  if (error) {
    console.error("play_history", error.message);
    return [];
  }
  if (!rows?.length) return [];
  const { data: games } = await createAnonClient()
    .from("game_feed_v")
    .select("*")
    .in("id", rows.map((r) => r.game_id));
  const byId = new Map((games ?? []).map((g) => [g.id, g]));
  return rows.flatMap((r) => {
    const g = byId.get(r.game_id);
    // Unpublished or removed since it was played.
    if (!g) return [];
    return [
      {
        game: toFeedGame(asFeedRow(g)),
        rounds: Number(r.rounds),
        firstPlayedAt: r.first_played_at,
        lastPlayedAt: r.last_played_at,
        playedMs: Number(r.played_ms),
        lastScore: r.last_score == null ? null : Number(r.last_score),
        bestScore: r.best_score == null ? null : Number(r.best_score),
        rank: r.board_rank == null ? null : Number(r.board_rank),
        boardTotal: r.board_total == null ? null : Number(r.board_total),
      },
    ];
  });
}
