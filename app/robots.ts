import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/** Private and signed-in surfaces stay out of search; the pages themselves also send noindex. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/auth/", "/admin", "/mcp/", "/onboarding", "/settings", "/publish", "/my-games", "/saved", "/profile", "/coming-soon", "/*?auth="],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
