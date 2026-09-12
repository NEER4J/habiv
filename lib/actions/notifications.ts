"use server";

import { createClient } from "@/lib/supabase/server";

type MarkResult = { ok: boolean; updated: number; error?: string };

/** Marks the given ids read; with no ids, marks everything read. */
async function mark(ids: string[] | null): Promise<MarkResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_notifications_read", ids ? { p_ids: ids } : {});
  if (error) {
    console.error("mark_notifications_read failed", error);
    return { ok: false, updated: 0, error: error.message };
  }
  return { ok: true, updated: data ?? 0 };
}

export async function markRead(ids: string[]): Promise<MarkResult> {
  if (!ids.length) return { ok: true, updated: 0 };
  return mark(ids);
}

export async function markAllRead(): Promise<MarkResult> {
  return mark(null);
}
