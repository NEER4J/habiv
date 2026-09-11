/**
 * View model the Habiv components render. Built from the backend shapes in lib/db/types.ts
 * (FeedGame / GameDetail); nothing here is static any more.
 */
import type { FeedGame, GameDetail, GameVersionSummary, Orientation, RemixLicence } from "@/lib/db/types";

export type Game = {
  id: string;
  shortId: string;
  slug: string;
  /** canonical page /@handle/slug */
  url: string;
  /** permanent short link /g/shortId */
  shortUrl: string;
  title: string;
  /** tagline (one line) */
  desc: string;
  /** creator handle */
  creator: string;
  creatorId: string;
  creatorName: string;
  creatorAvatar: string | null;
  creatorVerified: boolean;
  followers: number;
  /** display category name, e.g. "Arcade" */
  type: string;
  /** category slug, e.g. "arcade" */
  category: string;
  hue: number;
  plays: number;
  runs: number;
  uniques: number;
  completions: number;
  remixes: number;
  likes: number;
  saves: number;
  comments: number;
  bestScore: number | null;
  /** "0:30", "12 lv" style label, or "—" */
  duration: string;
  durationSec: number | null;
  /** relative time such as "3 days ago" */
  age: string;
  publishedAt: string | null;
  size: string;
  sizeBytes: number | null;
  model: string;
  tool: string;
  engine: string;
  versions: number;
  versionId: string | null;
  prompt: string;
  coverUrl: string | null;
  cardUrl: string | null;
  orientation: Orientation;
  remixLicence: RemixLicence;
  usesNetwork: boolean;
  needsIsolation: boolean;
  leaderboardEnabled: boolean;
  featured: boolean;
};

export type GameControls = { keys: { key: string; action: string }[]; touch: string | null };

export type GameFull = Game & {
  description: string;
  controls: GameControls;
  remixedFrom: { id: string; shortId: string; slug: string; title: string; handle: string } | null;
  versionList: GameVersionSummary[];
};

export type CategoryInfo = { slug: string; name: string; icon: string | null; games: number };

export const categoryName = (slug: string) => (slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : "Other");

export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "unpublished";
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)} min ago`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)} hour${Math.floor(h) === 1 ? "" : "s"} ago`;
  const d = h / 24;
  if (d < 7) return `${Math.floor(d)} day${Math.floor(d) === 1 ? "" : "s"} ago`;
  if (d < 30) return `${Math.floor(d / 7)} week${Math.floor(d / 7) === 1 ? "" : "s"} ago`;
  if (d < 365) return `${Math.floor(d / 30)} month${Math.floor(d / 30) === 1 ? "" : "s"} ago`;
  return `${Math.floor(d / 365)} year${Math.floor(d / 365) === 1 ? "" : "s"} ago`;
}

