"use client";

import { useEffect, useMemo, useState } from "react";
import { ThemeSwatch, ThumbFrame } from "@/components/habiv/thumb-frame";
import {
  CARD,
  COVER,
  THUMB_MODES,
  THUMB_STYLES,
  THUMB_THEMES,
  renderThumb,
  type ThumbInput,
  type ThumbMode,
  type ThumbOptions,
  type ThumbSize,
  type ThumbStyleId,
} from "@/lib/thumbs/styles";
import { chipStyle, monoLabel, pageTitleStyle } from "@/lib/habiv/ui";

/** Only the fallback case matters (creator-uploaded art is kept as is), so games carry no image. */
export type LabGame = ThumbInput & { id: string };

type Format = "both" | "cover" | "card";
type Group = "all" | "modern" | "retro";
type Open = { html: string; size: ThumbSize } | null;

function Pair({ input, style, format, opts, onOpen }: { input: LabGame; style: ThumbStyleId; format: Format; opts: ThumbOptions; onOpen: (o: Open) => void }) {
  const cover = useMemo(() => renderThumb(style, input, COVER, opts), [input, style, opts]);
  const card = useMemo(() => renderThumb(style, input, CARD, opts), [input, style, opts]);
  const cols = format === "both" ? `${COVER.w / COVER.h}fr ${CARD.w / CARD.h}fr` : "1fr";
  return (
    <div style={{ display: "grid", gridTemplateColumns: cols, gap: "10px", alignItems: "start" }}>
      {format !== "card" ? <ThumbFrame html={cover} size={COVER} onClick={() => onOpen({ html: cover, size: COVER })} /> : null}
      {format !== "cover" ? (
        <div style={format === "card" ? { maxWidth: "340px" } : undefined}>
          <ThumbFrame html={card} size={CARD} onClick={() => onOpen({ html: card, size: CARD })} />
        </div>
      ) : null}
    </div>
  );
}

