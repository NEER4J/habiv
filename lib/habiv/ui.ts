import type { CSSProperties } from "react";

/**
 * Style primitives for the Habiv Bento design. Colours come from the theme tokens
 * defined in app/globals.css (`.hb-theme`, swapped by `html.hb-light`), so every helper here
 * works in both themes.
 */

export const mono = "'IBM Plex Mono', monospace";

const glass = "blur(30px) saturate(160%)";

/** The rounded translucent panel every bento cell sits on. */
export const bpanel: CSSProperties = {
  borderRadius: "16px",
  background: "var(--panel)",
  backdropFilter: glass,
  WebkitBackdropFilter: glass,
  minWidth: 0,
};

export function pill(kind?: "primary" | "quiet"): CSSProperties {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "7px",
    height: "36px",
    padding: "0 15px",
    borderRadius: "18px",
    fontSize: "13.5px",
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
    background: "var(--chip)",
    color: "var(--ink-2)",
    transition: "background 120ms ease",
  };
  if (kind === "primary") return { ...base, background: "var(--ink)", color: "var(--ink-invert)", fontWeight: 600 };
  if (kind === "quiet") return { ...base, background: "transparent", color: "var(--ink-3)" };
  return base;
}

export function chipStyle(active: boolean): CSSProperties {
  return {
    height: "32px",
    padding: "0 13px",
    borderRadius: "9px",
    fontSize: "13px",
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
    background: active ? "var(--ink)" : "var(--chip)",
    color: active ? "var(--ink-invert)" : "var(--ink-3)",
    transition: "background 120ms ease",
  };
}

export function navStyleFor(active: boolean, collapsed: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: collapsed ? "center" : "flex-start",
    gap: "16px",
    height: "46px",
    padding: collapsed ? "0" : "0 14px",
    borderRadius: "10px",
    background: active ? "var(--chip)" : "transparent",
    color: "var(--ink)",
    fontSize: "14px",
    fontWeight: active ? 500 : 400,
    cursor: "pointer",
    width: "100%",
    textAlign: "left",
  };
}

/** Numbered step pills used by onboarding and the publish flow. */
export function stepStyle(current: boolean, reached: boolean, done: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 13px",
    borderRadius: "9px",
    fontSize: "13px",
    cursor: reached ? "pointer" : "default",
    background: current ? "var(--ink)" : "var(--chip)",
    color: current ? "var(--ink-invert)" : done ? "var(--ink-3)" : "var(--ink-6)",
  };
}

export const primaryBtn = pill("primary");
export const chipBtn = pill();
export const ctrlBtn = pill("quiet");
export const dangerBtn: CSSProperties = { ...pill(), background: "var(--danger-bg)", color: "var(--danger-ink)" };

/** White buttons that sit directly on cover art, independent of theme. */
export const onArtBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: "42px",
  padding: "0 22px",
  borderRadius: "21px",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
  background: "rgba(255,255,255,0.18)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  color: "#ffffff",
};

export const fieldLabelStyle: CSSProperties = {
  fontFamily: mono,
  fontSize: "10.5px",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--ink-5)",
  margin: "18px 0 8px",
};

export const fieldStyle: CSSProperties = {
  width: "100%",
  height: "40px",
  padding: "0 14px",
  border: "none",
  borderRadius: "9px",
  background: "var(--chip)",
  color: "var(--ink)",
  fontSize: "14px",
  fontFamily: "inherit",
  outline: "none",
};

export const handleInputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  height: "40px",
  border: "none",
  outline: "none",
  background: "transparent",
  color: "var(--ink)",
  fontSize: "17px",
  fontFamily: "inherit",
};

export const monoLabel: CSSProperties = {
  fontFamily: mono,
  fontSize: "10.5px",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--ink-5)",
};

export const pageTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "22px",
  fontWeight: 600,
  letterSpacing: "-0.025em",
};

export const modalSmStyleFor = (light: boolean): CSSProperties => ({
  position: "relative",
  width: "min(480px, 96vw)",
  maxHeight: "86vh",
  overflow: "auto",
  padding: "24px",
  borderRadius: "20px",
  background: light ? "rgba(250,250,252,0.98)" : "rgba(22,22,26,0.98)",
  backdropFilter: "blur(40px) saturate(180%)",
  WebkitBackdropFilter: "blur(40px) saturate(180%)",
  boxShadow: light ? "0 30px 90px rgba(20,22,32,0.28)" : "0 30px 90px rgba(0,0,0,0.66)",
  animation: "hbRise 200ms ease-out both",
});

export const modalScrimStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 120,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "20px",
  background: "var(--scrim)",
  backdropFilter: "blur(3px)",
  WebkitBackdropFilter: "blur(3px)",
  animation: "hbFade 160ms ease-out both",
};
