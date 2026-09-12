"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { spanFor } from "@/lib/habiv/bento";
import {
  accentOf,
  art,
  best,
  fmt,
  initialsOf,
  isPortrait,
  poster,
  shortModel,
  type CategoryInfo,
  type Game,
} from "@/lib/habiv/games";
import { bpanel, mono } from "@/lib/habiv/ui";
import { useShell } from "./shell-context";

const blurChip: CSSProperties = {
  position: "absolute",
  top: "8px",
  padding: "3px 8px",
  borderRadius: "6px",
  background: "rgba(0,0,0,0.62)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  fontFamily: mono,
  color: "#fff",
};

export const shimmer: CSSProperties = {
  background: "var(--skeleton)",
  backgroundSize: "420px 100%",
  animation: "hbShimmer 1.2s linear infinite",
};

/** Shimmer until the image has actually decoded, then cross-fade the art in. */
function FadeImg({ src }: { src: string }) {
  const ref = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);

  // Cached images can finish before React attaches onLoad.
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth) setLoaded(true);
  }, []);

  return (
    <>
      {!loaded ? <div style={{ position: "absolute", inset: 0, ...shimmer }} /> : null}
      {/* eslint-disable-next-line @next/next/no-img-element -- cover art is a CSS-sized background layer */}
      <img
        ref={ref}
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: loaded ? 1 : 0,
          transition: "opacity 360ms ease",
        }}
      />
    </>
  );
}

/** Image layer on a shimmer so tiles never flash empty while art loads. */
export function ArtFrame({
  src,
  style,
  children,
}: {
  src: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <div style={{ position: "relative", overflow: "hidden", background: "var(--chip)", ...style }}>
      <FadeImg key={src} src={src} />
      {children}
    </div>
  );
}

/** Thumbnail height shared by every card at this bento width. */
function cardArtHeight(cols: number) {
  return cols === 6 ? 160 : cols === 8 ? 180 : 200;
}

const CARD_MIN_WIDTH = 220;

/**
 * A card is as wide as its thumbnail at the shared height, so a lone card never stretches
 * across the page. Cards may grow up to a quarter wider to close a row.
 */
function cardBox(cols: number, aspect: number): CSSProperties {
  if (cols === 2) return { minWidth: 0 };
  const w = Math.max(CARD_MIN_WIDTH, Math.round(cardArtHeight(cols) * aspect));
  return { flex: `1 1 ${w}px`, maxWidth: `${Math.round(w * 1.25)}px`, minWidth: `min(100%, ${CARD_MIN_WIDTH}px)` };
}

function cardArtStyle(cols: number): CSSProperties {
  return cols === 2 ? { aspectRatio: "4 / 5", borderRadius: "10px" } : { height: `${cardArtHeight(cols)}px`, borderRadius: "10px" };
}

const cardShell: CSSProperties = { ...bpanel, display: "flex", flexDirection: "column", gap: "10px", padding: "10px", overflow: "hidden" };

/** Vertical stack of grids and card lists, spaced like the bento gap. */
export function BentoStack({ children }: { children: ReactNode }) {
  const { cols } = useShell();
  return <div style={{ display: "flex", flexDirection: "column", gap: cols === 2 ? "10px" : "12px" }}>{children}</div>;
}

/** A wrapping list of game cards that all share one thumbnail height. Phones get an even two-up grid. */
export function GameCards({ children }: { children: ReactNode }) {
  const { cols } = useShell();
  return (
    <div style={cols === 2 ? { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px" } : { display: "flex", flexWrap: "wrap", gap: "12px" }}>
      {children}
    </div>
  );
}

/** Placeholder with the footprint of a landscape GameCard, so loading never shifts the list. */
export function SkeletonCard() {
  const { cols } = useShell();
  return (
    <div aria-hidden="true" style={{ ...cardShell, ...cardBox(cols, 16 / 9), animation: "hbFade 200ms ease-out both" }}>
      <div style={{ ...cardArtStyle(cols), ...shimmer }} />
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "2px 4px 6px" }}>
        <div style={{ height: "14px", width: "68%", borderRadius: "5px", ...shimmer }} />
        <div style={{ height: "10px", width: "38%", borderRadius: "4px", ...shimmer }} />
        <div style={{ height: "10px", width: "52%", borderRadius: "4px", ...shimmer }} />
      </div>
    </div>
  );
}

type CardProps = {
  game: Game;
  showModel?: boolean;
  showCreator?: boolean;
  showStats?: boolean;
};

