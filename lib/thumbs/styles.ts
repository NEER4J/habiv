/**
 * Fallback thumbnails for games whose creator hasn't uploaded art (uploaded art is always kept).
 * Every style is typography only: a pure function from game metadata + a colour theme to a
 * self-contained HTML document at the exact output size. The smoke job already runs headless
 * Chromium, so the chosen style can be rendered there with page.setContent() and a screenshot,
 * identical to the /experiment preview.
 */

export type ThumbInput = {
  title: string;
  tagline?: string | null;
  category?: string | null;
  engine?: string | null;
  creator?: string | null;
  hue: number;
};

export type ThumbSize = { w: number; h: number };
export const COVER: ThumbSize = { w: 1280, h: 720 };
export const CARD: ThumbSize = { w: 600, h: 800 };

export type ThumbMode = "light" | "dark" | "vivid";
export const THUMB_MODES: ThumbMode[] = ["light", "dark", "vivid"];

/** `hue: null` follows the game's own accent hue. `chroma` scales saturation (0 = greyscale). */
export type ThumbTheme = { id: string; name: string; hue: number | null; hue2?: number; chroma?: number };
export const THUMB_THEMES: ThumbTheme[] = [
  { id: "auto", name: "Game colour", hue: null },
  { id: "candy", name: "Candy", hue: 350, hue2: 230 },
  { id: "sunset", name: "Sunset", hue: 45, hue2: 345 },
  { id: "ocean", name: "Ocean", hue: 245, hue2: 190 },
  { id: "mint", name: "Mint", hue: 165, hue2: 105 },
  { id: "grape", name: "Grape", hue: 300, hue2: 20 },
  { id: "lemon", name: "Lemon", hue: 100, hue2: 150 },
  { id: "mono", name: "Mono", hue: 260, hue2: 260, chroma: 0 },
];

export type ThumbGroup = "baseline" | "modern" | "retro";
export type ThumbStyleId =
  | "current"
  | "mesh" | "appicon" | "sticker" | "bubble" | "brutal" | "esports" | "giant" | "stack" | "comic" | "loading" | "achievement"
  | "terminal" | "crt" | "titlescreen" | "gameboy" | "vhs" | "synthwave" | "dialogue" | "neon" | "scroll";

export const THUMB_STYLES: { id: ThumbStyleId; group: ThumbGroup; name: string; blurb: string }[] = [
  { id: "current", group: "baseline", name: "Today (baseline)", blurb: "Today's placeholder: a hue gradient with the title's first two letters. Ignores themes." },
  { id: "mesh", group: "modern", name: "Soft gradient", blurb: "Mesh-gradient backdrop, big clean title, a category pill and a round play button." },
  { id: "appicon", group: "modern", name: "App icon", blurb: "Store-listing look: a glossy squircle icon with the initial, title, subtitle and GET button." },
  { id: "sticker", group: "modern", name: "Sticker pack", blurb: "Chunky outlined title surrounded by tilted sticker labels." },
  { id: "bubble", group: "modern", name: "Casual pop", blurb: "Mobile-game logo: bubbly double-outlined title on a sunburst with glyph confetti." },
  { id: "brutal", group: "modern", name: "Neo-brutalist", blurb: "Thick outlines, hard offset shadows, info cells and a PLAY block." },
  { id: "esports", group: "modern", name: "Esports", blurb: "Angular italic type, diagonal slab and tag chips, like a competitive-game key art." },
  { id: "giant", group: "modern", name: "Giant type", blurb: "The title as big as it will go, bleeding off the edges." },
  { id: "stack", group: "modern", name: "Echo stack", blurb: "The title repeated in outline across the frame, with a solid band carrying the full name." },
  { id: "comic", group: "modern", name: "Comic bubble", blurb: "Speech bubble title on a halftone field with a burst label." },
  { id: "loading", group: "modern", name: "Now loading", blurb: "Loading screen: big title, a segmented progress bar and a TIP line." },
  { id: "achievement", group: "modern", name: "Achievement unlocked", blurb: "Console achievement toast with a glowing badge, the title and +XP." },
  { id: "terminal", group: "retro", name: "Terminal", blurb: "Command-line boot log with the title typed out in glowing phosphor and a cursor." },
  { id: "crt", group: "retro", name: "Arcade CRT", blurb: "Arcade cabinet screen: neon border, scanlines, 1UP / HI-SCORE HUD and INSERT COIN." },
  { id: "titlescreen", group: "retro", name: "8-bit title screen", blurb: "NES-style title screen: stepped-shadow pixel title, player menu and PUSH START." },
  { id: "gameboy", group: "retro", name: "Game Boy", blurb: "Four-shade handheld palette in the theme hue on a dot-matrix screen." },
  { id: "vhs", group: "retro", name: "VHS tape", blurb: "Tape playback OSD: PLAY ▶, timecode, tracking lines and a glitched RGB title." },
  { id: "synthwave", group: "retro", name: "Synthwave chrome", blurb: "80s chrome logo type over a neon horizon, with a hot script tag." },
  { id: "dialogue", group: "retro", name: "RPG dialogue", blurb: "JRPG text box with a name tab and ▼ prompt under a pixel title." },
  { id: "neon", group: "retro", name: "Neon sign", blurb: "Glowing neon-tube lettering with a PLAY NOW sub-sign in a lit frame." },
  { id: "scroll", group: "retro", name: "Old scroll", blurb: "Rolled parchment with a decorative serif title, a quest kicker and a wax seal." },
];

// ——— colour ———

const ok = (l: number, c: number, h: number, a?: number) => `oklch(${l} ${c} ${((h % 360) + 360) % 360}${a != null ? ` / ${a}` : ""})`;
/** `col` at `pct`% opacity. */
const mix = (col: string, pct: number) => `color-mix(in oklch, ${col} ${pct}%, transparent)`;

type Palette = {
  dark: boolean;
  bg: string; bg2: string; surface: string; ink: string; muted: string;
  accent: string; accent2: string; deep: string; onAccent: string; onAccent2: string;
};

function palette(h: number, h2: number, mode: ThumbMode, k: number): Palette {
  const o = (l: number, c: number, hh: number) => ok(l, c * k, hh);
  if (mode === "light") {
    return {
      dark: false, bg: o(0.97, 0.025, h), bg2: o(0.91, 0.06, h), surface: "#ffffff", ink: o(0.22, 0.06, h), muted: o(0.5, 0.05, h),
      accent: o(0.62, 0.21, h), accent2: o(0.72, 0.17, h2), deep: o(0.42, 0.15, h), onAccent: "#ffffff", onAccent2: o(0.2, 0.06, h2),
    };
  }
  if (mode === "vivid") {
    return {
      dark: false, bg: o(0.78, 0.17, h), bg2: o(0.66, 0.2, h), surface: o(0.98, 0.015, h), ink: o(0.2, 0.07, h), muted: o(0.36, 0.09, h),
      accent: o(0.98, 0.02, h), accent2: o(0.42, 0.18, h2), deep: o(0.5, 0.19, h), onAccent: o(0.2, 0.07, h), onAccent2: "#ffffff",
    };
  }
  return {
    dark: true, bg: o(0.18, 0.04, h), bg2: o(0.11, 0.025, h), surface: o(0.25, 0.05, h), ink: o(0.97, 0.015, h), muted: o(0.72, 0.04, h),
    accent: o(0.8, 0.17, h), accent2: o(0.82, 0.15, h2), deep: o(0.42, 0.15, h), onAccent: o(0.18, 0.05, h), onAccent2: o(0.18, 0.05, h2),
  };
}

