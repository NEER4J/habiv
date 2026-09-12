import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-user";
import { ART_MAX_BYTES, saveGameArt } from "@/lib/art";

/**
 * Store art upload: multipart form with `file` and `kind` ("cover" | "card"). The client crops and
 * resizes first (canvas); the server checks the bytes and ownership in `saveGameArt`.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ gameId: string }> }) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ ok: false, code: "unauthorized", error: "Sign in first." }, { status: 401 });
  const { gameId } = await params;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const kind = form?.get("kind");
  if (!(file instanceof Blob)) return NextResponse.json({ ok: false, code: "invalid", error: "Attach an image as `file`." }, { status: 400 });
  if (kind !== "cover" && kind !== "card") return NextResponse.json({ ok: false, code: "invalid", error: "`kind` must be cover or card." }, { status: 400 });
  if (file.size > ART_MAX_BYTES) return NextResponse.json({ ok: false, code: "too_large", error: "Art is capped at 3 MB." }, { status: 413 });

  const res = await saveGameArt(user.userId, gameId, kind, new Uint8Array(await file.arrayBuffer()));
  if (!res.ok) return NextResponse.json({ ok: false, code: res.code, error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true, url: res.url, path: res.path });
}
