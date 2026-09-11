import Link from "next/link";
import type { ReactNode } from "react";
import { chipStyle, monoLabel, pageTitleStyle } from "@/lib/habiv/ui";

export function PageHeader({ title, count, children }: { title: string; count?: number | string; children?: ReactNode }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 16px", marginBottom: "18px" }}>
      <h1 style={pageTitleStyle}>{title}</h1>
      {count !== undefined && <span style={monoLabel}>{count}</span>}
      <div style={{ flex: 1 }} />
      {children}
    </div>
  );
}

/** Link-based filter chips; each chip merges its param into the current query and clears paging. */
export function FilterChips({ base, param, current, options, keep = {} }: { base: string; param: string; current: string | null; options: { value: string | null; label: string }[]; keep?: Record<string, string | undefined> }) {
  return (
    <div className="hb-no-scrollbar" style={{ display: "flex", gap: "6px", overflowX: "auto", maxWidth: "100%" }}>
      {options.map((o) => {
        const sp = new URLSearchParams();
        for (const [k, v] of Object.entries(keep)) if (v) sp.set(k, v);
        if (o.value) sp.set(param, o.value);
        else sp.delete(param);
        const qs = sp.toString();
        return (
          <Link key={o.label} href={qs ? `${base}?${qs}` : base} style={{ ...chipStyle((current ?? null) === o.value), display: "inline-flex", alignItems: "center" }}>
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}

export function LoadMore({ base, params, nextOffset }: { base: string; params: Record<string, string | undefined>; nextOffset: number | null }) {
  if (nextOffset === null) return null;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  sp.set("offset", String(nextOffset));
  return (
    <div style={{ display: "flex", justifyContent: "center", marginTop: "16px" }}>
      <Link href={`${base}?${sp.toString()}`} style={{ ...chipStyle(false), display: "inline-flex", alignItems: "center" }}>
        Load more →
      </Link>
    </div>
  );
}

export function SearchForm({ action, id, placeholder, defaultValue, hidden = {} }: { action: string; id: string; placeholder: string; defaultValue?: string; hidden?: Record<string, string | undefined> }) {
  return (
    <form action={action} method="get" style={{ display: "flex", gap: "6px" }}>
      {Object.entries(hidden).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <input
        id={id}
        name="q"
        type="search"
        className="hb-input"
        placeholder={placeholder}
        defaultValue={defaultValue}
        style={{ height: "32px", padding: "0 12px", border: "none", borderRadius: "9px", background: "var(--chip)", color: "var(--ink)", fontSize: "13px", fontFamily: "inherit", outline: "none", width: "220px", maxWidth: "60vw" }}
      />
      <button type="submit" style={{ ...chipStyle(false) }}>Search</button>
    </form>
  );
}

export const cellMuted = { color: "var(--ink-5)", fontSize: "12px" } as const;

export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function offsetOf(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
