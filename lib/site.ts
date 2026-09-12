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
