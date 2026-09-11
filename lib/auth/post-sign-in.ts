import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** Only same-origin paths are honoured as a post-login destination. */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (next.startsWith("/auth/") || next.startsWith("/api/")) return fallback;
  return next;
}

/**
 * Where to send a user right after signing in: the handle picker if they have not chosen
 * one yet, otherwise the requested `next` path.
 */
export async function resolvePostSignInPath(
  supabase: SupabaseClient<Database>,
  next: string | null | undefined,
  user?: User | null,
): Promise<string> {
  const target = safeNextPath(next);
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return "/?auth=signin";

  const { data: profile } = await supabase
    .from("profiles")
    .select("handle_set")
    .eq("id", uid)
    .maybeSingle();

  if (profile?.handle_set) return target;

  const params = new URLSearchParams({ next: target });
  const meta = user?.user_metadata as Record<string, unknown> | undefined;
  const provider = (user?.app_metadata as Record<string, unknown> | undefined)?.provider;
  const suggested = provider === "github" ? meta?.user_name ?? meta?.preferred_username : undefined;
  if (typeof suggested === "string" && suggested) params.set("suggest", suggested);
  return `/onboarding?${params.toString()}`;
}
