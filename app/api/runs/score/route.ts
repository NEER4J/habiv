import { z } from "zod";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyRunToken } from "@/lib/runs/token";
import { playerIdFrom } from "@/lib/runs/http";
import { leaderboardTag } from "@/lib/db/leaderboards";
import { nullable } from "@/lib/supabase/helpers";

const noStore = { "cache-control": "no-store" };

const schema = z.object({
  run_id: z.string().uuid(),
  run_token: z.string().min(20).max(200),
  board: z.string().regex(/^[a-z0-9_]{1,32}$/).default("main"),
  value: z.number().int().safe(),
});

/**
 * Leaderboard submit with anti-cheat: valid run token, one submit per run per board, server-timed
 * minimum duration and score-per-second ceiling from the creator's board config.
 */
export async function POST(request: NextRequest) {
  const playerId = playerIdFrom(request);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400, headers: noStore });
  const b = parsed.data;

  const admin = createAdminClient();
  if (playerId) {
    const { data: allowed } = await admin.rpc("rate_limit_hit", { p_key: `score:${playerId}`, p_window: "1 hour", p_limit: 60 });
    if (allowed === false) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: noStore });
  }

  const { data: rows } = await admin.rpc("get_run", { p_id: b.run_id });
  const run = rows?.[0];
  if (!run) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore });
  if (run.preview) return NextResponse.json({ accepted: false, flagged: "preview", boards: [] }, { headers: noStore });
  const startedAt = new Date(run.started_at).toISOString();
  if (!verifyRunToken({ runId: run.id, gameId: run.game_id, playerId: run.player_id, startedAt }, b.run_token)) {
    return NextResponse.json({ error: "bad_token" }, { status: 401, headers: noStore });
  }

  // Only the live version ranks. Older versions stay playable (/@handle/slug?v=N), but their scores
  // were made under different rules, so they are not compared with today's board.
  if (run.version_id) {
    const { data: game } = await admin.from("games").select("current_version_id").eq("id", run.game_id).maybeSingle();
    if (game?.current_version_id && game.current_version_id !== run.version_id) {
      return NextResponse.json({ accepted: false, flagged: "old_version", boards: [] }, { headers: noStore });
    }
  }

  const { data: boards } = await admin.from("leaderboards").select("id, period, sort, max_per_second, min_duration_ms").eq("game_id", run.game_id).eq("key", b.board);
  if (!boards?.length) return NextResponse.json({ accepted: false, flagged: "no_board", boards: [] }, { headers: noStore });

  const durationMs = Date.now() - new Date(run.started_at).getTime();
  const minMs = Math.max(...boards.map((x) => x.min_duration_ms));
  const maxPerSecond = boards.map((x) => x.max_per_second).filter((x): x is number => x != null)[0] ?? null;
  let flag: string | null = null;
  if (durationMs < minMs) flag = "too_fast";
  else if (maxPerSecond != null && Math.abs(b.value) / Math.max(durationMs / 1000, 0.001) > maxPerSecond) flag = "rate";

  const { data: results, error } = await admin.rpc("submit_score", { p_run: run.id, p_key: b.board, p_score: b.value, p_flag: nullable(flag) });
  if (error) {
    if (error.message.includes("lb_one_per_run") || error.code === "23505") return NextResponse.json({ accepted: false, flagged: "already_submitted", boards: [] }, { status: 409, headers: noStore });
    console.error("submit_score", error.message);
    return NextResponse.json({ error: "store_failed" }, { status: 500, headers: noStore });
  }
  if (!flag) {
    await admin.rpc("set_run_score", { p_run: run.id, p_score: b.value });
    revalidateTag(leaderboardTag(run.game_id), "max");
  }
  return NextResponse.json(
    { accepted: !flag, flagged: flag, boards: (results ?? []).map((r) => ({ period: r.period, rank: Number(r.rank), personal_best: r.personal_best })) },
    { headers: noStore },
  );
}
