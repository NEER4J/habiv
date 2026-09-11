import "server-only";
import { after } from "next/server";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken, looksLikeToken } from "@/lib/tokens/format";

export type TokenAuth = { tokenId: string; userId: string; scopes: string[] };

/** Resolves `Authorization: Bearer hbv_live_...` to its owner. Updates last_used_at after the response. */
export async function authenticateToken(header: string | null): Promise<TokenAuth | null> {
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  if (!looksLikeToken(token)) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("api_tokens").select("id, user_id, scopes, revoked_at").eq("token_hash", hashToken(token)).maybeSingle();
  if (!data || data.revoked_at) return null;
  const id = data.id;
  after(async () => {
    await admin.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", id);
  });
  return { tokenId: data.id, userId: data.user_id, scopes: data.scopes };
}

export function toAuthInfo(a: TokenAuth): AuthInfo {
  return {
    token: a.tokenId,
    clientId: a.userId,
    scopes: a.scopes,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    extra: { userId: a.userId, tokenId: a.tokenId },
  };
}