/**
 * `unit` is 1% of the shorter side in px and `u(n)` formats n units as a CSS length. `hA`/`hB` are
 * the theme hues and `o()` an oklch() that honours the theme's chroma.
 */
type Ctx = ThumbInput & ThumbSize & {
  tall: boolean; seed: number; unit: number; u: (n: number) => string;
  p: Palette; hA: number; hB: number; o: (l: number, c: number, h: number, a?: number) => string;
};

// ——— text helpers ———

function esc(s: string) {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Fit = { lines: string[]; fs: number };

/** Splits words into n lines as evenly as the word lengths allow. */
function partition(words: string[], n: number): string[] {
  const target = words.join(" ").length / n;
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && out.length < n - 1 && Math.abs(next.length - target) > Math.abs(cur.length - target)) {
      out.push(cur);
      cur = w;
    } else cur = next;
  }
  out.push(cur);
  return out;
}

/**
 * Picks the line count and font size (px) that make `text` as large as possible inside a box.
 * `cw` is the font's average glyph advance in em, `lh` its line height.
 */
function fitBox(text: string, boxW: number, boxH: number, cw: number, lh: number, maxLines = 4): Fit {
  const words = text.trim().split(/\s+/).filter(Boolean);
  let best: Fit = { lines: [text], fs: 0 };
  for (let n = 1; n <= Math.min(maxLines, words.length); n++) {
    const lines = partition(words, n);
    const longest = Math.max(...lines.map((l) => l.length));
    const fs = Math.min(boxH / (n * lh), boxW / (longest * cw));
    if (fs > best.fs) best = { lines, fs: Math.floor(fs * 10) / 10 };
  }
  return best;
}

const lines = (f: Fit) => f.lines.map(esc).join("<br>");
const tag = (c: Ctx) => esc((c.category || "game").toUpperCase());
const handle = (c: Ctx) => (c.creator ? `@${esc(c.creator)}` : "");
const firstLetter = (c: Ctx) => esc((c.title.match(/[A-Za-z0-9]/)?.[0] ?? "?").toUpperCase());

const GRAIN = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>",
)}")`;

const FONTS = {
  jakarta: "Plus+Jakarta+Sans:wght@600;800",
  mono: "IBM+Plex+Mono:wght@500",
  pixel: "Press+Start+2P",
  vt: "VT323",
  silk: "Silkscreen:wght@400;700",
  pixelify: "Pixelify+Sans:wght@500;700",
  cinzel: "Cinzel+Decorative:wght@900",
  fell: "IM+Fell+English:ital@0;1",
  orbitron: "Orbitron:wght@900",
  dafoe: "Mr+Dafoe",
  bungee: "Bungee",
  rajdhani: "Rajdhani:wght@700",
  tilt: "Tilt+Neon",
  monoton: "Monoton",
  lilita: "Lilita+One",
  bagel: "Bagel+Fat+One",
  chakra: "Chakra+Petch:ital,wght@1,700",
  archivo: "Archivo+Black",
  anton: "Anton",
  bangers: "Bangers",
};

function doc(c: Ctx, fonts: string[], css: string, body: string) {
  const link = fonts.length
    ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fonts.map((f) => `family=${f}`).join("&")}&display=block">`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8">${link}<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${c.w}px;height:${c.h}px;overflow:hidden;background:${c.p.bg}}
body{position:relative;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
.grain{position:absolute;inset:0;background:${GRAIN};opacity:.13;mix-blend-mode:overlay;pointer-events:none}
.scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.3) 0 2px,transparent 2px 4px);pointer-events:none;opacity:${c.p.dark ? 1 : 0.25}}
.vig{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,.75) 100%);pointer-events:none;opacity:${c.p.dark ? 1 : 0.3}}
${css}</style></head><body>${body}</body></html>`;
}

// ——— styles ———

const styles: Record<ThumbStyleId, (c: Ctx) => string> = {
  current(c) {
    return doc(
      c,
      [],
      `body{background:linear-gradient(135deg,hsl(${c.hue} 55% 22%),hsl(${(c.hue + 40) % 360} 60% 48%))}
.i{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:700 ${Math.round(Math.min(c.w, c.h) / 3)}px system-ui,sans-serif;color:rgba(255,255,255,.85)}`,
      `<div class="i">${esc(c.title.trim().slice(0, 2).toUpperCase())}</div>`,
    );
  },

  // ——— modern ———

  mesh(c) {
    const { u, unit, p, w: W, h: H, tall } = c;
    const pad = unit * 6;
    const r = rng(c.seed);
    const f = fitBox(c.title, tall ? W - pad * 2 : W * 0.68, H * (tall ? 0.34 : 0.42), 0.56, 0.95, 4);
    const strength = p.dark ? 60 : 85;
    const blob = (col: string, x: number, y: number, s: number) => `radial-gradient(${s}% ${s}% at ${x.toFixed(0)}% ${y.toFixed(0)}%,${mix(col, strength)},transparent 70%)`;
    return doc(
      c,
      [FONTS.jakarta],
      `body{background:${blob(p.accent, 10 + r() * 25, 15 + r() * 30, 75)},${blob(p.accent2, 70 + r() * 25, 5 + r() * 40, 70)},${blob(p.deep, 45 + r() * 40, 80 + r() * 20, 75)},${p.bg}}
.grain{opacity:.1}
.pill{position:absolute;left:${pad}px;top:${pad}px;display:flex;align-items:center;gap:${u(1.2)};padding:${u(1.3)} ${u(2.2)};border-radius:${u(5)};background:${mix(p.surface, 60)};backdrop-filter:blur(${u(2)});border:1px solid ${mix(p.ink, 15)};font:800 ${u(2.1)}/1 'Plus Jakarta Sans',sans-serif;letter-spacing:.1em;color:${p.ink}}
.pill i{width:${u(1.2)};height:${u(1.2)};border-radius:50%;background:${p.accent2}}
h1{position:absolute;left:${pad}px;bottom:${pad}px;font:800 ${f.fs}px/.95 'Plus Jakarta Sans',sans-serif;letter-spacing:-.045em;color:${p.ink};white-space:nowrap}
.play{position:absolute;right:${pad}px;${tall ? `top:${pad}px` : `bottom:${pad}px`};width:${u(12)};height:${u(12)};border-radius:50%;background:${p.ink};display:flex;align-items:center;justify-content:center}
.play i{width:0;height:0;margin-left:${u(0.8)};border-left:${u(3.4)} solid ${p.bg};border-top:${u(2.1)} solid transparent;border-bottom:${u(2.1)} solid transparent}`,
      `<div class="grain"></div><div class="pill"><i></i>${tag(c)}</div><h1>${lines(f)}</h1><div class="play"><i></i></div>`,
    );
  },

  appicon(c) {
    const { u, unit, p, w: W, h: H, tall } = c;
    const pad = unit * 8;
    const icon = tall ? W * 0.46 : H * 0.54;
    const textLeft = pad + icon + unit * 5;
    const f = tall
      ? fitBox(c.title, W - unit * 12, H * 0.2, 0.56, 1, 3)
      : fitBox(c.title, W - textLeft - pad, H * 0.36, 0.56, 1, 3);
    return doc(
      c,
      [FONTS.jakarta],
      `body{background:radial-gradient(60% 70% at ${tall ? "50% 28%" : "25% 50%"},${mix(p.accent, p.dark ? 30 : 24)},transparent 70%),${p.bg}}