/** A game card: portrait games show the poster, landscape ones the cover, all at the same height. */
export function GameCard({ game: g, showModel = true, showCreator = true, showStats = true }: CardProps) {
  const { cols } = useShell();
  const portrait = isPortrait(g);
  const src = cols === 2 || portrait ? poster(g, 560) : art(g, 1000);
  return (
    <Link
      href={g.url}
      className="hb-lift"
      style={{
        ...cardShell,
        ...cardBox(cols, portrait ? 3 / 4 : 16 / 9),
        color: "var(--ink)",
        cursor: "pointer",
        textAlign: "left",
        // Opacity only: a transform animation would pin the hover lift.
        animation: "hbFade 320ms ease-out both",
      }}
    >
      <ArtFrame src={src} style={cardArtStyle(cols)}>
        <span style={{ ...blurChip, right: "8px", fontSize: "10.5px" }}>{g.duration}</span>
        {showModel ? (
          <span style={{ ...blurChip, left: "8px", fontSize: "9.5px", letterSpacing: "0.08em", color: "rgba(255,255,255,0.9)" }}>
            {shortModel(g.model)}
          </span>
        ) : null}
      </ArtFrame>
      <div style={{ display: "flex", flexDirection: "column", gap: "5px", padding: "0 4px 4px", minWidth: 0 }}>
        <div
          style={{
            fontSize: "14px",
            fontWeight: 600,
            lineHeight: 1.25,
            letterSpacing: "-0.01em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {g.title}
        </div>
        {showCreator ? (
          <div
            style={{
              fontFamily: mono,
              fontSize: "10px",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--ink-5)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {g.creator}
          </div>
        ) : null}
        {showStats ? (
          <div style={{ fontFamily: mono, fontSize: "10.5px", color: "var(--ink-4)" }}>
            {fmt(g.plays)} runs / best {best(g)}
          </div>
        ) : null}
      </div>
    </Link>
  );
}

/** The auto-row bento grid shared by the browse pages. */
export function BentoGrid({ children }: { children: ReactNode }) {
  const { cols } = useShell();
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridAutoRows: cols === 2 ? "54px" : "56px",
        gridAutoFlow: "dense",
        gap: cols === 2 ? "10px" : "12px",
      }}
    >
      {children}
    </div>
  );
}

/** Grid for form-style pages, where cells size to their content. */
export function BentoAutoGrid({ children }: { children: ReactNode }) {
  const { cols } = useShell();
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridAutoRows: "min-content",
        gap: cols === 2 ? "10px" : "12px",
      }}
    >
      {children}
    </div>
  );
}

/** Full-width page header cell. `auto` sizes to content instead of spanning two rows. */
export function PageHead({
  title,
  sub,
  auto,
  children,
}: {
  title: string;
  sub?: string;
  auto?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      style={{
        ...bpanel,
        gridColumn: "1 / -1",
        gridRow: auto ? undefined : "span 2",
        display: "flex",
        alignItems: "center",
        gap: "14px",
        padding: auto ? "16px 18px" : "0 18px",
        flexWrap: "wrap",
      }}
    >
      <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 600, letterSpacing: "-0.025em" }}>{title}</h1>
      {sub ? <span style={{ flex: 1, fontSize: "13px", color: "var(--ink-5)" }}>{sub}</span> : null}
      {children}
    </div>
  );
}

/** A full-width strip of chips (sort / tab controls). */
export function ChipCell({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        ...bpanel,
        gridColumn: "1 / -1",
        gridRow: "span 1",
        display: "flex",
        alignItems: "center",
        padding: "0 12px",
      }}
    >
      <div className="hb-no-scrollbar" style={{ display: "flex", alignItems: "center", gap: "8px", overflowX: "auto" }}>
        {children}
      </div>
    </div>
  );
}

/** Centered empty-state cell. */
export function EmptyCell({ auto, children }: { auto?: boolean; children: ReactNode }) {
  return (
    <div
      style={{
        ...bpanel,
        gridColumn: "1 / -1",
        gridRow: auto ? undefined : "span 6",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: auto ? "40px 24px" : "24px",
      }}
    >
      {children}
    </div>
  );
}

const catIcons: Record<string, string> = {
  Arcade: "M5.6 7.6h6.8a3.4 3.4 0 0 1 0 6.8H5.6a3.4 3.4 0 0 1 0-6.8zM7.6 9.6v2.8M6.2 11h2.8M11.7 10.4h.01M12.6 12h.01",
  Puzzle: "M3.6 3.6h4.3v4.3H3.6zM10.1 3.6h4.3v4.3h-4.3zM3.6 10.1h4.3v4.3H3.6zM10.1 10.1h4.3v4.3h-4.3z",
  Reaction: "M10.2 2.6 5.2 9.9h3.2l-.7 5.5L13.1 8H9.9z",
  Rhythm: "M4.6 11.4v3.2M7.5 7v7.6M10.5 3.4v11.2M13.4 8.8v5.8",
  Racing: "M5 3v12M5 3.7c2.5-1.3 5 0 7.5-1.1v6.2C10 9.9 7.5 8.7 5 9.9",
  Cozy: "M4.5 6.2h7v4.8a2.6 2.6 0 0 1-2.6 2.6H7.1A2.6 2.6 0 0 1 4.5 11zM11.5 7.4h1.5a1.6 1.6 0 0 1 0 3.2h-1.5M5.5 15.2h6",
  Horror: "M13.6 10.9A5.7 5.7 0 0 1 6.2 3.5a5.7 5.7 0 1 0 7.4 7.4z",
  Experimental: "M7.4 2.8h3.2v3.4l3 6.1a1.5 1.5 0 0 1-1.4 2.2H5.8a1.5 1.5 0 0 1-1.4-2.2l3-6.1zM6.3 10.4h5.4",
};

