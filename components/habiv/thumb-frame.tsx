"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { ThumbSize, ThumbTheme } from "@/lib/thumbs/styles";

/** A thumbnail document rendered at native size in a sandboxed iframe and scaled to the box width. */
export function ThumbFrame({
  html,
  size,
  onClick,
  selected = false,
  label = "Open full size",
}: {
  html: string;
  size: ThumbSize;
  onClick?: () => void;
  selected?: boolean;
  label?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / size.w));
    ro.observe(el);
    return () => ro.disconnect();
  }, [size.w]);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={onClick ? selected : undefined}
      style={{
        position: "relative",
        display: "block",
        width: "100%",
        aspectRatio: `${size.w} / ${size.h}`,
        overflow: "hidden",
        borderRadius: "10px",
        background: "var(--chip)",
        border: 0,
        padding: 0,
        cursor: onClick ? "pointer" : "default",
        outline: selected ? "2px solid var(--ink)" : "none",
        outlineOffset: "2px",
      }}
    >
      {scale > 0 ? (
        <iframe
          srcDoc={html}
          sandbox=""
          loading="lazy"
          tabIndex={-1}
          title=""
          style={{ position: "absolute", top: 0, left: 0, width: size.w, height: size.h, border: 0, transform: `scale(${scale})`, transformOrigin: "0 0", pointerEvents: "none" }}
        />
      ) : null}
    </button>
  );
}

/** Round colour chip for a thumbnail theme; the game-colour theme shows a hue wheel. */
export function ThemeSwatch({ theme, size = 12 }: { theme: ThumbTheme; size?: number }) {
  const c = theme.chroma ?? 1;
  const background =
    theme.hue == null
      ? "conic-gradient(from 0deg, oklch(0.72 0.17 0), oklch(0.72 0.17 120), oklch(0.72 0.17 240), oklch(0.72 0.17 360))"
      : `linear-gradient(135deg, oklch(0.68 ${0.2 * c} ${theme.hue}) 50%, oklch(0.74 ${0.17 * c} ${theme.hue2 ?? theme.hue}) 50%)`;
  return <span aria-hidden="true" style={{ width: `${size}px`, height: `${size}px`, borderRadius: "50%", background, flex: "none" }} />;
}
