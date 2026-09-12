import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Tables } from "@/lib/supabase/database.types";
import { cdnUrl, gameOrigin } from "@/lib/site";

export type AdminContext = { supabase: SupabaseClient<Database>; admin: SupabaseClient<Database>; uid: string };

/** Resolves the caller and verifies is_admin through RLS-scoped RPC; null when not an admin. */
export async function getAdminContext(): Promise<AdminContext | null> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return null;
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return null;
  return { supabase, admin: createAdminClient(), uid };
}

export type AdminStats = {
  users: number; creators: number; games_published: number; games_total: number; versions_processing: number;
  versions_rejected: number; storage_bytes: number; plays_today: number; plays_7d: number; reports_open: number; comments: number;
};

export async function adminStats(ctx: AdminContext): Promise<AdminStats | null> {
  const { data } = await ctx.supabase.rpc("admin_stats");
  return (data as AdminStats | null) ?? null;
}

export type AdminVersion = {
  id: string; version: number; status: string; source: string; engine: string | null; sizeBytes: number | null; fileCount: number | null;
  rejectReason: string | null; warnings: string[]; createdAt: string; updatedAt: string; previewUrl: string | null;
  game: { id: string; title: string; slug: string; status: string; shortId: string; currentVersionId: string | null };
  creator: { id: string; handle: string; displayName: string };
};

/** Every upload, newest first, for the uploads queue. */
export async function listVersions(ctx: AdminContext, opts: { status?: string | null; limit?: number; offset?: number } = {}): Promise<{ items: AdminVersion[]; nextOffset: number | null }> {
  const limit = Math.min(opts.limit ?? 40, 100);
  const offset = opts.offset ?? 0;
  let q = ctx.admin.from("game_versions").select("id, game_id, version, status, source, engine, size_bytes, file_count, reject_reason, manifest, created_at, updated_at").order("created_at", { ascending: false }).range(offset, offset + limit);
  if (opts.status) q = q.eq("status", opts.status);
  const { data: rows } = await q;
  const list = (rows ?? []).slice(0, limit);
  const gameIds = Array.from(new Set(list.map((v) => v.game_id)));
  const { data: games } = gameIds.length ? await ctx.admin.from("games").select("id, title, slug, status, short_id, creator_id, current_version_id").in("id", gameIds) : { data: [] as Pick<Tables<"games">, "id" | "title" | "slug" | "status" | "short_id" | "creator_id" | "current_version_id">[] };
  const creatorIds = Array.from(new Set((games ?? []).map((g) => g.creator_id)));
  const { data: profiles } = creatorIds.length ? await ctx.admin.from("profiles").select("id, handle, display_name").in("id", creatorIds) : { data: [] as Pick<Tables<"profiles">, "id" | "handle" | "display_name">[] };
  const gameMap = new Map((games ?? []).map((g) => [g.id, g]));
  const profMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const items = list.map((v) => {
    const g = gameMap.get(v.game_id);
    const p = g ? profMap.get(g.creator_id) : undefined;
    const manifest = (v.manifest ?? null) as { warnings?: unknown } | null;
    return {
      id: v.id, version: v.version, status: v.status, source: v.source, engine: v.engine, sizeBytes: v.size_bytes, fileCount: v.file_count,
      rejectReason: v.reject_reason, warnings: Array.isArray(manifest?.warnings) ? (manifest!.warnings as unknown[]).filter((w): w is string => typeof w === "string") : [],
      createdAt: v.created_at, updatedAt: v.updated_at,
      previewUrl: v.status === "ready" && gameOrigin ? `${gameOrigin}/v/${v.id}/?mode=preview` : null,
      game: { id: v.game_id, title: g?.title ?? "(deleted)", slug: g?.slug ?? "", status: g?.status ?? "removed", shortId: g?.short_id ?? "", currentVersionId: g?.current_version_id ?? null },
      creator: { id: g?.creator_id ?? "", handle: p?.handle ?? "", displayName: p?.display_name ?? p?.handle ?? "" },
    };
  });
  return { items, nextOffset: (rows ?? []).length > limit ? offset + limit : null };
}

export type AdminGame = {
  id: string; shortId: string; slug: string; title: string; status: string; hiddenReason: string | null; category: string; coverUrl: string | null;
  featuredAt: string | null; featuredRank: number | null; publishedAt: string | null; createdAt: string; updatedAt: string;
  currentVersion: number | null; plays: number; likes: number; remixes: number; comments: number;
  creator: { id: string; handle: string; displayName: string }; url: string;
};

