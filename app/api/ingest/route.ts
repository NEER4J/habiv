import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestBodySchema, MAX_INGEST_BODY_BYTES, MAX_PROPS_BYTES, MAX_PROPS_KEYS } from "@/lib/analytics/schema";
import { parseUA } from "@/lib/analytics/ua";
import { playerIdFrom } from "@/lib/runs/http";
import type { Json } from "@/lib/supabase/database.types";


const noStore = { "cache-control": "no-store" };
const EVENTS_PER_HOUR = 2000;

/**
 * Batched analytics ingest. Nothing here is trusted for counting plays (those come from
 * server-minted runs); events feed views, drop-off, geo/device/referrer breakdowns.
 */
export async function POST(request: NextRequest) {
  const len = Number(request.headers.get("content-length") ?? 0);
  if (len > MAX_INGEST_BODY_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413, headers: noStore });

  const playerId = playerIdFrom(request);
  if (!playerId) return new NextResponse(null, { status: 204, headers: noStore });

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return NextResponse.json({ error: "bad_body" }, { status: 400, headers: noStore });
  }
  if (raw.length > MAX_INGEST_BODY_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413, headers: noStore });

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400, headers: noStore });
  }
  const parsed = ingestBodySchema.safeParse(parsedJson);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400, headers: noStore });
  }
  const { ctx, events } = parsed.data;
  for (const e of events) {
    if (e.props && (Object.keys(e.props).length > MAX_PROPS_KEYS || JSON.stringify(e.props).length > MAX_PROPS_BYTES)) {
      return NextResponse.json({ error: "props_too_large" }, { status: 400, headers: noStore });
    }
  }

  const admin = createAdminClient();
  const { data: allowed } = await admin.rpc("rate_limit_hit", { p_key: `ingest:${playerId}`, p_window: "1 hour", p_limit: EVENTS_PER_HOUR, p_cost: events.length });
  if (allowed === false) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: noStore });

  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    userId = data?.claims?.sub ?? null;
  } catch {
    userId = null;
  }

  const ua = parseUA(request.headers.get("user-agent"));
  if (ua.device_type === "bot") return new NextResponse(null, { status: 204, headers: noStore });
  const country = (request.headers.get("x-vercel-ip-country") ?? request.headers.get("cf-ipcountry") ?? "").slice(0, 2).toUpperCase() || null;

  const rows = events.map((e) => ({
    client_ts: e.client_ts,
    game_id: e.game_id,
    version_id: e.version_id ?? null,
    player_id: playerId,
    user_id: userId,
    session_id: e.session_id,
    run_id: e.run_id ?? null,
    name: e.name,
    level: e.level ?? null,
    outcome: e.outcome ?? null,
    score: e.score ?? null,
    value: e.value ?? null,
    props: e.props ?? {},
    referrer_host: ctx?.referrer_host ?? null,
    utm_source: ctx?.utm_source ?? null,
    utm_medium: ctx?.utm_medium ?? null,
    utm_campaign: ctx?.utm_campaign ?? null,
    device_type: ua.device_type,
    os: ua.os,
    browser: ua.browser,
    country,
  }));

  const { data: accepted, error } = await admin.rpc("ingest_events", { p_rows: rows as unknown as Json });
  if (error) {
    console.error("ingest_events", error.message);
    return NextResponse.json({ error: "store_failed" }, { status: 500, headers: noStore });
  }
  return NextResponse.json({ accepted: accepted ?? rows.length }, { status: 202, headers: noStore });
}
