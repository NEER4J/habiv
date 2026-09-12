/**
 * Server-side loaders that assemble the props each Habiv view receives. Pages call these
 * inside <Suspense>; views are client components that render the result.
 */
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Licence, Orientation } from "@/lib/habiv/game-details";
import { FEED_TAG, asFeedRow, toFeedGame, getFeed, getBuiltWithCounts, getCategoryCounts, getGameByHandleSlug, getCreatorGames, getOwnGames } from "@/lib/db/games";
import { getDaily, getRunsToday } from "@/lib/db/feed";
import { getLeaderboard, getViewerRank, type LeaderboardView } from "@/lib/db/leaderboards";
import { listComments, type CommentItem } from "@/lib/db/comments";
import { getViewerState, getSavedGames, getFollowers } from "@/lib/db/social";
import { getPublicStats, getCreatorTotals } from "@/lib/db/stats";
import { getOwnProfile, type OwnProfile, type PublicProfile } from "@/lib/db/profiles";
import { listTokens, type ApiTokenSummary } from "@/lib/db/tokens";
import { fromFeedGame, fromGameDetail, type CategoryInfo, type Game, type GameFull } from "@/lib/habiv/games";
import type { CreatorGame } from "@/lib/db/types";
import type { SdkInfo } from "@/lib/contracts/ingest";
import { readSdk } from "@/lib/habiv/sdk";
import { cdnUrl } from "@/lib/site";

export type Section = { key: string; title: string; note: string; games: Game[] };

export type HomeData = {
  hero: Game | null;
  featured: Game[];
  daily: { game: Game; resetsAt: string; runsToday: number; board: LeaderboardView | null } | null;
  runsToday: number;
  categories: CategoryInfo[];
  sections: Section[];
  feed: { items: Game[]; nextOffset: number | null };
};

/**
 * Public data only, so it is cached like the feed it reads. The cache scope is also what lets
 * relativeTime() call Date.now() while "/" is prerendered.
 */
export async function loadHome(): Promise<HomeData> {
  "use cache";
  cacheTag(FEED_TAG);
  cacheLife({ stale: 60, revalidate: 60, expire: 300 });
  const [featured, trending, quick, plays, remixes, newest, daily, runsToday, categories, feed] = await Promise.all([
    getFeed({ sort: "featured", limit: 6 }),
    getFeed({ sort: "trending", limit: 5 }),
    getFeed({ sort: "quick", limit: 5 }),
    getFeed({ sort: "plays", limit: 5 }),
    getFeed({ sort: "remixes", limit: 5 }),
    getFeed({ sort: "new", limit: 5 }),
    getDaily(),
    getRunsToday(),
    getCategoryCounts(),
    getFeed({ sort: "new", limit: 12 }),
  ]);
  const featuredGames = featured.items.map(fromFeedGame);
  const hero = featuredGames[0] ?? trending.items.map(fromFeedGame)[0] ?? feed.items.map(fromFeedGame)[0] ?? null;
  const board = daily ? await getLeaderboard(daily.game.id, "daily", "daily", 5) : null;
  const sections: Section[] = [
    { key: "trending", title: "Trending right now", note: "activity in the last 24 hours", games: trending.items.map(fromFeedGame) },
    { key: "quick", title: "Quick play", note: "finish a run in under 45 seconds", games: quick.items.map(fromFeedGame) },
    { key: "plays", title: "Most played", note: "by lifetime runs", games: plays.items.map(fromFeedGame) },
    { key: "remixes", title: "Most remixed", note: "originals and their forks", games: remixes.items.map(fromFeedGame) },
    { key: "new", title: "New this week", note: "fresh builds", games: newest.items.map(fromFeedGame) },
    { key: "featured", title: "Staff picks", note: "chosen by hand", games: featuredGames },
  ].filter((s) => s.games.length > 0);
  return {
    hero,
    featured: featuredGames.length ? featuredGames.slice(0, 4) : trending.items.slice(0, 4).map(fromFeedGame),
    daily: daily ? { game: fromFeedGame(daily.game), resetsAt: daily.resetsAt, runsToday: daily.runsToday, board } : null,
    runsToday,
    categories,
    sections,
    feed: { items: feed.items.map(fromFeedGame), nextOffset: feed.nextOffset },
  };
}

export type ExploreData = {
  categories: CategoryInfo[];
  feed: { items: Game[]; nextOffset: number | null };
  /** Games per model and per tool, feeding the explore filter chips. */
  builtWith: { models: [string, number][]; agents: [string, number][] };
};

