import type { GameMeta, GameMetaSource } from "../contracts/ingest";

/**
 * Reads the game details a build declares about itself, so the publish form and MCP publishes start
 * filled in (title, one line, about, how to play...). The AI that made the game writes them:
 *   1. habiv.json at the bundle root (zips), or
 *   2. <script type="application/habiv+json">{...}</script> in the entry html (works for single files too),
 *   3. and as a fallback, the page's <title> and <meta name="description">.
 * Earlier sources win field by field. Everything is cleaned to the same limits as the publish form
 * (lib/habiv/game-details.ts) and the games table, and bad input is skipped rather than rejected:
 * a typo in habiv.json must never block a game from being published.
 * The format is documented at /docs/details and published as a JSON Schema at /habiv.schema.json.
 */

export const META_FILE = "habiv.json";
export const MAX_META_BYTES = 64 * 1024;

const TITLE_MAX = 80;
const TAGLINE_MAX = 140;
const DESCRIPTION_MAX = 4000;
const MAX_CONTROL_ROWS = 6;
const CONTROL_KEY_MAX = 16;
const CONTROL_ACTION_MAX = 60;
const TOUCH_HINT_MAX = 80;
const MAX_TAGS = 5;
const MAX_CATEGORIES = 3;
const NAME_MAX = 80;
const PROMPT_MAX = 8000;
const CHANGELOG_MAX = 500;
const TAG_RE = /^[a-z0-9][a-z0-9 -]{0,23}$/;
const CATEGORY_RE = /^[a-z][a-z0-9_]{1,23}$/;

const INLINE = /<script\b[^>]*\btype\s*=\s*["']?application\/habiv\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/i;
const TITLE = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i;
/** Titles engines and templates leave behind; they say nothing about the game. */
const PLACEHOLDER_TITLE = /^(document|untitled|index|game|my game|new game|html5? game|web ?game|godot|phaser|construct( 3)?|gdevelop|pico-8|love\.?js|unity web ?gl player)$/i;

type Details = Omit<GameMeta, "sources">;
type Obj = Record<string, unknown>;

export function readGameMeta(input: { json?: string | null; html?: string | null }): { meta?: GameMeta; warnings: string[] } {
  const warnings: string[] = [];
  const layers: [GameMetaSource, Details][] = [];
  if (input.json != null) {
    const d = jsonLayer(input.json, META_FILE, warnings);
    if (d) layers.push(["habiv.json", d]);
  }
  if (input.html) {
    const block = INLINE.exec(input.html)?.[1];
    if (block != null) {
      const d = jsonLayer(block, "The application/habiv+json block", warnings);
      if (d) layers.push(["inline", d]);
    }
    layers.push(["html", htmlLayer(input.html)]);
  }

  const out: Obj = {};
  const sources: GameMetaSource[] = [];
  for (const [source, d] of layers) {
    let used = false;
    for (const [k, v] of Object.entries(d)) {
      if (v === undefined || out[k] !== undefined) continue;
      out[k] = v;
      used = true;
    }
    if (used) sources.push(source);
  }
  return sources.length ? { meta: { sources, ...(out as Details) }, warnings } : { warnings };
}

function jsonLayer(text: string, label: string, warnings: string[]): Details | null {
  if (text.length > MAX_META_BYTES) {
    warnings.push(`${label} is over ${MAX_META_BYTES / 1024} KB, so its game details were skipped.`);
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^﻿/, "").trim() || "null");
  } catch (e) {
    warnings.push(`${label} is not valid JSON (${(e as Error).message}), so its game details were skipped.`);
    return null;
  }
  if (!isObj(parsed)) {
    warnings.push(`${label} should hold a JSON object, so its game details were skipped.`);
    return null;
  }
  return clean(parsed);
}

