import { z } from "zod";
import type { NextRequest } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { buckets, completeMultipart, headObject } from "@/lib/r2";
import { enqueueIngest } from "@/lib/jobs/trigger";
import { MAX_UPLOAD_BYTES } from "@/lib/contracts/upload";
import { fail, ok, parseJson } from "@/lib/upload/http";

const schema = z.object({
  key: z.string().min(1),
  uploadId: z.string().min(1).optional(),
  parts: z.array(z.object({ PartNumber: z.number().int().min(1), ETag: z.string().min(1) })).min(1).optional(),
});

/** Step 3: closes the R2 upload, verifies the object and enqueues ingest. Idempotent per session. */
export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return fail("unauthorized", "Sign in first.", 401);
  const parsed = await parseJson(request, schema);
  if ("response" in parsed) return parsed.response;
  const { key, uploadId, parts } = parsed.data;

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("upload_sessions")
    .select("id, mode, key, r2_upload_id, status, version_id, game_id, size_bytes")
    .eq("user_id", user.userId)
    .eq("key", key)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!session) return fail("not_found", "Upload session not found.", 404);
  if (session.status !== "open") return fail("closed", "Upload already completed.", 409);

  const b = buckets();
  try {
    if (session.mode === "multipart") {
      if (!uploadId || !parts?.length || uploadId !== session.r2_upload_id) return fail("invalid", "uploadId and parts are required for multipart uploads.");
      await completeMultipart(b.uploads, key, uploadId, parts);
    }
    const head = await headObject(b.uploads, key);
    if (!head) return fail("missing_object", "The file did not arrive in storage.", 400);
    if (head.size > MAX_UPLOAD_BYTES) {
      await admin.from("upload_sessions").update({ status: "aborted" }).eq("id", session.id);
      await admin.from("game_versions").update({ status: "rejected", reject_reason: "too_large" }).eq("id", session.version_id);
      return fail("too_large", "The uploaded file is over the size cap.", 413);
    }

    await admin.from("upload_sessions").update({ status: "completed", size_bytes: head.size }).eq("id", session.id);
    await admin.from("game_versions").update({ status: "processing", size_bytes: head.size }).eq("id", session.version_id);
    const run = await enqueueIngest(session.version_id);
    await admin.from("game_versions").update({ ingest_run_id: run.id }).eq("id", session.version_id);
    return ok({ versionId: session.version_id, gameId: session.game_id, status: "processing", jobRunId: run.id });
  } catch (e) {
    console.error("upload/complete", e);
    return fail("internal", "Could not complete the upload.", 500);
  }
}
