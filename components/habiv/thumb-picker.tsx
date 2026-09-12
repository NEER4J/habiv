"use client";

import { useMemo, useState } from "react";
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
  type ThumbStyleId,
} from "@/lib/thumbs/styles";
import { rasterizeThumb } from "@/lib/thumbs/rasterize";
import { chipBtn, chipStyle, fieldLabelStyle, mono, primaryBtn } from "@/lib/habiv/ui";
import { ThemeSwatch, ThumbFrame } from "./thumb-frame";

const PICKABLE = THUMB_STYLES.filter((s) => s.group !== "baseline");
const MODE_LABEL: Record<ThumbMode, string> = { light: "Light", dark: "Dark", vivid: "Vivid" };
type Group = "all" | "modern" | "retro";

function Tile({ id, name, input, opts, active, onPick }: { id: ThumbStyleId; name: string; input: ThumbInput; opts: ThumbOptions; active: boolean; onPick: () => void }) {
  const html = useMemo(() => renderThumb(id, input, COVER, opts), [id, input, opts]);
  return (
    <div>
      <ThumbFrame html={html} size={COVER} onClick={onPick} selected={active} label={name} />
      <div style={{ marginTop: "6px", fontSize: "12.5px", color: active ? "var(--ink)" : "var(--ink-4)", fontWeight: active ? 600 : 400 }}>{name}</div>
    </div>
  );
}

/**
 * Ready-made cover and card for creators who don't upload art: pick a style and colours, and both
 * images are rendered in the browser and handed to `onUse`, which saves them like an upload.
 */
export function ThumbPicker({
  input,
  replacing,
  onUse,
  onCancel,
}: {
  input: ThumbInput;
  /** The game already has art that this will replace. */
  replacing: boolean;
  onUse: (images: { cover: Blob; card: Blob }) => Promise<void>;
  onCancel: () => void;
}) {
  const [style, setStyle] = useState<ThumbStyleId>(PICKABLE[0].id);
  const [theme, setTheme] = useState("auto");
  const [mode, setMode] = useState<ThumbMode>("light");
  const [group, setGroup] = useState<Group>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const opts = useMemo<ThumbOptions>(() => ({ theme, mode }), [theme, mode]);
  const cover = useMemo(() => renderThumb(style, input, COVER, opts), [style, input, opts]);
  const card = useMemo(() => renderThumb(style, input, CARD, opts), [style, input, opts]);
  const list = PICKABLE.filter((s) => group === "all" || s.group === group);

  const use = async () => {
    setBusy(true);
    setError(null);
    try {
      const [c, k] = await Promise.all([rasterizeThumb(cover, COVER), rasterizeThumb(card, CARD)]);
      await onUse({ cover: c, card: k });
    } catch (e) {
      // Some browsers refuse to export a canvas drawn from HTML; uploading still works there.
      setError(e instanceof Error && e.message ? `${e.message} You can upload your own image instead.` : "Could not create the thumbnail. You can upload your own image instead.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: "14px", padding: "16px", borderRadius: "14px", border: "1px solid var(--divider)", background: "var(--well)" }}>
      <div style={{ display: "grid", gridTemplateColumns: `${COVER.w / COVER.h}fr ${CARD.w / CARD.h}fr`, gap: "10px", alignItems: "start", maxWidth: "620px" }}>
        <ThumbFrame html={cover} size={COVER} label="Cover preview" />
        <ThumbFrame html={card} size={CARD} label="Card preview" />
      </div>

      <div style={fieldLabelStyle}>Colours</div>
      <div className="hb-no-scrollbar" style={{ display: "flex", gap: "6px", overflowX: "auto" }}>
        {THUMB_THEMES.map((t) => (
          <button key={t.id} type="button" onClick={() => setTheme(t.id)} style={{ ...chipStyle(theme === t.id), display: "inline-flex", alignItems: "center", gap: "8px", flex: "none" }}>
            <ThemeSwatch theme={t} />
            {t.name}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
        {THUMB_MODES.map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} style={chipStyle(mode === m)}>
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>

      <div style={{ ...fieldLabelStyle, display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <span>Style</span>
        <span style={{ display: "inline-flex", gap: "6px" }}>
          {(["all", "modern", "retro"] as const).map((g) => (
            <button key={g} type="button" onClick={() => setGroup(g)} style={chipStyle(group === g)}>
              {g === "all" ? "All" : g === "modern" ? "Modern" : "Retro"}
            </button>
          ))}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 150px), 1fr))", gap: "14px 12px", maxHeight: "440px", overflowY: "auto", padding: "4px" }}>
        {list.map((s) => (
          <Tile key={s.id} id={s.id} name={s.name} input={input} opts={opts} active={style === s.id} onPick={() => setStyle(s.id)} />
        ))}
      </div>

      <div style={{ display: "flex", gap: "8px", marginTop: "16px", flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" onClick={() => void use()} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Saving…" : "Use this design"}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} style={chipBtn}>
          Cancel
        </button>
        <span style={{ fontFamily: mono, fontSize: "10.5px", color: "var(--ink-5)" }}>
          {replacing ? "Replaces the current cover and card." : "Saved as your cover and card."} Upload an image any time to change it.
        </span>
      </div>
      {error ? (
        <div role="alert" style={{ marginTop: "10px", fontSize: "12.5px", color: "var(--danger-ink)" }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
