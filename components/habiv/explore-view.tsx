"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { loadFeedPage } from "@/lib/actions/feed";
import { packTiles } from "@/lib/habiv/bento";
import { categoryName, type Game } from "@/lib/habiv/games";
import type { ExploreData } from "@/lib/habiv/page-data";
import { bpanel, chipStyle, pill } from "@/lib/habiv/ui";
import { BentoGrid, BentoTile, CategoryCells, ChipCell, EmptyCell, PageHead, SkeletonTile } from "./game-card";
import { useShell } from "./shell-context";

export type ExploreSort = "Trending" | "Newest" | "Most played" | "Quick play";

const SORTS: ExploreSort[] = ["Trending", "Newest", "Most played", "Quick play"];
const SORT_PARAM: Record<ExploreSort, "trending" | "new" | "plays" | "quick"> = {
  Trending: "trending",
  Newest: "new",
  "Most played": "plays",
  "Quick play": "quick",
};
const PAGE = 24;

/** Grid slots for tiles that have not arrived yet; only the spans are read. */
function skeletonSlots(n: number, cols: number, startRow: number) {
  return packTiles(Array.from({ length: n }, () => null as unknown as Game), cols, startRow).tiles;
}

export function ExploreView({ data, initialSort, initialCategory }: { data: ExploreData; initialSort: ExploreSort; initialCategory: string | null }) {
  const { cols } = useShell();
  const router = useRouter();
  const initialChip = initialCategory ? (data.categories.find((c) => c.slug === initialCategory)?.name ?? categoryName(initialCategory)) : "All";
  const [sort, setSort] = useState<ExploreSort>(initialSort);
  const [chip, setChip] = useState(initialChip);
  const [items, setItems] = useState<Game[]>(data.feed.items);
  const [nextOffset, setNextOffset] = useState<number | null>(data.feed.nextOffset);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Bumped on every filter change so a stale page cannot land in the new list.
  const reqRef = useRef(0);
  const firstRender = useRef(true);

  // Filters drive the URL (shareable) and refetch the first page.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const req = ++reqRef.current;
    const category = chip === "All" ? null : chip.toLowerCase();
    const params = new URLSearchParams();
    if (sort !== "Newest") params.set("sort", sort);
    if (category) params.set("category", category);
    const qs = params.toString();
    router.replace(qs ? `/explore?${qs}` : "/explore", { scroll: false });
    setLoading(true);
    setItems([]);
    setNextOffset(null);
    loadFeedPage({ sort: SORT_PARAM[sort], category, offset: 0, limit: PAGE })
      .then((page) => {
        if (req !== reqRef.current) return;
        setItems(page.items);
        setNextOffset(page.nextOffset);
      })
      .catch(() => {
        if (req === reqRef.current) setNextOffset(null);
      })
      .finally(() => {
        if (req === reqRef.current) setLoading(false);
      });
  }, [sort, chip, router]);

  const loadMore = () => {
    if (loading || loadingMore || nextOffset == null) return;
    const req = reqRef.current;
    setLoadingMore(true);
    loadFeedPage({ sort: SORT_PARAM[sort], category: chip === "All" ? null : chip.toLowerCase(), offset: nextOffset, limit: PAGE })
      .then((page) => {
        if (req !== reqRef.current) return;
        setItems((prev) => prev.concat(page.items));
        setNextOffset(page.nextOffset);
      })
      .catch(() => {
        if (req === reqRef.current) setNextOffset(null);
      })
      .finally(() => {
        if (req === reqRef.current) setLoadingMore(false);
      });
  };

  const trending = sort === "Trending";
  const packed = packTiles(items, cols, 0);
  const skeletons = loading ? skeletonSlots(cols === 2 ? 4 : 8, cols, 0) : loadingMore ? skeletonSlots(cols === 2 ? 2 : 4, cols, packed.next) : [];
  const done = nextOffset == null && !loading && !loadingMore;

  return (
    <BentoGrid>
      <PageHead
        title={trending ? "Trending" : chip === "All" ? "Explore" : chip}
        sub={trending ? "Most activity in the last 24 hours." : "Every game runs in the browser. Filter by category, model or length."}
      />
      <CategoryCells categories={data.categories} onPick={(name) => setChip((cur) => (cur === name ? "All" : name))} />
      <ChipCell>
        {SORTS.map((l) => (
          <button key={l} onClick={() => setSort(l)} style={chipStyle(sort === l)}>
            {l}
          </button>
        ))}
        {chip !== "All" ? (
          <button onClick={() => setChip("All")} style={chipStyle(true)} aria-label={`Clear ${chip} filter`}>
            {chip} ×
          </button>
        ) : null}
      </ChipCell>
      {packed.tiles.map((t, i) => (
        <BentoTile key={`${t.game.id}-${i}`} tile={t} cols={cols} />
      ))}
      {skeletons.map((t, i) => (
        <SkeletonTile key={`skeleton-${i}`} c={t.c} r={t.r} />
      ))}
      {done && !items.length ? (
        <EmptyCell>
          <div style={{ fontSize: "17px", fontWeight: 600 }}>{chip === "All" ? "Nothing here yet" : `No ${chip} games yet`}</div>
          <div style={{ marginTop: "8px", fontSize: "14px", color: "var(--ink-4)", maxWidth: "44ch" }}>
            {trending ? "Nothing has picked up activity in the last day." : "Try another category or sort, or publish the first one."}
          </div>
        </EmptyCell>
      ) : null}
      {items.length ? (
        <div style={{ ...bpanel, gridColumn: "1 / -1", gridRow: "span 1", display: "flex", justifyContent: "center", alignItems: "center" }}>
          <button onClick={loadMore} disabled={loadingMore || nextOffset == null} style={{ ...pill(), opacity: loadingMore ? 0.6 : 1 }}>
            {done ? "That is everything for now" : loadingMore ? "Loading more games…" : "Load more"}
          </button>
        </div>
      ) : null}
    </BentoGrid>
  );
}
