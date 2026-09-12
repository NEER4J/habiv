"use client";

import type { CSSProperties } from "react";
import { MAX_CATEGORIES, makeMainCategory, toggleCategory } from "@/lib/habiv/categories";
import type { CategoryInfo } from "@/lib/habiv/games";
import { chipStyle, mono } from "@/lib/habiv/ui";

const hint: CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", marginTop: "8px", fontFamily: mono, fontSize: "10.5px", color: "var(--ink-6)" };
const mainTag: CSSProperties = {
  padding: "1px 5px",
  borderRadius: "4px",
  background: "var(--ink-invert)",
  color: "var(--ink)",
  fontFamily: mono,
  fontSize: "9px",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};
const miniTag = (on: boolean): CSSProperties => ({
  height: "22px",
  padding: "0 9px",
  borderRadius: "99px",
  background: on ? "var(--ink)" : "var(--chip)",
  color: on ? "var(--ink-invert)" : "var(--ink-4)",
  fontSize: "11.5px",
  cursor: "pointer",
});

/** Multi-select category chips (publish wizard and edit page). Up to MAX_CATEGORIES; the first is the main one. */
export function CategoryChips({ categories, value, onChange }: { categories: CategoryInfo[]; value: string[]; onChange: (next: string[]) => void }) {
  const full = value.length >= MAX_CATEGORIES;
  const nameOf = (slug: string) => categories.find((c) => c.slug === slug)?.name ?? slug;

  return (
    <>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {categories.map((c) => {
          const i = value.indexOf(c.slug);
          const on = i >= 0;
          const blocked = !on && full;
          return (
            <button
              key={c.slug}
              type="button"
              aria-pressed={on}
              disabled={blocked}
              title={blocked ? `Up to ${MAX_CATEGORIES} categories` : undefined}
              onClick={() => onChange(toggleCategory(value, c.slug))}
              style={{ ...chipStyle(on), display: "inline-flex", alignItems: "center", gap: "6px", opacity: blocked ? 0.4 : 1, cursor: blocked ? "default" : "pointer" }}
            >
              {c.name}
              {i === 0 && value.length > 1 ? <span style={mainTag}>main</span> : null}
            </button>
          );
        })}
      </div>
      <div style={hint}>
        {value.length > 1 ? (
          <>
            <span>Main category, shown on cards:</span>
            {value.map((s) => (
              <button key={s} type="button" onClick={() => onChange(makeMainCategory(value, s))} style={miniTag(s === value[0])}>
                {nameOf(s)}
              </button>
            ))}
          </>
        ) : (
          <span>Pick up to {MAX_CATEGORIES}. The game shows up in each one.</span>
        )}
      </div>
    </>
  );
}
