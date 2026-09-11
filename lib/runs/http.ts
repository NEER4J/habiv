import "server-only";
import type { NextRequest } from "next/server";
import { PLAYER_COOKIE } from "@/lib/supabase/proxy";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function playerIdFrom(request: NextRequest): string | null {
  const v = request.cookies.get(PLAYER_COOKIE)?.value;
  return v && UUID_RE.test(v) ? v.toLowerCase() : null;
}
