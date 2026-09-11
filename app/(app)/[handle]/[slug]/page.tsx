import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { handleFromRouteParam } from "@/lib/handles";
import { resolveHandle } from "@/lib/db/profiles";
import { getGameByHandleSlug } from "@/lib/db/games";
import { siteUrl } from "@/lib/site";
import { loadWatch } from "@/lib/habiv/page-data";
import { WatchView } from "@/components/habiv/watch-view";

type Params = Promise<{ handle: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { handle: raw, slug } = await params;
  const handle = handleFromRouteParam(raw);
  if (!handle) return {};
  const game = await getGameByHandleSlug(handle, slug);
  if (!game) return {};
  const title = `${game.title} by @${game.creator.handle} · Habiv`;
  const description = game.tagline ?? `A tiny game by @${game.creator.handle}. Play it in your browser on Habiv.`;
  return {
    title,
    description,
    alternates: { canonical: `${siteUrl}${game.url}` },
    openGraph: { title: game.title, description, type: "website", url: `${siteUrl}${game.url}`, images: game.coverUrl ? [{ url: game.coverUrl, width: 1280, height: 720 }] : undefined },
    twitter: { card: "summary_large_image", title: game.title, description },
  };
}

export default function GamePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <GameContent params={params} />
    </Suspense>
  );
}

async function GameContent({ params }: { params: Params }) {
  const { handle: raw, slug } = await params;
  const handle = handleFromRouteParam(raw);
  if (!handle) notFound();
  const data = await loadWatch(handle, slug);
  if (!data) {
    const resolved = await resolveHandle(handle);
    if (resolved.kind === "redirect") redirect(`/@${resolved.handle}/${slug}`);
    notFound();
  }
  return <WatchView data={data} />;
}
