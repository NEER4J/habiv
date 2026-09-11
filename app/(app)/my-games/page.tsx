import { Suspense } from "react";
import { redirect } from "next/navigation";
import { MyGamesView } from "@/components/habiv/my-games-view";
import { createClient } from "@/lib/supabase/server";
import { getOwnProfile } from "@/lib/db/profiles";
import { loadMyGames } from "@/lib/habiv/page-data";

export const metadata = { title: "My games — Habiv" };

export default function MyGamesPage() {
  return (
    <Suspense fallback={null}>
      <MyGames />
    </Suspense>
  );
}

async function MyGames() {
  const supabase = await createClient();
  const own = await getOwnProfile(supabase);
  if (!own) redirect("/?auth=signin&next=%2Fmy-games");
  const data = await loadMyGames(supabase, own);
  return <MyGamesView data={data} />;
}
