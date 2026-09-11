import { Suspense } from "react";
import { redirect } from "next/navigation";
import { OnboardingView } from "@/components/habiv/onboarding-view";
import { createClient } from "@/lib/supabase/server";
import { getOwnProfile } from "@/lib/db/profiles";
import { safeNextPath } from "@/lib/auth/post-sign-in";

export const metadata = { title: "Welcome — Habiv" };

type SearchParams = Promise<{ step?: string; next?: string; suggest?: string }>;

export default function OnboardingPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={null}>
      <Onboarding searchParams={searchParams} />
    </Suspense>
  );
}

async function Onboarding({ searchParams }: { searchParams: SearchParams }) {
  const { step, next, suggest } = await searchParams;
  const target = safeNextPath(next);
  const supabase = await createClient();
  const own = await getOwnProfile(supabase);
  if (!own) redirect(`/?auth=signin&next=${encodeURIComponent(`/onboarding?next=${target}`)}`);
  if (own.handleSet && step !== "avatar") redirect(target);
  return <OnboardingView key={step ?? "start"} initialStep={step} next={target} suggested={suggest ?? ""} />;
}
