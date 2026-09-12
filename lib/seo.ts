/**
 * Search and social metadata shared by pages, the sitemap and structured data.
 * The titles here are complete; pages under the root layout pass bare titles and get " · Habiv" from the template.
 */
import { siteUrl } from "@/lib/site";

export const siteName = "Habiv";
export const siteTagline = "A home for tiny games.";
export const siteTitle = "Habiv — Play tiny AI-made games in your browser";
export const siteDescription =
  "Habiv is a home for tiny games made with AI. Play free in your browser with no download, climb daily leaderboards, remix what you like and publish your own game straight from Claude Code, Codex or any MCP-ready agent.";
export const siteKeywords = [
  "browser games",
  "free online games",
  "AI games",
  "AI-made games",
  "tiny games",
  "HTML5 games",
  "no download games",
  "indie games",
  "publish games",
  "MCP",
  "Claude Code",
  "Codex",
];

/** Social card used when a page has no image of its own. */
export const defaultOgImage = {
  url: "/assets/tiny-game-hero.png",
  width: 1536,
  height: 1024,
  alt: "A tiny astronaut jumping between floating game platforms toward a glowing star",
};

/** Base Open Graph fields. A page's openGraph replaces the root one wholesale, so pages that set their own spread this first. */
export const ogBase = { siteName, locale: "en_US", type: "website" as const, images: [defaultOgImage] };

export const absoluteUrl =(path: string) => (/^https?:\/\//.test(path) ? path : `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`);

/** Cuts text at a word boundary so it fits a meta description (about 160 characters). */
export function clip(text: string, max = 160): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20)).replace(/[\s,.;:–—-]+$/, "")}…`;
}

/** ISO 8601 duration for schema.org timeRequired; endless games (3600+) have none. */
export function isoDuration(sec: number | null | undefined): string | undefined {
  if (!sec || sec >= 3600) return undefined;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `PT${m ? `${m}M` : ""}${s || !m ? `${s}S` : ""}`;
}

export const organizationLd = {
  "@type": "Organization",
  "@id": `${siteUrl}/#organization`,
  name: siteName,
  url: `${siteUrl}/`,
  logo: { "@type": "ImageObject", url: `${siteUrl}/apple-icon`, width: 180, height: 180 },
};

export const websiteLd = {
  "@type": "WebSite",
  "@id": `${siteUrl}/#website`,
  name: siteName,
  alternateName: "habiv.com",
  url: `${siteUrl}/`,
  description: siteDescription,
  inLanguage: "en",
  publisher: { "@id": `${siteUrl}/#organization` },
};

/** BreadcrumbList from [name, path] pairs, in order from the home page. */
export function breadcrumbLd(items: [name: string, path: string][]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: absoluteUrl(path) })),
  };
}
