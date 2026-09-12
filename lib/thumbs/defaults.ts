import {
  CARD,
  COVER,
  renderThumb,
  THUMB_STYLES,
  THUMB_THEMES,
  type ThumbInput,
  type ThumbMode,
  type ThumbSize,
  type ThumbStyleId,
} from "./styles";

/** The styles a game can receive automatically when it has no uploaded art. */
const FALLBACK_STYLES = THUMB_STYLES.filter((style) => style.group !== "baseline").map((style) => style.id) as ThumbStyleId[];
const FALLBACK_THEMES = THUMB_THEMES.filter((theme) => theme.id !== "auto").map((theme) => theme.id);
const FALLBACK_MODES: ThumbMode[] = ["light", "dark", "vivid"];

function hash(seed: string) {
  let value = 2166136261;
  for (let i = 0; i < seed.length; i++) value = Math.imul(value ^ seed.charCodeAt(i), 16777619);
  return value >>> 0;
}

function choose<T>(items: T[], seed: number, salt: number) {
  return items[(seed + salt * 2654435761) % items.length];
}

export type DefaultThumbSelection = { style: ThumbStyleId; theme: string; mode: ThumbMode };

/**
 * Gives every game a different lab treatment while staying stable across renders and deploys.
 * The game id is the seed, so two games with the same title still don't look identical.
 */
export function defaultThumbSelection(seed: string): DefaultThumbSelection {
  const value = hash(seed || "habiv");
  return {
    style: choose(FALLBACK_STYLES, value, 1),
    theme: choose(FALLBACK_THEMES, value, 2),
    mode: choose(FALLBACK_MODES, value, 3),
  };
}

export function defaultThumbHtml(input: ThumbInput, size: ThumbSize): string {
  const selection = defaultThumbSelection(input.seed ?? input.title);
  return renderThumb(selection.style, input, size, { theme: selection.theme, mode: selection.mode });
}

export function defaultThumbDocuments(input: ThumbInput) {
  return {
    cover: defaultThumbHtml(input, COVER),
    card: defaultThumbHtml(input, CARD),
  };
}
