"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAnonClient } from "@/lib/supabase/anon";
import { getViewerRank } from "@/lib/db/leaderboards";
import { getPlayHistory } from "@/lib/db/history";
import { playedLabel, signScoreShare } from "@/lib/share/score";
import { siteUrl } from "@/lib/site";

export type ScoreShareLink = {
  /** Game link carrying the signed result; its og:image is the score card. */
  url: string;
  /** The card itself, same-origin, for the modal preview and Save image. */
  imagePath: string;
  text: string;
  score: number | null;
  rank: number | null;
  total: number | null;
  rounds: number;
};

/**
 * A share link for the viewer's own result on a game: best all-time score and place when the game
 * has a board, otherwise their best run score, otherwise rounds played. Built only from what the
 * server can verify (session and hv_pid cookie). Null when the viewer has not played it.
 */
export async function createScoreShare(gameId: string): Promise<ScoreShareLink | null> {
  if (!/^[0-9a-f-]{36}$/i.test(gameId)) return null;
  const supabase = await createClient();
  const [{ data: claims }, jar, { data: game }] = await Promise.all([
    supabase.auth.getClaims(),
    cookies(),
    createAnonClient().from("game_feed_v").select("id, slug, title, creator_handle, leaderboard_enabled").eq("id", gameId).maybeSingle(),
  ]);
  if (!game?.slug || !game.creator_handle) return null;
  const userId = claims?.claims?.sub ?? null;
  const playerId = jar.get("hv_pid")?.value ?? null;

  const [rank, history, profile] = await Promise.all([
    game.leaderboard_enabled ? getViewerRank(gameId, playerId, userId, "main", "alltime") : Promise.resolve(null),
    getPlayHistory(userId, playerId),
    userId ? supabase.from("profiles").select("handle, handle_set").eq("id", userId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const played = history.find((h) => h.game.id === gameId);
  const score = rank?.score ?? played?.bestScore ?? null;
  const rounds = played?.rounds ?? 0;
  if (score == null && !rounds) return null;

  const name = profile.data?.handle_set ? profile.data.handle : null;
  const token = signScoreShare({
    gameId,
    score,
    rank: rank?.rank ?? null,
    total: rank?.total ?? null,
    rounds,
    playedMs: played?.playedMs ?? 0,
    name,
    at: Math.floor(Date.now() / 1000),
  });
  const title = game.title ?? "this game";
  const text =
    score != null
      ? `I scored ${score.toLocaleString("en-US")} in ${title}${rank ? ` (#${rank.rank} of ${rank.total.toLocaleString("en-US")} all time)` : ""}. Can you beat it?`
      : `I've played ${rounds} ${rounds === 1 ? "round" : "rounds"} of ${title}${played?.playedMs ? ` (${playedLabel(played.playedMs)})` : ""} on Habiv. Your turn.`;
  return {
    url: `${siteUrl}/@${game.creator_handle}/${game.slug}?s=${token}`,
    imagePath: `/og/score/${token}`,
    text,
    score,
    rank: rank?.rank ?? null,
    total: rank?.total ?? null,
    rounds,
  };
}
