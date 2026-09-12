"use client";

import type { CSSProperties } from "react";
import {
  CONTROL_ACTION_MAX,
  CONTROL_KEY_MAX,
  DESCRIPTION_MAX,
  MAX_CONTROL_ROWS,
  MAX_TAGS,
  TOUCH_HINT_MAX,
  durationOptions,
  parseTags,
  type ControlRow,
  type ExtraDetails,
} from "@/lib/habiv/game-details";
import { durationLabel } from "@/lib/habiv/games";
import { chipBtn, chipStyle, fieldLabelStyle, fieldStyle, mono } from "@/lib/habiv/ui";

const hint: CSSProperties = { marginTop: "6px", fontFamily: mono, fontSize: "10.5px", color: "var(--ink-6)" };

/** One-click tags under the Tags field; each must pass TAG_RE (lower case, 24 characters). */
const SUGGESTED_TAGS = [
  "one button",
  "high score",
  "endless",
  "roguelike",
  "platformer",
  "pixel art",
  "physics",
  "relaxing",
  "hard",
  "retro",
  "local multiplayer",
  "keyboard",
  "touch friendly",
  "story",
  "idle",
  "shooter",
  "strategy",
  "music",
];

const tagChip = (on: boolean, blocked: boolean): CSSProperties => ({
  height: "26px",
  padding: "0 10px",
  borderRadius: "99px",
  fontSize: "12px",
  background: on ? "var(--ink)" : "var(--chip)",
  color: on ? "var(--ink-invert)" : "var(--ink-4)",
  opacity: blocked ? 0.4 : 1,
  cursor: blocked ? "default" : "pointer",
});

/** Long description, how-to-play controls, tags and run length. Used by the publish wizard and the edit page. */
export function GameExtraFields({ value, onChange }: { value: ExtraDetails; onChange: (patch: Partial<ExtraDetails>) => void }) {
  const setRow = (i: number, patch: Partial<ControlRow>) => onChange({ keys: value.keys.map((k, j) => (j === i ? { ...k, ...patch } : k)) });
  const tags = parseTags(value.tags);
  const customDuration = value.durationSec != null && !durationOptions.some((o) => o.value === value.durationSec);

  return (
    <>
      <div style={fieldLabelStyle}>About the game · shown on the game page</div>
      <textarea
        className="hb-input"
        value={value.description}
        maxLength={DESCRIPTION_MAX}
        onChange={(e) => onChange({ description: e.target.value })}
        placeholder="The goal, how a run goes, tips and credits."
        style={{ ...fieldStyle, height: 120, padding: "10px 14px", resize: "vertical", lineHeight: 1.5 }}
      />

      <div style={fieldLabelStyle}>How to play</div>
      {value.keys.map((k, i) => (
        <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
          <input
            className="hb-input"
            aria-label={`Control ${i + 1}: key or gesture`}
            value={k.key}
            maxLength={CONTROL_KEY_MAX}
            onChange={(e) => setRow(i, { key: e.target.value })}
            placeholder="Space"
            style={{ ...fieldStyle, width: "34%", minWidth: 0 }}
          />
          <input
            className="hb-input"
            aria-label={`Control ${i + 1}: what it does`}
            value={k.action}
            maxLength={CONTROL_ACTION_MAX}
            onChange={(e) => setRow(i, { action: e.target.value })}
            placeholder="Jump"
            style={{ ...fieldStyle, flex: 1, minWidth: 0 }}
          />
          <button type="button" aria-label={`Remove control ${i + 1}`} onClick={() => onChange({ keys: value.keys.filter((_, j) => j !== i) })} style={chipBtn}>
            ✕
          </button>
        </div>
      ))}
      {value.keys.length < MAX_CONTROL_ROWS ? (
        <button type="button" onClick={() => onChange({ keys: [...value.keys, { key: "", action: "" }] })} style={chipBtn}>
          Add a control
        </button>
      ) : null}
      <div style={hint}>A key or gesture and what it does, like “← →” and “Move”. Left empty, the game page shows defaults for the category.</div>

      <div style={fieldLabelStyle}>On touch screens</div>
      <input
        className="hb-input"
        value={value.touch}
        maxLength={TOUCH_HINT_MAX}
        onChange={(e) => onChange({ touch: e.target.value })}
        placeholder="Tap to jump, swipe to dodge"
        style={fieldStyle}
      />

      <div style={fieldLabelStyle}>Tags</div>
      <input className="hb-input" value={value.tags} onChange={(e) => onChange({ tags: e.target.value })} placeholder="one thumb, high score, cozy" style={fieldStyle} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
        {SUGGESTED_TAGS.map((t) => {
          const on = tags.includes(t);
          const blocked = !on && tags.length >= MAX_TAGS;
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              disabled={blocked}
              onClick={() => onChange({ tags: (on ? tags.filter((x) => x !== t) : [...tags, t]).join(", ") })}
              style={tagChip(on, blocked)}
            >
              {on ? "✓ " : "+ "}
              {t}
            </button>
          );
        })}
      </div>
      <div style={hint}>{tags.length ? `Saved as: ${tags.join(" · ")} (${tags.length}/${MAX_TAGS})` : `Up to ${MAX_TAGS}: pick above or type your own, separated by commas.`}</div>

      <div style={fieldLabelStyle}>Typical run length</div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {customDuration ? (
          <button type="button" style={chipStyle(true)}>
            {durationLabel(value.durationSec)}
          </button>
        ) : null}
        {durationOptions.map((o) => (
          <button key={o.label} type="button" onClick={() => onChange({ durationSec: o.value })} style={chipStyle(value.durationSec === o.value)}>
            {o.label}
          </button>
        ))}
      </div>
      <div style={hint}>Games with runs of 45 seconds or less show up in Quick play.</div>
    </>
  );
}
