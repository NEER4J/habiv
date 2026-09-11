/**
 * Handle rules. The database CHECK constraint and is_handle_available() enforce the same
 * rule; keep the three in sync.
 *
 * 3–20 chars, [a-z0-9_], starts with a letter, no double underscore, not a placeholder.
 */
export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;
export const HANDLE_RE = /^[a-z][a-z0-9_]{2,19}$/;
const PLACEHOLDER_RE = /^user_[0-9a-f]{8}$/;

export type HandleValidation =
  | { ok: true; handle: string }
  | { ok: false; reason: "length" | "charset" | "start" | "double_underscore" | "reserved_pattern" };

/** Lowercases, strips disallowed characters and caps the length. Safe to run on every keystroke. */
export function normalizeHandle(value: string): string {
  return value
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, HANDLE_MAX);
}

export function validateHandle(value: string): HandleValidation {
  const handle = normalizeHandle(value);
  if (handle.length < HANDLE_MIN || handle.length > HANDLE_MAX) return { ok: false, reason: "length" };
  if (!/^[a-z]/.test(handle)) return { ok: false, reason: "start" };
  if (handle.includes("__")) return { ok: false, reason: "double_underscore" };
  if (PLACEHOLDER_RE.test(handle)) return { ok: false, reason: "reserved_pattern" };
  if (!HANDLE_RE.test(handle)) return { ok: false, reason: "charset" };
  return { ok: true, handle };
}

export function handleReasonMessage(reason: Extract<HandleValidation, { ok: false }>["reason"]): string {
  switch (reason) {
    case "length":
      return `Use ${HANDLE_MIN} to ${HANDLE_MAX} characters.`;
    case "start":
      return "Start with a letter.";
    case "double_underscore":
      return "No double underscores.";
    case "reserved_pattern":
      return "That pattern is reserved.";
    case "charset":
      return "Only lowercase letters, numbers and underscores.";
  }
}

/** Strips a leading @ from a route param such as "@rahul" and lowercases it. Returns null if not @-prefixed. */
export function handleFromRouteParam(param: string): string | null {
  const decoded = decodeURIComponent(param);
  if (!decoded.startsWith("@")) return null;
  const handle = decoded.slice(1).toLowerCase();
  return HANDLE_RE.test(handle) ? handle : null;
}

export function isPlaceholderHandle(handle: string): boolean {
  return PLACEHOLDER_RE.test(handle);
}
