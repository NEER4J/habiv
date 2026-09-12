import { cacheLife, cacheTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAnonClient } from "@/lib/supabase/anon";
import type { Database, Tables } from "@/lib/supabase/database.types";
import { avatarUrlOf } from "@/lib/site";

export type PublicProfile = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  links: string[];
  pronouns: string | null;
  isCreator: boolean;
  isVerified: boolean;
  followersCount: number;
  followingCount: number;
  createdAt: string;
  url: string;
};

export type OwnProfile = PublicProfile & {
  handleSet: boolean;
  handleChangedAt: string | null;
  isAdmin: boolean;
};

export function toPublicProfile(row: Tables<"profiles">): PublicProfile {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name ?? row.handle,
    avatarUrl: avatarUrlOf(row.avatar_path),
    bio: row.bio,
    links: Array.isArray(row.links) ? (row.links as unknown[]).filter((l): l is string => typeof l === "string") : [],
    pronouns: row.pronouns,
    isCreator: row.is_creator,
    isVerified: row.is_verified,
    followersCount: row.followers_count,
    followingCount: row.following_count,
    createdAt: row.created_at,
    url: `/@${row.handle}`,
  };
}

export function profileTag(handle: string) {
  return `profile:${handle.toLowerCase()}`;
}

/** Public profile by handle. Cached; invalidated with profileTag(handle). */
export async function getProfileByHandle(handle: string): Promise<PublicProfile | null> {
  "use cache";
  const h = handle.toLowerCase();
  cacheTag(profileTag(h));
  cacheLife("minutes");
  const supabase = createAnonClient();
  const { data } = await supabase.from("profiles").select("*").eq("handle", h).maybeSingle();
  return data ? toPublicProfile(data) : null;
}

export type ResolvedHandle =
  | { kind: "found"; profile: PublicProfile }
  | { kind: "redirect"; handle: string }
  | { kind: "none" };

/**
 * Resolves a handle from a URL, following renames: an old handle held in handle_history
 * (90 days) redirects to the account's current handle.
 */
export async function resolveHandle(handle: string): Promise<ResolvedHandle> {
  "use cache";
  const h = handle.toLowerCase();
  cacheTag(profileTag(h));
  cacheLife("minutes");
  const supabase = createAnonClient();
  const { data: profile } = await supabase.from("profiles").select("*").eq("handle", h).maybeSingle();
  if (profile) return { kind: "found", profile: toPublicProfile(profile) };

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: history } = await supabase
    .from("handle_history")
    .select("user_id, released_at")
    .eq("handle", h)
    .gt("released_at", since)
    .order("released_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!history) return { kind: "none" };

  const { data: current } = await supabase.from("profiles").select("handle").eq("id", history.user_id).maybeSingle();
  return current ? { kind: "redirect", handle: current.handle } : { kind: "none" };
}

/** The signed-in user's own profile. Never cached (cookie-scoped client). */
export async function getOwnProfile(supabase: SupabaseClient<Database>): Promise<OwnProfile | null> {
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
  if (!data) return null;
  return {
    ...toPublicProfile(data),
    handleSet: data.handle_set,
    handleChangedAt: data.handle_changed_at,
    isAdmin: data.is_admin,
  };
}

/** Live availability check (anonymous). The caller's own handle is treated as taken here. */
export async function isHandleAvailable(handle: string): Promise<boolean> {
  const supabase = createAnonClient();
  const { data } = await supabase.rpc("is_handle_available", { h: handle });
  return data === true;
}
