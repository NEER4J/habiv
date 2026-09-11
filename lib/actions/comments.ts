"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { gameTag } from "@/lib/db/games";

type Err = { ok: false; code: "auth" | "invalid" | "blocked" | "rate_limited" | "duplicate" | "links" | "not_found" | "unknown"; error: string };

function mapError(message: string): Err {
  if (message.includes("blocked")) return { ok: false, code: "blocked", error: "You cannot comment here." };
  if (message.includes("rate_limited")) return { ok: false, code: "rate_limited", error: "Slow down a little." };
  if (message.includes("duplicate")) return { ok: false, code: "duplicate", error: "You already posted that." };
  if (message.includes("too_many_links")) return { ok: false, code: "links", error: "At most two links per comment." };
  if (message.includes("not_found") || message.includes("parent_")) return { ok: false, code: "not_found", error: "That comment is gone." };
  if (message.includes("edit_window_closed")) return { ok: false, code: "invalid", error: "Comments can be edited for 15 minutes." };
  if (message.includes("not_allowed")) return { ok: false, code: "auth", error: "Not allowed." };
  return { ok: false, code: "unknown", error: message || "Something went wrong." };
}

async function me() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return { supabase, uid: data?.claims?.sub ?? null };
}

const bodySchema = z.string().trim().min(1).max(500);

export async function postComment(gameId: string, body: string, parentId?: string | null): Promise<{ ok: true; id: string; createdAt: string } | Err> {
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return { ok: false, code: "invalid", error: "Write between 1 and 500 characters." };
  const { supabase, uid } = await me();
  if (!uid) return { ok: false, code: "auth", error: "Sign in to comment." };
  const { data, error } = await supabase
    .from("comments")
    .insert({ game_id: gameId, author_id: uid, parent_id: parentId ?? null, body: parsed.data })
    .select("id, created_at")
    .single();
  if (error || !data) return mapError(error?.message ?? "");
  updateTag(gameTag(gameId));
  return { ok: true, id: data.id, createdAt: data.created_at };
}

export async function editComment(commentId: string, body: string): Promise<{ ok: true } | Err> {
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return { ok: false, code: "invalid", error: "Write between 1 and 500 characters." };
  const { supabase, uid } = await me();
  if (!uid) return { ok: false, code: "auth", error: "Sign in first." };
  const { error } = await supabase.from("comments").update({ body: parsed.data }).eq("id", commentId).eq("author_id", uid);
  if (error) return mapError(error.message);
  return { ok: true };
}

/** Soft delete by the author, the game's creator or an admin (RLS + trigger enforce who). */
export async function deleteComment(commentId: string): Promise<{ ok: true } | Err> {
  const { supabase, uid } = await me();
  if (!uid) return { ok: false, code: "auth", error: "Sign in first." };
  const { data, error } = await supabase.from("comments").update({ deleted_at: new Date().toISOString() }).eq("id", commentId).select("game_id").maybeSingle();
  if (error) return mapError(error.message);
  if (data) updateTag(gameTag(data.game_id));
  return { ok: true };
}

export async function pinComment(commentId: string, pinned: boolean): Promise<{ ok: true } | Err> {
  const { supabase, uid } = await me();
  if (!uid) return { ok: false, code: "auth", error: "Sign in first." };
  const { error } = await supabase.from("comments").update({ pinned }).eq("id", commentId);
  if (error) return mapError(error.message);
  return { ok: true };
}

export async function toggleCommentLike(commentId: string): Promise<{ ok: true; active: boolean; count: number } | Err> {
  const { supabase, uid } = await me();
  if (!uid) return { ok: false, code: "auth", error: "Sign in to like comments." };
  const { data: existing } = await supabase.from("comment_likes").select("comment_id").eq("user_id", uid).eq("comment_id", commentId).maybeSingle();
  const { error } = existing
    ? await supabase.from("comment_likes").delete().eq("user_id", uid).eq("comment_id", commentId)
    : await supabase.from("comment_likes").insert({ user_id: uid, comment_id: commentId });
  if (error) return mapError(error.message);
  const { data: c } = await supabase.from("comments").select("likes_count").eq("id", commentId).maybeSingle();
  return { ok: true, active: !existing, count: c?.likes_count ?? 0 };
}

/** Mention autocomplete. */
export async function searchHandles(prefix: string): Promise<{ id: string; handle: string; displayName: string; avatarUrl: string | null }[]> {
  const q = prefix.replace(/^@/, "").toLowerCase().slice(0, 20);
  if (q.length < 1) return [];
  const { supabase } = await me();
  const { data } = await supabase.rpc("search_handles", { prefix: q, max_rows: 8 });
  const { cdnUrl } = await import("@/lib/site");
  return (data ?? []).map((r) => ({ id: r.id, handle: r.handle, displayName: r.display_name ?? r.handle, avatarUrl: cdnUrl(r.avatar_path) }));
}