const catIconList = Object.values(catIcons);

/** Category cells with live counts. Empty categories are hidden unless the catalog is still small. */
export function CategoryCells({ categories, onPick }: { categories: CategoryInfo[]; onPick: (name: string) => void }) {
  const { cols, light } = useShell();
  const active = categories.filter((c) => c.games > 0);
  const shown = active.length >= 4 ? active : categories;
  return (
    <>
      {shown.map((c, i) => {
        const hue = 20 + i * 42;
        const path = catIcons[c.name] ?? catIconList[i % catIconList.length];
        return (
          <button
            key={c.slug}
            onClick={() => onPick(c.name)}
            className="hb-lift-sm"
            style={{
              ...bpanel,
              gridColumn: `span ${spanFor(cols, [1, 3, 2, 3])}`,
              gridRow: "span 1",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "0 14px",
              color: "var(--ink)",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "30px",
                height: "30px",
                flex: "0 0 auto",
                borderRadius: "9px",
                background: `oklch(0.72 0.15 ${hue} / ${light ? 0.14 : 0.2})`,
                color: light ? `oklch(0.52 0.15 ${hue})` : `oklch(0.82 0.13 ${hue})`,
                fontSize: "15px",
                lineHeight: 1,
              }}
            >
              {c.icon ? (
                <span aria-hidden="true">{c.icon}</span>
              ) : (
                <svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d={path} />
                </svg>
              )}
            </span>
            <span style={{ flex: 1, fontSize: "13.5px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {c.name}
            </span>
            <span style={{ fontFamily: mono, fontSize: "10px", color: "var(--ink-5)", whiteSpace: "nowrap" }}>
              {c.games} {c.games === 1 ? "game" : "games"}
            </span>
          </button>
        );
      })}
    </>
  );
}

export function railThumbStyle(g: Game): CSSProperties {
  return {
    backgroundImage: `url("${isPortrait(g) ? poster(g, 240) : art(g, 320)}")`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundColor: "var(--panel)",
    position: "relative",
    width: "100%",
    height: "100%",
    borderRadius: "5px",
    overflow: "hidden",
  };
}

export function RailRow({ game, queueNo, active }: { game: Game; queueNo?: string; active?: boolean }) {
  return (
    <Link
      href={game.url}
      className="hb-row"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "6px",
        borderRadius: "8px",
        background: active ? "var(--chip)" : "transparent",
        color: "var(--ink)",
        cursor: "pointer",
        width: "100%",
        transition: "background 120ms ease",
      }}
    >
      <div style={{ width: "100px", height: "58px", flex: "0 0 100px", position: "relative" }}>
        <div style={railThumbStyle(game)}>
          <span
            style={{
              position: "absolute",
              right: "7px",
              bottom: "7px",
              padding: "2px 6px",
              borderRadius: "5px",
              background: "rgba(0,0,0,0.8)",
              fontFamily: mono,
              fontSize: "11px",
              color: "#fff",
            }}
          >
            {game.duration}
          </span>
        </div>
        {queueNo ? (
          <span
            style={{
              position: "absolute",
              left: "5px",
              top: "5px",
              padding: "1px 5px",
              borderRadius: "4px",
              background: "rgba(0,0,0,0.72)",
              fontFamily: mono,
              fontSize: "9.5px",
              color: "#ffffff",
            }}
          >
            {queueNo}
          </span>
        ) : null}
      </div>
      <div style={{ minWidth: 0, flex: 1, textAlign: "left" }}>
        <div
          style={{
            fontSize: "13px",
            fontWeight: 600,
            lineHeight: 1.3,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {game.title}
        </div>
        <div
          style={{
            marginTop: "4px",
            fontFamily: mono,
            fontSize: "10px",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--ink-5)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {game.creator} · {fmt(game.plays)} runs
        </div>
      </div>
    </Link>
  );
}

export function CreatorAvatar({ game, size = 40 }: { game: Game; size?: number }) {
  const box: CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    flex: "0 0 auto",
    borderRadius: "50%",
    overflow: "hidden",
  };
  if (game.creatorAvatar) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatar URLs come from Supabase storage
      <img src={game.creatorAvatar} alt="" style={{ ...box, objectFit: "cover", background: "var(--chip)" }} />
    );
  }
  return (
    <div
      style={{
        ...box,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `linear-gradient(150deg, ${accentOf(game)}, #2a2a2a)`,
        color: "#0f0f0f",
        fontSize: size > 36 ? "13px" : "12px",
        fontWeight: 700,
      }}
    >
      {initialsOf(game.creator)}
    </div>
  );
}
