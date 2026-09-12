import { z } from "zod";
import type { NextRequest } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { buckets, headObject, presignPut } from "@/lib/storage";
import { extensionOf } from "@/lib/contracts/upload";
import { fail, ok, parseJson } from "@/lib/upload/http";

const schema = z.object({ key: z.string().min(1) });

/**
 * Lets the publish wizard pick up an upload the creator left mid-way (tab closed, network dropped).
 * Reports whether the session can still take bytes; single-PUT sessions get a fresh URL (the old one
 * lasts an hour) and say whether the object already arrived, so the client can skip straight to complete.
 * Multipart parts are tracked by the client, which re-uploads only the parts it has no ETag for.
 */
export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return fail("unauthorized", "Sign in first.", 401);
  const parsed = await parseJson(request, schema);
  if ("response" in parsed) return parsed.response;
  const { key } = parsed.data;

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("upload_sessions")
    .select("id, mode, key, status, expires_at, version_id, game_id, size_bytes")
    .eq("user_id", user.userId)
    .eq("key", key)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!session) return ok({ state: "closed" });
  if (session.status === "completed") return ok({ state: "completed", versionId: session.version_id, gameId: session.game_id });
  if (session.status !== "open") return ok({ state: "closed" });
  if (new Date(session.expires_at).getTime() < Date.now()) return ok({ state: "expired" });

  if (session.mode === "single") {
    const b = buckets();
    const head = await headObject(b.uploads, key).catch(() => null);
    const arrived = !!head && (session.size_bytes == null || head.size === session.size_bytes);
    const putUrl = arrived ? null : await presignPut(b.uploads, key, extensionOf(key) === ".zip" ? "application/zip" : "text/html", 3600);
    return ok({ state: "open", arrived, putUrl });
  }
  return ok({ state: "open", arrived: false, putUrl: null });
}
