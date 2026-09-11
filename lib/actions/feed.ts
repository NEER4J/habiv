"use server";

import { getFeed, searchGames as searchGamesDb } from "@/lib/db/games";
import { fromFeedGame, type Game } from "@/lib/habiv/games";
import type { FeedSort, GameCategory } from "@/lib/db/types";

/** Next page of the feed for infinite scroll. Returns view-model games ready to render. */
export async function loadFeedPage(input: { sort?: FeedSort; category?: string | null; offset?: number; limit?: number }): Promise<{ items: Game[]; nextOffset: number | null }> {
  const category = input.category && input.category !== "All" ? (input.category.toLowerCase() as GameCategory) : null;
  const { items, nextOffset } = await getFeed({ sort: input.sort ?? "new", category, offset: input.offset ?? 0, limit: Math.min(input.limit ?? 12, 48) });
  return { items: items.map(fromFeedGame), nextOffset };
}

/** Search box results. */
export async function searchGames(q: string): Promise<Game[]> {
  const rows = await searchGamesDb(q, 12);
  return rows.map(fromFeedGame);
}
