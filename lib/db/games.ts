import { cacheLife, cacheTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAnonClient } from "@/lib/supabase/anon";
import type { Database, Tables } from "@/lib/supabase/database.types";
import type { Views } from "@/lib/supabase/helpers";
import { cdnUrl } from "@/lib/site";
import { modelNamesForLab } from "@/lib/ai/catalog";
import type { CreatorGame, FeedGame, FeedSort, GameCategory, GameDetail, GameStatsSummary, GameVersionSummary, Orientation, RemixLicence, VersionStatus } from "@/lib/db/types";

export const FEED_TAG = "feed";
export const gameTag = (gameId: string) => `game:${gameId}`;

type FeedRowRaw = Views<"game_feed_v">;
/** The view joins games (all non-null) so the generated nullability is overly cautious; narrow it once here. */
type FeedRow = { [K in keyof FeedRowRaw]: K extends "id" | "short_id" | "slug" | "title" | "category" | "orientation" | "accent_hue" | "remix_licence" | "leaderboard_enabled" | "creator_id" | "creator_handle" | "creator_verified" | "followers_count" | "plays" | "unique_players" | "runs" | "completions" | "likes" | "saves" | "remixes" | "comments" | "trending_score" | "hot_score" | "created_at" | "updated_at" ? NonNullable<FeedRowRaw[K]> : FeedRowRaw[K] };
export type { FeedRow };
export const asFeedRow = (r: FeedRowRaw) => r as FeedRow;

function statsFromFeedRow(r: FeedRow): GameStatsSummary {
  return {
    plays: r.plays, uniquePlayers: r.unique_players, runs: r.runs, completions: r.completions,
    likes: r.likes, saves: r.saves, remixes: r.remixes, comments: r.comments, bestScore: r.best_score,
  };
}

export function toFeedGame(r: FeedRow): FeedGame {
  return {
    id: r.id,
    shortId: r.short_id,
    slug: r.slug,
    title: r.title,
    tagline: r.tagline,
    category: r.category as GameCategory,
    categories: (r.categories?.length ? r.categories : [r.category]) as GameCategory[],
    orientation: r.orientation as Orientation,
    accentHue: r.accent_hue,
    coverUrl: cdnUrl(r.cover_path),
    cardUrl: cdnUrl(r.card_path),
    durationSec: r.duration_sec,
    remixLicence: r.remix_licence as RemixLicence,
    leaderboardEnabled: r.leaderboard_enabled,
    creator: {
      id: r.creator_id,
      handle: r.creator_handle,
      displayName: r.creator_name ?? r.creator_handle,
      avatarUrl: cdnUrl(r.creator_avatar),
      isVerified: r.creator_verified,
      followersCount: r.followers_count,
    },
    stats: statsFromFeedRow(r),
    currentVersion: r.current_version_id
      ? {
          id: r.current_version_id,
          version: r.version_no ?? 1,
          engine: r.engine,
          sizeBytes: r.size_bytes,
          model: r.model,
          agent: r.agent,
          usesNetwork: !!r.uses_network,
          needsIsolation: !!r.needs_isolation,
        }
      : null,
    publishedAt: r.published_at,
    featured: r.featured_at != null,
    featuredRank: r.featured_rank ?? null,
    url: `/@${r.creator_handle}/${r.slug}`,
    shortUrl: `/g/${r.short_id}`,
  };
}

function toVersionSummary(v: Pick<Tables<"game_versions">, "id" | "version" | "status" | "engine" | "changelog" | "model" | "agent" | "prompt" | "size_bytes" | "created_at">): GameVersionSummary {
  return {
    id: v.id, version: v.version, status: v.status as VersionStatus, engine: v.engine, changelog: v.changelog,
    model: v.model, agent: v.agent, prompt: v.prompt, sizeBytes: v.size_bytes, createdAt: v.created_at,
  };
}