export async function loadExplore(
  sort: "trending" | "new" | "plays" | "quick" = "new",
  category: string | null = null,
  model: string | null = null,
  agent: string | null = null,
): Promise<ExploreData> {
  "use cache";
  cacheTag(FEED_TAG);
  cacheLife({ stale: 60, revalidate: 60, expire: 300 });
  const [categories, feed, builtWith] = await Promise.all([
    getCategoryCounts(),
    getFeed({ sort, category: category as never, model, agent, limit: 24 }),
    getBuiltWithCounts(),
  ]);
  return { categories, feed: { items: feed.items.map(fromFeedGame), nextOffset: feed.nextOffset }, builtWith };
}

export type WatchViewer = {
  signedIn: boolean;
  userId: string | null;
  handle: string | null;
  playerId: string | null;
  liked: boolean;
  saved: boolean;
  following: boolean;
  isCreator: boolean;
  isAdmin: boolean;
  rank: { rank: number; score: number; total: number } | null;
};

export type WatchData = {
  game: GameFull;
  leaderboard: LeaderboardView | null;
  comments: { items: CommentItem[]; nextOffset: number | null };
  viewer: WatchViewer;
  queue: Game[];
  runsToday: number;
};

export async function loadWatch(handle: string, slug: string): Promise<WatchData | null> {
  const detail = await getGameByHandleSlug(handle, slug);
  if (!detail) return null;
  const supabase = await createClient();
  const cookieStore = await cookies();
  const playerId = cookieStore.get("hv_pid")?.value ?? null;
  const ownP = getOwnProfile(supabase);
  // The rank only needs the viewer's id, so it starts as soon as that resolves, not after everything else.
  const rankP = detail.leaderboardEnabled ? ownP.then((own) => getViewerRank(detail.id, playerId, own?.id ?? null, "main", "daily")) : Promise.resolve(null);
  const [own, viewerState, leaderboard, comments, queue, stats, runsToday, rank] = await Promise.all([
    ownP,
    getViewerState(supabase, [detail.id], [detail.creator.id]),
    detail.leaderboardEnabled ? getLeaderboard(detail.id, "main", "daily", 10) : Promise.resolve(null),
    listComments(supabase, detail.id, { sort: "top", limit: 20 }),
    getFeed({ sort: "hot", limit: 13 }),
    getPublicStats(detail.id),
    getRunsToday(),
    rankP,
  ]);
  const game = fromGameDetail(detail);
  if (stats) {
    game.plays = Number(stats.plays); game.likes = stats.likes; game.saves = stats.saves; game.comments = stats.comments;
    game.remixes = stats.remixes; game.runs = Number(stats.runs); game.completions = Number(stats.completions); game.bestScore = stats.best_score;
  }
  return {
    game,
    leaderboard,
    comments,
    viewer: {
      signedIn: !!own,
      userId: own?.id ?? null,
      handle: own?.handle ?? null,
      playerId,
      liked: viewerState.liked.has(detail.id),
      saved: viewerState.saved.has(detail.id),
      following: viewerState.following.has(detail.creator.id),
      isCreator: own?.id === detail.creator.id,
      isAdmin: !!own?.isAdmin,
      rank,
    },
    queue: queue.items.filter((g) => g.id !== detail.id).slice(0, 12).map(fromFeedGame),
    runsToday,
  };
}

export type ProfileData = {
  profile: PublicProfile;
  isSelf: boolean;
  following: boolean;
  games: Game[];
  remixes: Game[];
  liked: Game[];
  followers: { id: string; handle: string; display_name: string | null; avatar_path: string | null; is_verified: boolean }[];
  totals: { published: number; plays: number; runs: number; likes: number; remixes: number };
};

export async function loadProfile(profile: PublicProfile): Promise<ProfileData> {
  const supabase = await createClient();
  const ownP = getOwnProfile(supabase);
  // Liked games are only shown to the profile's owner; that chain starts once we know who is looking.
  const likedP = ownP.then(async (own): Promise<Game[]> => {
    if (own?.id !== profile.id) return [];
    const { data: likes } = await supabase.from("likes").select("game_id").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(30);
    const ids = (likes ?? []).map((l) => l.game_id);
    if (!ids.length) return [];
    const { data: rows } = await supabase.from("game_feed_v").select("*").in("id", ids);
    return (rows ?? []).map((r) => fromFeedGame(toFeedGame(asFeedRow(r))));
  });
  const [own, games, followers, totals, state, { data: remixRows }, liked] = await Promise.all([
    ownP,
    getCreatorGames(profile.id),
    getFollowers(profile.id, 30),
    getCreatorTotals(supabase, profile.id),
    getViewerState(supabase, [], [profile.id]),
    supabase.from("game_feed_v").select("*").eq("creator_id", profile.id).not("remixed_from_game_id", "is", null).limit(30),
    likedP,
  ]);
  const isSelf = own?.id === profile.id;
  const remixGames = (remixRows ?? []).map((r) => fromFeedGame(toFeedGame(asFeedRow(r))));
  return {
    profile,
    isSelf,
    following: state.following.has(profile.id),
    games: games.map(fromFeedGame),
    remixes: remixGames,
    liked,
    followers,
    totals,
  };
}