export function formatBytes(n: number | null | undefined): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1048576).toFixed(n < 10 * 1048576 ? 1 : 0)} MB`;
}

export function durationLabel(sec: number | null | undefined): string {
  if (!sec) return "—";
  if (sec >= 3600) return "∞";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function fromFeedGame(f: FeedGame): Game {
  return {
    id: f.id,
    shortId: f.shortId,
    slug: f.slug,
    url: f.url,
    shortUrl: f.shortUrl,
    title: f.title,
    desc: f.tagline ?? "",
    creator: f.creator.handle,
    creatorId: f.creator.id,
    creatorName: f.creator.displayName,
    creatorAvatar: f.creator.avatarUrl,
    creatorVerified: f.creator.isVerified,
    followers: f.creator.followersCount,
    type: categoryName(f.category),
    category: f.category,
    hue: f.accentHue,
    plays: f.stats.plays,
    runs: f.stats.runs,
    uniques: f.stats.uniquePlayers,
    completions: f.stats.completions,
    remixes: f.stats.remixes,
    likes: f.stats.likes,
    saves: f.stats.saves,
    comments: f.stats.comments,
    bestScore: f.stats.bestScore,
    duration: durationLabel(f.durationSec),
    durationSec: f.durationSec,
    age: relativeTime(f.publishedAt),
    publishedAt: f.publishedAt,
    size: formatBytes(f.currentVersion?.sizeBytes),
    sizeBytes: f.currentVersion?.sizeBytes ?? null,
    model: f.currentVersion?.model ?? "",
    tool: f.currentVersion?.agent ?? "",
    engine: f.currentVersion?.engine ?? "html",
    versions: f.currentVersion?.version ?? 0,
    versionId: f.currentVersion?.id ?? null,
    prompt: "",
    coverUrl: f.coverUrl,
    cardUrl: f.cardUrl,
    orientation: f.orientation,
    remixLicence: f.remixLicence,
    usesNetwork: f.currentVersion?.usesNetwork ?? false,
    needsIsolation: f.currentVersion?.needsIsolation ?? false,
    leaderboardEnabled: f.leaderboardEnabled,
    featured: f.featured,
  };
}

const DEFAULT_TOUCH: Record<string, string> = {
  puzzle: "tap a tile, swipe to undo",
  ambient: "drag anywhere to steer",
  reaction: "tap on the cue",
};

function parseControls(raw: Record<string, unknown>, category: string): GameControls {
  const keys = Array.isArray(raw.keys)
    ? (raw.keys as unknown[])
        .map((k) => (k && typeof k === "object" ? (k as { key?: unknown; action?: unknown }) : null))
        .filter((k): k is { key?: unknown; action?: unknown } => !!k)
        .map((k) => ({ key: String(k.key ?? "").slice(0, 16), action: String(k.action ?? "").slice(0, 60) }))
        .filter((k) => k.key && k.action)
        .slice(0, 6)
    : [];
  const touch = typeof raw.touch === "string" ? raw.touch.slice(0, 80) : DEFAULT_TOUCH[category] ?? "tap and hold, release to act";
  return { keys, touch };
}

export function fromGameDetail(d: GameDetail): GameFull {
  const base = fromFeedGame(d);
  const current = d.versions.find((v) => v.id === d.currentVersion?.id) ?? d.versions[0];
  return {
    ...base,
    prompt: current?.prompt ?? "",
    description: d.description ?? "",
    controls: parseControls(d.controls, d.category),
    remixedFrom: d.remixedFrom,
    versionList: d.versions,
  };
}

/** Placeholder art: an SVG gradient in the game's hue with its initials. Works as <img src> and as CSS url(). */
function placeholderArt(g: Pick<Game, "hue" | "title">, w: number, h: number): string {
  const initials = g.title.trim().slice(0, 2).toUpperCase().replace(/[<>&]/g, "");
  const a = `hsl(${g.hue} 55% 22%)`;
  const b = `hsl(${(g.hue + 40) % 360} 60% 48%)`;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${a}'/><stop offset='1' stop-color='${b}'/></linearGradient></defs>` +
    `<rect width='${w}' height='${h}' fill='url(#g)'/>` +
    `<text x='50%' y='54%' text-anchor='middle' font-family='system-ui,sans-serif' font-weight='700' font-size='${Math.round(Math.min(w, h) / 3)}' fill='rgba(255,255,255,0.85)'>${initials}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Landscape art (feed tiles, player cover). */
export function art(g: Pick<Game, "coverUrl" | "cardUrl" | "hue" | "title">, w: number) {
  void w;
  return g.coverUrl ?? g.cardUrl ?? placeholderArt(g, 1280, 720);
}

/** Portrait art (mobile tiles, rails). */
export function poster(g: Pick<Game, "coverUrl" | "cardUrl" | "hue" | "title">, w: number) {
  void w;
  return g.cardUrl ?? g.coverUrl ?? placeholderArt(g, 600, 800);
}

export function accentOf(g: Pick<Game, "hue">, l = 0.74, c = 0.16, a?: number) {
  return `oklch(${l} ${c} ${g.hue}${a != null ? ` / ${a}` : ""})`;
}

export function shortModel(m: string | null | undefined) {
  if (!m) return "HTML";
  return m.replace("Claude ", "").replace("Local ", "").toUpperCase();
}

export function fmt(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1).replace(".0", "")}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

/** Best score on the game, or a dash while nobody has scored. */
export function best(g: Pick<Game, "bestScore">) {
  return g.bestScore == null ? "—" : g.bestScore.toLocaleString();
}

export function isPortrait(g: Pick<Game, "orientation">) {
  return g.orientation === "portrait";
}

export function secs(g: Pick<Game, "durationSec">) {
  return g.durationSec ?? 999;
}

export function initialsOf(name: string) {
  return (name || "?").slice(0, 2).toUpperCase();
}

export function orientLabel(g: Pick<Game, "orientation">) {
  return g.orientation === "portrait" ? "Vertical" : g.orientation === "landscape" ? "Landscape" : "Any";
}

/** Chip filter: "All", a category name, "Under 50 KB", or a model name. */
export function matchesChip(g: Game, chip: string) {
  if (chip === "All") return true;
  if (chip === "Under 50 KB") return (g.sizeBytes ?? Infinity) < 50 * 1024;
  if (g.type.toLowerCase() === chip.toLowerCase() || g.category === chip.toLowerCase()) return true;
  return g.model.toLowerCase() === chip.toLowerCase();
}

export function sortGames(list: Game[], sort: string) {
  const c = list.slice();
  if (sort === "Newest") return c.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  if (sort === "Most played") return c.sort((a, b) => b.plays - a.plays);
  if (sort === "Quick play") return c.filter((x) => secs(x) <= 45).concat(c.filter((x) => secs(x) > 45));
  return c;
}

const DEFAULT_KEYS: Record<string, { key: string; action: string }[]> = {
  puzzle: [
    { key: "Click", action: "Select a tile" },
    { key: "Z", action: "Undo last move" },
    { key: "R", action: "Reset the board" },
  ],
  reaction: [
    { key: "Space", action: "Act on the cue" },
    { key: "Enter", action: "Next round" },
    { key: "Esc", action: "Forfeit" },
  ],
  ambient: [
    { key: "Move", action: "Steer with the pointer" },
    { key: "M", action: "Mute" },
    { key: "Esc", action: "Leave anytime" },
  ],
};

export function controlsFor(g: Game | GameFull) {
  const fromGame = "controls" in g ? g.controls.keys : [];
  if (fromGame.length) return fromGame;
  return DEFAULT_KEYS[g.category] ?? [
    { key: "Space", action: "Jump / act" },
    { key: "← →", action: "Move" },
    { key: "R", action: "Restart the run" },
  ];
}

export function touchHintFor(g: Game | GameFull) {
  if ("controls" in g && g.controls.touch) return g.controls.touch;
  return DEFAULT_TOUCH[g.category] ?? "tap and hold, release to act";
}

/** Default chips shown before the category list has loaded. */
export const chipsList: string[] = ["All", "Arcade", "Puzzle", "Reaction", "Ambient", "Under 50 KB"];

export function chipsFor(categories: CategoryInfo[]): string[] {
  return ["All", ...categories.filter((c) => c.games > 0).map((c) => c.name), "Under 50 KB"];
}
