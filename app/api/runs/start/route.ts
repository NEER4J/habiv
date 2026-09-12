import { z } from "zod";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { gameTag } from "@/lib/db/games";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashRunToken, isoNow, mintRunToken } from "@/lib/runs/token";
import { playerIdFrom } from "@/lib/runs/http";
import { nullable } from "@/lib/supabase/helpers";

const noStore = { "cache-control": "no-store" };

const schema = z.object({
  game_id: z.string().uuid(),
  version_id: z.string().uuid().optional(),
  session_id: z.string().uuid(),
  level: z.string().max(64).optional(),
  auto: z.boolean().optional(),
  preview: z.boolean().optional(),
});

/** Mints a run: the server-timed unit behind plays, durations, beats and leaderboard scores. */
export async function POST(request: NextRequest) {
  const playerId = playerIdFrom(request);
  if (!playerId) return NextResponse.json({ error: "no_player" }, { status: 400, headers: noStore });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400, headers: noStore });
  const b = parsed.data;

  const admin = createAdminClient();
  const { data: allowed } = await admin.rpc("rate_limit_hit", { p_key: `runs:start:${playerId}`, p_window: "1 hour", p_limit: 120 });
  if (allowed === false) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: noStore });

  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    userId = data?.claims?.sub ?? null;
  } catch {
    userId = null;
  }

  const { data: game } = await admin.from("games").select("id, status, creator_id, current_version_id").eq("id", b.game_id).maybeSingle();
  if (!game || game.status === "removed") return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore });
  // Unpublished games only count as previews (creator testing); they never affect stats.
  const preview = !!b.preview || game.status !== "published";
  if (preview && game.creator_id !== userId) return NextResponse.json({ run_id: null, run_token: null, started_at: null }, { headers: noStore });

  const runId = crypto.randomUUID();
  const startedAt = isoNow();
  const token = mintRunToken({ runId, gameId: game.id, playerId, startedAt });
  const { data: counted, error } = await admin.rpc("start_run", {
    p_id: runId,
    p_started_at: startedAt,
    p_game_id: game.id,
    p_version_id: nullable(b.version_id ?? game.current_version_id),
    p_player_id: playerId,
    p_user_id: nullable(userId),
    p_session_id: b.session_id,
    p_level: nullable(b.level),
    p_auto: !!b.auto,
    p_preview: preview,
    p_token_hash: hashRunToken(token),
  });
  if (error) {
    console.error("start_run", error.message);
    return NextResponse.json({ error: "store_failed" }, { status: 500, headers: noStore });
  }
  // Only the session's first run of a game is a play; when it counted, let the watch page pick up the new count.
  if (counted) revalidateTag(gameTag(game.id), "max");
  return NextResponse.json({ run_id: runId, run_token: token, started_at: startedAt, preview, counted: !!counted }, { headers: noStore });
}