.ic{position:absolute;${tall ? `left:50%;top:${H * 0.1}px;transform:translateX(-50%)` : `left:${pad}px;top:50%;transform:translateY(-50%)`};width:${icon}px;height:${icon}px;border-radius:23%;background:linear-gradient(145deg,${p.accent},${p.accent2});box-shadow:0 ${u(3)} ${u(8)} ${mix(p.deep, 45)},inset 0 ${u(0.6)} 0 rgba(255,255,255,.35);display:flex;align-items:center;justify-content:center;font:800 ${icon * 0.56}px/1 'Plus Jakarta Sans',sans-serif;color:${p.onAccent}}
.tx{position:absolute;${tall ? `left:${unit * 6}px;right:${unit * 6}px;top:${H * 0.1 + icon + unit * 6}px;text-align:center` : `left:${textLeft}px;right:${pad}px;top:50%;transform:translateY(-50%)`}}
h1{font:800 ${f.fs}px/1 'Plus Jakarta Sans',sans-serif;letter-spacing:-.04em;color:${p.ink};white-space:nowrap}
.sub{margin-top:${u(1.8)};font:600 ${u(2.7)}/1.3 'Plus Jakarta Sans',sans-serif;color:${p.muted}}
.row{display:flex;gap:${u(1.4)};margin-top:${u(3)};${tall ? "justify-content:center" : ""}}
.get{padding:${u(1.4)} ${u(3.4)};border-radius:${u(5)};background:${p.ink};color:${p.bg};font:800 ${u(2.4)}/1 'Plus Jakarta Sans',sans-serif;letter-spacing:.06em}
.chip{padding:${u(1.4)} ${u(2.4)};border-radius:${u(5)};background:${mix(p.ink, 9)};color:${p.ink};font:600 ${u(2.2)}/1 'Plus Jakarta Sans',sans-serif}`,
      `<div class="ic">${firstLetter(c)}</div><div class="tx"><h1>${lines(f)}</h1><div class="sub">${esc(c.category || "Game")} · Free to play</div><div class="row"><span class="get">GET</span><span class="chip">${esc(c.engine || "HTML5")}</span></div></div>`,
    );
  },

  sticker(c) {
    const { u, p, w: W, h: H, tall } = c;
    const f = fitBox(c.title, W * 0.76, H * (tall ? 0.36 : 0.4), 0.55, 0.95, 4);
    const r = rng(c.seed + 3);
    const labels: [string, string, string][] = [
      [tag(c), p.accent, p.onAccent],
      [esc((c.engine || "html5").toUpperCase()), p.accent2, p.onAccent2],
      ["FREE", p.surface, p.ink],
      ["▶ PLAY", p.ink, p.bg],
    ];
    const spots = tall ? [[7, 7], [52, 13], [9, 82], [50, 79]] : [[5, 11], [70, 9], [9, 76], [69, 73]];
    const stickers = labels
      .map(([t, bg, fg], i) => `<div class="s" style="left:${spots[i][0]}%;top:${spots[i][1]}%;background:${bg};color:${fg};transform:rotate(${(r() * 18 - 9).toFixed(1)}deg)">${t}</div>`)
      .join("");
    return doc(
      c,
      [FONTS.lilita],
      `body{background:radial-gradient(${mix(p.ink, 12)} ${u(0.25)},transparent ${u(0.3)}) 0 0/${u(3)} ${u(3)},${p.bg}}
