import { z } from "zod";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-user";
import { createVersionForUpload, UploadError } from "@/lib/upload/create";
import { fail, parseJson } from "@/lib/upload/http";

const schema = z.object({
  filename: z.string().min(1).max(255),
  size: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  gameId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(80).optional(),
  agent: z.string().trim().max(80).optional(),
  model: z.string().trim().max(80).optional(),
  prompt: z.string().trim().max(8000).optional(),
  changelog: z.string().trim().max(500).optional(),
});

/** Step 1 of an upload: creates the draft game + version and opens a storage upload session. */
export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return fail("unauthorized", "Sign in first.", 401);
  const parsed = await parseJson(request, schema);
  if ("response" in parsed) return parsed.response;
  const b = parsed.data;
  try {
    const result = await createVersionForUpload({
      userId: user.userId,
      filename: b.filename,
      sizeBytes: b.size,
      sha256: b.sha256,
      gameId: b.gameId,
      title: b.title,
      source: "web",
      agent: b.agent,
      model: b.model,
      prompt: b.prompt,
      changelog: b.changelog,
    });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof UploadError) return fail(e.code, e.message, e.status);
    console.error("upload/create", e);
    return fail("internal", "Could not start the upload.", 500);
  }
}
