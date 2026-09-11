import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";

export const fail = (code: string, error: string, status = 400) =>
  NextResponse.json({ ok: false, code, error }, { status, headers: { "cache-control": "no-store" } });

export const ok = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json({ ok: true, ...body }, { status, headers: { "cache-control": "no-store" } });

export async function parseJson<T extends z.ZodTypeAny>(request: Request, schema: T): Promise<{ data: z.infer<T> } | { response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { response: fail("bad_json", "Body must be JSON.") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { response: fail("invalid", parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ")) };
  }
  return { data: parsed.data };
}
