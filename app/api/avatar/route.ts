import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getRequestUser } from "@/lib/supabase/request-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { buckets, deleteObject, putObject } from "@/lib/r2";
import { profileTag } from "@/lib/db/profiles";
import { cdnUrl } from "@/lib/site";

const MAX_BYTES = 2 * 1024 * 1024;

function sniff(buf: Uint8Array): "webp" | "png" | "jpg" | null {
  if (buf.length > 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return "webp";
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  return null;
}

/**
 * Avatar upload: multipart form with a `file` field. The client resizes to 256 px first
 * (canvas), the server checks the bytes and stores them under avatars/{uid}/{ts}.{ext}.
 */
export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ ok: false, code: "unauthorized", error: "Sign in first." }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob)) return NextResponse.json({ ok: false, code: "invalid", error: "Attach an image as `file`." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, code: "too_large", error: "Avatars are capped at 2 MB." }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes);
  if (!kind) return NextResponse.json({ ok: false, code: "bad_type", error: "Use a PNG, JPEG or WebP image." }, { status: 400 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("handle, avatar_path").eq("id", user.userId).maybeSingle();
  const key = `avatars/${user.userId}/${Date.now()}.${kind}`;
  await putObject(buckets().public, key, bytes, kind === "jpg" ? "image/jpeg" : `image/${kind}`, { cacheControl: "public, max-age=31536000, immutable" });
  await admin.from("profiles").update({ avatar_path: key }).eq("id", user.userId);
  if (profile?.avatar_path && profile.avatar_path !== key) await deleteObject(buckets().public, profile.avatar_path).catch(() => {});
  if (profile?.handle) revalidateTag(profileTag(profile.handle), "max");
  return NextResponse.json({ ok: true, avatarUrl: cdnUrl(key), path: key });
}

export async function DELETE(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ ok: false, code: "unauthorized", error: "Sign in first." }, { status: 401 });
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("handle, avatar_path").eq("id", user.userId).maybeSingle();
  if (profile?.avatar_path) await deleteObject(buckets().public, profile.avatar_path).catch(() => {});
  await admin.from("profiles").update({ avatar_path: null }).eq("id", user.userId);
  if (profile?.handle) revalidateTag(profileTag(profile.handle), "max");
  return NextResponse.json({ ok: true });
}
