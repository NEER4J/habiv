import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-user";
import { gameOrigin } from "@/lib/site";
import type { VersionStatusResponse } from "@/lib/contracts/upload";
import { fail } from "@/lib/upload/http";

/** Polling target for the publish wizard: GET /api/upload/status?versionId=... */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return fail("unauthorized", "Sign in first.", 401);
  const versionId = request.nextUrl.searchParams.get("versionId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(versionId)) return fail("invalid", "versionId is required.");

  const { data: v } = await user.supabase
    .from("game_versions")
    .select("id, game_id, version, status, engine, needs_isolation, uses_network, size_bytes, file_count, reject_reason, manifest")
    .eq("id", versionId)
    .maybeSingle();
  if (!v) return fail("not_found", "Version not found.", 404);

  const manifest = (v.manifest ?? null) as { warnings?: unknown } | null;
  const warnings = Array.isArray(manifest?.warnings) ? (manifest!.warnings as unknown[]).filter((w): w is string => typeof w === "string") : [];
  const body: VersionStatusResponse = {
    ok: true,
    versionId: v.id,
    gameId: v.game_id,
    version: v.version,
    status: v.status as Extract<VersionStatusResponse, { ok: true }>["status"],
    engine: v.engine,
    needsIsolation: v.needs_isolation,
    usesNetwork: v.uses_network,
    sizeBytes: v.size_bytes,
    fileCount: v.file_count,
    rejectReason: v.reject_reason,
    warnings,
    previewUrl: v.status === "ready" && gameOrigin ? `${gameOrigin}/v/${v.id}/?mode=preview` : null,
  };
  return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
}
