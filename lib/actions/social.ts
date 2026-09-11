"use server";

import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { gameTag } from "@/lib/db/games";

type Toggle = { ok: true; active: boolean; count: number } | { ok: false; code: "auth" | "unknown"; error: string };

async function uid() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return { supabase, uid: data?.claims?.sub ?? null };
}

export async function toggleLike(gameId: string): Promise<Toggle> {
  const { supabase, uid: me } = await uid();
  if (!me) return { ok: false, code: "auth", error: "Sign in to like games." };
  const { data: existing } = await supabase.from("likes").select("game_id").eq("user_id", me).eq("game_id", gameId).maybeSingle();
  const { error } = existing
    ? await supabase.from("likes").delete().eq("user_id", me).eq("game_id", gameId)
    : await supabase.from("likes").insert({ user_id: me, game_id: gameId });
  if (error) return { ok: false, code: "unknown", error: error.message };
  const { data: s } = await supabase.from("game_stats").select("likes").eq("game_id", gameId).maybeSingle();
  revalidateTag(gameTag(gameId), "max");
  return { ok: true, active: !existing, count: s?.likes ?? 0 };
}

export async function toggleSave(gameId: string): Promise<Toggle> {
  const { supabase, uid: me } = await uid();
  if (!me) return { ok: false, code: "auth", error: "Sign in to save games." };
  const { data: existing } = await supabase.from("saves").select("game_id").eq("user_id", me).eq("game_id", gameId).maybeSingle();
  const { error } = existing
    ? await supabase.from("saves").delete().eq("user_id", me).eq("game_id", gameId)
    : await supabase.from("saves").insert({ user_id: me, game_id: gameId });
  if (error) return { ok: false, code: "unknown", error: error.message };
  const { data: s } = await supabase.from("game_stats").select("saves").eq("game_id", gameId).maybeSingle();
  return { ok: true, active: !existing, count: s?.saves ?? 0 };
}

export async function toggleFollow(creatorId: string): Promise<Toggle> {
  const { supabase, uid: me } = await uid();
  if (!me) return { ok: false, code: "auth", error: "Sign in to follow creators." };
  if (me === creatorId) return { ok: false, code: "unknown", error: "You cannot follow yourself." };
  const { data: existing } = await supabase.from("follows").select("creator_id").eq("follower_id", me).eq("creator_id", creatorId).maybeSingle();
  const { error } = existing
    ? await supabase.from("follows").delete().eq("follower_id", me).eq("creator_id", creatorId)
    : await supabase.from("follows").insert({ follower_id: me, creator_id: creatorId });
  if (error) return { ok: false, code: "unknown", error: error.message };
  const { data: p } = await supabase.from("profiles").select("handle, followers_count").eq("id", creatorId).maybeSingle();
  if (p?.handle) revalidateTag(`profile:${p.handle}`, "max");
  revalidateTag(`followers:${creatorId}`, "max");
  return { ok: true, active: !existing, count: p?.followers_count ?? 0 };
}
