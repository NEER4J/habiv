import type { SupabaseClient } from "@supabase/supabase-js";
import { cacheLife, cacheTag } from "next/cache";
import type { Database, Tables } from "@/lib/supabase/database.types";
import { createAnonClient } from "@/lib/supabase/anon";
import { gameTag } from "@/lib/db/games";

export type CreatorStats = {
  stats: Tables<"game_stats"> | null;
  daily: Tables<"game_daily">[];
  retention: Tables<"retention_daily">[];
  last24h: { bucket: string; plays: number; uniques: number; completions: number }[];
};

/** Creator dashboard numbers for one game. RLS scopes daily/retention to the creator. Never cached. */
export async function getStatsForGame(supabase: SupabaseClient<Database>, gameId: string, days = 30): Promise<CreatorStats> {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const since24h = new Date(Date.now() - 86400000).toISOString();
  const [{ data: stats }, { data: daily }, { data: retention }, { data: buckets }] = await Promise.all([
    supabase.from("game_stats").select("*").eq("game_id", gameId).maybeSingle(),
    supabase.from("game_daily").select("*").eq("game_id", gameId).gte("day", since).order("day"),
    supabase.from("retention_daily").select("*").eq("game_id", gameId).gte("cohort_day", since).order("cohort_day"),
    supabase.from("game_stats_5m").select("bucket, plays, uniques, completions").eq("game_id", gameId).gte("bucket", since24h).order("bucket"),
  ]);
  return { stats: stats ?? null, daily: daily ?? [], retention: retention ?? [], last24h: buckets ?? [] };
}

/** Public counters for the watch page tiles (cached with the game). */
export async function getPublicStats(gameId: string): Promise<Tables<"game_stats"> | null> {
  "use cache";
  cacheTag(gameTag(gameId));
  cacheLife("minutes");
  const { data } = await createAnonClient().from("game_stats").select("*").eq("game_id", gameId).maybeSingle();
  return data ?? null;
}

/** Aggregate creator totals across all their games (for the profile / my-games header). */
export async function getCreatorTotals(supabase: SupabaseClient<Database>, creatorId: string) {
  const { data: games } = await supabase.from("games").select("id, status").eq("creator_id", creatorId);
  const ids = (games ?? []).map((g) => g.id);
  if (!ids.length) return { published: 0, plays: 0, runs: 0, likes: 0, remixes: 0 };
  const { data: stats } = await supabase.from("game_stats").select("plays, runs, likes, remixes").in("game_id", ids);
  const sum = (k: "plays" | "runs" | "likes" | "remixes") => (stats ?? []).reduce((n, s) => n + Number(s[k] ?? 0), 0);
  return { published: (games ?? []).filter((g) => g.status === "published").length, plays: sum("plays"), runs: sum("runs"), likes: sum("likes"), remixes: sum("remixes") };
}
