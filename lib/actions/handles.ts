"use server";

import { revalidateTag, updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { handleReasonMessage, validateHandle } from "@/lib/handles";
import { profileTag } from "@/lib/db/profiles";

export type CheckHandleResult = { available: boolean; normalized: string; reason?: string };

/** Debounced availability check for onboarding and settings. */
export async function checkHandle(input: string): Promise<CheckHandleResult> {
  const v = validateHandle(input);
  if (!v.ok) return { available: false, normalized: "", reason: handleReasonMessage(v.reason) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_handle_available", { h: v.handle });
  if (error) return { available: false, normalized: v.handle, reason: "Could not check right now." };
  return data ? { available: true, normalized: v.handle } : { available: false, normalized: v.handle, reason: "That handle is taken." };
}

export type SetHandleResult =
  | { ok: true; handle: string }
  | { ok: false; error: string; code: "invalid" | "cooldown" | "unavailable" | "auth" | "unknown" };

/** Sets (first time) or renames (once per 30 days) the caller's handle. */
export async function setHandle(input: string): Promise<SetHandleResult> {
  const v = validateHandle(input);
  if (!v.ok) return { ok: false, code: "invalid", error: handleReasonMessage(v.reason) };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false, code: "auth", error: "Sign in first." };

  const { data: before } = await supabase.from("profiles").select("handle").eq("id", claims.claims.sub).maybeSingle();
  const { data, error } = await supabase.rpc("set_handle", { new_handle: v.handle });
  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("cooldown")) return { ok: false, code: "cooldown", error: "You can change your handle once every 30 days." };
    if (msg.includes("unavailable")) return { ok: false, code: "unavailable", error: "That handle is taken." };
    if (msg.includes("not_signed_in")) return { ok: false, code: "auth", error: "Sign in first." };
    return { ok: false, code: "unknown", error: "Could not save your handle." };
  }

  if (before?.handle) revalidateTag(profileTag(before.handle), "max");
  updateTag(profileTag(data.handle));
  return { ok: true, handle: data.handle };
}
