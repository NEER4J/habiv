import { cacheLife, cacheTag } from "next/cache";
import { createAnonClient } from "@/lib/supabase/anon";
import { FEED_TAG, asFeedRow, getFeed, toFeedGame } from "@/lib/db/games";
import type { FeedGame, GameCategory } from "@/lib/db/types";

export const getTrending = (limit = 24, offset = 0, category?: GameCategory | null) => getFeed({ limit, offset, category, sort: "trending" });
export const getHot = (limit = 24, offset = 0, category?: GameCategory | null) => getFeed({ limit, offset, category, sort: "hot" });
export const getNewest = (limit = 24, offset = 0, category?: GameCategory | null) => getFeed({ limit, offset, category, sort: "new" });

/** Total plays today across the site, for the "18,402 runs today" line. */
export async function getRunsToday(): Promise<number> {
  "use cache";
  cacheTag(FEED_TAG);
  cacheLife({ stale: 60, revalidate: 60, expire: 300 });
  const { data } = await createAnonClient().rpc("runs_today");
  return Number(data ?? 0);
}

export type DailyPick = { game: FeedGame; resetsAt: string; runsToday: number };

/**
 * Today's featured game. Phase 5 replaces the pick with the daily_challenges table; until then
 * it is the hottest game, stable for the UTC day.
 */
export async function getDaily(): Promise<DailyPick | null> {
  "use cache";
  cacheTag(FEED_TAG, "daily");
  cacheLife({ stale: 300, revalidate: 300, expire: 3600 });
  const supabase = createAnonClient();
  const midnight = new Date();
  midnight.setUTCHours(24, 0, 0, 0);
  const { data: daily } = await supabase.from("daily_challenges").select("game_id").eq("day", new Date().toISOString().slice(0, 10)).maybeSingle();
  let row = null;
  if (daily?.game_id) {
    const { data } = await supabase.from("game_feed_v").select("*").eq("id", daily.game_id).maybeSingle();
    row = data;
  }
  if (!row) {
    const { data } = await supabase.from("game_feed_v").select("*").order("hot_score", { ascending: false }).order("published_at", { ascending: false }).limit(1).maybeSingle();
    row = data;
  }
  if (!row?.id) return null;
  const feedRow = asFeedRow(row);
  const today = new Date().toISOString().slice(0, 10);
  const { data: d } = await supabase.from("game_daily").select("plays").eq("game_id", feedRow.id).eq("day", today).maybeSingle();
  return { game: toFeedGame(feedRow), resetsAt: midnight.toISOString(), runsToday: d?.plays ?? 0 };
}

/** Games published in the last 7 days (sidebar stat). */
export async function getBuiltThisWeek(): Promise<number> {
  "use cache";
  cacheTag(FEED_TAG);
  cacheLife("minutes");
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const { count } = await createAnonClient().from("game_feed_v").select("id", { count: "exact", head: true }).gte("published_at", since);
  return count ?? 0;
}
