"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateToken, hashToken, prefixOf } from "@/lib/tokens/format";

const MAX_ACTIVE = 10;
type Err = { ok: false; code: "auth" | "invalid" | "limit" | "unknown"; error: string };

/** Creates a personal token. The full token is returned once and never stored. */
export async function createToken(name: string): Promise<{ ok: true; id: string; name: string; prefix: string; token: string; createdAt: string } | Err> {
  const parsed = z.string().trim().min(1).max(40).safeParse(name);
  if (!parsed.success) return { ok: false, code: "invalid", error: "Give the token a short name." };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return { ok: false, code: "auth", error: "Sign in first." };

  const admin = createAdminClient();
  const { count } = await admin.from("api_tokens").select("id", { count: "exact", head: true }).eq("user_id", uid).is("revoked_at", null);
  if ((count ?? 0) >= MAX_ACTIVE) return { ok: false, code: "limit", error: `You can have ${MAX_ACTIVE} active tokens. Revoke one first.` };

  const token = generateToken();
  const { data, error } = await admin
    .from("api_tokens")
    .insert({ user_id: uid, name: parsed.data, token_hash: hashToken(token), prefix: prefixOf(token), scopes: ["publish"] })
    .select("id, created_at")
    .single();
  if (error || !data) return { ok: false, code: "unknown", error: error?.message ?? "Could not create the token." };
  return { ok: true, id: data.id, name: parsed.data, prefix: prefixOf(token), token, createdAt: data.created_at };
}

export async function revokeToken(id: string): Promise<{ ok: true } | Err> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return { ok: false, code: "auth", error: "Sign in first." };
  const { error } = await supabase.from("api_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("user_id", uid);
  if (error) return { ok: false, code: "unknown", error: error.message };
  return { ok: true };
}
