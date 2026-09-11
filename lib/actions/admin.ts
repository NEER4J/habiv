"use server";

import { z } from "zod";
import { revalidateTag, updateTag } from "next/cache";
import { getAdminContext } from "@/lib/db/admin";
import { FEED_TAG, gameTag } from "@/lib/db/games";
import { profileTag } from "@/lib/db/profiles";
import { enqueueIngest } from "@/lib/jobs/trigger";
import type { TablesUpdate } from "@/lib/supabase/database.types";

type Result = { ok: true } | { ok: false; error: string };
const deny: Result = { ok: false, error: "Admin only." };

async function ctxOrDeny() {
  const ctx = await getAdminContext();
  return ctx;
}

function bumpGame(gameId: string) {
  updateTag(gameTag(gameId));
  revalidateTag(FEED_TAG, "max");
}

/** Feature / unfeature a game (staff picks and the home hero). Lower rank shows first. */
export async function setFeatured(gameId: string, featured: boolean, rank?: number | null): Promise<Result> {
  const ctx = await ctxOrDeny();
  if (!ctx) return deny;
  const { error } = await ctx.admin.from("games").update(featured ? { featured_at: new Date().toISOString(), featured_rank: rank ?? null } : { featured_at: null, featured_rank: null }).eq("id", gameId);
  if (error) return { ok: false, error: error.message };
  bumpGame(gameId);
  return { ok: true };
}

const statusSchema = z.enum(["published", "hidden", "removed", "draft"]);

/** Moderation status change. Hidden/removed by admin carry hidden_reason=moderation so creators cannot republish. */
export async function setGameStatus(gameId: string, status: z.infer<typeof statusSchema>, reason?: string): Promise<Result> {
  const ctx = await ctxOrDeny();
  if (!ctx) return deny;
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, error: "Bad status." };
  const patch = status === "published"
    ? { status, hidden_reason: null, published_at: new Date().toISOString() }
    : status === "draft"
      ? { status: "draft", hidden_reason: null }
      : { status, hidden_reason: reason?.trim() ? `moderation:${reason.trim().slice(0, 120)}` : "moderation" };
  const { data: before } = await ctx.admin.from("games").select("published_at, current_version_id").eq("id", gameId).maybeSingle();
  if (status === "published") {
    if (!before?.current_version_id) {
      const { data: v } = await ctx.admin.from("game_versions").select("id").eq("game_id", gameId).eq("status", "ready").order("version", { ascending: false }).limit(1).maybeSingle();
      if (!v) return { ok: false, error: "No ready version to publish." };
      Object.assign(patch, { current_version_id: v.id });
    }
    if (before?.published_at) Object.assign(patch, { published_at: before.published_at });
  }
  const { error } = await ctx.admin.from("games").update(patch).eq("id", gameId);
  if (error) return { ok: false, error: error.message };
  bumpGame(gameId);
  return { ok: true };
}

export async function setGameCategory(gameId: string, category: string): Promise<Result> {
  const ctx = await ctxOrDeny();
  if (!ctx) return deny;
  const { error } = await ctx.admin.from("games").update({ category }).eq("id", gameId);
  if (error) return { ok: false, error: error.message };
  bumpGame(gameId);
  return { ok: true };
}

/** Re-runs ingest for a version (e.g. after a job fix). */
export async function reprocessVersion(versionId: string): Promise<Result> {
  const ctx = await ctxOrDeny();
  if (!ctx) return deny;
  const { data: v } = await ctx.admin.from("game_versions").select("id, upload_key").eq("id", versionId).maybeSingle();
  if (!v) return { ok: false, error: "Version not found." };
  if (!v.upload_key) return { ok: false, error: "No upload to reprocess (source expired)." };
  await ctx.admin.from("game_versions").update({ status: "processing", reject_reason: null }).eq("id", versionId);
  try {
    const run = await enqueueIngest(versionId);
    await ctx.admin.from("game_versions").update({ ingest_run_id: run.id }).eq("id", versionId);
  } catch (e) {
    await ctx.admin.from("game_versions").update({ status: "rejected", reject_reason: "internal_error" }).eq("id", versionId);
    return { ok: false, error: e instanceof Error ? e.message : "Could not enqueue." };
  }
  return { ok: true };
}

export async function setUserFlags(userId: string, flags: { isAdmin?: boolean; isVerified?: boolean }): Promise<Result> {
  const ctx = await ctxOrDeny();
  if (!ctx) return deny;
  if (flags.isAdmin === false && userId === ctx.uid) return { ok: false, error: "You cannot remove your own admin access." };
  const patch: TablesUpdate<"profiles"> = {};
  if (flags.isAdmin !== undefined) patch.is_admin = flags.isAdmin;
  if (flags.isVerified !== undefined) patch.is_verified = flags.isVerified;
  const { data, error } = await ctx.admin.from("profiles").update(patch).eq("id", userId).select("handle").maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (flags.isVerified !== undefined) {
    if (flags.isVerified) await ctx.admin.from("profile_badges").upsert({ user_id: userId, badge: "verified" });
    else await ctx.admin.from("profile_badges").delete().eq("user_id", userId).eq("badge", "verified");
  }
  if (data?.handle) revalidateTag(profileTag(data.handle), "max");
  return { ok: true };
}

