import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type ApiTokenSummary = { id: string; name: string; prefix: string; scopes: string[]; lastUsedAt: string | null; revokedAt: string | null; createdAt: string };

/** The caller's tokens (the hash column is not readable through RLS grants). */
export async function listTokens(supabase: SupabaseClient<Database>): Promise<ApiTokenSummary[]> {
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return [];
  const { data } = await supabase.from("api_tokens").select("id, name, prefix, scopes, last_used_at, revoked_at, created_at").eq("user_id", uid).order("created_at", { ascending: false });
  return (data ?? []).map((t) => ({ id: t.id, name: t.name, prefix: t.prefix, scopes: t.scopes, lastUsedAt: t.last_used_at, revokedAt: t.revoked_at, createdAt: t.created_at }));
}
