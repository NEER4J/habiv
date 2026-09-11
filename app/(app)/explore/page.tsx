import { Suspense } from "react";
import { ExploreView, type ExploreSort } from "@/components/habiv/explore-view";
import { loadExplore } from "@/lib/habiv/page-data";

export const metadata = { title: "Explore — Habiv" };

type SearchParams = Promise<{ sort?: string; category?: string }>;
const SORTS: Record<string, "trending" | "new" | "plays" | "quick"> = { Trending: "trending", Newest: "new", "Most played": "plays", "Quick play": "quick" };

export default function ExplorePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={null}>
      <Explore searchParams={searchParams} />
    </Suspense>
  );
}

async function Explore({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const initialSort = (Object.keys(SORTS).find((k) => k.toLowerCase() === (sp.sort ?? "").toLowerCase()) ?? "Newest") as ExploreSort;
  const category = sp.category?.toLowerCase() ?? null;
  const data = await loadExplore(SORTS[initialSort], category);
  return <ExploreView data={data} initialSort={initialSort} initialCategory={category} />;
}
