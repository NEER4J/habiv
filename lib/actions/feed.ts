"use server";

import { getBuiltWithCounts, getFeed, searchGames as searchGamesDb } from "@/lib/db/games";
import { fromFeedGame, type Game } from "@/lib/habiv/games";
import type { FeedSort, GameCategory } from "@/lib/db/types";

const filterValue = (v: string | null | undefined) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : null);

/** Next page of the feed for infinite scroll. Returns view-model games ready to render. */
export async function loadFeedPage(input: {
  sort?: FeedSort;
  category?: string | null;
  model?: string | null;
  agent?: string | null;
  /** creator handle */
  creator?: string | null;
  offset?: number;
  limit?: number;
}): Promise<{ items: Game[]; nextOffset: number | null }> {
  const category = input.category && input.category !== "All" ? (input.category.toLowerCase() as GameCategory) : null;
  const { items, nextOffset } = await getFeed({
    sort: input.sort ?? "new",
    category,
    model: filterValue(input.model),
    agent: filterValue(input.agent),
    creator: filterValue(input.creator),
    offset: input.offset ?? 0,
    limit: Math.min(input.limit ?? 12, 48),
  });
  return { items: items.map(fromFeedGame), nextOffset };
}

/** Most used models and tools, for the search overlay shortcuts. */
export async function loadBuiltWith(): Promise<{ models: [string, number][]; agents: [string, number][] }> {
  return getBuiltWithCounts();
}

/** Search box results. */
export async function searchGames(q: string): Promise<Game[]> {
  const rows = await searchGamesDb(q, 12);
  return rows.map(fromFeedGame);
}
