"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { loadFeedPage } from "@/lib/actions/feed";
import { spanFor } from "@/lib/habiv/bento";
import { accentOf, art, best, chipsFor, fmt, matchesChip, shortModel, type Game } from "@/lib/habiv/games";
import type { HomeData } from "@/lib/habiv/page-data";
import { bpanel, chipStyle, mono, monoLabel, onArtBtn, pill, primaryBtn } from "@/lib/habiv/ui";
import { ArtFrame, BentoGrid, BentoStack, CategoryCells, GameCard, GameCards, SkeletonCard } from "./game-card";
import { thumbInputForGame } from "./generated-thumb";
import { useShell } from "./shell-context";

function HeroCell({ hero, onHover }: { hero: Game; onHover: (on: boolean) => void }) {
  const { cols, isSaved, toggleSaved, openModal, setModalGameId } = useShell();
  return (
    <div
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={{
        position: "relative",
        gridColumn: `span ${spanFor(cols, [2, 6, 6, 9])}`,
        gridRow: `span ${cols === 2 ? 7 : 9}`,
        borderRadius: "18px",
        overflow: "hidden",
        background: "var(--well)",
        color: "#f5f5f7",
      }}
    >
      <ArtFrame src={art(hero, 1440)} fallback={thumbInputForGame(hero)} fallbackSize={{ w: 1280, h: 720 }} style={{ position: "absolute", inset: 0 }} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(90deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.66) 48%, rgba(0,0,0,0.16) 100%)",
        }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          height: "100%",
          maxWidth: "540px",
          padding: "clamp(18px, 3.2%, 34px)",
        }}
      >
        <div
          style={{
            fontFamily: mono,
            fontSize: "10.5px",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: accentOf(hero, 0.78, 0.15),
          }}
        >
          Featured today
        </div>
        <div style={{ marginTop: "10px", fontSize: "clamp(24px, 3.2vw, 40px)", fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.05 }}>
          {hero.title}
        </div>
        <div style={{ marginTop: "10px", fontSize: "14px", lineHeight: 1.6, color: "rgba(255,255,255,0.86)", maxWidth: "44ch" }}>
          {hero.desc}
        </div>
        <div style={{ marginTop: "12px", fontFamily: mono, fontSize: "11px", color: "rgba(255,255,255,0.72)" }}>
          {hero.creator} · {fmt(hero.plays)} runs · best {best(hero)} · {shortModel(hero.model)}
        </div>
        <div style={{ display: "flex", gap: "8px", marginTop: "16px", flexWrap: "wrap" }}>
          <Link
            href={hero.url}
            style={{ ...pill("primary"), height: "42px", padding: "0 22px", borderRadius: "21px", fontSize: "14px", background: "#ffffff", color: "#0f0f0f" }}
          >
            Play now
          </Link>
          <button onClick={() => toggleSaved(hero.id)} style={onArtBtn}>
            {isSaved(hero.id) ? "Saved" : "Save"}
          </button>
          <button
            onClick={() => {
              setModalGameId(hero.id);
              openModal("remix");
            }}
            style={onArtBtn}
          >
            Remix
          </button>
        </div>
      </div>
    </div>
  );
}

/** How long each featured game holds the hero before the next one takes over. */
const ROTATE_MS = 6000;