.s{position:absolute;padding:${u(1.5)} ${u(2.6)};border-radius:${u(2.4)};font:400 ${u(3.4)}/1 'Lilita One',sans-serif;letter-spacing:.04em;border:${u(0.7)} solid #fff;box-shadow:0 ${u(1)} ${u(2.4)} rgba(0,0,0,.22)}
h1{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-4deg);text-align:center;font:400 ${f.fs}px/.95 'Lilita One',sans-serif;color:#fff;white-space:nowrap;-webkit-text-stroke:${(f.fs * 0.07).toFixed(1)}px #16131c;paint-order:stroke fill;text-shadow:${u(1.2)} ${u(1.2)} 0 ${p.accent}}`,
      `${stickers}<h1>${lines(f)}</h1>`,
    );
  },

  bubble(c) {
    const { u, p, o, hB, w: W, h: H, tall } = c;
    const f = fitBox(c.title, W * 0.82, H * (tall ? 0.4 : 0.46), 0.68, 1, 4);
    const sw = f.fs * 0.09;
    const s1 = p.dark ? p.deep : p.accent;
    const s2 = `color-mix(in oklch, ${s1} 76%, ${p.dark ? p.bg2 : p.deep})`;
    const r = rng(c.seed + 11);
    const glyphs = ["★", "✦", "●", "▲", "♥", "✚"];
    const cols = ["#fff", p.accent2, p.dark ? p.accent : p.ink];
    const confetti = Array.from({ length: 16 }, () =>
      `<i style="left:${(r() * 100).toFixed(1)}%;top:${(r() * 100).toFixed(1)}%;font-size:${u(3 + r() * 5)};color:${cols[Math.floor(r() * 3)]};transform:translate(-50%,-50%) rotate(${Math.round(r() * 60 - 30)}deg)">${glyphs[Math.floor(r() * glyphs.length)]}</i>`,
    ).join("");
    const title = lines(f);
    return doc(
      c,
      [FONTS.bagel],
      `body{background:radial-gradient(circle at 50% 50%,rgba(255,255,255,.28),transparent 45%),repeating-conic-gradient(from ${c.seed % 30}deg at 50% 50%,${s1} 0 10deg,${s2} 10deg 20deg)}
.cf i{position:absolute;font-style:normal;line-height:1;text-shadow:0 ${u(0.4)} 0 rgba(0,0,0,.25)}
.lg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-3deg);text-align:center;font:400 ${f.fs}px/1 'Bagel Fat One',sans-serif;white-space:nowrap}
.a{color:#1b1330;-webkit-text-stroke:${(sw * 2.2).toFixed(1)}px #1b1330;paint-order:stroke fill;text-shadow:0 ${(sw * 1.6).toFixed(1)}px 0 #1b1330}
.b{position:absolute;inset:0;background:linear-gradient(180deg,#fff 0%,${o(0.93, 0.13, hB)} 42%,${o(0.8, 0.18, hB)} 100%);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-stroke:${(sw * 0.7).toFixed(1)}px #fff}`,
      `<div class="cf">${confetti}</div><div class="lg"><div class="a">${title}</div><div class="b">${title}</div></div>`,
    );
  },

  brutal(c) {
    const { u, unit, p, w: W, h: H } = c;
    const pad = unit * 4;
    const b = unit * 0.7;
    const cellH = unit * 12;
    const mainTop = pad + cellH + unit * 2.6;
    const mainW = W - pad * 2;
    const mainH = H - mainTop - pad - unit * 1.4;
    const f = fitBox(c.title.toUpperCase(), mainW - unit * 6, mainH - unit * 14, 0.8, 0.95, 4);
    const cells: [string, string, string, string][] = [
      ["Genre", tag(c), p.accent2, p.onAccent2],
      ["Engine", esc((c.engine || "html5").toUpperCase()), p.surface, p.ink],
      ["By", handle(c) || "—", p.surface, p.ink],
    ];
    return doc(
      c,
      [FONTS.archivo, FONTS.mono],
      `body{background:${p.bg}}
.cells{position:absolute;left:${pad}px;right:${pad}px;top:${pad}px;height:${cellH}px;display:grid;grid-template-columns:repeat(3,1fr);gap:${u(1.6)}}
.cells div{border:${b}px solid ${p.ink};box-shadow:${u(0.9)} ${u(0.9)} 0 ${p.ink};padding:${u(1.4)} ${u(1.8)};min-width:0;display:flex;flex-direction:column;justify-content:space-between}
.cells small{font:500 ${u(1.7)}/1 'IBM Plex Mono',monospace;letter-spacing:.14em;text-transform:uppercase;opacity:.7}
.cells b{font:400 ${u(2.6)}/1 'Archivo Black',sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.main{position:absolute;left:${pad}px;top:${mainTop}px;width:${mainW}px;height:${mainH}px;background:${p.surface};border:${b}px solid ${p.ink};box-shadow:${u(1.4)} ${u(1.4)} 0 ${p.ink}}
h1{position:absolute;left:${u(3)};top:${u(3)};font:400 ${f.fs}px/.95 'Archivo Black',sans-serif;color:${p.ink};white-space:nowrap;letter-spacing:-.01em}
.go{position:absolute;right:-${b}px;bottom:-${b}px;background:${p.accent};color:${p.onAccent};border:${b}px solid ${p.ink};padding:${u(1.8)} ${u(3.2)};font:400 ${u(3.2)}/1 'Archivo Black',sans-serif}`,
      `<div class="cells">${cells.map(([k, v, bg, fg]) => `<div style="background:${bg};color:${fg}"><small>${k}</small><b>${v}</b></div>`).join("")}</div>
<div class="main"><h1>${lines(f)}</h1><div class="go">PLAY →</div></div>`,
    );
  },

  esports(c) {
    const { u, unit, p, w: W, h: H, tall } = c;
    const pad = unit * 5;
    const titleTop = H * (tall ? 0.14 : 0.17);
    const slabTop = tall ? 0.56 : 0.54;
    const f = fitBox(c.title.toUpperCase(), W - pad * 2, H * (slabTop - (tall ? 0.16 : 0.19)), 0.76, 0.95, 4);
    return doc(
      c,
      [FONTS.chakra],
      `body{background:repeating-linear-gradient(-55deg,${mix(p.ink, 5)} 0 ${u(0.6)},transparent ${u(0.6)} ${u(2.4)}),linear-gradient(135deg,${p.bg},${p.bg2});font-family:'Chakra Petch',sans-serif;font-style:italic;font-weight:700}
.big{position:absolute;right:${-unit * 2}px;top:${-H * 0.12}px;font-size:${H * 0.95}px;line-height:1;color:transparent;-webkit-text-stroke:${u(0.25)} ${mix(p.ink, 14)}}
.tags{position:absolute;left:${pad}px;top:${pad}px;display:flex;gap:${u(1.2)}}
.tags span{font-size:${u(2.2)};line-height:1;letter-spacing:.12em;padding:${u(1.1)} ${u(2.4)} ${u(1.1)} ${u(1.8)};clip-path:polygon(0 0,100% 0,88% 100%,0 100%)}
h1{position:absolute;left:${pad}px;top:${titleTop}px;font-size:${f.fs}px;line-height:.95;color:${p.ink};white-space:nowrap;letter-spacing:-.01em}
.slab{position:absolute;left:0;right:0;top:${slabTop * 100}%;height:${tall ? 24 : 30}%;background:${p.accent};clip-path:polygon(0 24%,100% 0,100% 76%,0 100%);display:flex;align-items:center;justify-content:space-between;padding:0 ${pad}px;color:${p.onAccent};font-size:${u(tall ? 3.6 : 4)}}
.line{position:absolute;left:0;right:0;top:calc(${slabTop * 100}% + ${tall ? 24 : 30}% - ${u(1)});height:${u(1.2)};background:${p.accent2};transform:rotate(${tall ? -2.2 : -1.3}deg);transform-origin:0 0}`,
      `<div class="big">${String((c.seed % 9) + 1).padStart(2, "0")}</div>
<div class="tags"><span style="background:${p.accent2};color:${p.onAccent2}">${tag(c)}</span><span style="background:${p.ink};color:${p.bg}">${esc((c.engine || "html5").toUpperCase())}</span></div>
<h1>${lines(f)}</h1><div class="line"></div><div class="slab"><span>${handle(c)}</span><span>▶ PLAY NOW</span></div>`,
    );
  },

  giant(c) {
    const { u, p, w: W, h: H, tall } = c;
    const f = fitBox(c.title.toUpperCase(), W * 1.02, H * (tall ? 0.8 : 0.78), 0.56, 0.84, tall ? 5 : 3);
    return doc(
      c,
      [FONTS.anton, FONTS.mono],
      `body{background:${p.bg}}
.k{position:absolute;top:${u(4.5)};left:${u(4.5)};right:${u(4.5)};display:flex;justify-content:space-between;font:500 ${u(2.2)}/1 'IBM Plex Mono',monospace;letter-spacing:.16em;color:${p.muted}}
h1{position:absolute;left:${-W * 0.008}px;bottom:${-f.fs * 0.07}px;font:400 ${f.fs}px/.84 Anton,sans-serif;color:${p.dark ? p.accent : p.ink};white-space:nowrap}`,
      `<div class="k"><span>${tag(c)}</span><span>${c.creator ? `@${esc(c.creator.toUpperCase())}` : ""}</span></div><h1>${lines(f)}</h1>`,
    );
  },

  stack(c) {
    const { p, w: W, h: H, tall } = c;
    const rows = tall ? 9 : 6;
    const rh = H / rows;
    const T = esc(c.title.toUpperCase());
    const rep = Array.from({ length: 6 }, () => T).join(" &nbsp;/&nbsp; ");
    const bandRows = tall ? 3 : 2;
    const f = fitBox(c.title.toUpperCase(), W * 0.88, rh * bandRows * 0.78, 0.8, 0.9, 3);
    const r = rng(c.seed);
    const echo = Array.from({ length: rows }, (_, i) => `<div class="r" style="top:${i * rh}px;transform:translateX(${-Math.round(r() * W * 0.5)}px)">${rep}</div>`).join("");
    return doc(
      c,
      [FONTS.archivo],
      `body{background:${p.bg}}
.r{position:absolute;left:0;height:${rh}px;font:400 ${rh * 0.78}px/${rh}px 'Archivo Black',sans-serif;white-space:nowrap;color:transparent;-webkit-text-stroke:${Math.max(1, rh * 0.012)}px ${mix(p.dark ? p.accent : p.deep, 55)}}
.band{position:absolute;left:0;right:0;top:${Math.floor((rows - bandRows) / 2) * rh}px;height:${rh * bandRows}px;background:${p.dark ? p.accent : p.ink};display:flex;align-items:center;justify-content:center;text-align:center}
.band h1{font:400 ${f.fs}px/.9 'Archivo Black',sans-serif;color:${p.dark ? p.onAccent : p.bg};white-space:nowrap;letter-spacing:-.01em}`,
      `${echo}<div class="band"><h1>${lines(f)}</h1></div>`,
    );
  },

  comic(c) {
    const { u, unit, p, w: W, h: H, tall } = c;
    const bw = unit * 0.8;
    const bubW = tall ? W * 0.86 : W * 0.62;
    const bubH = tall ? H * 0.46 : H * 0.62;
    const f = fitBox(c.title.toUpperCase(), bubW * 0.7, bubH * 0.5, 0.5, 0.95, 4);
    const pts = Array.from({ length: 28 }, (_, i) => {
      const a = (i / 28) * Math.PI * 2, r = i % 2 ? 36 : 50;
      return `${(50 + Math.cos(a) * r).toFixed(1)}% ${(50 + Math.sin(a) * r).toFixed(1)}%`;
    }).join(",");
    return doc(
      c,
      [FONTS.bangers],
      `body{background:radial-gradient(circle,rgba(0,0,0,.16) 24%,transparent 26%) 0 0/${u(2.2)} ${u(2.2)},${p.dark ? p.deep : p.accent2}}
.bub{position:absolute;left:50%;top:${tall ? 44 : 48}%;width:${bubW}px;height:${bubH}px;transform:translate(-50%,-50%) rotate(-2deg);background:#fff;border:${bw}px solid #111;border-radius:50%;box-shadow:${u(1.4)} ${u(1.4)} 0 #111;display:flex;align-items:center;justify-content:center;text-align:center}
.tail{position:absolute;left:24%;bottom:-${u(4.6)};width:${u(9)};height:${u(9)};background:#fff;border-right:${bw}px solid #111;border-bottom:${bw}px solid #111;transform:rotate(35deg) skewX(20deg);z-index:-1}
h1{font:400 ${f.fs}px/.95 Bangers,sans-serif;color:#111;letter-spacing:.03em;white-space:nowrap}
.star{position:absolute;${tall ? `right:${u(3)};top:${u(3)}` : `left:${u(4)};top:${u(4)}`};width:${u(20)};height:${u(20)};clip-path:polygon(${pts});background:${p.dark ? p.accent : p.accent};display:flex;align-items:center;justify-content:center;transform:rotate(-12deg)}
.star span{font:400 ${u(3.4)}/1 Bangers,sans-serif;color:#fff;letter-spacing:.04em;-webkit-text-stroke:${u(0.25)} #111;paint-order:stroke fill}
.by{position:absolute;right:${u(4)};bottom:${u(4)};background:#fff;border:${u(0.5)} solid #111;padding:${u(1)} ${u(2)};font:400 ${u(3)}/1 Bangers,sans-serif;letter-spacing:.04em;color:#111;transform:rotate(3deg);box-shadow:${u(0.8)} ${u(0.8)} 0 #111}`,
      `<div class="bub"><div class="tail"></div><h1>${lines(f)}</h1></div><div class="star"><span>${tag(c)}!</span></div>${c.creator ? `<div class="by">BY @${esc(c.creator.toUpperCase())}</div>` : ""}`,
    );
  },

  loading(c) {
    const { u, unit, p, w: W, h: H, tall } = c;
    const pad = unit * 6;
    const f = fitBox(c.title.toUpperCase(), W - pad * 2, H * (tall ? 0.34 : 0.36), 0.74, 1, 4);
    const pct = 35 + (c.seed % 60);
    const cells = 20;
    const on = Math.round((pct / 100) * cells);
    const tip = c.tagline ? esc(c.tagline) : `Built with ${esc(c.engine || "HTML")}${c.creator ? ` by @${esc(c.creator)}` : ""}.`;
    return doc(
      c,
      [FONTS.bungee, FONTS.silk],
      `body{background:linear-gradient(160deg,${p.bg},${p.bg2})}
.k{position:absolute;left:${pad}px;top:${pad}px;font:700 ${u(2.2)}/1 Silkscreen,monospace;letter-spacing:.14em;color:${p.dark ? p.accent : p.deep}}
h1{position:absolute;left:${pad}px;top:${H * (tall ? 0.22 : 0.2)}px;font:400 ${f.fs}px/1 Bungee,sans-serif;white-space:nowrap;color:${p.ink}}
.ld{position:absolute;left:${pad}px;right:${pad}px;bottom:${pad + unit * 9}px}
.ld .t{display:flex;justify-content:space-between;font:700 ${u(2.8)}/1 Silkscreen,monospace;color:${p.ink};margin-bottom:${u(1.6)}}
.bar{display:flex;gap:${u(0.5)}}
.bar i{flex:1;height:${u(2.6)};background:${mix(p.ink, 12)};transform:skewX(-20deg)}
.bar i.on{background:${p.dark ? p.accent : p.deep};box-shadow:0 0 ${u(1.2)} ${mix(p.accent, 60)}}
.tip{position:absolute;left:${pad}px;right:${pad}px;bottom:${pad}px;font:400 ${u(2.4)}/1.35 Silkscreen,monospace;color:${p.muted}}
.tip b{color:${p.dark ? p.accent2 : p.deep};font-weight:700}`,
      `<div class="k">${tag(c)}</div><h1>${lines(f)}</h1>
<div class="ld"><div class="t"><span>NOW LOADING...</span><span>${pct}%</span></div><div class="bar">${Array.from({ length: cells }, (_, i) => `<i${i < on ? ' class="on"' : ""}></i>`).join("")}</div></div>
<div class="tip"><b>TIP:</b> ${tip}</div>`,
    );
  },

  achievement(c) {
    const { u, unit, p, o, hA, w: W, h: H, tall } = c;
    const pillW = tall ? W * 0.86 : W * 0.8;
    const icon = unit * (tall ? 16 : 14);
    const textW = tall ? pillW - unit * 8 : pillW - icon - unit * 26;
    const f = fitBox(c.title, textW, H * (tall ? 0.24 : 0.2), 0.5, 1, 3);
    const xp = ((c.seed % 9) + 1) * 10;
    const onToast = p.dark ? "#fff" : p.ink;
    const shape = tall
      ? `flex-direction:column;text-align:center;border-radius:${u(6)};padding:${u(6)} ${u(4)}`
      : `border-radius:${u(50)};padding:${u(2.4)} ${u(6)} ${u(2.4)} ${u(2.4)}`;
    return doc(
      c,
      [FONTS.rajdhani],
      `body{background:radial-gradient(70% 70% at 50% 50%,${p.dark ? p.surface : p.bg},${p.bg2})}
.t{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:${pillW}px;display:flex;align-items:center;gap:${u(3.5)};${shape};background:${p.dark ? "linear-gradient(180deg,rgba(40,42,50,.96),rgba(18,19,24,.96))" : "#fff"};border:${u(0.3)} solid ${mix(p.ink, 14)};box-shadow:0 ${u(2)} ${u(8)} rgba(0,0,0,${p.dark ? 0.5 : 0.16}),0 0 0 ${u(1.2)} ${mix(p.dark ? p.accent : p.deep, 22)}}
.ic{flex:none;width:${icon}px;height:${icon}px;border-radius:50%;background:radial-gradient(circle at 35% 30%,${o(0.9, 0.14, hA)},${o(0.62, 0.2, hA)} 70%);display:flex;align-items:center;justify-content:center;font:700 ${icon * 0.5}px/1 Rajdhani,sans-serif;color:#fff;box-shadow:inset 0 -${u(0.6)} 0 rgba(0,0,0,.25),0 0 ${u(3)} ${mix(p.accent, 55)}}
.x{min-width:0;flex:1}
.k{font:700 ${u(2.4)}/1 Rajdhani,sans-serif;letter-spacing:.2em;color:${p.dark ? p.accent : p.deep};margin-bottom:${u(1)}}
h1{font:700 ${f.fs}px/1 Rajdhani,sans-serif;white-space:nowrap;color:${onToast}}
.g{flex:none;font:700 ${u(3.4)}/1 Rajdhani,sans-serif;color:${onToast};opacity:.85}
.g small{font-size:.6em;margin-left:.2em;color:${p.dark ? p.accent : p.deep}}`,
      `<div class="t"><div class="ic">★</div><div class="x"><div class="k">ACHIEVEMENT UNLOCKED</div><h1>${lines(f)}</h1></div><div class="g">+${xp}<small>XP</small></div></div>`,
    );
  },

  // ——— retro ———

  terminal(c) {
    const { u, unit, p, w: W, h: H, tall } = c;
    const pad = unit * 5;
    const glow = mix(p.accent, 60);
    const slug = c.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "game";
    const f = fitBox(c.title, W - pad * 2 - unit * 3, H * (tall ? 0.36 : 0.34), 0.6, 1.05, 4);
    const meta = [["engine", c.engine || "html"], ["genre", (c.category || "game").toLowerCase()], ["by", c.creator ? `@${c.creator}` : "anon"]];
    return doc(
      c,
      [FONTS.mono],
      `body{background:radial-gradient(120% 100% at 50% 40%,${p.bg},${p.bg2})}
.bar{position:absolute;left:0;right:0;top:0;height:${u(5)};display:flex;align-items:center;gap:${u(1)};padding:0 ${pad}px;background:${p.surface};border-bottom:1px solid ${mix(p.ink, 10)}}
.bar i{width:${u(1.3)};height:${u(1.3)};border-radius:50%;background:${mix(p.ink, 30)}}
.log{position:absolute;left:${pad}px;right:${pad}px;top:${unit * 10}px;font:500 ${u(2.5)}/1.6 'IBM Plex Mono',monospace;color:${p.muted};white-space:pre;overflow:hidden}
.log b{font-weight:500;color:${p.ink}}
.log .ok{color:${p.dark ? p.accent : p.deep}}
h1{position:absolute;left:${pad}px;bottom:${pad * 1.1}px;font:500 ${f.fs}px/1.05 'IBM Plex Mono',monospace;color:${p.dark ? p.accent : p.deep};letter-spacing:-.03em;white-space:nowrap;text-shadow:0 0 ${u(1.6)} ${glow}}
h1 .cur{display:inline-block;width:.55em;height:.9em;margin-left:.08em;vertical-align:-.1em;background:${p.dark ? p.accent : p.deep};box-shadow:0 0 ${u(1.6)} ${glow}}`,
      `<div class="bar"><i></i><i></i><i></i></div><div class="log"><b>$ habiv run ${esc(slug)}</b>\n${meta.map(([k, v]) => `  ${k.padEnd(7)}${esc(v)}`).join("\n")}\n<span class="ok">✓ ready</span></div><h1>${lines(f)}<span class="cur"></span></h1><div class="scan"></div><div class="vig"></div>`,
    );
  },

  crt(c) {
    const { u, unit, p, o, hB, w: W, h: H, tall } = c;
    const inset = unit * 4;
    const f = fitBox(c.title.toUpperCase(), (W - inset * 2) * 0.84, (H - inset * 2) * (tall ? 0.4 : 0.36), 1, 1.3, 4);
    const hi = String((c.seed % 900000) + 100000);
    return doc(
      c,
      [FONTS.pixel],
      `body{background:${p.bg2}}
.scr{position:absolute;inset:${inset}px;border-radius:${u(5)}/${u(4)};overflow:hidden;background:radial-gradient(90% 80% at 50% 45%,${p.surface},${p.bg2} 78%);box-shadow:0 0 0 ${u(0.5)} ${p.dark ? p.accent : p.deep},0 0 ${u(5)} ${mix(p.accent, 70)},inset 0 0 ${u(8)} ${p.dark ? "rgba(0,0,0,.9)" : mix(p.deep, 30)};font-family:'Press Start 2P',monospace}
.hud{position:absolute;top:${u(4)};left:${u(4.5)};right:${u(4.5)};display:flex;justify-content:space-between;font-size:${u(2)};line-height:1.7;color:${p.ink};text-align:center}
.hud b{display:block;font-weight:400;color:${p.dark ? p.accent2 : p.deep}}
.mid{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center}
h1{font-size:${f.fs}px;line-height:1.3;font-weight:400;white-space:nowrap;color:${p.dark ? o(0.93, 0.12, hB) : p.deep};text-shadow:-${u(0.35)} 0 rgba(255,40,110,.75),${u(0.35)} 0 rgba(0,225,255,.75),0 0 ${u(3)} ${mix(p.accent, 80)}}
.coin{margin-top:${u(4)};font-size:${u(2.4)};color:${p.dark ? p.accent2 : p.ink};letter-spacing:.08em}
.foot{position:absolute;bottom:${u(3.5)};left:${u(4.5)};right:${u(4.5)};display:flex;justify-content:space-between;font-size:${u(1.7)};color:${p.muted}}`,
      `<div class="scr"><div class="hud"><span><b>1UP</b>000000</span><span><b>HI-SCORE</b>${hi}</span><span><b>2UP</b>000000</span></div>
<div class="mid"><h1>${lines(f)}</h1><div class="coin">INSERT COIN</div></div>
<div class="foot"><span>CREDIT 0</span><span>${c.creator ? `© @${esc(c.creator.toUpperCase())}` : ""}</span></div>
<div class="scan"></div><div class="vig"></div></div>`,
    );
  },

  titlescreen(c) {
    const { u, p, w: W, h: H, tall } = c;
    const f = fitBox(c.title.toUpperCase(), W * 0.86, H * (tall ? 0.38 : 0.4), 1, 1.25, 4);
    const d = Math.max(2, Math.round(f.fs * 0.07));
    const cols = p.dark ? [p.accent, p.accent2, p.ink] : [p.deep, p.accent, p.ink];
    const title = f.lines.map((l, i) => `<span style="color:${cols[i % 3]}">${esc(l)}</span>`).join("<br>");
    return doc(
      c,
      [FONTS.pixel],
      `body{background:${p.bg2};font-family:'Press Start 2P',monospace}
.w{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
h1{font-size:${f.fs}px;line-height:1.25;font-weight:400;white-space:nowrap;text-shadow:${d}px ${d}px 0 ${p.dark ? p.deep : mix(p.ink, 30)},${d * 2}px ${d * 2}px 0 ${mix(p.dark ? p.deep : p.ink, p.dark ? 55 : 15)}}
.menu{margin-top:${u(tall ? 7 : 5.5)};font-size:${u(2.6)};line-height:2;color:${p.ink};text-align:left}
.menu i{font-style:normal;color:${p.dark ? p.accent2 : p.accent}}
.foot{position:absolute;left:0;right:0;bottom:${u(4)};text-align:center;font-size:${u(1.8)};color:${p.muted};line-height:1.8}`,
      `<div class="w"><h1>${title}</h1><div class="menu"><i>▶</i> 1 PLAYER<br>&nbsp;&nbsp;2 PLAYERS</div></div>
<div class="foot">© 2026 ${c.creator ? `@${esc(c.creator.toUpperCase())}` : "HABIV"}<br>PUSH START BUTTON</div>`,
    );
  },

  gameboy(c) {
    const { u, o, hA, w: W, h: H, tall } = c;
    // Darkest → lightest: the four DMG shades rotated into the theme hue.
    const s = [o(0.3, 0.07, hA), o(0.46, 0.09, hA), o(0.7, 0.12, hA), o(0.84, 0.11, hA)];
    const f = fitBox(c.title.toUpperCase(), W * 0.8, H * (tall ? 0.36 : 0.38), 1, 1.3, 4);
    const d = Math.max(2, Math.round(f.fs * 0.08));
    return doc(
      c,
      [FONTS.pixel],
      `body{background:${s[3]};font-family:'Press Start 2P',monospace;color:${s[0]}}
.px{position:absolute;inset:0;background:linear-gradient(90deg,${s[2]} 1px,transparent 1px) 0 0/${u(0.9)} ${u(0.9)},linear-gradient(${s[2]} 1px,transparent 1px) 0 0/${u(0.9)} ${u(0.9)};opacity:.35}
.fr{position:absolute;inset:${u(3.5)};border:${u(0.9)} solid ${s[0]};box-shadow:inset 0 0 0 ${u(0.9)} ${s[2]}}
.top{position:absolute;top:${u(8)};left:0;right:0;text-align:center;font-size:${u(2.2)};color:${s[1]};letter-spacing:.1em}
.w{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
h1{font-size:${f.fs}px;line-height:1.3;font-weight:400;white-space:nowrap;color:${s[0]};text-shadow:${d}px ${d}px 0 ${s[2]}}
.st{margin-top:${u(5)};font-size:${u(2.6)};color:${s[1]}}
.bot{position:absolute;bottom:${u(8)};left:0;right:0;text-align:center;font-size:${u(1.8)};color:${s[1]}}`,
      `<div class="px"></div><div class="fr"></div><div class="top">${tag(c)}</div>
<div class="w"><h1>${lines(f)}</h1><div class="st">PRESS START</div></div><div class="bot">${c.creator ? `© @${esc(c.creator.toUpperCase())}` : ""}</div>`,
    );
  },

  vhs(c) {
    const { u, unit, p, w: W, h: H, tall } = c;
    const pad = unit * 5;
    const s = c.seed;
    const f = fitBox(c.title.toUpperCase(), W - pad * 2, H * (tall ? 0.4 : 0.42), 0.5, 0.95, 4);
    const glitch = Math.floor(f.lines.length / 2);
    const title = f.lines.map((l, i) => `<span${i === glitch ? ' class="gl"' : ""}>${esc(l)}</span>`).join("<br>");
    const tc = `${s % 2}:${String(s % 60).padStart(2, "0")}:${String((s >>> 6) % 60).padStart(2, "0")}`;
    return doc(
      c,
      [FONTS.vt],
      `body{background:linear-gradient(180deg,${p.bg},${p.bg2});font-family:VT323,monospace;color:${p.ink}}
.grain{opacity:.22}
.trk{position:absolute;left:0;right:0;height:${u(2.2)};background:linear-gradient(transparent,${mix(p.ink, 22)},transparent);filter:blur(1px)}
.osd{position:absolute;font-size:${u(5)};line-height:1;text-shadow:0 0 ${u(0.6)} ${mix(p.ink, 50)}}
h1{position:absolute;left:${pad}px;bottom:${pad * 1.9}px;font-size:${f.fs}px;line-height:.95;font-weight:400;white-space:nowrap;text-shadow:-${u(0.5)} 0 rgba(255,0,90,.8),${u(0.5)} 0 rgba(0,220,255,.8)}
h1 span{display:inline-block}
h1 .gl{transform:translateX(${u(2)})}
.sm{position:absolute;bottom:${pad}px;font-size:${u(3.6)};line-height:1;color:${p.dark ? p.accent : p.deep}}`,
      `<div class="trk" style="top:${18 + (s % 20)}%"></div><div class="trk" style="top:${60 + (s % 15)}%;opacity:.6"></div><div class="grain"></div>
<div class="osd" style="left:${pad}px;top:${pad}px">PLAY ▶</div><div class="osd" style="right:${pad}px;top:${pad}px">SP</div>
<h1>${title}</h1><div class="sm" style="left:${pad}px">${tc} · ${tag(c)}</div><div class="sm" style="right:${pad}px">JAN.01 1989</div><div class="scan" style="opacity:${p.dark ? 0.5 : 0.15}"></div>`,
    );
  },

  synthwave(c) {
    const { u, unit, p, o, hA, w: W, h: H, tall } = c;
    const f = fitBox(c.title.toUpperCase(), W * 0.86, H * (tall ? 0.4 : 0.42), 0.9, 1, 4);
    return doc(
      c,
      [FONTS.orbitron, FONTS.dafoe],
      `body{background:linear-gradient(180deg,${p.bg2} 0%,${p.bg} 55%,${p.deep} 100%)}
.hz{position:absolute;left:0;right:0;top:${tall ? 58 : 62}%;height:${u(0.4)};background:linear-gradient(90deg,transparent,${p.accent2},transparent);box-shadow:0 0 ${u(3)} ${p.accent2}}
.w{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
h1{font:900 ${f.fs}px/1 Orbitron,sans-serif;white-space:nowrap;letter-spacing:.02em;filter:drop-shadow(0 0 ${u(1.5)} ${mix(p.accent, 80)}) drop-shadow(0 ${u(0.8)} 0 ${p.dark ? o(0.25, 0.1, hA) : p.ink})}
h1 span{display:block;background:linear-gradient(180deg,#fff 0%,#d6ecff 40%,#5a5fb8 50%,#2b1f5c 52%,#ff9ee0 78%,#fff 100%);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-stroke:${Math.max(1, f.fs * 0.012)}px rgba(255,255,255,.7)}
.sc{margin-top:${-f.fs * 0.18}px;margin-left:${W * 0.25}px;font:400 ${u(tall ? 11 : 10)}/1 'Mr Dafoe',cursive;color:${p.accent2};transform:rotate(-8deg);text-shadow:0 0 ${unit}px #fff,0 0 ${u(3)} ${p.accent2}}`,
      `<div class="hz"></div><div class="w"><h1>${f.lines.map((l) => `<span>${esc(l)}</span>`).join("")}</h1><div class="sc">${esc(c.category || "Game")}</div></div>`,
    );
  },

  dialogue(c) {
    const { u, unit, p, o, hA, hB, w: W, h: H, tall } = c;
    const pad = unit * 5;
    const boxH = H * 0.34;
    const f = fitBox(c.title.toUpperCase(), W - pad * 2, (H - boxH - pad * 2) * 0.62, 0.78, 1.05, 4);
    const boxBg = p.dark ? `linear-gradient(180deg,${o(0.52, 0.17, hB)},${o(0.3, 0.14, hB)})` : "#fff";
    const boxInk = p.dark ? "#fff" : p.ink;
    return doc(
      c,
      [FONTS.pixelify],
      `body{background:${p.bg};font-family:'Pixelify Sans',sans-serif}
.w{position:absolute;left:${pad}px;right:${pad}px;top:${pad}px;bottom:${boxH + pad * 1.5}px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.k{font-weight:500;font-size:${u(2.8)};color:${p.dark ? p.accent : p.deep};letter-spacing:.2em;margin-bottom:${u(2)}}
h1{font-weight:700;font-size:${f.fs}px;line-height:1.05;white-space:nowrap;color:${p.dark ? o(0.95, 0.06, hA) : p.ink};text-shadow:${u(0.6)} ${u(0.6)} 0 ${p.dark ? p.deep : p.accent2}}
.box{position:absolute;left:${pad}px;right:${pad}px;bottom:${pad}px;height:${boxH}px;background:${boxBg};border:${u(0.7)} solid ${boxInk};border-radius:${u(1.6)};box-shadow:${p.dark ? `0 0 0 ${u(0.5)} ${o(0.15, 0.05, hB)},inset 0 0 0 ${u(0.5)} ${o(0.15, 0.05, hB)}` : `${u(0.9)} ${u(0.9)} 0 ${mix(p.ink, 25)}`};padding:${u(3.4)} ${u(4)};font-weight:500;font-size:${u(tall ? 3.6 : 3.4)};line-height:1.45;color:${boxInk}}
.box b{color:${p.dark ? o(0.9, 0.15, 95) : p.deep};font-weight:700}
.name{position:absolute;left:${u(3)};top:-${u(5.2)};background:${p.dark ? o(0.3, 0.14, hB) : p.accent};color:${p.dark ? "#fff" : p.onAccent};border:${u(0.6)} solid ${boxInk};border-radius:${u(1)};padding:${u(1)} ${u(2)};font-weight:700;font-size:${u(2.6)};line-height:1}
.nx{position:absolute;right:${u(3)};bottom:${u(2)};font-size:${u(3)}}`,
      `<div class="w"><div class="k">${tag(c)}</div><h1>${lines(f)}</h1></div>
<div class="box"><div class="name">${handle(c) || "???"}</div>Hey, you made it! Ready to play <b>${esc(c.title)}</b>?<div class="nx">▼</div></div>`,
    );
  },

  neon(c) {
    const { u, p, o, hA, hB, w: W, h: H, tall } = c;
    const tube = (col: string, inset = "") =>
      [u(0.4), u(1.2), u(3), u(7)].map((r, i) => `${inset}0 0 ${r} ${i === 0 ? (p.dark ? "#fff" : col) : col}`).join(",");
    const f = fitBox(c.title, W * 0.76, H * (tall ? 0.36 : 0.4), 0.55, 1.05, 4);
    return doc(
      c,
      [FONTS.tilt, FONTS.monoton],
      `body{background:radial-gradient(80% 70% at 50% 45%,${p.bg},${p.bg2})}
.sign{position:absolute;inset:${u(tall ? 7 : 6)};border:${u(0.7)} solid ${p.dark ? o(0.95, 0.05, hB) : p.accent2};border-radius:${u(4)};box-shadow:${tube(p.accent2)},${tube(p.accent2, "inset ")}}
.w{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
h1{font:400 ${f.fs}px/1.05 'Tilt Neon',sans-serif;white-space:nowrap;color:${p.dark ? o(0.97, 0.04, hA) : p.deep};text-shadow:${tube(p.dark ? p.accent : mix(p.accent, 70))}}
.sm{margin-top:${u(3.5)};font:400 ${u(tall ? 5 : 4.6)}/1 Monoton,sans-serif;letter-spacing:.08em;color:${p.dark ? o(0.97, 0.04, hB) : p.accent2};text-shadow:${tube(p.accent2)}}`,
      `<div class="sign"></div><div class="w"><h1>${lines(f)}</h1><div class="sm">PLAY NOW</div></div>`,
    );
  },

  scroll(c) {
    const { u, p, o, hA, w: W, h: H, tall } = c;
    const ink = "#3a2210";
    const pw = tall ? W * 0.82 : W * 0.74;
    const ph = tall ? H * 0.76 : H * 0.84;
    const f = fitBox(c.title, pw * 0.8, ph * 0.36, 0.74, 1.05, 4);
    const paper = tall ? "left:9%;right:9%;top:12%;bottom:12%" : "left:13%;right:13%;top:8%;bottom:8%";
    const grad = (dir: string) => `linear-gradient(${dir},#5a3d1c,#b8955a 22%,#ecdcb0 45%,#c9a86b 70%,#5a3d1c)`;
    const rolls = tall
      ? [`left:5%;right:5%;top:6%;height:7%;background:${grad("180deg")}`, `left:5%;right:5%;bottom:6%;height:7%;background:${grad("180deg")}`]
      : [`left:8.5%;width:5.5%;top:3%;bottom:3%;background:${grad("90deg")}`, `right:8.5%;width:5.5%;top:3%;bottom:3%;background:${grad("90deg")}`];
    return doc(
      c,
      [FONTS.cinzel, FONTS.fell],
      `body{background:radial-gradient(100% 100% at 50% 50%,${p.bg},${p.bg2})}
.p{position:absolute;${paper};background:radial-gradient(120% 90% at 50% 50%,#f7ecd2 40%,#e8d3a4 85%,#d4b77e 100%);box-shadow:inset 0 0 ${u(6)} rgba(110,70,25,.45),0 ${u(2)} ${u(5)} rgba(0,0,0,.35);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:${ink}}
.p::after{content:"";position:absolute;inset:0;background:${GRAIN};opacity:.18;mix-blend-mode:multiply}
.roll{position:absolute;border-radius:${u(2)};box-shadow:0 ${u(1)} ${u(3)} rgba(0,0,0,.45)}
.k{font:italic 400 ${u(3)}/1 'IM Fell English',serif;color:#6b4423;margin-bottom:${u(2.4)}}
h1{font:900 ${f.fs}px/1.05 'Cinzel Decorative',serif;white-space:nowrap;color:${ink};text-shadow:0 1px 0 rgba(255,255,255,.35)}
.orn{margin:${u(2.2)} 0 ${u(1.6)};font:400 ${u(3.2)}/1 'IM Fell English',serif;color:#8a5a2b;letter-spacing:.4em}
.by{font:italic 400 ${u(2.6)}/1 'IM Fell English',serif;color:#6b4423}
.seal{position:absolute;${tall ? "right:14%;bottom:9%" : "right:16%;bottom:10%"};width:${u(11)};height:${u(11)};border-radius:50%;background:radial-gradient(circle at 35% 30%,${o(0.62, 0.17, hA)},${o(0.47, 0.16, hA)} 60%,${o(0.3, 0.12, hA)});box-shadow:0 ${u(0.6)} ${u(1.5)} rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font:900 ${u(4.6)}/1 'Cinzel Decorative',serif;color:${o(0.3, 0.1, hA)};transform:rotate(-12deg)}`,
      `<div class="p"><div class="k">~ A ${esc(c.category || "Game")} Quest ~</div><h1>${lines(f)}</h1><div class="orn">— ✦ —</div><div class="by">${c.creator ? `Penned by @${esc(c.creator)}` : ""}</div></div>
<div class="roll" style="${rolls[0]}"></div><div class="roll" style="${rolls[1]}"></div><div class="seal">${firstLetter(c)}</div>`,
    );
  },
};

export type ThumbOptions = { theme?: string; mode?: ThumbMode };

/** Full HTML document for one style at one size and colour theme. */
export function renderThumb(id: ThumbStyleId, input: ThumbInput, size: ThumbSize, opts: ThumbOptions = {}): string {
  const theme = THUMB_THEMES.find((t) => t.id === opts.theme) ?? THUMB_THEMES[0];
  const hA = theme.hue ?? input.hue;
  const hB = theme.hue2 ?? hA + 50;
  const k = theme.chroma ?? 1;
  const unit = Math.min(size.w, size.h) / 100;
  const u = (n: number) => `${Math.round(n * unit * 100) / 100}px`;
  const o = (l: number, c: number, h: number, a?: number) => ok(l, c * k, h, a);
  return styles[id]({
    ...input, ...size, tall: size.h > size.w, seed: hash(input.title || "habiv"), unit, u,
    p: palette(hA, hB, opts.mode ?? "light", k), hA, hB, o,
  });
}