/** Ban: hides all their published games and blocks new publishes/comments. Unban restores hidden-by-ban games. */
export async function setUserBan(userId: string, banned: boolean, reason?: string): Promise<Result> {
  const ctx = await ctxOrDeny();
  if (!ctx) return deny;
  if (userId === ctx.uid) return { ok: false, error: "You cannot ban yourself." };
  const { data, error } = await ctx.admin.from("profiles").update(banned ? { banned_at: new Date().toISOString(), ban_reason: reason?.slice(0, 200) ?? null } : { banned_at: null, ban_reason: null }).eq("id", userId).select("handle").maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (banned) await ctx.admin.from("games").update({ status: "hidden", hidden_reason: "moderation:banned" }).eq("creator_id", userId).eq("status", "published");
  else await ctx.admin.from("games").update({ status: "published", hidden_reason: null }).eq("creator_id", userId).eq("hidden_reason", "moderation:banned");
  if (data?.handle) revalidateTag(profileTag(data.handle), "max");
  revalidateTag(FEED_TAG, "max");
  return { ok: true };
}

export async function grantBadge(userId: string, badge: "verified" | "founder" | "top_creator" | "staff", on: boolean): Promise<Result> {
  const ctx = await ctxOrDeny();
  if (!ctx) return deny;
  const { error } = on
    ? await ctx.admin.from("profile_badges").upsert({ user_id: userId, badge })
    : await ctx.admin.from("profile_badges").delete().eq("user_id", userId).eq("badge", badge);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

const categorySchema = z.object({
  slug: z.string().regex(/^[a-z][a-z0-9_]{1,23}$/),
  name: z.string().trim().min(1).max(32),
  icon: z.string().trim().max(8).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  active: z.boolean().optional(),
});

export async function upsertCategory(input: z.infer<typeof categorySchema>): Promise<Result> {
  const ctx = await ctxOrDeny();
  if (!ctx) return deny;
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid category." };
  const c = parsed.data;
  const { error } = await ctx.admin.from("categories").upsert({ slug: c.slug, name: c.name, icon: c.icon ?? null, ...(c.sortOrder !== undefined ? { sort_order: c.sortOrder } : {}), ...(c.active !== undefined ? { active: c.active } : {}) }, { onConflict: "slug" });
  if (error) return { ok: false, error: error.message };
  revalidateTag(FEED_TAG, "max");
  return { ok: true };
}

/** Deleting moves that category's games to `other` first. */
export async function deleteCategory(slug: string): Promise<Result> {
  const ctx = await ctxOrDeny();
  if (!ctx) return deny;
  if (slug === "other") return { ok: false, error: "The fallback category cannot be deleted." };
  await ctx.admin.from("games").update({ category: "other" }).eq("category", slug);
  const { error } = await ctx.admin.from("categories").delete().eq("slug", slug);
  if (error) return { ok: false, error: error.message };
  revalidateTag(FEED_TAG, "max");
  return { ok: true };
}

export async function setSiteSetting(key: string, value: unknown): Promise<Result> {
  const ctx = await ctxOrDeny();
  if (!ctx) return deny;
  if (!/^[a-z][a-z0-9_.]{1,60}$/.test(key)) return { ok: false, error: "Bad key." };
  const { error } = await ctx.admin.from("site_settings").upsert({ key, value: value as never, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: error.message };
  revalidateTag(FEED_TAG, "max");
  return { ok: true };
}

/** Soft-delete a comment as admin. */
export async function adminDeleteComment(commentId: string): Promise<Result> {
  const ctx = await ctxOrDeny();
  if (!ctx) return deny;
  const { data, error } = await ctx.admin.from("comments").update({ deleted_at: new Date().toISOString() }).eq("id", commentId).select("game_id").maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (data) updateTag(gameTag(data.game_id));
  return { ok: true };
}

export async function adminResolveReport(reportId: string, status: "resolved" | "dismissed", action?: "restore" | "remove"): Promise<Result> {
  const ctx = await ctxOrDeny();
  if (!ctx) return deny;
  const { error } = await ctx.supabase.rpc("resolve_report", { p_report_id: reportId, p_status: status, p_game_action: action ?? undefined });
  if (error) return { ok: false, error: error.message };
  revalidateTag(FEED_TAG, "max");
  return { ok: true };
}
