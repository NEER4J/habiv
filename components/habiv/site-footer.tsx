import Link from "next/link";
import { legalPages } from "@/lib/legal";
import { mono } from "@/lib/habiv/ui";

/** Bottom of every app page: a line about Habiv (plain text for search engines too) and the legal links. */
export function SiteFooter() {
  return (
    <footer style={{ margin: "28px 6px 6px", padding: "18px 4px 8px", borderTop: "1px solid var(--divider)", color: "var(--ink-5)" }}>
      <p style={{ margin: 0, maxWidth: "70ch", fontSize: "13px", lineHeight: 1.6 }}>
        Habiv is a home for tiny games made with AI. Play free in your browser with no download, remix what you like, and publish your own from
        Claude Code, Codex or any MCP-ready agent.
      </p>
      <nav aria-label="Footer" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 16px", marginTop: "12px", fontSize: "12.5px" }}>
        <Link href="/explore" style={{ color: "var(--ink-4)" }}>
          Explore
        </Link>
        <Link href="/publish" style={{ color: "var(--ink-4)" }}>
          Publish a game
        </Link>
        {legalPages.map((p) => (
          <Link key={p.href} href={p.href} style={{ color: "var(--ink-4)" }}>
            {p.label}
          </Link>
        ))}
        <span style={{ fontFamily: mono, fontSize: "11px", color: "var(--ink-6)" }}>© Habiv</span>
      </nav>
    </footer>
  );
}
