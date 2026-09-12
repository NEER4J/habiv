import { Suspense } from "react";
import type { Metadata } from "next";
import { HomeView } from "@/components/habiv/home-view";
import { JsonLd } from "@/components/seo/json-ld";
import { loadHome } from "@/lib/habiv/page-data";
import { HomeSkeleton } from "@/components/habiv/skeletons";
import { absoluteUrl, ogBase, organizationLd, siteTitle, websiteLd } from "@/lib/seo";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: siteTitle },
  alternates: { canonical: "/" },
  openGraph: { ...ogBase, title: siteTitle, url: "/" },
};

export default function HomePage() {
  return (
    <>
      {/* The bento grid has no visible page title; this gives the page its heading for search and screen readers. */}
      <h1 className="sr-only">Habiv: play tiny AI-made games free in your browser</h1>
      <Suspense fallback={<HomeSkeleton />}>
        <Home />
      </Suspense>
    </>
  );
}

async function Home() {
  const data = await loadHome();
  // The games a visitor sees first, de-duplicated, as an ItemList for search engines.
  const seen = new Set<string>();
  const listed = [...(data.hero ? [data.hero] : []), ...data.featured, ...data.sections.flatMap((s) => s.games)].filter((g) => !seen.has(g.id) && seen.add(g.id)).slice(0, 20);
  return (
    <>
      <JsonLd
        data={[
          websiteLd,
          organizationLd,
          {
            "@type": "CollectionPage",
            "@id": `${siteUrl}/#home`,
            url: `${siteUrl}/`,
            name: siteTitle,
            isPartOf: { "@id": `${siteUrl}/#website` },
            mainEntity: {
              "@type": "ItemList",
              itemListElement: listed.map((g, i) => ({ "@type": "ListItem", position: i + 1, url: absoluteUrl(g.url), name: g.title })),
            },
          },
        ]}
      />
      <HomeView data={data} />
    </>
  );
}
