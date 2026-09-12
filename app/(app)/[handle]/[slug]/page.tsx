import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { handleFromRouteParam } from "@/lib/handles";
import { resolveHandle } from "@/lib/db/profiles";
import { getGameByHandleSlug } from "@/lib/db/games";
import { siteUrl } from "@/lib/site";
import { categoryName, type GameFull } from "@/lib/habiv/games";
import { absoluteUrl, breadcrumbLd, clip, isoDuration, organizationLd, siteName } from "@/lib/seo";
import { loadWatch } from "@/lib/habiv/page-data";
import { JsonLd } from "@/components/seo/json-ld";
import { WatchView } from "@/components/habiv/watch-view";
import { WatchSkeleton } from "@/components/habiv/skeletons";

type Params = Promise<{ handle: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { handle: raw, slug } = await params;
  const handle = handleFromRouteParam(raw);
  // The 404 is sent after streaming starts (status 200), so the page itself must say noindex.
  if (!handle) return { title: "Page not found", robots: { index: false, follow: true } };
  const game = await getGameByHandleSlug(handle, slug);
  if (!game) return { title: "Game not found", robots: { index: false, follow: true } };
  const h = game.creator.handle;
  const category = categoryName(game.category);
  const lead = game.tagline?.trim() || (game.description ? clip(game.description, 110) : `${game.title} is a tiny ${category.toLowerCase()} game by @${h}.`);
  const description = clip(`${lead.replace(/[.!?…]?$/, ".")} Play free in your browser on Habiv. No download.`);
  const url = `${siteUrl}${game.url}`;
  // No images: the route's opengraph-image.tsx renders the social card.
  return {
    title: `${game.title}: ${category} game by @${h}`,
    description,
    keywords: [game.title, `${category.toLowerCase()} game`, "browser game", "free online game", "AI game", game.currentVersion?.model, game.currentVersion?.agent].filter((k): k is string => !!k),
    authors: [{ name: game.creator.displayName, url: `${siteUrl}/@${h}` }],
    alternates: { canonical: url },
    openGraph: { siteName, locale: "en_US", type: "website", title: `${game.title} by @${h}`, description, url },
    twitter: { card: "summary_large_image", title: `${game.title} by @${h}`, description },
  };
}

/** `?v=3` plays version 3 instead of the live one (the canonical URL stays the bare game page). */
type SearchParams = Promise<{ v?: string | string[] }>;

export default function GamePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  return (
    <Suspense fallback={<WatchSkeleton />}>
      <GameContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function GameContent({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ handle: raw, slug }, { v }] = await Promise.all([params, searchParams]);
  const handle = handleFromRouteParam(raw);
  if (!handle) notFound();
  const versionNo = typeof v === "string" && /^\d{1,6}$/.test(v) ? Number(v) : null;
  const data = await loadWatch(handle, slug, versionNo);
  if (!data) {
    const resolved = await resolveHandle(handle);
    if (resolved.kind === "redirect") redirect(`/@${resolved.handle}/${slug}${versionNo ? `?v=${versionNo}` : ""}`);
    notFound();
  }
  return (
    <>
      <JsonLd data={gameLd(data.game)} />
      {/* Keyed by version so switching versions starts the player fresh. */}
      <WatchView key={data.game.versionId ?? "none"} data={data} />
    </>
  );
}

/** schema.org VideoGame for the page, plus its breadcrumb and the publisher it references. */
function gameLd(g: GameFull) {
  const url = absoluteUrl(g.url);
  const creatorUrl = absoluteUrl(`/@${g.creator}`);
  const images = [g.coverUrl, g.cardUrl].filter((u): u is string => !!u);
  // A version is built before it is published, so the later of the two is the real last change.
  const modified = [g.versionList[0]?.createdAt, g.publishedAt].filter((d): d is string => !!d).sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  const counter = (type: string, n: number) => ({ "@type": "InteractionCounter", interactionType: `https://schema.org/${type}`, userInteractionCount: n });
  return [
    {
      "@type": "VideoGame",
      "@id": `${url}#game`,
      name: g.title,
      url,
      description: g.description || g.desc || undefined,
      image: images.length ? images : undefined,
      genre: g.type,
      gamePlatform: "Web browser",
      applicationCategory: "GameApplication",
      operatingSystem: "Any (web browser)",
      playMode: "SinglePlayer",
      inLanguage: "en",
      isAccessibleForFree: true,
      datePublished: g.publishedAt ?? undefined,
      dateModified: modified,
      softwareVersion: g.versions ? String(g.versions) : undefined,
      timeRequired: isoDuration(g.durationSec),
      author: { "@type": "Person", name: g.creatorName, alternateName: `@${g.creator}`, url: creatorUrl },
      publisher: { "@id": organizationLd["@id"] },
      isBasedOn: g.remixedFrom ? absoluteUrl(`/@${g.remixedFrom.handle}/${g.remixedFrom.slug}`) : undefined,
      offers: { "@type": "Offer", price: 0, priceCurrency: "USD", availability: "https://schema.org/InStock", url },
      interactionStatistic: [counter("PlayAction", g.plays), counter("LikeAction", g.likes), counter("CommentAction", g.comments)],
    },
    breadcrumbLd([
      ["Home", "/"],
      [`@${g.creator}`, `/@${g.creator}`],
      [g.title, g.url],
    ]),
    organizationLd,
  ];
}
