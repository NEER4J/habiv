"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadFeedPage } from "@/lib/actions/feed";
import { agentFilterOptions, filterLabel, modelFilterOptions } from "@/lib/ai/catalog";
import { categoryName, type Game } from "@/lib/habiv/games";
import type { ExploreData } from "@/lib/habiv/page-data";
import { bpanel, chipStyle, pill } from "@/lib/habiv/ui";
import { CatalogFilterChip } from "./catalog-picker";
import { BentoGrid, BentoStack, CategoryCells, ChipCell, EmptyCell, GameCard, GameCards, PageHead, SkeletonCard } from "./game-card";
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

export function ExploreView({
  data,
  initialSort,
  initialCategory,
  initialModel,
  initialTool,
}: {
  data: ExploreData;
  initialSort: ExploreSort;
  initialCategory: string | null;
  initialModel: string | null;
  initialTool: string | null;
}) {
  const { cols } = useShell();
  const router = useRouter();
  const initialChip = initialCategory ? (data.categories.find((c) => c.slug === initialCategory)?.name ?? categoryName(initialCategory)) : "All";
  const [sort, setSort] = useState<ExploreSort>(initialSort);
  const [chip, setChip] = useState(initialChip);
  const [model, setModel] = useState<string | null>(initialModel);
  const [tool, setTool] = useState<string | null>(initialTool);
  const [items, setItems] = useState<Game[]>(data.feed.items);
  const [nextOffset, setNextOffset] = useState<number | null>(data.feed.nextOffset);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Bumped on every filter change so a stale page cannot land in the new list.
  const reqRef = useRef(0);
  const firstRender = useRef(true);

  const modelOptions = useMemo(() => modelFilterOptions(data.builtWith.models), [data.builtWith.models]);
  const toolOptions = useMemo(() => agentFilterOptions(data.builtWith.agents), [data.builtWith.agents]);
  const category = chip === "All" ? null : chip.toLowerCase();

  // Filters drive the URL (shareable) and refetch the first page.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const req = ++reqRef.current;
    const params = new URLSearchParams();
    if (sort !== "Newest") params.set("sort", sort);
    if (category) params.set("category", category);
    if (model) params.set("model", model);
    if (tool) params.set("tool", tool);
    const qs = params.toString();
    router.replace(qs ? `/explore?${qs}` : "/explore", { scroll: false });
    setLoading(true);
    setItems([]);
    setNextOffset(null);
    loadFeedPage({ sort: SORT_PARAM[sort], category, model, agent: tool, offset: 0, limit: PAGE })
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
  }, [sort, category, model, tool, router]);

  const loadMore = () => {
    if (loading || loadingMore || nextOffset == null) return;
    const req = reqRef.current;
    setLoadingMore(true);
    loadFeedPage({ sort: SORT_PARAM[sort], category, model, agent: tool, offset: nextOffset, limit: PAGE })
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
  const builtWith = [model ? filterLabel(model) : null, tool].filter(Boolean).join(" · ");
  const filtered = chip !== "All" || !!builtWith;
  const skeletons = loading ? (cols === 2 ? 4 : 8) : loadingMore ? (cols === 2 ? 2 : 4) : 0;
  const done = nextOffset == null && !loading && !loadingMore;

  return (
    <BentoStack>
      <BentoGrid>
        <PageHead
          title={trending ? "Trending" : chip === "All" ? "Explore" : chip}
          sub={
            builtWith
              ? `Built with ${builtWith}.`
              : trending
                ? "Most activity in the last 24 hours."
                : "Every game runs in the browser. Filter by category, model, tool or length."
          }
        />
        <CategoryCells categories={data.categories} onPick={(name) => setChip((cur) => (cur === name ? "All" : name))} />
        <ChipCell>
          {SORTS.map((l) => (
            <button key={l} onClick={() => setSort(l)} style={chipStyle(sort === l)}>
              {l}
            </button>
          ))}
          <span aria-hidden style={{ flex: "0 0 1px", height: "18px", background: "var(--chip-2)", margin: "0 4px" }} />
          <CatalogFilterChip label="Model" options={modelOptions} value={model} onChange={setModel} />
          <CatalogFilterChip label="Tool" options={toolOptions} value={tool} onChange={setTool} />
          {chip !== "All" ? (
            <button onClick={() => setChip("All")} style={chipStyle(true)} aria-label={`Clear ${chip} filter`}>
              {chip} ×
            </button>
          ) : null}
          {filtered && (model || tool) ? (
            <button
              onClick={() => {
                setChip("All");
                setModel(null);
                setTool(null);
              }}
              style={{ ...chipStyle(false), background: "transparent" }}
            >
              Clear filters
            </button>
          ) : null}
        </ChipCell>
      </BentoGrid>
      {items.length || skeletons ? (
        <GameCards>
          {items.map((g, i) => (
            <GameCard key={`${g.id}-${i}`} game={g} />
          ))}
          {Array.from({ length: skeletons }, (_, i) => (
            <SkeletonCard key={`skeleton-${i}`} />
          ))}
        </GameCards>
      ) : null}
      {items.length || done ? (
        <BentoGrid>
          {done && !items.length ? (
            <EmptyCell>
              <div style={{ fontSize: "17px", fontWeight: 600 }}>
                {builtWith ? "No games match these filters" : chip === "All" ? "Nothing here yet" : `No ${chip} games yet`}
              </div>
              <div style={{ marginTop: "8px", fontSize: "14px", color: "var(--ink-4)", maxWidth: "44ch" }}>
                {trending ? "Nothing has picked up activity in the last day." : filtered ? "Try another category, model, tool or sort, or publish the first one." : "Publish the first one."}
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
      ) : null}
    </BentoStack>
  );
}
