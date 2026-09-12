import { z } from "zod";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const noStore = { "cache-control": "no-store" };

/** Public, uncached count of distinct players with a fresh open run on a published game. */
export async function GET(_request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  if (!z.string().uuid().safeParse(gameId).success) {
    return NextResponse.json({ error: "invalid" }, { status: 400, headers: noStore });
  }

  const { data, error } = await createAdminClient().rpc("active_game_players", { p_game_id: gameId });
  if (error) {
    console.error("active_game_players", error.message);
    return NextResponse.json({ error: "store_failed" }, { status: 500, headers: noStore });
  }
  return NextResponse.json({ playing: Number(data ?? 0) }, { headers: noStore });
}
