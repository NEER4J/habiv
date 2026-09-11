"use server";

import { createClient } from "@/lib/supabase/server";
import { createAnonClient } from "@/lib/supabase/anon";
import { asFeedRow, toFeedGame } from "@/lib/db/games";
import { listNotifications, type NotificationItem } from "@/lib/db/notifications";
import { searchGames } from "@/lib/actions/feed";
import { fromFeedGame, type Game } from "@/lib/habiv/games";

/** The viewer's latest notifications (empty for guests). Never cached. */
export async function loadNotifications(): Promise<NotificationItem[]> {
  const supabase = await createClient();
  return listNotifications(supabase, { limit: 30 });
}

/** Search box results; same semantics as the feed search action. */
export async function loadSearch(q: string): Promise<Game[]> {
  return searchGames(q);
}

/**
 * A single published game for the share / remix modals, read through the public feed view
 * (so it only ever returns what anonymous visitors can see). Fills in the current version's
 * prompt when it is readable.
 */
export async function loadGameForModal(gameId: string): Promise<Game | null> {
  if (!/^[0-9a-f-]{36}$/i.test(gameId)) return null;
  const supabase = createAnonClient();
  const { data: row } = await supabase.from("game_feed_v").select("*").eq("id", gameId).maybeSingle();
  if (!row) return null;
  const game = fromFeedGame(toFeedGame(asFeedRow(row)));
  if (row.current_version_id) {
    const { data: version } = await supabase.from("game_versions").select("prompt").eq("id", row.current_version_id).maybeSingle();
    if (version?.prompt) game.prompt = version.prompt;
  }
  return game;
}
