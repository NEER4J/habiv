import { Suspense } from "react";
import { SavedView } from "@/components/habiv/saved-view";
import { createClient } from "@/lib/supabase/server";
import { loadSaved } from "@/lib/habiv/page-data";
import { getDaily } from "@/lib/db/feed";
import { fromFeedGame } from "@/lib/habiv/games";

export const metadata = { title: "Saved — Habiv" };

export default function SavedPage() {
  return (
    <Suspense fallback={null}>
      <Saved />
    </Suspense>
  );
}

async function Saved() {
  const supabase = await createClient();
  const [games, daily] = await Promise.all([loadSaved(supabase), getDaily()]);
  return <SavedView games={games} daily={daily ? fromFeedGame(daily.game) : null} />;
}
