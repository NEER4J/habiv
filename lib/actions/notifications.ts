"use server";

import { createClient } from "@/lib/supabase/server";

export async function markRead(ids: string[]): Promise<{ ok: boolean; updated: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_notifications_read", { p_ids: ids });
  return { ok: !error, updated: data ?? 0 };
}

export async function markAllRead(): Promise<{ ok: boolean; updated: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_notifications_read", {});
  return { ok: !error, updated: data ?? 0 };
}
