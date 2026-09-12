import { Suspense } from "react";
import { SavedView } from "@/components/habiv/saved-view";
import { createClient } from "@/lib/supabase/server";
import { loadSaved } from "@/lib/habiv/page-data";
import { getDaily } from "@/lib/db/feed";
import { fromFeedGame } from "@/lib/habiv/games";
import { GridPageSkeleton } from "@/components/habiv/skeletons";

export const metadata = { title: "Saved", robots: { index: false } };

export default function SavedPage() {
  return (
    <Suspense fallback={<GridPageSkeleton title="Saved" sub="Games you kept for later. Only you can see this list." />}>
      <Saved />
    </Suspense>
  );
}

async function Saved() {
  const supabase = await createClient();
  const [games, daily] = await Promise.all([loadSaved(supabase), getDaily()]);
  return <SavedView games={games} daily={daily ? fromFeedGame(daily.game) : null} />;
}