export type MyGamesData = { games: CreatorGame[]; totals: { published: number; plays: number; runs: number; likes: number; remixes: number }; handle: string; followers: number };

export async function loadMyGames(supabase: SupabaseClient<Database>, own: OwnProfile): Promise<MyGamesData> {
  const [games, totals] = await Promise.all([getOwnGames(supabase), getCreatorTotals(supabase, own.id)]);
  return { games, totals, handle: own.handle, followers: own.followersCount };
}

export type SettingsData = { profile: OwnProfile; tokens: ApiTokenSummary[]; email: string | null; provider: string | null };

/**
 * Null when signed out. Email and provider come from the verified JWT claims rather than
 * auth.getUser(), which is a network round trip to Supabase Auth on every call.
 */
export async function loadSettings(supabase: SupabaseClient<Database>): Promise<SettingsData | null> {
  const [own, { data: claims }, tokens] = await Promise.all([getOwnProfile(supabase), supabase.auth.getClaims(), listTokens(supabase)]);
  if (!own) return null;
  const c = claims?.claims;
  return { profile: own, tokens, email: c?.email ?? null, provider: (c?.app_metadata?.provider as string | undefined) ?? null };
}

export async function loadSaved(supabase: SupabaseClient<Database>): Promise<Game[]> {
  const games = await getSavedGames(supabase, 60);
  return games.map(fromFeedGame);
}

export type GameEditData = {
  game: {
    id: string;
    title: string;
    tagline: string;
    description: string | null;
    category: string;
    /** every category, main first */
    categories: string[];
    orientation: Orientation;
    remixLicence: Licence;
    durationSec: number | null;
    controls: unknown;
    tags: string[];
    status: string;
    /** Game page path while published, else null. */
    url: string | null;
    coverUrl: string | null;
    cardUrl: string | null;
    /** Accent hue (0–359); ready-made thumbnails use it for the "game colour" theme. */
    accentHue: number;
  };
  /** The live version (or the newest one for drafts); model, tool and prompt live here. */
  version: { id: string; version: number; model: string; agent: string; prompt: string } | null;
  /** SDK features found in that version's build; null when it predates detection or there is no build. */
  sdk: SdkInfo | null;
  leaderboard: { enabled: boolean; sort: "desc" | "asc" };
};

/** The creator's own game with every editable field: the edit-details page, and prefill for a new version. */
export async function loadGameEdit(supabase: SupabaseClient<Database>, own: OwnProfile, gameId: string): Promise<GameEditData | null> {
  const { data: g } = await supabase
    .from("games")
    .select("id, slug, title, tagline, description, category, categories, orientation, remix_licence, duration_sec, controls, status, current_version_id, cover_path, card_path, accent_hue, leaderboard_enabled")
    .eq("id", gameId)
    .eq("creator_id", own.id)
    .maybeSingle();
  if (!g) return null;
  const versionCols = "id, version, model, agent, prompt, manifest";
  const versionQuery = g.current_version_id
    ? supabase.from("game_versions").select(versionCols).eq("id", g.current_version_id).maybeSingle()
    : supabase.from("game_versions").select(versionCols).eq("game_id", g.id).order("version", { ascending: false }).limit(1).maybeSingle();
  // Tag links and the board config are read with the service role, after the ownership check above.
  const admin = createAdminClient();
  const [{ data: tagRows }, { data: v }, { data: board }] = await Promise.all([
    admin.from("game_tags").select("tags(name)").eq("game_id", g.id),
    versionQuery,
    admin.from("leaderboards").select("sort").eq("game_id", g.id).eq("key", "main").limit(1).maybeSingle(),
  ]);
  const tags = (tagRows ?? []).flatMap((r) => {
    const t = (r as { tags: { name: string } | { name: string }[] | null }).tags;
    return (Array.isArray(t) ? t : t ? [t] : []).map((x) => x.name);
  });
  return {
    game: {
      id: g.id,
      title: g.title,
      tagline: g.tagline ?? "",
      description: g.description,
      category: g.category,
      categories: g.categories?.length ? g.categories : [g.category],
      orientation: g.orientation as Orientation,
      remixLicence: g.remix_licence as Licence,
      durationSec: g.duration_sec,
      controls: g.controls,
      tags,
      status: g.status,
      url: g.status === "published" ? `/@${own.handle}/${g.slug}` : null,
      coverUrl: cdnUrl(g.cover_path),
      cardUrl: cdnUrl(g.card_path),
      accentHue: g.accent_hue,
    },
    version: v ? { id: v.id, version: v.version, model: v.model ?? "", agent: v.agent ?? "", prompt: v.prompt ?? "" } : null,
    sdk: readSdk(v?.manifest),
    leaderboard: { enabled: g.leaderboard_enabled, sort: board?.sort === "asc" ? "asc" : "desc" },
  };
}