/** Public feed. Cached for about a minute; invalidated with FEED_TAG on publish. */
export async function getFeed(
  opts: { limit?: number; offset?: number; category?: GameCategory | null; sort?: FeedSort; model?: string | null; agent?: string | null } = {},
): Promise<{ items: FeedGame[]; nextOffset: number | null }> {
  "use cache";
  cacheTag(FEED_TAG);
  cacheLife("minutes");
  const limit = Math.min(Math.max(opts.limit ?? 24, 1), 60);
  const offset = Math.max(opts.offset ?? 0, 0);
  const sort = opts.sort ?? "new";
  const supabase = createAnonClient();
  let q = supabase.from("game_feed_v").select("*");
  // A game is listed under each of its categories, not only the main one.
  if (opts.category) q = q.contains("categories", [opts.category]);
  // model is a catalog name, or "lab:<id>" for every model from one lab (lib/ai/catalog.ts).
  if (opts.model?.startsWith("lab:")) q = q.in("model", modelNamesForLab(opts.model.slice(4)));
  else if (opts.model) q = q.eq("model", opts.model);
  if (opts.agent) q = q.eq("agent", opts.agent);
  if (sort === "trending") q = q.order("trending_score", { ascending: false }).order("published_at", { ascending: false });
  else if (sort === "hot") q = q.order("hot_score", { ascending: false }).order("published_at", { ascending: false });
  else if (sort === "plays") q = q.order("plays", { ascending: false }).order("published_at", { ascending: false });
  else if (sort === "remixes") q = q.order("remixes", { ascending: false }).order("plays", { ascending: false });
  else if (sort === "quick") q = q.lte("duration_sec", 45).order("plays", { ascending: false });
  else if (sort === "featured") q = q.not("featured_at", "is", null).order("featured_rank", { ascending: true, nullsFirst: false }).order("featured_at", { ascending: false });
  else q = q.order("published_at", { ascending: false });
  const { data } = await q.range(offset, offset + limit);
  const rows = data ?? [];
  const items = rows.slice(0, limit).map((r) => toFeedGame(asFeedRow(r)));
  return { items, nextOffset: rows.length > limit ? offset + limit : null };
}

