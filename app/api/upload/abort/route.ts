import { z } from "zod";
import type { NextRequest } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { abortMultipart, buckets } from "@/lib/r2";
import { fail, ok, parseJson } from "@/lib/upload/http";

const schema = z.object({ key: z.string().min(1), uploadId: z.string().min(1).optional() });

/** Cancels an in-progress upload and marks the version rejected. */
export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return fail("unauthorized", "Sign in first.", 401);
  const parsed = await parseJson(request, schema);
  if ("response" in parsed) return parsed.response;
  const { key, uploadId } = parsed.data;

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("upload_sessions")
    .select("id, mode, r2_upload_id, status, version_id")
    .eq("user_id", user.userId)
    .eq("key", key)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!session) return fail("not_found", "Upload session not found.", 404);
  if (session.status !== "open") return ok({ already: session.status });

  if (session.mode === "multipart" && session.r2_upload_id && uploadId === session.r2_upload_id) {
    try {
      await abortMultipart(buckets().uploads, key, uploadId);
    } catch (e) {
      console.warn("abortMultipart", e);
    }
  }
  await admin.from("upload_sessions").update({ status: "aborted" }).eq("id", session.id);
  await admin.from("game_versions").update({ status: "rejected", reject_reason: "aborted" }).eq("id", session.version_id);
  return ok({});
}
