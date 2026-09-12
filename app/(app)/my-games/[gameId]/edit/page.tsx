import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { GameEditView } from "@/components/habiv/game-edit-view";
import { createClient } from "@/lib/supabase/server";
import { getOwnProfile } from "@/lib/db/profiles";
import { getCategoryCounts } from "@/lib/db/games";
import { loadGameEdit } from "@/lib/habiv/page-data";
import { FormSkeleton } from "@/components/habiv/skeletons";

export const metadata = { title: "Edit game details", robots: { index: false } };

type Params = Promise<{ gameId: string }>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function EditGamePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<FormSkeleton fields={6} />}>
      <EditGame params={params} />
    </Suspense>
  );
}

async function EditGame({ params }: { params: Params }) {
  const { gameId } = await params;
  const supabase = await createClient();
  const [own, categories] = await Promise.all([getOwnProfile(supabase), getCategoryCounts()]);
  if (!own) redirect(`/?auth=signin&next=${encodeURIComponent(`/my-games/${gameId}/edit`)}`);
  const data = UUID_RE.test(gameId) ? await loadGameEdit(supabase, own, gameId) : null;
  if (!data) notFound();
  return <GameEditView data={data} categories={categories} />;
}