/** Canonical game page data. Cached; invalidated with gameTag(id). */
export async function getGameByHandleSlug(handle: string, slug: string): Promise<GameDetail | null> {
  "use cache";
  cacheLife("minutes");
  const supabase = createAnonClient();
  const { data: row } = await supabase
    .from("game_feed_v")
    .select("*")
    .eq("creator_handle", handle.toLowerCase())
    .eq("slug", slug)
    .maybeSingle();
  if (!row) return null;
  const feedRow = asFeedRow(row);
  cacheTag(gameTag(feedRow.id), FEED_TAG);

  const [{ data: versions }, remixedFrom] = await Promise.all([
    supabase
      .from("game_versions")
      .select("id, version, status, engine, changelog, model, agent, prompt, size_bytes, created_at")
      .eq("game_id", feedRow.id)
      .eq("status", "ready")
      .order("version", { ascending: false })
      .limit(50),
    row.remixed_from_game_id
      ? supabase.from("game_feed_v").select("id, short_id, slug, title, creator_handle").eq("id", row.remixed_from_game_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    ...toFeedGame(feedRow),
    description: row.description,
    controls: (row.controls && typeof row.controls === "object" && !Array.isArray(row.controls) ? (row.controls as Record<string, unknown>) : {}),
    remixedFrom: remixedFrom.data?.id
      ? { id: remixedFrom.data.id, shortId: remixedFrom.data.short_id ?? "", slug: remixedFrom.data.slug ?? "", title: remixedFrom.data.title ?? "", handle: remixedFrom.data.creator_handle ?? "" }
      : null,
    versions: (versions ?? []).map(toVersionSummary),
  };
}

/** Resolves a short id to its canonical URL parts. */
export async function getGameByShortId(shortId: string): Promise<{ id: string; handle: string; slug: string } | null> {
  "use cache";
  cacheLife("hours");
  const supabase = createAnonClient();
  const { data } = await supabase.from("game_feed_v").select("id, creator_handle, slug").eq("short_id", shortId).maybeSingle();
  if (!data?.id || !data.creator_handle || !data.slug) return null;
  cacheTag(gameTag(data.id));
  return { id: data.id, handle: data.creator_handle, slug: data.slug };
}

/** Published games of a creator (public, cached). For drafts use getOwnGames. */
export async function getCreatorGames(creatorId: string, limit = 60): Promise<FeedGame[]> {
  "use cache";
  cacheTag(FEED_TAG, `creator-games:${creatorId}`);
  cacheLife("minutes");
  const supabase = createAnonClient();
  const { data } = await supabase
    .from("game_feed_v")
    .select("*")
    .eq("creator_id", creatorId)
    .order("published_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => toFeedGame(asFeedRow(r)));
}

/** The signed-in creator's games in every status, for /my-games. Never cached. */
export async function getOwnGames(supabase: SupabaseClient<Database>): Promise<CreatorGame[]> {
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return [];
  const { data: games } = await supabase.from("games").select("*").eq("creator_id", uid).order("updated_at", { ascending: false });
  if (!games?.length) return [];
  const ids = games.map((g) => g.id);
  const [{ data: versions }, { data: stats }, { data: me }] = await Promise.all([
    supabase
      .from("game_versions")
      .select("id, game_id, version, status, reject_reason, engine, created_at, updated_at, warnings:manifest->warnings")
      .in("game_id", ids)
      .order("version", { ascending: false }),
    supabase.from("game_stats").select("*").in("game_id", ids),
    supabase.from("profiles").select("handle").eq("id", uid).maybeSingle(),
  ]);
  const latestByGame = new Map<string, NonNullable<typeof versions>[number]>();
  for (const v of versions ?? []) if (!latestByGame.has(v.game_id)) latestByGame.set(v.game_id, v);
  const statsByGame = new Map((stats ?? []).map((s) => [s.game_id, s]));
  const handle = me?.handle ?? "";
  // An "uploaded" version is only still uploading while its storage session is open.
  const uploadingIds = [...latestByGame.values()].filter((v) => v.status === "uploaded").map((v) => v.id);
  const { data: sessions } = uploadingIds.length
    ? await supabase.from("upload_sessions").select("version_id, expires_at").in("version_id", uploadingIds).eq("status", "open")
    : { data: [] as { version_id: string; expires_at: string }[] };
  const uploadExpiry = new Map((sessions ?? []).map((s) => [s.version_id, s.expires_at]));
  // Rejects keep the human-readable reason as the first manifest warning (jobs/src/lib/ingest.ts reject()).
  const firstWarning = (w: unknown) => (Array.isArray(w) && typeof w[0] === "string" ? w[0] : null);

  return games.map((g) => {
    const lv = latestByGame.get(g.id);
    const s = statsByGame.get(g.id);
    return {
      id: g.id,
      shortId: g.short_id,
      slug: g.slug,
      title: g.title,
      tagline: g.tagline,
      category: g.category as GameCategory,
      orientation: g.orientation as Orientation,
      accentHue: g.accent_hue,
      coverUrl: cdnUrl(g.cover_path),
      cardUrl: cdnUrl(g.card_path),
      status: g.status as CreatorGame["status"],
      hiddenReason: g.hidden_reason,
      remixLicence: g.remix_licence as RemixLicence,
      currentVersionId: g.current_version_id,
      latestVersion: lv
        ? {
            id: lv.id,
            version: lv.version,
            status: lv.status as VersionStatus,
            rejectReason: lv.reject_reason,
            rejectMessage: lv.status === "rejected" ? firstWarning(lv.warnings) : null,
            engine: lv.engine,
            createdAt: lv.created_at,
            updatedAt: lv.updated_at,
            uploadExpiresAt: uploadExpiry.get(lv.id) ?? null,
          }
        : null,
      stats: s
        ? { plays: s.plays, uniquePlayers: s.unique_players, runs: s.runs, completions: s.completions, likes: s.likes, saves: s.saves, remixes: s.remixes, comments: s.comments, bestScore: s.best_score }
        : null,
      publishedAt: g.published_at,
      updatedAt: g.updated_at,
      url: `/@${handle}/${g.slug}`,
    };
  });
}

/** One version row as the caller may see it (RLS decides). Never cached. */
export async function getVersion(supabase: SupabaseClient<Database>, versionId: string): Promise<Tables<"game_versions"> | null> {
  const { data } = await supabase.from("game_versions").select("*").eq("id", versionId).maybeSingle();
  return data ?? null;
}

/** Active categories with published-game counts. Cached with the feed. */
export async function getCategoryCounts(): Promise<{ slug: string; name: string; icon: string | null; games: number }[]> {
  "use cache";
  cacheTag(FEED_TAG, "categories");
  cacheLife("minutes");
  const { data } = await createAnonClient().rpc("category_counts");
  return (data ?? []).map((c) => ({ slug: c.slug, name: c.name, icon: c.icon, games: Number(c.games) }));
}

/** Published games per model and per tool, most used first, for the explore filters. Cached with the feed. */
export async function getBuiltWithCounts(): Promise<{ models: [string, number][]; agents: [string, number][] }> {
  "use cache";
  cacheTag(FEED_TAG, "built-with");
  cacheLife("minutes");
  const { data } = await createAnonClient().from("game_feed_v").select("model, agent").limit(5000);
  const tally = (key: "model" | "agent"): [string, number][] => {
    const n = new Map<string, number>();
    for (const r of data ?? []) if (r[key]) n.set(r[key], (n.get(r[key]) ?? 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1]);
  };
  return { models: tally("model"), agents: tally("agent") };
}

/** Title / creator / tagline / model search over published games. Not cached (query is user input). */
export async function searchGames(q: string, limit = 12): Promise<FeedGame[]> {
  const term = q.trim().slice(0, 80);
  if (term.length < 2) return [];
  const { data } = await createAnonClient().rpc("search_games", { q: term, max_rows: limit });
  return (data ?? []).map((r) => toFeedGame(asFeedRow(r)));
}

export function slugify(title: string): string {
  const s = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return s || "untitled-game";
}