export async function listGamesAdmin(ctx: AdminContext, opts: { status?: string | null; q?: string | null; featured?: boolean; limit?: number; offset?: number } = {}): Promise<{ items: AdminGame[]; nextOffset: number | null }> {
  const limit = Math.min(opts.limit ?? 40, 100);
  const offset = opts.offset ?? 0;
  let q = ctx.admin.from("games").select("*").order("updated_at", { ascending: false }).range(offset, offset + limit);
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.featured) q = q.not("featured_at", "is", null).order("featured_rank", { ascending: true, nullsFirst: false });
  if (opts.q) q = q.ilike("title", `%${opts.q.replace(/[%_]/g, "")}%`);
  const { data: rows } = await q;
  const list = (rows ?? []).slice(0, limit);
  const ids = list.map((g) => g.id);
  const creatorIds = Array.from(new Set(list.map((g) => g.creator_id)));
  const [{ data: stats }, { data: profiles }, { data: versions }] = await Promise.all([
    ids.length ? ctx.admin.from("game_stats").select("game_id, plays, likes, remixes, comments").in("game_id", ids) : Promise.resolve({ data: [] as Pick<Tables<"game_stats">, "game_id" | "plays" | "likes" | "remixes" | "comments">[] }),
    creatorIds.length ? ctx.admin.from("profiles").select("id, handle, display_name").in("id", creatorIds) : Promise.resolve({ data: [] as Pick<Tables<"profiles">, "id" | "handle" | "display_name">[] }),
    ids.length ? ctx.admin.from("game_versions").select("id, version").in("id", list.map((g) => g.current_version_id).filter((x): x is string => !!x)) : Promise.resolve({ data: [] as { id: string; version: number }[] }),
  ]);
  const statMap = new Map((stats ?? []).map((s) => [s.game_id, s]));
  const profMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const verMap = new Map((versions ?? []).map((v) => [v.id, v.version]));
  const items = list.map((g) => {
    const p = profMap.get(g.creator_id);
    const s = statMap.get(g.id);
    return {
      id: g.id, shortId: g.short_id, slug: g.slug, title: g.title, status: g.status, hiddenReason: g.hidden_reason, category: g.category,
      coverUrl: cdnUrl(g.cover_path), featuredAt: g.featured_at, featuredRank: g.featured_rank, publishedAt: g.published_at, createdAt: g.created_at, updatedAt: g.updated_at,
      currentVersion: g.current_version_id ? verMap.get(g.current_version_id) ?? null : null,
      plays: s?.plays ?? 0, likes: s?.likes ?? 0, remixes: s?.remixes ?? 0, comments: s?.comments ?? 0,
      creator: { id: g.creator_id, handle: p?.handle ?? "", displayName: p?.display_name ?? p?.handle ?? "" },
      url: `/@${p?.handle ?? ""}/${g.slug}`,
    };
  });
  return { items, nextOffset: (rows ?? []).length > limit ? offset + limit : null };
}

export type AdminUser = {
  id: string; handle: string; displayName: string; avatarUrl: string | null; email: string | null; provider: string | null;
  isAdmin: boolean; isVerified: boolean; isCreator: boolean; bannedAt: string | null; banReason: string | null;
  followersCount: number; games: number; createdAt: string; lastSignInAt: string | null; badges: string[];
};

export async function listUsersAdmin(ctx: AdminContext, opts: { q?: string | null; limit?: number; offset?: number; banned?: boolean } = {}): Promise<{ items: AdminUser[]; nextOffset: number | null }> {
  const limit = Math.min(opts.limit ?? 40, 100);
  const offset = opts.offset ?? 0;
  let q = ctx.admin.from("profiles").select("*").order("created_at", { ascending: false }).range(offset, offset + limit);
  if (opts.q) {
    const term = opts.q.replace(/[%_]/g, "").replace(/^@/, "");
    q = q.or(`handle.ilike.%${term}%,display_name.ilike.%${term}%`);
  }
  if (opts.banned) q = q.not("banned_at", "is", null);
  const { data: rows } = await q;
  const list = (rows ?? []).slice(0, limit);
  const ids = list.map((p) => p.id);
  const [{ data: emails }, { data: games }, { data: badges }] = await Promise.all([
    ids.length ? ctx.supabase.rpc("admin_user_emails", { p_ids: ids }) : Promise.resolve({ data: [] as { id: string; email: string; last_sign_in_at: string | null; created_at: string; provider: string }[] }),
    ids.length ? ctx.admin.from("games").select("creator_id").in("creator_id", ids) : Promise.resolve({ data: [] as { creator_id: string }[] }),
    ids.length ? ctx.admin.from("profile_badges").select("user_id, badge").in("user_id", ids) : Promise.resolve({ data: [] as { user_id: string; badge: string }[] }),
  ]);
  const emailMap = new Map((emails ?? []).map((e) => [e.id, e]));
  const gameCount = new Map<string, number>();
  for (const g of games ?? []) gameCount.set(g.creator_id, (gameCount.get(g.creator_id) ?? 0) + 1);
  const badgeMap = new Map<string, string[]>();
  for (const b of badges ?? []) badgeMap.set(b.user_id, [...(badgeMap.get(b.user_id) ?? []), b.badge]);
  const items = list.map((p) => {
    const e = emailMap.get(p.id);
    return {
      id: p.id, handle: p.handle, displayName: p.display_name ?? p.handle, avatarUrl: cdnUrl(p.avatar_path), email: e?.email ?? null, provider: e?.provider ?? null,
      isAdmin: p.is_admin, isVerified: p.is_verified, isCreator: p.is_creator, bannedAt: p.banned_at, banReason: p.ban_reason,
      followersCount: p.followers_count, games: gameCount.get(p.id) ?? 0, createdAt: p.created_at, lastSignInAt: e?.last_sign_in_at ?? null, badges: badgeMap.get(p.id) ?? [],
    };
  });
  return { items, nextOffset: (rows ?? []).length > limit ? offset + limit : null };
}

