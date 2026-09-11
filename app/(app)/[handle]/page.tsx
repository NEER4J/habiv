import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { handleFromRouteParam } from "@/lib/handles";
import { resolveHandle } from "@/lib/db/profiles";
import { loadProfile } from "@/lib/habiv/page-data";
import { ProfileView } from "@/components/habiv/profile-view";

type Params = Promise<{ handle: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const handle = handleFromRouteParam((await params).handle);
  if (!handle) return {};
  const resolved = await resolveHandle(handle);
  if (resolved.kind !== "found") return {};
  const p = resolved.profile;
  return {
    title: `${p.displayName} (@${p.handle}) · Habiv`,
    description: p.bio ?? `Tiny games by @${p.handle} on Habiv.`,
    alternates: { canonical: p.url },
    openGraph: { title: `${p.displayName} (@${p.handle})`, description: p.bio ?? undefined, images: p.avatarUrl ? [p.avatarUrl] : undefined },
  };
}

export default function ProfilePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <ProfileContent params={params} />
    </Suspense>
  );
}

async function ProfileContent({ params }: { params: Params }) {
  const handle = handleFromRouteParam((await params).handle);
  if (!handle) notFound();
  const resolved = await resolveHandle(handle);
  if (resolved.kind === "redirect") redirect(`/@${resolved.handle}`);
  if (resolved.kind === "none") notFound();
  const data = await loadProfile(resolved.profile);
  return <ProfileView data={data} />;
}
