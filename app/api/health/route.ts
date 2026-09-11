import { NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/anon";

/** Liveness probe that also touches Postgres so Supabase Free does not pause the project. */
export async function GET() {
  const startedAt = Date.now();
  let db = false;
  try {
    const supabase = createAnonClient();
    const { error } = await supabase.from("reserved_handles").select("handle", { count: "exact", head: true });
    db = !error;
  } catch {
    db = false;
  }
  return NextResponse.json(
    { ok: db, db, ms: Date.now() - startedAt, ts: new Date().toISOString() },
    { status: db ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
