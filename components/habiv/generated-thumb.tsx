"use client";

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { defaultThumbHtml } from "@/lib/thumbs/defaults";
import type { ThumbInput, ThumbSize } from "@/lib/thumbs/styles";
import type { Game } from "@/lib/habiv/games";

/** Renders the same thumbnail-lab HTML used by the automatic art job, without waiting for storage. */
export function GeneratedThumb({ input, size, style }: { input: ThumbInput; size: ThumbSize; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const html = useMemo(() => defaultThumbHtml(input, size), [input, size]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const resize = () => setScale(element.getBoundingClientRect().width / size.w);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [size.w]);

  return (
    <div ref={ref} aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", background: "var(--chip)", ...style }}>
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
    </div>
  );
}

export function thumbInputForGame(g: Pick<Game, "id" | "title" | "desc" | "type" | "engine" | "creator" | "hue">): ThumbInput {
  return {
    seed: g.id,
    title: g.title,
    tagline: g.desc,
    category: g.type,
    engine: g.engine,
    creator: g.creator,
    hue: g.hue,
  };
}
