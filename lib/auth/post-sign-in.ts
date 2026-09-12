import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { welcomePath } from "@/lib/auth/protected";

/** Only same-origin paths are honoured as a post-login destination. */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (next.startsWith("/auth/") || next.startsWith("/api/")) return fallback;
  return next;
}

/**
 * Where to send a user right after signing in: the requested `next` path, with the profile-setup
 * popup open over it if they have not chosen a handle yet.
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

  const meta = user?.user_metadata as Record<string, unknown> | undefined;
  const provider = (user?.app_metadata as Record<string, unknown> | undefined)?.provider;
  const suggested = provider === "github" ? meta?.user_name ?? meta?.preferred_username : undefined;
  return welcomePath(target, typeof suggested === "string" ? suggested : null);
}
