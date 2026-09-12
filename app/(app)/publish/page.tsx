import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PublishView } from "@/components/habiv/publish-view";
import { createClient } from "@/lib/supabase/server";
import { getOwnProfile } from "@/lib/db/profiles";
import { getCategoryCounts } from "@/lib/db/games";
import { loadGameEdit } from "@/lib/habiv/page-data";
import { FormSkeleton } from "@/components/habiv/skeletons";

export const metadata = { title: "Publish a game", robots: { index: false } };

type SearchParams = Promise<{ game?: string }>;

export default function PublishPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<FormSkeleton fields={4} />}>
      <Publish searchParams={searchParams} />
    </Suspense>
  );
}

async function Publish({ searchParams }: { searchParams: SearchParams }) {
  const { game } = await searchParams;
  const supabase = await createClient();
  const [own, categories] = await Promise.all([getOwnProfile(supabase), getCategoryCounts()]);
  if (!own) redirect("/?auth=signin&next=%2Fpublish");
  // A new version starts from the game's current details, so publishing it does not blank them.
  const existing = game && /^[0-9a-f-]{36}$/i.test(game) ? await loadGameEdit(supabase, own, game) : null;
  return <PublishView categories={categories} existingGame={existing} handle={own.handle} />;
}
