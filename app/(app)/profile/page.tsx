import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnProfile } from "@/lib/db/profiles";
import { welcomePath } from "@/lib/auth/protected";
import { ProfileSkeleton } from "@/components/habiv/skeletons";

export const metadata = { title: "Profile", robots: { index: false } };

/** /profile is the signed-in user's own page; it lives at /@handle. */
export default function ProfilePage() {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <Me />
    </Suspense>
  );
}

async function Me() {
  const supabase = await createClient();
  const own = await getOwnProfile(supabase);
  if (!own) redirect("/?auth=signin&next=%2Fprofile");
  if (!own.handleSet) redirect(welcomePath("/profile"));
  redirect(`/@${own.handle}`);
  return null;
}