function Lightbox({ open, onClose }: { open: Open; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const { w, h } = open.size;
  return (
    <div onClick={onClose} role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", cursor: "zoom-out" }}>
      <div style={{ width: `min(100%, calc((100svh - 48px) * ${w / h}), ${w}px)` }}>
        <ThumbFrame html={open.html} size={open.size} />
        <div style={{ ...monoLabel, marginTop: "10px", textAlign: "center", color: "#aaa" }}>{w}×{h} · Esc to close</div>
      </div>
    </div>
  );
}

const MODE_LABEL: Record<ThumbMode, string> = { light: "Light", dark: "Dark", vivid: "Vivid" };

export function ThumbLab({ games }: { games: LabGame[] }) {
  const [gameId, setGameId] = useState(games[0]?.id ?? "");
  const [format, setFormat] = useState<Format>("both");
  const [focus, setFocus] = useState<ThumbStyleId | null>(null);
  const [open, setOpen] = useState<Open>(null);
  const [group, setGroup] = useState<Group>("all");
  const [theme, setTheme] = useState("auto");
  const [mode, setMode] = useState<ThumbMode>("light");

  const opts = useMemo<ThumbOptions>(() => ({ theme, mode }), [theme, mode]);
  const game = games.find((g) => g.id === gameId) ?? games[0];
  const visible = THUMB_STYLES.filter((s) => s.group === "baseline" || group === "all" || s.group === group);

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "8px 14px", marginBottom: "6px" }}>
        <h1 style={pageTitleStyle}>Thumbnail lab</h1>
        <span style={monoLabel}>{visible.length - 1} fallback styles · admin only</span>
      </div>
      <p style={{ color: "var(--ink-4)", fontSize: "14px", lineHeight: 1.5, maxWidth: "760px", margin: "0 0 20px" }}>
        What a game gets when the creator hasn&apos;t uploaded a thumbnail. Uploaded art is always kept as is. Each style is typography only, built from
        the title, category, engine and creator, and every style follows the colour theme and mode below. Click any thumbnail to see it full size.
      </p>

      <div style={{ position: "sticky", top: 0, zIndex: 5, background: "var(--bg)", padding: "10px 0 14px", borderBottom: "1px solid var(--divider)", marginBottom: "22px", display: "flex", flexDirection: "column", gap: "10px" }}>
        <div className="hb-no-scrollbar" style={{ display: "flex", gap: "6px", overflowX: "auto" }}>
          {games.map((g) => (
            <button key={g.id} type="button" onClick={() => { setGameId(g.id); setFocus(null); }} style={{ ...chipStyle(!focus && g.id === game?.id), display: "inline-flex", alignItems: "center", gap: "8px", flex: "none" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: `oklch(0.74 0.17 ${g.hue})` }} />
              {g.title}
            </button>
          ))}
        </div>
        <div className="hb-no-scrollbar" style={{ display: "flex", gap: "6px", overflowX: "auto", alignItems: "center" }}>
          <span style={{ ...monoLabel, flex: "none", marginRight: "4px" }}>Theme</span>
          {THUMB_THEMES.map((t) => (
            <button key={t.id} type="button" onClick={() => setTheme(t.id)} style={{ ...chipStyle(theme === t.id), display: "inline-flex", alignItems: "center", gap: "8px", flex: "none" }}>
              <ThemeSwatch theme={t} />
              {t.name}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", alignItems: "center" }}>
          <div style={{ display: "flex", gap: "6px" }}>
            {THUMB_MODES.map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} style={chipStyle(mode === m)}>
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            {(["all", "modern", "retro"] as const).map((g) => (
              <button key={g} type="button" onClick={() => { setGroup(g); setFocus(null); }} style={chipStyle(group === g)}>
                {g === "all" ? "All styles" : g === "modern" ? "Modern" : "Retro"}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            {(["both", "cover", "card"] as const).map((f) => (
              <button key={f} type="button" onClick={() => setFormat(f)} style={chipStyle(format === f)}>
                {f === "both" ? "Cover + card" : f === "cover" ? "Cover 16:9" : "Card 3:4"}
              </button>
            ))}
          </div>
          {focus ? (
            <button type="button" onClick={() => setFocus(null)} style={chipStyle(false)}>
              ← All styles
            </button>
          ) : null}
        </div>
      </div>

      {focus ? (
        <>
          <h2 style={{ fontSize: "20px", fontWeight: 600, margin: "0 0 4px" }}>{THUMB_STYLES.find((s) => s.id === focus)?.name} across every game</h2>
          <p style={{ color: "var(--ink-5)", fontSize: "13px", margin: "0 0 18px" }}>Consistency check: how the style holds up on different titles and hues.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 420px), 1fr))", gap: "26px 20px" }}>
            {games.map((g) => (
              <div key={g.id}>
                <Pair input={g} style={focus} format={format} opts={opts} onOpen={setOpen} />
                <div style={{ ...monoLabel, marginTop: "8px" }}>{g.title}</div>
              </div>
            ))}
          </div>
        </>
      ) : game ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 520px), 1fr))", gap: "34px 24px" }}>
          {visible.map((s) => (
            <section key={s.id}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "4px" }}>
                <h2 style={{ fontSize: "17px", fontWeight: 600, margin: 0 }}>{s.name}</h2>
                <span style={monoLabel}>{s.group === "baseline" ? "today" : s.group}</span>
                <div style={{ flex: 1 }} />
                <button type="button" onClick={() => setFocus(s.id)} style={{ background: "none", border: 0, padding: 0, color: "var(--ink-4)", fontSize: "13px", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: "3px" }}>
                  See on all games →
                </button>
              </div>
              <p style={{ color: "var(--ink-5)", fontSize: "13px", lineHeight: 1.45, margin: "0 0 10px" }}>{s.blurb}</p>
              <Pair input={game} style={s.id} format={format} opts={opts} onOpen={setOpen} />
            </section>
          ))}
        </div>
      ) : null}

      <Lightbox open={open} onClose={() => setOpen(null)} />
    </div>
  );
}
