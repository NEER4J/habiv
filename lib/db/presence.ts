import { createAnonClient } from "@/lib/supabase/anon";

/** Returns the number of distinct players with a fresh open run on this game. */
export async function getActiveGamePlayers(gameId: string): Promise<number> {
  const { data } = await createAnonClient().rpc("active_game_players", { p_game_id: gameId });
  return Number(data ?? 0);
}