function FeaturedQueue({
  featured,
  heroId,
  setHeroId,
  paused,
  setPaused,
}: {
  featured: Game[];
  heroId: string | null;
  setHeroId: (id: string) => void;
  paused: boolean;
  setPaused: (on: boolean) => void;
}) {
  const { cols } = useShell();
  // Reduced motion collapses every animation to ~0ms, which would flip slides every frame, so it gets no rotation.
  const [still, setStill] = useState(true);
  useEffect(() => {
    setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);
  if (!featured.length) return null;

  const advance = () => {
    const i = featured.findIndex((g) => g.id === heroId);
    setHeroId(featured[(i + 1) % featured.length].id);
  };

  return (
    <>
      <div
        style={{
          ...bpanel,
          gridColumn: `span ${spanFor(cols, [2, 6, 2, 3])}`,
          gridRow: "span 1",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "10px",
          padding: "0 14px",
        }}
      >
        <span style={{ ...monoLabel, letterSpacing: "0.14em" }}>Featured queue</span>
        <span style={{ fontFamily: mono, fontSize: "10.5px", color: "var(--ink-6)" }}>{String(featured.length).padStart(2, "0")}</span>
      </div>
      {featured.map((x) => (
        <Link
          key={x.id}
          href={x.url}
          onMouseEnter={() => {
            setHeroId(x.id);
            setPaused(true);
          }}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setHeroId(x.id)}
          className="hb-lift-sm"
          style={{
            ...bpanel,
            position: "relative",
            // Keeps the progress fill (z-index -1) above the card background but under its content.
            isolation: "isolate",
            gridColumn: `span ${spanFor(cols, [1, 2, 2, 3])}`,
            // Phones stack the 16:9 art over the title, which needs the extra row.
            gridRow: `span ${cols === 2 ? 3 : 2}`,
            alignSelf: "stretch",
            display: "flex",
            flexDirection: cols === 2 ? "column" : "row",
            alignItems: cols === 2 ? "stretch" : "center",
            gap: "10px",
            padding: "10px",
            color: "var(--ink)",
            textDecoration: "none",
            textAlign: "left",
            overflow: "hidden",
          }}
        >
          {x.id === heroId && !still && featured.length > 1 ? (
            // Doubles as the rotation timer: when the fill reaches the right edge, the next game takes the hero.
            <span
              aria-hidden
              onAnimationEnd={advance}
              style={{
                position: "absolute",
                inset: 0,
                zIndex: -1,
                background: "var(--chip)",
                pointerEvents: "none",
                transformOrigin: "left",
                animation: `hbProgress ${ROTATE_MS}ms linear forwards`,
                animationPlayState: paused ? "paused" : "running",
              }}
            />
          ) : null}
          <ArtFrame
            src={art(x, 400)}
            fallback={thumbInputForGame(x)}
            fallbackSize={{ w: 1280, h: 720 }}
            style={{ width: cols === 2 ? "100%" : "46%", maxWidth: cols === 2 ? undefined : "186px", aspectRatio: "16 / 9", flex: "0 0 auto", borderRadius: "8px" }}
          >
            <span
              style={{
                position: "absolute",
                right: "4px",
                bottom: "4px",
                padding: "2px 6px",
                borderRadius: "5px",
                background: "rgba(0,0,0,0.72)",
                fontFamily: mono,
                fontSize: "9px",
                color: "#fff",
              }}
            >
              {x.duration}
            </span>
          </ArtFrame>
          <div style={{ minWidth: 0, flex: 1, paddingRight: "4px" }}>
            <div style={{ fontSize: "13.5px", fontWeight: 600, letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {x.title}
            </div>
            <div
              style={{
                marginTop: "3px",
                fontFamily: mono,
                fontSize: "10.5px",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--ink-5)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {x.type} · {x.duration}
            </div>
          </div>
        </Link>
      ))}
    </>
  );
}

/** Live countdown to `resetsAt`, rendered only after mount to avoid a hydration mismatch. */
export function useCountdown(resetsAt: string) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now == null) return null;
  const left = Math.max(0, new Date(resetsAt).getTime() - now);
  return `${String(Math.floor(left / 3600000)).padStart(2, "0")}h ${String(Math.floor(left / 60000) % 60).padStart(2, "0")}m ${String(
    Math.floor(left / 1000) % 60,
  ).padStart(2, "0")}s`;
}

/** The daily challenge and its global board are hidden for now; flip this (and SHOW_DAILY in page-data) to bring them back. */
const SHOW_DAILY = false;

type Daily = NonNullable<HomeData["daily"]>;

function DailyCells({ daily }: { daily: Daily | null }) {
  if (!daily) return <NoDailyCell />;
  return <DailyLive daily={daily} />;
}

function NoDailyCell() {
  const { cols } = useShell();
  return (
    <div
      style={{
        ...bpanel,
        gridColumn: `span ${spanFor(cols, [2, 6, 8, 12])}`,
        gridRow: "span 2",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "0 20px",
      }}
    >
      <span style={{ ...monoLabel, letterSpacing: "0.14em" }}>Daily challenge</span>
      <span style={{ fontSize: "13.5px", color: "var(--ink-4)" }}>No daily challenge yet. Check back once the first games land.</span>
    </div>
  );
}

function DailyLive({ daily }: { daily: Daily }) {
  const { cols, profile } = useShell();
  const countdown = useCountdown(daily.resetsAt) ?? "--h --m --s";
  const game = daily.game;
  const board = daily.board;
  // The day this challenge belongs to: the board's period, else the UTC day that ends at resetsAt.
  const seed = board?.periodStart ?? new Date(new Date(daily.resetsAt).getTime() - 1).toISOString().slice(0, 10);
  const entries = board?.entries ?? [];
  return (
    <>
      <div
        style={{
          ...bpanel,
          gridColumn: `span ${spanFor(cols, [2, 4, 5, 7])}`,
          gridRow: `span ${cols === 2 ? 6 : 4}`,
          padding: "20px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "var(--pos)", animation: "hbBlink 2s ease-in-out infinite" }} />
          <span style={{ ...monoLabel, letterSpacing: "0.14em" }}>Daily challenge · resets in {countdown}</span>
        </div>
        <div style={{ marginTop: "12px", fontSize: "22px", fontWeight: 600, letterSpacing: "-0.02em" }}>{game.title}</div>
        <div style={{ marginTop: "6px", fontSize: "14px", lineHeight: 1.55, color: "var(--ink-4)", maxWidth: "52ch" }}>
          Everyone plays the same seed today. One run counts, no retries on the board.
        </div>
        <div
          style={{
            marginTop: "12px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexWrap: "wrap",
            fontFamily: mono,
            fontSize: "11px",
            color: "var(--ink-5)",
          }}
        >
          <span style={{ padding: "4px 9px", borderRadius: "6px", background: "var(--well)", color: "var(--ink-2)" }}>SEED {seed}</span>
          <span>
            {daily.runsToday.toLocaleString()} {daily.runsToday === 1 ? "run" : "runs"} today
          </span>
          <span>·</span>
          <span>{shortModel(game.model)}</span>
        </div>
        <div style={{ display: "flex", gap: "8px", marginTop: "16px", flexWrap: "wrap" }}>
          <Link href={game.url} style={primaryBtn}>
            Play today&apos;s seed
          </Link>
        </div>
      </div>
      <div
        style={{
          ...bpanel,
          gridColumn: `span ${spanFor(cols, [2, 2, 3, 5])}`,
          gridRow: `span ${cols === 2 ? 5 : 4}`,
          padding: "16px 18px",
        }}
      >
        <div style={monoLabel}>Global board</div>
        <div style={{ marginTop: "10px", display: "flex", flexDirection: "column" }}>
          {entries.length ? (
            entries.map((r) => {
              const you = !!profile.id && r.user?.id === profile.id;
              return (
                <div
                  key={`${r.rank}-${r.playerId}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "8px",
                    borderRadius: "7px",
                    background: you ? "var(--chip)" : "transparent",
                    color: you ? "var(--ink)" : "var(--ink-2)",
                  }}
                >
                  <span style={{ fontFamily: mono, fontSize: "11.5px", color: "var(--ink-5)", width: "26px" }}>{String(r.rank).padStart(2, "0")}</span>
                  <span style={{ flex: 1, fontSize: "13.5px", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.user?.handle ?? "anonymous"}
                  </span>
                  {you ? <span style={{ fontFamily: mono, fontSize: "11px", color: "var(--ink-5)" }}>you</span> : null}
                  <span style={{ fontFamily: mono, fontSize: "13px", minWidth: "62px", textAlign: "right" }}>{r.score.toLocaleString()}</span>
                </div>
              );
            })
          ) : (
            <div style={{ padding: "8px", fontSize: "13px", color: "var(--ink-4)" }}>No scores on the board yet. Yours could be first.</div>
          )}
        </div>
      </div>
    </>
  );
}

function ChipsCell({ chips, chip, setChip }: { chips: string[]; chip: string; setChip: (c: string) => void }) {
  const { light } = useShell();
  const ref = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const measure = () => {
    const el = ref.current;
    if (!el) return;
    setAtStart(el.scrollLeft < 8);
    setAtEnd(el.scrollLeft + el.clientWidth > el.scrollWidth - 8);
  };

  useEffect(() => {
    const t = setTimeout(measure, 60);
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
    };
  }, []);

  const scrollBy = (d: number) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: d * Math.max(200, el.clientWidth * 0.7), behavior: "smooth" });
  };

  const arrow: CSSProperties = {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    background: "var(--chip)",
    color: "var(--ink)",
    fontSize: "17px",
    lineHeight: 1,
    cursor: "pointer",
  };
  const fadeBg = light ? "250,250,252" : "28,29,34";

  return (
    <div style={{ ...bpanel, gridColumn: "1 / -1", gridRow: "span 1", display: "flex", alignItems: "center", padding: "0 12px" }}>
      <div style={{ position: "relative", width: "100%" }}>
        <div
          ref={ref}
          onScroll={measure}
          className="hb-no-scrollbar"
          style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "nowrap", overflowX: "auto", scrollBehavior: "smooth" }}
        >
          {chips.map((c) => (
            <button key={c} onClick={() => setChip(c)} style={chipStyle(chip === c)}>
              {c}
            </button>
          ))}
        </div>
        {!atStart ? (
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              display: "flex",
              alignItems: "center",
              paddingRight: "30px",
              background: `linear-gradient(90deg, rgba(${fadeBg},0.96) 52%, rgba(${fadeBg},0))`,
            }}
          >
            <button onClick={() => scrollBy(-1)} aria-label="Scroll filters left" style={arrow}>
              ‹
            </button>
          </div>
        ) : null}
        {!atEnd ? (
          <div
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              paddingLeft: "30px",
              background: `linear-gradient(270deg, rgba(${fadeBg},0.96) 52%, rgba(${fadeBg},0))`,
            }}
          >
            <button onClick={() => scrollBy(1)} aria-label="Scroll filters right" style={arrow}>
              ›
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SectionHeader({ title, note }: { title: string; note: string }) {
  return (
    <div
      style={{
        ...bpanel,
        gridColumn: "1 / -1",
        gridRow: "span 1",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "0 18px",
      }}
    >
      <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 600, letterSpacing: "-0.015em" }}>{title}</h2>
      <span style={{ fontFamily: mono, fontSize: "10.5px", color: "var(--ink-5)" }}>{note}</span>
    </div>
  );
}

const FEED_PAGE = 12;

/** Chips that are not categories are applied on the client after the page arrives. */
const feedCategory = (chip: string) => (chip === "All" || chip === "Under 50 KB" ? null : chip);

export function HomeView({ data }: { data: HomeData }) {
  const { cols } = useShell();
  const [heroId, setHeroId] = useState<string | null>(data.hero?.id ?? null);
  // Rotation holds while the pointer rests on the hero or the queue.
  const [paused, setPaused] = useState(false);
  const [chip, setChip] = useState("All");
  const [items, setItems] = useState<Game[]>(data.feed.items);
  const [nextOffset, setNextOffset] = useState<number | null>(data.feed.nextOffset);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  // Refs keep the observer callback stable and stop overlapping page loads.
  const loadingRef = useRef(false);
  const offsetRef = useRef<number | null>(data.feed.nextOffset);
  const chipRef = useRef(chip);
  // Bumped on every chip change so a page from an old filter cannot land in the new list.
  const reqRef = useRef(0);

  const hero = data.featured.find((g) => g.id === heroId) ?? data.hero;

  const loadMore = useCallback(() => {
    const offset = offsetRef.current;
    if (loadingRef.current || offset == null) return;
    loadingRef.current = true;
    setLoadingMore(true);
    const req = reqRef.current;
    const current = chipRef.current;
    loadFeedPage({ sort: "new", category: feedCategory(current), offset, limit: FEED_PAGE })
      .then((page) => {
        if (req !== reqRef.current) return;
        setItems((prev) => prev.concat(page.items));
        offsetRef.current = page.nextOffset;
        setNextOffset(page.nextOffset);
      })
      .catch(() => {
        if (req === reqRef.current) setNextOffset(null);
      })
      .finally(() => {
        if (req !== reqRef.current) return;
        loadingRef.current = false;
        setLoadingMore(false);
      });
  }, []);

  // Load the next page before the end of the feed scrolls into view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) loadMore();
    }, { rootMargin: "0px 0px 900px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  // The observer only fires on changes; if the end is still close after a page lands, keep going.
  useEffect(() => {
    if (loadingMore || nextOffset == null) return;
    const el = sentinel.current;
    if (el && el.getBoundingClientRect().top < window.innerHeight + 900) loadMore();
  }, [items, loadingMore, nextOffset, loadMore]);

  const pick = (c: string) => {
    if (c === chipRef.current) return;
    reqRef.current += 1;
    const req = reqRef.current;
    chipRef.current = c;
    setChip(c);
    setItems([]);
    setNextOffset(null);
    offsetRef.current = null;
    loadingRef.current = true;
    setLoadingMore(true);
    loadFeedPage({ sort: "new", category: feedCategory(c), offset: 0, limit: FEED_PAGE })
      .then((page) => {
        if (req !== reqRef.current) return;
        setItems(page.items);
        offsetRef.current = page.nextOffset;
        setNextOffset(page.nextOffset);
      })
      .catch(() => {
        if (req === reqRef.current) setNextOffset(null);
      })
      .finally(() => {
        if (req !== reqRef.current) return;
        loadingRef.current = false;
        setLoadingMore(false);
      });
  };

  const visible = items.filter((g) => matchesChip(g, chip));
  const done = nextOffset == null && !loadingMore;

  return (
    <BentoStack>
      <BentoGrid>
        {hero ? (
          <HeroCell hero={hero} onHover={setPaused} />
        ) : (
          <div
            style={{
              ...bpanel,
              gridColumn: `span ${spanFor(cols, [2, 6, 6, 9])}`,
              gridRow: `span ${cols === 2 ? 4 : 5}`,
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
              padding: "clamp(18px, 3.2%, 34px)",
            }}
          >
            <div style={{ ...monoLabel, letterSpacing: "0.16em" }}>Featured today</div>
            <div style={{ marginTop: "10px", fontSize: "clamp(22px, 3vw, 34px)", fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.05 }}>
              Nothing published yet
            </div>
            <div style={{ marginTop: "10px", fontSize: "14px", lineHeight: 1.6, color: "var(--ink-4)", maxWidth: "44ch" }}>
              The first game to land on Habiv takes this spot.
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
              <Link href="/publish" style={primaryBtn}>
                Publish a game
              </Link>
            </div>
          </div>
        )}
        <FeaturedQueue featured={data.featured} heroId={hero?.id ?? null} setHeroId={setHeroId} paused={paused} setPaused={setPaused} />
        <CategoryCells categories={data.categories} />
        {SHOW_DAILY ? <DailyCells daily={data.daily} /> : null}
        <ChipsCell chips={chipsFor(data.categories)} chip={chip} setChip={pick} />
      </BentoGrid>

      {data.sections
        .filter((sec) => sec.games.length > 0)
        .map((sec) => (
          <SectionBlock key={sec.key} title={sec.title} note={sec.note}>
            {sec.games.map((g) => (
              <GameCard key={`${sec.key}-${g.id}`} game={g} />
            ))}
          </SectionBlock>
        ))}

      <BentoGrid>
        <SectionHeader title={chip === "All" ? "Keep discovering" : `${chip} games`} note="keeps loading as you scroll" />
      </BentoGrid>
      {visible.length || loadingMore ? (
        <GameCards>
          {visible.map((g, i) => (
            <GameCard key={`feed-${g.id}-${i}`} game={g} />
          ))}
          {/* While a page loads, its cards render as skeletons in the same spots. */}
          {loadingMore ? Array.from({ length: FEED_PAGE }, (_, i) => <SkeletonCard key={`skeleton-${i}`} />) : null}
        </GameCards>
      ) : null}
      <BentoGrid>
        {done && !visible.length ? (
          <div style={{ ...bpanel, gridColumn: "1 / -1", gridRow: "span 3", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-4)", fontSize: "14px" }}>
            {chip === "All" ? "No games published yet." : `No ${chip} games yet.`}
          </div>
        ) : null}

        <div
          ref={sentinel}
          style={{ ...bpanel, gridColumn: "1 / -1", gridRow: "span 1", display: "flex", justifyContent: "center", alignItems: "center" }}
        >
          <button onClick={loadMore} disabled={loadingMore || nextOffset == null} style={{ ...pill(), opacity: loadingMore ? 0.6 : 1 }}>
            {done ? "That is everything for now" : loadingMore ? "Loading more games…" : "Load more"}
          </button>
        </div>
      </BentoGrid>
    </BentoStack>
  );
}

function SectionBlock({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <>
      <BentoGrid>
        <SectionHeader title={title} note={note} />
      </BentoGrid>
      <GameCards>{children}</GameCards>
    </>
  );
}
