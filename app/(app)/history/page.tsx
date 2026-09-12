import { Suspense } from "react";
import { HistoryView, HISTORY_SUB } from "@/components/habiv/history-view";
import { createClient } from "@/lib/supabase/server";
import { loadHistory } from "@/lib/habiv/page-data";
import { HistorySkeleton } from "@/components/habiv/skeletons";

export const metadata = { title: "Play history", robots: { index: false } };

export default function HistoryPage() {
  return (
    <Suspense fallback={<HistorySkeleton sub={HISTORY_SUB} />}>
      <History />
    </Suspense>
  );
}

async function History() {
  const supabase = await createClient();
  return <HistoryView data={await loadHistory(supabase)} />;
}
