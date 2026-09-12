/** Public site constants usable from both server and client code. */
export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.habiv.com").replace(/\/$/, "");
export const gameOrigin = (process.env.NEXT_PUBLIC_GAME_ORIGIN ?? "").replace(/\/$/, "");
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
/** Base URL of the public bucket: Supabase Storage's public URL unless a CDN origin is set. */
export const cdnOrigin = (process.env.NEXT_PUBLIC_CDN_ORIGIN || `${supabaseUrl}/storage/v1/object/public/habiv-public`).replace(/\/$/, "");

/** Absolute URL for an object in the public bucket, or null when no path is set. */
export function cdnUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${cdnOrigin}/${path.replace(/^\//, "")}`;
}

/**
 * profiles.avatar_path holds either a storage key (an uploaded photo) or `seed:<seed>`
 * (a generated face the user picked). avatarUrl values keep that token as-is, so render
 * them with <UserAvatar>, never straight into an <img>.
 */
export const AVATAR_SEED_PREFIX = "seed:";
export const AVATAR_SEED_RE = /^[a-z0-9_.-]{1,48}$/i;

/** avatarUrl for a profile's avatar_path: a CDN URL for a photo, the `seed:` token for a generated face. */
export function avatarUrlOf(path: string | null | undefined): string | null {
  if (path?.startsWith(AVATAR_SEED_PREFIX)) return path;
  return cdnUrl(path);
}

/** The picked seed in an avatarUrl, or null for a photo or no avatar. */
export function avatarSeedOf(url: string | null | undefined): string | null {
  return url?.startsWith(AVATAR_SEED_PREFIX) ? url.slice(AVATAR_SEED_PREFIX.length) || null : null;
}

/** True when an avatarUrl is an uploaded photo (safe to put in an <img> or og:image). */
export function isAvatarPhoto(url: string | null | undefined): url is string {
  return !!url && !url.startsWith(AVATAR_SEED_PREFIX);
}
