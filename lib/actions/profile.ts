"use server";

import { z } from "zod";
import { updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { profileTag } from "@/lib/db/profiles";
import { setHandle, type SetHandleResult } from "@/lib/actions/handles";

const schema = z.object({
  displayName: z.string().trim().min(1).max(40).optional(),
  bio: z.string().trim().max(160).nullable().optional(),
  pronouns: z.string().trim().max(24).nullable().optional(),
  links: z.array(z.string().url().max(200)).max(3).optional(),
});

type Err = { ok: false; code: "auth" | "invalid" | "unknown"; error: string };

export async function updateProfile(input: z.infer<typeof schema>): Promise<{ ok: true } | Err> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid", error: parsed.error.issues[0]?.message ?? "Invalid profile." };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return { ok: false, code: "auth", error: "Sign in first." };
  const p = parsed.data;
  const { data, error } = await supabase
    .from("profiles")
    .update({
      ...(p.displayName !== undefined ? { display_name: p.displayName } : {}),
      ...(p.bio !== undefined ? { bio: p.bio } : {}),
      ...(p.pronouns !== undefined ? { pronouns: p.pronouns } : {}),
      ...(p.links !== undefined ? { links: p.links } : {}),
    })
    .eq("id", uid)
    .select("handle")
    .maybeSingle();
  if (error) return { ok: false, code: "unknown", error: error.message };
  if (data?.handle) updateTag(profileTag(data.handle));
  return { ok: true };
}

/** Rename with the 30-day cooldown and 90-day hold (same RPC as onboarding). */
export async function renameHandle(newHandle: string): Promise<SetHandleResult> {
  return setHandle(newHandle);
}
