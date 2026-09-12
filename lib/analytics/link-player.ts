"use client";

import { createClient } from "@/lib/supabase/client";
import { getPlayerId } from "@/lib/analytics/collector";

const KEY = "hv_linked";

/**
 * Call after sign-in: attaches this browser's anonymous plays and guest scores to the account.
 * Once per visit, so scores set while signed out between visits are picked up too.
 */
export async function linkPlayer(): Promise<void> {
  const pid = getPlayerId();
  if (!pid) return;
  const supabase = createClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) return;
  try {
    if (sessionStorage.getItem(KEY) === `${uid}:${pid}`) return;
  } catch {
    /* ignore */
  }
  const { error } = await supabase.rpc("link_player", { p_pid: pid });
  if (!error) {
    try {
      sessionStorage.setItem(KEY, `${uid}:${pid}`);
    } catch {
      /* ignore */
    }
  }
}
