import { z } from "zod";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyRunToken } from "@/lib/runs/token";
import { playerIdFrom } from "@/lib/runs/http";
import { nullable } from "@/lib/supabase/helpers";

const noStore = { "cache-control": "no-store" };
const MIN_RUN_MS = 500;

const schema = z.object({
  run_id: z.string().uuid(),
  run_token: z.string().min(20).max(200),
  outcome: z.enum(["complete", "fail", "quit"]),
  score: z.number().int().safe().optional(),
  level: z.string().max(64).optional(),
  progress_pct: z.number().min(0).max(100).optional(),
});

/** Ends a run with server-side timing. Returns the duration and "beat X% of today's players". */
export async function POST(request: NextRequest) {
  const playerId = playerIdFrom(request);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400, headers: noStore });
  const b = parsed.data;

  const admin = createAdminClient();
  if (playerId) {
    const { data: allowed } = await admin.rpc("rate_limit_hit", { p_key: `runs:end:${playerId}`, p_window: "1 hour", p_limit: 240 });
    if (allowed === false) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: noStore });
  }

  const { data: rows } = await admin.rpc("get_run", { p_id: b.run_id });
  const run = rows?.[0];
  if (!run) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore });
  if (run.ended_at) return NextResponse.json({ error: "already_ended" }, { status: 409, headers: noStore });

  const startedAt = new Date(run.started_at).toISOString();
  if (!verifyRunToken({ runId: run.id, gameId: run.game_id, playerId: run.player_id, startedAt }, b.run_token)) {
    return NextResponse.json({ error: "bad_token" }, { status: 401, headers: noStore });
  }

  const elapsed = Date.now() - new Date(run.started_at).getTime();
  const flag = elapsed < MIN_RUN_MS ? "too_short" : null;
  const { data: ended, error } = await admin.rpc("end_run", {
    p_id: run.id,
    p_outcome: b.outcome,
    p_score: nullable(b.score),
    p_level: nullable(b.level),
    p_progress_pct: nullable(b.progress_pct != null ? Math.round(b.progress_pct) : null),
    p_flag: nullable(flag),
  });
  if (error) {
    console.error("end_run", error.message);
    return NextResponse.json({ error: "store_failed" }, { status: 500, headers: noStore });
  }
  const row = ended?.[0];
  return NextResponse.json({ ok: true, duration_ms: row?.duration_ms ?? elapsed, beat_pct: row?.beat_pct ?? null, flagged: flag }, { headers: noStore });
}
