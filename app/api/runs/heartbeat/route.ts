import { z } from "zod";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyRunToken } from "@/lib/runs/token";
import { playerIdFrom } from "@/lib/runs/http";

const noStore = { "cache-control": "no-store" };

const schema = z.object({
  run_id: z.string().uuid(),
  run_token: z.string().min(20).max(200),
});

/** Keeps an open run visible to the live "playing now" count. */
export async function POST(request: NextRequest) {
  const playerId = playerIdFrom(request);
  if (!playerId) return NextResponse.json({ error: "no_player" }, { status: 400, headers: noStore });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400, headers: noStore });
  const b = parsed.data;

  const admin = createAdminClient();
  const { data: allowed } = await admin.rpc("rate_limit_hit", { p_key: `runs:heartbeat:${playerId}`, p_window: "1 hour", p_limit: 480 });
  if (allowed === false) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: noStore });

  const { data: rows } = await admin.rpc("get_run", { p_id: b.run_id });
  const run = rows?.[0];
  if (!run) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore });
  if (run.preview) return NextResponse.json({ ok: false }, { headers: noStore });
  if (run.ended_at) return NextResponse.json({ ok: false }, { status: 409, headers: noStore });

  const startedAt = new Date(run.started_at).toISOString();
  if (!verifyRunToken({ runId: run.id, gameId: run.game_id, playerId: run.player_id, startedAt }, b.run_token)) {
    return NextResponse.json({ error: "bad_token" }, { status: 401, headers: noStore });
  }

  const { data: alive, error } = await admin.rpc("heartbeat_run", { p_id: b.run_id });
  if (error) {
    console.error("heartbeat_run", error.message);
    return NextResponse.json({ error: "store_failed" }, { status: 500, headers: noStore });
  }
  return NextResponse.json({ ok: alive === true }, { headers: noStore });
}
