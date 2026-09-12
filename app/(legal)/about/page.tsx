import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Mail } from "@/components/habiv/legal-page";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbLd, organizationLd, siteDescription } from "@/lib/seo";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description: "Habiv is a home for tiny games made with AI. Play free in your browser, remix what you like, and publish from Claude Code, Codex or any MCP-ready agent.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <LegalPage path="/about" title="A home for tiny games." intro={siteDescription} showUpdated={false}>
      <JsonLd
        data={[
          { "@type": "AboutPage", "@id": `${siteUrl}/about`, url: `${siteUrl}/about`, name: "About Habiv", about: { "@id": `${siteUrl}/#organization` } },
          organizationLd,
          breadcrumbLd([
            ["Home", "/"],
            ["About", "/about"],
          ]),
        ]}
      />
      <h2>What Habiv is</h2>
      <p>
        Habiv is a browser-first place to find, play and share small games, most of them made with AI models in an afternoon or less. A run lasts
        anywhere from ten seconds to a few minutes. There&apos;s nothing to download and no account needed to play. Open a link and you&apos;re in.
      </p>

      <h2>Play</h2>
      <p>
        Browse the <Link href="/">home feed</Link> or <Link href="/explore">explore</Link> by category: arcade, puzzle, reaction, rhythm, racing, cozy,
        horror and more. Every game has a daily leaderboard, and there&apos;s a daily challenge on the home page. Save the games you love and follow the
        creators who make them.
      </p>

      <h2>Remix</h2>
      <p>
        Creators can open their games to remix. If you like how something plays, fork it, change it and publish your version. Habiv credits the
        original automatically, so ideas can travel without losing where they came from.
      </p>

      <h2>Publish</h2>
      <p>
        Upload a finished game as a single HTML file or a zip, or <Link href="/publish">publish from the web</Link>. You can also connect Claude Code,
        Codex or any MCP-ready agent and ship straight from your terminal: the agent uploads the build, Habiv checks and converts it, and your game
        gets a page at <code>habiv.com/@you/your-game</code> with stats, comments and a leaderboard.
      </p>

      <h2>Safe by design</h2>
      <p>
        Every game runs in a sandboxed frame on its own domain, with no access to your Habiv account, and uploads are checked automatically before
        they go public. Read the <Link href="/guidelines">Community Guidelines</Link> to see what&apos;s allowed.
      </p>

      <h2>Contact</h2>
      <p>
        Habiv is in beta and we read everything. Ideas, bugs or partnership questions: <Mail subject="Hello" />.
      </p>
    </LegalPage>
  );
}
