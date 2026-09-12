/** Creator surfaces need a session. Browsing and playing never do. */
export const PROTECTED_PREFIXES = ["/publish", "/my-games", "/settings", "/admin", "/experiment", "/profile", "/saved", "/mcp/"];

export function isProtectedPath(path: string): boolean {
  return PROTECTED_PREFIXES.some((p) => path.startsWith(p));
}

/**
 * Where to send someone who has not picked a handle yet: `target` with the profile-setup popup
 * (username, then avatar) open over it. Creator routes need a handle to load, so for those the
 * popup opens over home and carries on to `target` once it is done.
 */
export function welcomePath(target: string, suggest?: string | null): string {
  const creator = isProtectedPath(target);
  const url = new URL(creator ? "/" : target, "http://habiv.local");
  url.searchParams.set("welcome", "1");
  if (creator) url.searchParams.set("next", target);
  if (suggest) url.searchParams.set("suggest", suggest);
  return `${url.pathname}${url.search}${url.hash}`;
}
