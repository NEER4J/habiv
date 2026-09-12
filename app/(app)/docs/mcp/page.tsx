import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/habiv/docs-code";
import { DocsPage, Table } from "@/components/habiv/docs-page";
import { JsonLd } from "@/components/seo/json-ld";
import { claudeCodeCommand, codexCommand, connectPrompt, connectSteps, mcpConfig, mcpUrl } from "@/lib/connect-ai";
import { breadcrumbLd } from "@/lib/seo";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "MCP & agents",
  description: "Connect Claude Code, Codex, the Claude app or any MCP client to Habiv, then publish, update and roll back games from a chat.",
  alternates: { canonical: "/docs/mcp" },
};

const toc = [
  { id: "connect", label: "Connect" },
  { id: "ask", label: "Things to ask" },
  { id: "flow", label: "How publishing works" },
  { id: "tools", label: "Tools" },
  { id: "limits", label: "Limits" },
  { id: "tokens", label: "Tokens for scripts" },
  { id: "trouble", label: "Troubleshooting" },
];

const t = (name: string) => <code key={name}>{name}</code>;

export default function DocsMcpPage() {
  return (
    <DocsPage
      path="/docs/mcp"
      title="MCP & agents"
      intro="Connect Claude, Codex or any MCP app to Habiv once. Then ask it in plain words to publish, update or roll back your games, and it hands you the link."
      toc={toc}
    >
      <JsonLd
        data={[
          breadcrumbLd([
            ["Home", "/"],
            ["Docs", "/docs"],
            ["MCP & agents", "/docs/mcp"],
          ]),
        ]}
      />

      <h2 id="connect">Connect</h2>
      <p>
        The quickest way takes about a minute and needs no API key. It&apos;s the same setup as{" "}
        <Link href="/settings?tab=api">Settings → Connect AI</Link>:
      </p>
      <ol>
        {connectSteps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <CodeBlock label="Message to paste into Claude Code or Codex" code={connectPrompt} wrap />
      <p>
        Your agent adds Habiv, starts the sign-in and tells you when to click <strong>Approve</strong>. It then lists your games to check that the
        connection works. From then on, just ask it to &ldquo;publish this game to Habiv&rdquo;.
      </p>

      <h3>Claude app (web or desktop)</h3>
      <p>
        Open <strong>Settings → Connectors → Add custom connector</strong>, name it Habiv and paste this link. Claude asks you to approve on Habiv the
        first time you use it.
      </p>
      <CodeBlock label="Link" code={mcpUrl} />

      <h3>Set it up yourself</h3>
      <p>If you&apos;d rather not paste the message, here are the details:</p>
      <Table
        head={["", ""]}
        rows={[
          ["Server URL", <code key="u">{mcpUrl}</code>],
          ["Transport", "Streamable HTTP"],
          ["Sign-in", "OAuth in your browser, or a personal token"],
        ]}
      />
      <p>
        <strong>Claude Code.</strong> Run this, restart Claude Code, type <code>/mcp</code>, pick <strong>habiv</strong> and choose{" "}
        <strong>Authenticate</strong>. Approve on the Habiv page that opens.
      </p>
      <CodeBlock label="Terminal" code={claudeCodeCommand} />
      <p>
        <strong>Codex.</strong> The login command opens your browser. Approve, then go back to Codex.
      </p>
      <CodeBlock label="Terminal" code={codexCommand} />
      <p>
        <strong>Cursor and other apps.</strong> Add a remote HTTP MCP server. Most apps take a config like this:
      </p>
      <CodeBlock label="JSON" code={mcpConfig} />

      <h2 id="ask">Things to ask</h2>
      <p>Once connected, talk to your agent normally. For example:</p>
      <ul>
        <li>&ldquo;Publish this game to Habiv.&rdquo;</li>
        <li>&ldquo;Publish this as a new version of Drift Dodge. Changelog: faster enemies, fixed the jump.&rdquo;</li>
        <li>&ldquo;Open the code of my game Blink Buffet, make the timer 30 seconds and publish it.&rdquo;</li>
        <li>&ldquo;Roll Drift Dodge back to the previous version.&rdquo;</li>
        <li>&ldquo;Use this image as the cover, and add the tags arcade and one-button.&rdquo;</li>
        <li>&ldquo;Turn on the leaderboard for Drift Dodge, lowest time wins.&rdquo;</li>
        <li>&ldquo;Hide Blink Buffet for now.&rdquo;</li>
      </ul>
      <p>
        If you want scores or levels, ask the agent to add the <Link href="/docs/sdk">Habiv SDK calls</Link> before it publishes. Pointing it at{" "}
        <code>{siteUrl}/docs/sdk</code> is enough.
      </p>

      <h2 id="flow">How publishing works</h2>
      <ol>
        <li>
          The agent calls {t("publish_game")} with the game&apos;s files, a title and the details it knows: tagline, description, categories, controls, the
          model and tool that made it. It also writes them into a <Link href="/docs/details">habiv.json</Link> in the bundle, so they stay with the code.
        </li>
        <li>
          Habiv checks and prepares the build, the same way as a <Link href="/docs#upload">web upload</Link>. The agent polls {t("get_publish_status")}{" "}
          until the status is <code>ready</code>, usually within a minute.
        </li>
        <li>
          The game lands as a private draft in <Link href="/my-games">My games</Link>. Publish it from there, or ask the agent to release it with{" "}
          {t("publish_version")}. To skip the draft and go live as soon as the build is ready, the agent passes <code>publish_when_ready: true</code>.
        </li>
      </ol>
      <p>
        Passing a <code>game_id</code> publishes a <strong>new version</strong> of an existing game. Its page, stats, comments and leaderboard stay the same,
        and every earlier version stays available for rollback.
      </p>

      <h2 id="tools">Tools</h2>
      <h3>Publishing</h3>
      <Table
        head={["Tool", "What it does"]}
        rows={[
          [t("publish_game"), "Uploads a game from inline files, a public zip/HTML URL or an upload session, and publishes it once it's ready. Pass game_id for a new version."],
          [t("create_upload"), "Opens a direct upload for bundles over 3 MB (up to 50 MB). Returns URLs to PUT the zip to, then call publish_game with upload_id."],
          [t("get_publish_status"), "Processing status (processing, ready, rejected), engine, warnings, the details found in the build, which page fields are still empty, a preview link and the game URL."],
        ]}
      />
      <h3>Your games</h3>
      <Table
        head={["Tool", "What it does"]}
        rows={[
          [t("list_my_games"), "Your games in every status, with their latest version."],
          [t("get_game"), "Every editable field of one of your games, or the public page of anyone's game."],
          [t("get_game_files"), "Lists or reads the source files of a version, so the agent can keep working on a game."],
          [t("update_game"), "Title, tagline, description, category, tags, orientation, controls, run length, remix licence, leaderboard, published or draft."],
          [t("set_game_art"), "Sets the cover (16:9) or card (3:4) image from a PNG, JPEG or WebP."],
          [t("unpublish_game"), "Hides a game. It stays in My games and can be published again."],
        ]}
      />
      <h3>Versions</h3>
      <Table
        head={["Tool", "What it does"]}
        rows={[
          [t("list_versions"), "Every version, newest first, with status, changelog and which one is live."],
          [t("publish_version"), "Makes a specific ready version live. Use it to roll back."],
          [t("update_version"), "Edits a version's changelog, prompt, model or tool."],
          [t("delete_version"), "Deletes a version that isn't live, with its files. Players open older versions from the game page until then."],
        ]}
      />

      <h2 id="limits">Limits</h2>
      <Table
        head={["What", "Limit"]}
        rows={[
          ["Inline files in publish_game", "Up to 40 files, 3 MB in total"],
          ["bundle_url", "A public https .zip or .html, up to 25 MB"],
          ["create_upload", "Up to 50 MB. One PUT under 20 MB, 8 MB parts above that"],
          ["Publishing", "20 publishes per hour per connection"],
          ["get_game_files", "512 KB per file, 2 MB per call. Images, audio and engine builds come back as links"],
          ["set_game_art", "3 MB image, PNG, JPEG or WebP"],
        ]}
      />
      <p>
        Builds follow the same rules as web uploads: an <code>index.html</code> at the root, local assets, 1,000 files and 300 MB unzipped. See{" "}
        <Link href="/docs#build">what a build looks like</Link>.
      </p>

      <h2 id="tokens">Tokens for scripts</h2>
      <p>
        Agents should use the browser sign-in. For CI jobs and your own scripts, create a personal token in{" "}
        <Link href="/settings?tab=api">Settings → Connect AI</Link>. It&apos;s shown only once. Send it with every request:
      </p>
      <CodeBlock label="HTTP header" code={`Authorization: Bearer hbv_live_…`} />
      <p>
        Any MCP client library works: point it at <code>{mcpUrl}</code> with that header. Browser sign-ins and tokens are listed together in Settings,
        and you can revoke either at any time.
      </p>

      <h2 id="trouble">Troubleshooting</h2>
      <ul>
        <li>
          <strong>The Habiv tools don&apos;t show up.</strong> Restart your agent after adding the server. In Claude Code, run <code>/mcp</code> and check
          that habiv is connected.
        </li>
        <li>
          <strong>&ldquo;unauthorized&rdquo;.</strong> The sign-in expired or the connection was revoked. Authenticate again from <code>/mcp</code>, or
          run <code>codex mcp login habiv</code>.
        </li>
        <li>
          <strong>&ldquo;rejected&rdquo;.</strong> {t("get_publish_status")} gives the reason, such as no <code>index.html</code>, an{" "}
          <code>http://</code> file, or too many files. Fix it and publish again.
        </li>
        <li>
          <strong>&ldquo;rate_limited&rdquo;.</strong> You hit 20 publishes in an hour. Wait a little and try again.
        </li>
        <li>
          <strong>Runs stay at 0.</strong> Counts refresh every few minutes, and plays on drafts don&apos;t count. See{" "}
          <Link href="/docs/sdk#runs">how runs work</Link>.
        </li>
      </ul>
    </DocsPage>
  );
}
