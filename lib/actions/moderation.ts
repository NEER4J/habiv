"use server";

import { z } from "zod";
import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { FEED_TAG, gameTag } from "@/lib/db/games";

const reportSchema = z
  .object({
    gameId: z.string().uuid().optional(),
    commentId: z.string().uuid().optional(),
    userId: z.string().uuid().optional(),
    reason: z.enum(["spam", "abuse", "sexual", "violence", "malware", "copyright", "broken", "other"]),
    details: z.string().trim().max(1000).optional(),
  })
  .refine((v) => [v.gameId, v.commentId, v.userId].filter(Boolean).length === 1, { message: "Report exactly one thing." });

type Err = { ok: false; code: "auth" | "invalid" | "unknown"; error: string };

export async function report(input: z.infer<typeof reportSchema>): Promise<{ ok: true; duplicate: boolean } | Err> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid", error: parsed.error.issues[0]?.message ?? "Invalid report." };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return { ok: false, code: "auth", error: "Sign in to report." };
  const p = parsed.data;
  const { error } = await supabase.from("reports").insert({
    reporter_id: uid,
    game_id: p.gameId ?? null,
    comment_id: p.commentId ?? null,
    user_id: p.userId ?? null,
    reason: p.reason,
    details: p.details ?? null,
  });
  if (error?.code === "23505") return { ok: true, duplicate: true };
  if (error) return { ok: false, code: "unknown", error: error.message };
  if (p.gameId) {
    revalidateTag(gameTag(p.gameId), "max");
    revalidateTag(FEED_TAG, "max");
  }
  return { ok: true, duplicate: false };
}

export async function toggleBlock(userId: string): Promise<{ ok: true; blocked: boolean } | Err> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return { ok: false, code: "auth", error: "Sign in first." };
  if (uid === userId) return { ok: false, code: "invalid", error: "You cannot block yourself." };
  const { data: existing } = await supabase.from("blocks").select("blocked_id").eq("blocker_id", uid).eq("blocked_id", userId).maybeSingle();
  const { error } = existing
    ? await supabase.from("blocks").delete().eq("blocker_id", uid).eq("blocked_id", userId)
    : await supabase.from("blocks").insert({ blocker_id: uid, blocked_id: userId });
  if (error) return { ok: false, code: "unknown", error: error.message };
  return { ok: true, blocked: !existing };
}

/** Admin only (enforced by the RPC). */
export async function resolveReport(reportId: string, status: "resolved" | "dismissed", gameAction?: "restore" | "remove"): Promise<{ ok: true } | Err> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_report", { p_report_id: reportId, p_status: status, p_game_action: gameAction ?? undefined });
  if (error) return { ok: false, code: error.message.includes("not_allowed") ? "auth" : "unknown", error: error.message };
  revalidateTag(FEED_TAG, "max");
  return { ok: true };
}
