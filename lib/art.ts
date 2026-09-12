import "server-only";
import { revalidateTag } from "next/cache";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { buckets, deleteObject, putObject } from "@/lib/storage";
import { FEED_TAG, gameTag } from "@/lib/db/games";
import { profileTag } from "@/lib/db/profiles";
import { cdnUrl } from "@/lib/site";

/** `cover` is the 16:9 landscape art (feed tiles, player cover, link previews); `card` the 3:4 poster. */
export type ArtKind = "cover" | "card";

/** Input cap; what is stored is the re-encoded WebP, usually well under 200 KB. */
export const ART_MAX_BYTES = 3 * 1024 * 1024;

/** Same sizes the smoke job's screenshots use. */
const ART_SIZE: Record<ArtKind, { w: number; h: number }> = { cover: { w: 1280, h: 720 }, card: { w: 600, h: 800 } };
const WEBP_QUALITY = 80;

function isImage(buf: Uint8Array): boolean {
  const webp = buf.length > 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
  const png = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const jpg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  return webp || png || jpg;
}

export type SaveArtResult =
  | { ok: true; url: string; path: string }
  | { ok: false; code: "not_found" | "too_large" | "bad_type"; error: string; status: number };

/**
 * Centre-crops and re-encodes creator art to a WebP at the slot size, stores it under
 * covers|cards/{gameId}/u-{ts}.webp, points the game at it and deletes the previous file.
 * The smoke job only fills empty slots, so uploaded art survives new versions.
 */
export async function saveGameArt(userId: string, gameId: string, kind: ArtKind, bytes: Uint8Array): Promise<SaveArtResult> {
  if (bytes.length > ART_MAX_BYTES) return { ok: false, code: "too_large", error: "Art is capped at 3 MB.", status: 413 };
  if (!isImage(bytes)) return { ok: false, code: "bad_type", error: "Use a PNG, JPEG or WebP image.", status: 400 };

  const admin = createAdminClient();
  const { data: game } = await admin.from("games").select("id, creator_id, cover_path, card_path").eq("id", gameId).maybeSingle();
  if (!game || game.creator_id !== userId) return { ok: false, code: "not_found", error: "Game not found.", status: 404 };

  const { w, h } = ART_SIZE[kind];
  let webp: Buffer;
  try {
    webp = await sharp(bytes, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize(w, h, { fit: "cover", position: "centre" })
      .webp({ quality: WEBP_QUALITY, effort: 5 })
      .toBuffer();
  } catch {
    return { ok: false, code: "bad_type", error: "Could not read that image.", status: 400 };
  }

  const previous = kind === "cover" ? game.cover_path : game.card_path;
  const key = `${kind === "cover" ? "covers" : "cards"}/${gameId}/u-${Date.now()}.webp`;
  await putObject(buckets().public, key, webp, "image/webp", { cacheControl: "public, max-age=31536000, immutable" });
  await admin.from("games").update(kind === "cover" ? { cover_path: key } : { card_path: key }).eq("id", gameId);
  if (previous && previous !== key) await deleteObject(buckets().public, previous).catch(() => {});

  revalidateTag(gameTag(gameId), "max");
  revalidateTag(FEED_TAG, "max");
  revalidateTag(`creator-games:${userId}`, "max");
  const { data: profile } = await admin.from("profiles").select("handle").eq("id", userId).maybeSingle();
  if (profile?.handle) revalidateTag(profileTag(profile.handle), "max");

  return { ok: true, url: cdnUrl(key)!, path: key };
}
