import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PublishView } from "@/components/habiv/publish-view";
import { createClient } from "@/lib/supabase/server";
import { getOwnProfile } from "@/lib/db/profiles";
import { getCategoryCounts } from "@/lib/db/games";

export const metadata = { title: "Publish — Habiv" };

type SearchParams = Promise<{ game?: string }>;

export default function PublishPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={null}>
      <Publish searchParams={searchParams} />
    </Suspense>
  );
}

async function Publish({ searchParams }: { searchParams: SearchParams }) {
  const { game } = await searchParams;
  const supabase = await createClient();
  const [own, categories] = await Promise.all([getOwnProfile(supabase), getCategoryCounts()]);
  if (!own) redirect("/?auth=signin&next=%2Fpublish");
  let existing: { id: string; title: string } | null = null;
  if (game) {
    const { data } = await supabase.from("games").select("id, title").eq("id", game).eq("creator_id", own.id).maybeSingle();
    existing = data ?? null;
  }
  return <PublishView categories={categories} existingGame={existing} handle={own.handle} />;
}