export type AdminReport = {
  id: string; reason: string; details: string | null; status: string; createdAt: string;
  reporter: { id: string; handle: string };
  target: { kind: "game" | "comment" | "user"; id: string; label: string; url: string | null };
};

export async function listReports(ctx: AdminContext, opts: { status?: string | null; limit?: number } = {}): Promise<AdminReport[]> {
  let q = ctx.admin.from("reports").select("*").order("created_at", { ascending: false }).limit(Math.min(opts.limit ?? 100, 200));
  if (opts.status) q = q.eq("status", opts.status);
  const { data: rows } = await q;
  if (!rows?.length) return [];
  const userIds = Array.from(new Set(rows.flatMap((r) => [r.reporter_id, r.user_id].filter((x): x is string => !!x))));
  const gameIds = Array.from(new Set(rows.map((r) => r.game_id).filter((x): x is string => !!x)));
  const commentIds = Array.from(new Set(rows.map((r) => r.comment_id).filter((x): x is string => !!x)));
  const [{ data: profiles }, { data: games }, { data: comments }] = await Promise.all([
    userIds.length ? ctx.admin.from("profiles").select("id, handle").in("id", userIds) : Promise.resolve({ data: [] as { id: string; handle: string }[] }),
    gameIds.length ? ctx.admin.from("games").select("id, title, slug, creator_id").in("id", gameIds) : Promise.resolve({ data: [] as { id: string; title: string; slug: string; creator_id: string }[] }),
    commentIds.length ? ctx.admin.from("comments").select("id, body, game_id").in("id", commentIds) : Promise.resolve({ data: [] as { id: string; body: string; game_id: string }[] }),
  ]);
  const gameCreatorIds = Array.from(new Set((games ?? []).map((g) => g.creator_id)));
  const { data: creators } = gameCreatorIds.length ? await ctx.admin.from("profiles").select("id, handle").in("id", gameCreatorIds) : { data: [] as { id: string; handle: string }[] };
  const handle = new Map([...(profiles ?? []), ...(creators ?? [])].map((p) => [p.id, p.handle]));
  const gameMap = new Map((games ?? []).map((g) => [g.id, g]));
  const commentMap = new Map((comments ?? []).map((c) => [c.id, c]));
  return rows.map((r) => {
    let target: AdminReport["target"];
    if (r.game_id) {
      const g = gameMap.get(r.game_id);
      target = { kind: "game", id: r.game_id, label: g?.title ?? "(deleted game)", url: g ? `/@${handle.get(g.creator_id) ?? ""}/${g.slug}` : null };
    } else if (r.comment_id) {
      const c = commentMap.get(r.comment_id);
      target = { kind: "comment", id: r.comment_id, label: c ? `“${c.body.slice(0, 80)}”` : "(deleted comment)", url: null };
    } else {
      target = { kind: "user", id: r.user_id!, label: `@${handle.get(r.user_id!) ?? "?"}`, url: `/@${handle.get(r.user_id!) ?? ""}` };
    }
    return { id: r.id, reason: r.reason, details: r.details, status: r.status, createdAt: r.created_at, reporter: { id: r.reporter_id, handle: handle.get(r.reporter_id) ?? "?" }, target };
  });
}

export async function listCategoriesAdmin(ctx: AdminContext) {
  const [{ data: cats }, { data: counts }] = await Promise.all([
    ctx.admin.from("categories").select("*").order("sort_order").order("name"),
    ctx.supabase.rpc("category_counts"),
  ]);
  const countMap = new Map((counts ?? []).map((c) => [c.slug, Number(c.games)]));
  return (cats ?? []).map((c) => ({ slug: c.slug, name: c.name, icon: c.icon, sortOrder: c.sort_order, active: c.active, games: countMap.get(c.slug) ?? 0 }));
}

export type PickableGame = { id: string; title: string; creator: string; coverUrl: string | null; durationSec: number | null; plays: number };

/** Live games an admin can pin on the home page, most played first. */
export async function listPickableGames(ctx: AdminContext): Promise<PickableGame[]> {
  const { data } = await ctx.admin.from("game_feed_v").select("id, title, creator_handle, cover_path, card_path, duration_sec, plays").order("plays", { ascending: false }).limit(1000);
  return (data ?? []).filter((g) => g.id).map((g) => ({
    id: g.id!, title: g.title ?? "(untitled)", creator: g.creator_handle ?? "", coverUrl: cdnUrl(g.cover_path ?? g.card_path), durationSec: g.duration_sec, plays: g.plays ?? 0,
  }));
}

export async function getSiteSettings(ctx: AdminContext): Promise<Record<string, unknown>> {
  const { data } = await ctx.admin.from("site_settings").select("key, value");
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
}
