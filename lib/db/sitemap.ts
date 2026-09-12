import { cacheLife, cacheTag } from "next/cache";
import { createAnonClient } from "@/lib/supabase/anon";
import { cdnUrl } from "@/lib/site";
import { FEED_TAG } from "@/lib/db/games";

export type SitemapGame = { path: string; title: string; updatedAt: string; image: string | null };
export type SitemapCreator = { path: string; updatedAt: string };

const PAGE = 1000;
/** One sitemap file holds 50,000 URLs; past this, split with generateSitemaps. */
const MAX_GAMES = 45_000;

/**
 * Every published game (game_feed_v only has published games from unbanned creators) and every
 * creator with at least one of them. PostgREST caps a response at 1,000 rows, so this pages.
 */
export async function getSitemapEntries(): Promise<{ games: SitemapGame[]; creators: SitemapCreator[] }> {
  "use cache";
  cacheTag(FEED_TAG, "sitemap");
  cacheLife("hours");
  const supabase = createAnonClient();
  const games: SitemapGame[] = [];
  const creators = new Map<string, string>();
  for (let from = 0; from < MAX_GAMES; from += PAGE) {
    const { data, error } = await supabase
      .from("game_feed_v")
      .select("id, creator_handle, slug, title, updated_at, cover_path")
      .order("published_at", { ascending: false })
      .order("id")
      .range(from, from + PAGE - 1);
    if (error || !data?.length) break;
    for (const r of data) {
      if (!r.creator_handle || !r.slug || !r.updated_at) continue;
      games.push({ path: `/@${r.creator_handle}/${r.slug}`, title: r.title ?? r.slug, updatedAt: r.updated_at, image: cdnUrl(r.cover_path) });
      const seen = creators.get(r.creator_handle);
      if (!seen || seen < r.updated_at) creators.set(r.creator_handle, r.updated_at);
    }
    if (data.length < PAGE) break;
  }
  return { games, creators: Array.from(creators, ([handle, updatedAt]) => ({ path: `/@${handle}`, updatedAt })) };
}
