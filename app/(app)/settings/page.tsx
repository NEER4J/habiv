import { Suspense } from "react";
import { redirect } from "next/navigation";
import { SettingsView } from "@/components/habiv/settings-view";
import { FormSkeleton } from "@/components/habiv/skeletons";
import { createClient } from "@/lib/supabase/server";
import { loadSettings } from "@/lib/habiv/page-data";

export const metadata = { title: "Settings", robots: { index: false } };

type SearchParams = Promise<{ tab?: string }>;

export default function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<FormSkeleton title="Settings" sub="Account, publishing access, playback and safety." chips={4} />}>
      <Settings searchParams={searchParams} />
    </Suspense>
  );
}

async function Settings({ searchParams }: { searchParams: SearchParams }) {
  const [{ tab }, supabase] = await Promise.all([searchParams, createClient()]);
  const data = await loadSettings(supabase);
  if (!data) redirect("/?auth=signin&next=%2Fsettings");
  return <SettingsView initialTab={tab} data={data} />;
}
