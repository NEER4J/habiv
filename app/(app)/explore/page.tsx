import { Suspense } from "react";
import type { Metadata } from "next";
import { ExploreView, type ExploreSort } from "@/components/habiv/explore-view";
import { loadExplore } from "@/lib/habiv/page-data";
import { getCategoryCounts } from "@/lib/db/games";
import { ogBase } from "@/lib/seo";
import { ExploreSkeleton } from "@/components/habiv/skeletons";

type SearchParams = Promise<{ sort?: string; category?: string; model?: string; tool?: string }>;
const SORTS: Record<string, "trending" | "new" | "plays" | "quick"> = { Trending: "trending", Newest: "new", "Most played": "plays", "Quick play": "quick" };

/** Each category is its own landing page (?category=); sort orders are views of it, so the canonical drops them. */
export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const slug = (await searchParams).category?.toLowerCase();
  if (!slug) {
    return {
      title: "Explore free browser games",
      description: "Browse every tiny game on Habiv by category, popularity or length. Arcade, puzzle, reaction, rhythm, racing, cozy and horror games made with AI. Play free, no download.",
      alternates: { canonical: "/explore" },
      openGraph: { ...ogBase, title: "Explore free browser games", url: "/explore" },
    };
  }
  const category = (await getCategoryCounts()).find((c) => c.slug === slug);
  if (!category) return { title: "Explore", alternates: { canonical: "/explore" }, robots: { index: false, follow: true } };
  const name = category.name;
  const n = category.games;
  const title = `${name} games: play free in your browser`;
  const url = `/explore?category=${encodeURIComponent(slug)}`;
  return {
    title,
    description: `Play ${n ? `${n} ` : ""}free ${name.toLowerCase()} game${n === 1 ? "" : "s"} made with AI on Habiv. Tiny games that run in your browser with no download, daily leaderboards and remixes.`,
    alternates: { canonical: url },
    openGraph: { ...ogBase, title, url },
    robots: category.games ? undefined : { index: false, follow: true },
  };
}

export default function ExplorePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<ExploreSkeleton />}>
      <Explore searchParams={searchParams} />
    </Suspense>
  );
}

async function Explore({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const initialSort = (Object.keys(SORTS).find((k) => k.toLowerCase() === (sp.sort ?? "").toLowerCase()) ?? "Newest") as ExploreSort;
  const category = sp.category?.toLowerCase() ?? null;
  // ?model= is a catalog name or "lab:<id>"; ?tool= a tool name (lib/ai/catalog.ts).
  const model = sp.model?.trim().slice(0, 80) || null;
  const tool = sp.tool?.trim().slice(0, 80) || null;
  const data = await loadExplore(SORTS[initialSort], category, model, tool);
  return <ExploreView data={data} initialSort={initialSort} initialCategory={category} initialModel={model} initialTool={tool} />;
}
