import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { handleFromRouteParam } from "@/lib/handles";
import { resolveHandle } from "@/lib/db/profiles";
import { getCreatorGames } from "@/lib/db/games";
import { loadProfile, type ProfileData } from "@/lib/habiv/page-data";
import { absoluteUrl, breadcrumbLd, clip, ogBase } from "@/lib/seo";
import { JsonLd } from "@/components/seo/json-ld";
import { ProfileView } from "@/components/habiv/profile-view";
import { ProfileSkeleton } from "@/components/habiv/skeletons";

type Params = Promise<{ handle: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const handle = handleFromRouteParam((await params).handle);
  // Any unknown top-level path lands here; its 404 is streamed with status 200, so say noindex.
  if (!handle) return { title: "Page not found", robots: { index: false, follow: true } };
  const resolved = await resolveHandle(handle);
  if (resolved.kind === "none") return { title: "Creator not found", robots: { index: false, follow: true } };
  if (resolved.kind !== "found") return {};
  const p = resolved.profile;
  const count = (await getCreatorGames(p.id)).length;
  const games = count ? `${count} tiny game${count === 1 ? "" : "s"}` : "tiny games";
  const title = `${p.displayName} (@${p.handle})`;
  const description = clip(p.bio?.trim() ? `${p.bio.trim()} Play ${games} by @${p.handle} on Habiv.` : `Play ${games} by ${p.displayName} (@${p.handle}) free in your browser on Habiv. No download.`);
  return {
    title,
    description,
    alternates: { canonical: p.url },
    // Profiles without a published game are thin pages; keep them out of the index until they ship one.
    robots: count ? undefined : { index: false, follow: true },
    openGraph: {
      ...ogBase,
      type: "profile",
      username: p.handle,
      title,
      description,
      url: p.url,
      images: p.avatarUrl ? [{ url: p.avatarUrl, width: 256, height: 256, alt: title }] : ogBase.images,
    },
    twitter: p.avatarUrl ? { card: "summary", title, description, images: [p.avatarUrl] } : { card: "summary_large_image", title, description, images: ogBase.images },
  };
}

export default function ProfilePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
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
  return (
    <>
      <JsonLd data={profileLd(data)} />
      <ProfileView data={data} />
    </>
  );
}

function profileLd({ profile: p, games, totals }: ProfileData) {
  const url = absoluteUrl(p.url);
  return [
    {
      "@type": "ProfilePage",
      "@id": url,
      url,
      name: `${p.displayName} (@${p.handle})`,
      dateCreated: p.createdAt,
      mainEntity: {
        "@type": "Person",
        "@id": `${url}#person`,
        name: p.displayName,
        alternateName: `@${p.handle}`,
        description: p.bio ?? undefined,
        image: p.avatarUrl ?? undefined,
        url,
        sameAs: p.links.filter((l) => /^https?:\/\//.test(l)),
        interactionStatistic: [{ "@type": "InteractionCounter", interactionType: "https://schema.org/FollowAction", userInteractionCount: p.followersCount }],
        agentInteractionStatistic: { "@type": "InteractionCounter", interactionType: "https://schema.org/WriteAction", userInteractionCount: totals.published },
      },
      hasPart: games.slice(0, 20).map((g) => ({ "@type": "VideoGame", name: g.title, url: absoluteUrl(g.url) })),
    },
    breadcrumbLd([
      ["Home", "/"],
      [`@${p.handle}`, p.url],
    ]),
  ];
}
