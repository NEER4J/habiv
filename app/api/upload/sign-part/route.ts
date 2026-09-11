import { z } from "zod";
import type { NextRequest } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { buckets, presignPart } from "@/lib/r2";
import { MAX_PARTS } from "@/lib/contracts/upload";
import { fail, ok, parseJson } from "@/lib/upload/http";

const schema = z.object({
  uploadId: z.string().min(1),
  key: z.string().min(1),
  partNumber: z.number().int().min(1).max(10000),
});

/** Presigns one multipart part for Uppy. */
export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return fail("unauthorized", "Sign in first.", 401);
  const parsed = await parseJson(request, schema);
  if ("response" in parsed) return parsed.response;
  const { uploadId, key, partNumber } = parsed.data;
  if (partNumber > MAX_PARTS) return fail("too_many_parts", "Too many parts for the upload cap.");

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("upload_sessions")
    .select("id, key, status, expires_at")
    .eq("user_id", user.userId)
    .eq("r2_upload_id", uploadId)
    .maybeSingle();
  if (!session || session.key !== key) return fail("not_found", "Upload session not found.", 404);
  if (session.status !== "open") return fail("closed", "Upload session is closed.", 409);
  if (new Date(session.expires_at).getTime() < Date.now()) return fail("expired", "Upload session expired.", 410);

  const url = await presignPart(buckets().uploads, key, uploadId, partNumber);
  return ok({ url });
}
