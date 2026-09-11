import { Suspense } from "react";
import { redirect } from "next/navigation";
import { SettingsView } from "@/components/habiv/settings-view";
import { createClient } from "@/lib/supabase/server";
import { getOwnProfile } from "@/lib/db/profiles";
import { loadSettings } from "@/lib/habiv/page-data";

export const metadata = { title: "Settings — Habiv" };

type SearchParams = Promise<{ tab?: string }>;

export default function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={null}>
      <Settings searchParams={searchParams} />
    </Suspense>
  );
}

async function Settings({ searchParams }: { searchParams: SearchParams }) {
  const { tab } = await searchParams;
  const supabase = await createClient();
  const own = await getOwnProfile(supabase);
  if (!own) redirect("/?auth=signin&next=%2Fsettings");
  const data = await loadSettings(supabase, own);
  return <SettingsView key={tab ?? "account"} initialTab={tab} data={data} />;
}
