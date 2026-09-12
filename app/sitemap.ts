import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
import { docsPages } from "@/lib/docs";
import { legalPages } from "@/lib/legal";
import { getCategoryCounts } from "@/lib/db/games";
import { getSitemapEntries } from "@/lib/db/sitemap";

/** Home, explore and its category views, the about and legal pages, every published game and every creator with one. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ games, creators }, categories] = await Promise.all([getSitemapEntries(), getCategoryCounts()]);
  const latest = games.reduce<string | undefined>((max, g) => (!max || g.updatedAt > max ? g.updatedAt : max), undefined);

  return [
    { url: `${siteUrl}/`, lastModified: latest, changeFrequency: "hourly", priority: 1 },
    { url: `${siteUrl}/explore`, lastModified: latest, changeFrequency: "hourly", priority: 0.8 },
    ...categories
      .filter((c) => c.games > 0)
      .map((c) => ({ url: `${siteUrl}/explore?category=${encodeURIComponent(c.slug)}`, changeFrequency: "daily" as const, priority: 0.6 })),
    ...games.map((g) => ({
      url: `${siteUrl}${g.path}`,
      lastModified: g.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
      images: g.image ? [g.image] : undefined,
    })),
    ...creators.map((c) => ({ url: `${siteUrl}${c.path}`, lastModified: c.updatedAt, changeFrequency: "weekly" as const, priority: 0.5 })),
    ...docsPages.map((p) => ({ url: `${siteUrl}${p.href}`, changeFrequency: "monthly" as const, priority: 0.5 })),
    ...legalPages.map((p) => ({ url: `${siteUrl}${p.href}`, changeFrequency: "monthly" as const, priority: p.href === "/about" ? 0.5 : 0.2 })),
  ];
}
