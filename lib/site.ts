/** Public site constants usable from both server and client code. */
export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://habiv.com").replace(/\/$/, "");
export const gameOrigin = (process.env.NEXT_PUBLIC_GAME_ORIGIN ?? "").replace(/\/$/, "");
export const cdnOrigin = (process.env.NEXT_PUBLIC_CDN_ORIGIN ?? "https://cdn.habiv.com").replace(/\/$/, "");

/** Absolute URL for an object in the public R2 bucket, or null when no path is set. */
export function cdnUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${cdnOrigin}/${path.replace(/^\//, "")}`;
}