/** Every known field of a habiv.json object, cleaned. A few common aliases are accepted because AIs improvise. */
export function clean(o: Obj): Details {
  const categories = strList(Array.isArray(o.categories) ? o.categories : [o.category ?? o.genre])
    .map((c) => c.toLowerCase())
    .filter((c) => CATEGORY_RE.test(c));
  const tags = strList(Array.isArray(o.tags) ? o.tags : typeof o.tags === "string" ? o.tags.split(",") : [])
    .map((t) => t.toLowerCase().replace(/\s+/g, " "))
    .filter((t) => TAG_RE.test(t));
  return {
    title: line(o.title ?? o.name, TITLE_MAX),
    tagline: line(o.tagline ?? o.summary ?? o.short_description, TAGLINE_MAX),
    description: text(o.description ?? o.about, DESCRIPTION_MAX),
    categories: categories.length ? unique(categories).slice(0, MAX_CATEGORIES) : undefined,
    tags: tags.length ? unique(tags).slice(0, MAX_TAGS) : undefined,
    orientation: orientation(o.orientation),
    durationSec: duration(o.duration_sec ?? o.durationSec),
    controls: controls(o.controls ?? o.how_to_play, o.touch),
    model: line(o.model, NAME_MAX),
    agent: line(o.agent ?? o.tool, NAME_MAX),
    prompt: text(o.prompt, PROMPT_MAX),
    changelog: line(o.changelog, CHANGELOG_MAX),
  };
}

function htmlLayer(html: string): Details {
  const out: Details = {};
  const rawTitle = TITLE.exec(html)?.[1];
  if (rawTitle) {
    const t = decode(rawTitle)
      .replace(/^unity web ?gl player\s*[|:-]\s*/i, "")
      .trim();
    if (!PLACEHOLDER_TITLE.test(t)) out.title = line(t, TITLE_MAX);
  }
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(tag[0]);
    if ((a.name ?? a.property ?? "").toLowerCase() !== "description" || !a.content) continue;
    const d = decode(a.content).trim();
    if (!d) continue;
    if (d.length <= TAGLINE_MAX) out.tagline = line(d, TAGLINE_MAX);
    else out.description = text(d, DESCRIPTION_MAX);
    break;
  }
  return out;
}

/**
 * How to play, from any of the shapes AIs tend to write:
 *   { keys: [{ key, action }], touch }   (the stored shape)
 *   [{ key, action }] or ["Space: Jump"]
 *   { "Space": "Jump", "← →": "Move", touch: "Tap to jump" }
 */
function controls(raw: unknown, touchRaw: unknown): GameMeta["controls"] {
  let rows: unknown[] = [];
  let touch: unknown = touchRaw;
  if (Array.isArray(raw)) rows = raw;
  else if (isObj(raw)) {
    if (raw.touch !== undefined) touch = raw.touch;
    if (Array.isArray(raw.keys)) rows = raw.keys;
    else if (isObj(raw.keys)) rows = Object.entries(raw.keys);
    else rows = Object.entries(raw).filter(([k]) => k !== "touch" && k !== "keys");
  }
  const keys = rows
    .map((r) => {
      if (Array.isArray(r)) return pair(r[0], r[1]);
      if (typeof r === "string") {
        const m = /^\s*(.+?)\s*(?:[:=]|->|→|—| - )\s*(.+)$/.exec(r);
        return m ? pair(m[1], m[2]) : null;
      }
      if (isObj(r)) return pair(r.key ?? r.input ?? r.button, r.action ?? r.does ?? r.description);
      return null;
    })
    .filter((k): k is { key: string; action: string } => !!k)
    .slice(0, MAX_CONTROL_ROWS);
  const t = line(touch, TOUCH_HINT_MAX) ?? null;
  return keys.length || t ? { keys, touch: t } : undefined;
}

function pair(key: unknown, action: unknown) {
  const k = line(key, CONTROL_KEY_MAX);
  const a = line(action, CONTROL_ACTION_MAX);
  return k && a ? { key: k, action: a } : null;
}

function orientation(v: unknown): GameMeta["orientation"] {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (s === "portrait" || s === "vertical") return "portrait";
  if (s === "landscape" || s === "horizontal") return "landscape";
  if (s === "any" || s === "both") return "any";
  return undefined;
}

function duration(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(3600, Math.max(1, Math.round(n)));
}

/** One line of plain text: whitespace collapsed, cut to max. */
function line(v: unknown, max: number): string | undefined {
  if (typeof v !== "string" && typeof v !== "number") return undefined;
  const s = String(v).replace(/\s+/g, " ").trim().slice(0, max).trim();
  return s || undefined;
}

/** Multi-line plain text: line breaks kept (the game page renders them), cut to max. */
function text(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max)
    .trim();
  return s || undefined;
}

function strList(v: unknown[]): string[] {
  return v.flatMap((x) => (typeof x === "string" && x.trim() ? [x.trim()] : []));
}

const unique = <T,>(xs: T[]) => [...new Set(xs)];

function isObj(v: unknown): v is Obj {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return out;
}

function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function safeChar(code: number) {
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
}
