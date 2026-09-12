/**
 * Creator-editable game details beyond the basics: the long description, how-to-play controls,
 * tags and typical run length. Shared by the publish wizard and the edit-details page; the limits
 * match what the game page renders (parseControls in lib/habiv/games.ts) and the server schema.
 */
export const MAX_CONTROL_ROWS = 6;
export const CONTROL_KEY_MAX = 16;
export const CONTROL_ACTION_MAX = 60;
export const TOUCH_HINT_MAX = 80;
export const DESCRIPTION_MAX = 4000;
export const MAX_TAGS = 5;
export const TAG_RE = /^[a-z0-9][a-z0-9 -]{0,23}$/;

export type Orientation = "portrait" | "landscape" | "any";
export type Licence = "open" | "no_remix";

export const orientations: { label: string; value: Orientation }[] = [
  { label: "Vertical", value: "portrait" },
  { label: "Landscape", value: "landscape" },
  { label: "Any", value: "any" },
];

export const licences: { label: string; value: Licence }[] = [
  { label: "Open to remix", value: "open" },
  { label: "No remixes", value: "no_remix" },
];

/** Run lengths offered as chips; 3600 is "endless" (durationLabel renders it as ∞). */
export const durationOptions: { label: string; value: number | null }[] = [
  { label: "Not set", value: null },
  { label: "15 sec", value: 15 },
  { label: "30 sec", value: 30 },
  { label: "1 min", value: 60 },
  { label: "2 min", value: 120 },
  { label: "5 min", value: 300 },
  { label: "15 min+", value: 900 },
  { label: "Endless", value: 3600 },
];

export type ControlRow = { key: string; action: string };

/** Form state for the extra details, kept as typed; toDetailsPatch normalises it for saving. */
export type ExtraDetails = { description: string; keys: ControlRow[]; touch: string; tags: string; durationSec: number | null };

export const emptyExtraDetails: ExtraDetails = { description: "", keys: [], touch: "", tags: "", durationSec: null };

/** Reads a games.controls value as stored, without the category defaults the game page falls back to. */
export function readControls(raw: unknown): { keys: ControlRow[]; touch: string | null } {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const keys = Array.isArray(o.keys)
    ? o.keys
        .flatMap((k) => (k && typeof k === "object" ? [{ key: String((k as ControlRow).key ?? ""), action: String((k as ControlRow).action ?? "") }] : []))
        .filter((k) => k.key && k.action)
        .slice(0, MAX_CONTROL_ROWS)
    : [];
  return { keys, touch: typeof o.touch === "string" && o.touch ? o.touch : null };
}

/** Comma-separated input to at most five valid, lower-case, de-duplicated tags. */
export function parseTags(text: string): string[] {
  const names = text
    .split(",")
    .map((t) => t.trim().toLowerCase().replace(/\s+/g, " "))
    .filter((t) => TAG_RE.test(t));
  return Array.from(new Set(names)).slice(0, MAX_TAGS);
}

export function extraDetailsFrom(g: { description: string | null; controls: unknown; tags: string[]; durationSec: number | null }): ExtraDetails {
  const c = readControls(g.controls);
  return { description: g.description ?? "", keys: c.keys, touch: c.touch ?? "", tags: g.tags.join(", "), durationSec: g.durationSec };
}

/** The updateGameMeta fields for the extra details. Blank control rows are dropped. */
export function toDetailsPatch(d: ExtraDetails) {
  return {
    description: d.description.trim() || null,
    controls: {
      keys: d.keys
        .map((k) => ({ key: k.key.trim(), action: k.action.trim() }))
        .filter((k) => k.key && k.action)
        .slice(0, MAX_CONTROL_ROWS),
      touch: d.touch.trim() || null,
    },
    tags: parseTags(d.tags),
    durationSec: d.durationSec,
  };
}
