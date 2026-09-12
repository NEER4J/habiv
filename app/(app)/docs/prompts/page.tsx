import type { Metadata } from "next";
import Link from "next/link";
import { DocsPage, Note } from "@/components/habiv/docs-page";
import { PromptCard } from "@/components/habiv/prompt-card";
import { JsonLd } from "@/components/seo/json-ld";
import { aiPrompts, promptGroups } from "@/lib/ai-prompts";
import { breadcrumbLd } from "@/lib/seo";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "AI prompts",
  description: "Copy-paste prompts for Claude, ChatGPT, Codex or Cursor: build a game from scratch, make an existing game work on Habiv, add a leaderboard and saves, and publish it.",
  alternates: { canonical: "/docs/prompts", types: { "text/markdown": "/docs/prompts.md" } },
};

const toc = [
  { id: "how", label: "How to use them" },
  ...promptGroups.map((g) => ({ id: g.id, label: g.label })),
  { id: "agents", label: "For AI agents" },
];

export default function DocsPromptsPage() {
  return (
    <DocsPage
      path="/docs/prompts"
      title="AI prompts"
      intro="Copy a prompt, paste it into your AI, and it does the work: builds or adapts the game, adds scores and saves, and publishes it to Habiv. Each prompt carries the rules, so your AI doesn't need to read these docs first."
      toc={toc}
    >
      <JsonLd
        data={[
          breadcrumbLd([
            ["Home", "/"],
            ["Docs", "/docs"],
            ["AI prompts", "/docs/prompts"],
          ]),
        ]}
      />

      <h2 id="how">How to use them</h2>
      <ol>
        <li>Pick a prompt below. Fill in the box if it has one, or leave it empty.</li>
        <li>
          Click <strong>Copy prompt</strong> and paste it into Claude, ChatGPT, Codex, Cursor or any other AI.
        </li>
        <li>Answer its questions. When it&apos;s done it gives you the link to your game, or a file to upload.</li>
      </ol>
      <Note>
        <p>
          <strong>You don&apos;t need to connect anything first.</strong> Every prompt checks whether your AI has the <Link href="/docs/mcp">Habiv MCP</Link>.
          If it does, the AI publishes for you and hands you the link. If it doesn&apos;t, it gives you the game file, writes the title and details
          for you to paste, and tells you where to upload it: the <Link href="/publish">publish page</Link> for a new game, or{" "}
          <strong>New version</strong> in <Link href="/my-games">My games</Link> for one that&apos;s already on Habiv.
        </p>
      </Note>

      {promptGroups.map((g) => (
        <div key={g.id}>
          <h2 id={g.id}>{g.label}</h2>
          {aiPrompts
            .filter((p) => p.group === g.id)
            .map((p) => (
              <PromptCard key={p.id} id={p.id} title={p.title} when={p.when} text={p.text} fill={p.fill} />
            ))}
        </div>
      ))}

      <h2 id="agents">For AI agents</h2>
      <p>
        Every prompt on this page, plus the rules they share, is also plain Markdown at <a href="/docs/prompts.md">{`${siteUrl}/docs/prompts.md`}</a>. The
        whole site is mapped for AI tools at <a href="/llms.txt">{`${siteUrl}/llms.txt`}</a>. Crawlers and assistants are welcome to read both.
      </p>
    </DocsPage>
  );
}
