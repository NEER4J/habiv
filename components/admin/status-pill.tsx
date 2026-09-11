import type { CSSProperties } from "react";
import { mono } from "@/lib/habiv/ui";

const tone: Record<string, { bg: string; ink: string }> = {
  ready: { bg: "var(--pos-bg)", ink: "var(--pos-ink)" },
  published: { bg: "var(--pos-bg)", ink: "var(--pos-ink)" },
  resolved: { bg: "var(--pos-bg)", ink: "var(--pos-ink)" },
  rejected: { bg: "var(--danger-bg)", ink: "var(--danger-ink)" },
  removed: { bg: "var(--danger-bg)", ink: "var(--danger-ink)" },
  banned: { bg: "var(--danger-bg)", ink: "var(--danger-ink)" },
  processing: { bg: "var(--chip-2)", ink: "var(--ink)" },
  uploaded: { bg: "var(--chip-2)", ink: "var(--ink)" },
  open: { bg: "var(--chip-2)", ink: "var(--ink)" },
};

const fallback = { bg: "var(--chip)", ink: "var(--ink-5)" };

export function StatusPill({ status, title, style }: { status: string; title?: string; style?: CSSProperties }) {
  const t = tone[status] ?? fallback;
  return (
    <span
      title={title}
      style={{
        display: "inline-flex", alignItems: "center", height: "22px", padding: "0 9px", borderRadius: "11px",
        background: t.bg, color: t.ink, fontFamily: mono, fontSize: "10.5px", letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap", ...style,
      }}
    >
      {status}
    </span>
  );
}
