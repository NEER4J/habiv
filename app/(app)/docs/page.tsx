import type { Metadata } from "next";
import Link from "next/link";
import { DocsPage, Note, Table } from "@/components/habiv/docs-page";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Docs",
  description: "How to put a browser game on Habiv: what a build looks like, what happens when you upload, the optional game SDK and the MCP server for AI agents.",
  alternates: { canonical: "/docs" },
};

const toc = [
  { id: "start", label: "Four ways to start" },
  { id: "build", label: "What a build looks like" },
  { id: "upload", label: "What happens on upload" },
  { id: "runtime", label: "How your game runs" },
  { id: "stats", label: "Stats you get for free" },
  { id: "next", label: "Next steps" },
];

export default function DocsOverviewPage() {
  return (
    <DocsPage
      path="/docs"
      title="Build for Habiv"
      intro="Everything you need to put a browser game on Habiv: what a build looks like, the optional SDK for scores and levels, and the MCP server that lets your AI publish for you."
      toc={toc}
    >
      <JsonLd
        data={[
          breadcrumbLd([
            ["Home", "/"],
            ["Docs", "/docs"],
          ]),
        ]}
      />

      <h2 id="start">Four ways to start</h2>
      <div className="hb-docs-cards">
        <Link href="/docs/prompts" className="hb-docs-card">
          <strong>Copy a prompt</strong>
          <span>Paste a ready-made prompt into any AI. It builds or adapts your game, adds scores and saves, and publishes it.</span>
        </Link>
        <Link href="/publish" className="hb-docs-card">
          <strong>Upload it</strong>
          <span>Drop an HTML file or a zip on the publish page. Five steps, nothing goes public until the last one.</span>
        </Link>
        <Link href="/docs/mcp" className="hb-docs-card">
          <strong>Ask your AI</strong>
          <span>Connect Claude or Codex once, then say &ldquo;publish this to Habiv&rdquo;. It uploads, checks and shares the link.</span>
        </Link>
        <Link href="/docs/sdk" className="hb-docs-card">
          <strong>Add the SDK</strong>
          <span>Optional. A few lines give you leaderboards, level stats and saves that survive a reload.</span>
        </Link>
      </div>

      <h2 id="build">What a build looks like</h2>
      <p>
        A Habiv game is a normal web page. Upload <strong>one HTML file</strong>, or a <strong>zip or folder with an <code>index.html</code> at the root</strong>{" "}
        and everything it needs next to it. A folder is zipped in your browser before it uploads. Any engine that exports to the web works: plain JavaScript, canvas, Phaser, PixiJS, three.js, Godot, Unity WebGL,
        Construct, GDevelop and so on.
      </p>
      <ul>
        <li>Keep every file inside the bundle and point to it with a relative path, like <code>./sprites/hero.png</code>.</li>
        <li>
          Use <code>https://</code> for anything outside the bundle. A build that loads an <code>http://</code> script, style or image is rejected.
        </li>
        <li>Match file name case exactly. <code>Hero.png</code> and <code>hero.png</code> are different files here, even if they worked on your computer.</li>
        <li>
          Add a <Link href="/docs/details">
            <code>habiv.json</code>
          </Link>{" "}
          with the title, description and controls, and the publish form fills itself in.
        </li>
      </ul>
      <Table
        head={["Limit", "Value"]}
        rows={[
          ["File types", ".html, .htm, .zip or a folder"],
          ["Upload size", "50 MB"],
          ["Files in a build", "1,000"],
          ["Unzipped size", "300 MB"],
          ["Storage per creator", "250 MB"],
        ]}
      />

      <h2 id="upload">What happens on upload</h2>
      <p>Every upload becomes a new version of the game. Habiv checks and prepares it automatically, usually in under a minute:</p>
      <ol>
        <li>
          <strong>Checks.</strong> Detects the engine, counts files, measures the size and looks for requests to outside servers. Builds with executables,
          suspicious compression or no <code>index.html</code> are rejected with the reason.
        </li>
        <li>
          <strong>Preparation.</strong> Adds the <Link href="/docs/sdk">Habiv SDK</Link> script, turns off service workers, rewrites paths that start
          with <code>/</code> so they load from your bundle, and swaps the Poki, CrazyGames and Newgrounds SDKs for local versions that talk to Habiv.
        </li>
        <li>
          <strong>Preview.</strong> You can play the build before it goes live. Preview plays never count as runs or scores.
        </li>
        <li>
          <strong>Publish.</strong> The version goes live at <code>habiv.com/@you/your-game</code>. Older versions stay in My games, so you can roll
          back at any time.
        </li>
      </ol>

      <h2 id="runtime">How your game runs</h2>
      <p>
        Each game plays in a sandboxed frame on a separate domain. It can&apos;t read the player&apos;s Habiv account or cookies, open pop-ups or
        start downloads. A few things follow from that:
      </p>
      <ul>
        <li>
          <strong>Bundle your assets.</strong> Network access is off by default, so fonts, sounds and libraries should ship inside the zip. The checks flag
          any outside servers your code mentions.
        </li>
        <li>
          <strong>Save through the SDK.</strong> The frame&apos;s own storage can be wiped between visits. Use{" "}
          <Link href="/docs/sdk#saves">
            <code>Habiv.save</code> and <code>Habiv.load</code>
          </Link>{" "}
          to keep progress.
        </li>
        <li>
          <strong>Arrow keys and Space just work.</strong> Habiv stops them from scrolling the page behind your game.
        </li>
      </ul>

      <h2 id="stats">Stats you get for free</h2>
      <p>You don&apos;t need to write any code to see how your game is doing. Every published game tracks these on its own:</p>
      <ul>
        <li>
          <strong>Runs.</strong> A run starts when a player first clicks or presses a key inside your game, and ends when they leave or switch tabs.
        </li>
        <li>
          <strong>Players, views and play time</strong>, plus where players come from and what device they use.
        </li>
      </ul>
      <p>
        Add the <Link href="/docs/sdk">SDK</Link> and you also get completions, leaderboards and level drop-off.
      </p>
      <Note>
        <p>
          Counts refresh every few minutes, so a new run can take up to about 5 minutes to show up. Plays on a draft, and plays in the preview, are never
          counted.
        </p>
      </Note>

      <h2 id="next">Next steps</h2>
      <ul>
        <li>
          <Link href="/docs/details">Game details</Link>: the habiv.json that fills in your game&apos;s page.
        </li>
        <li>
          <Link href="/docs/sdk">Game SDK</Link>: runs, scores, levels, saves and pause/mute.
        </li>
        <li>
          <Link href="/docs/mcp">MCP &amp; agents</Link>: connect Claude, Codex or any MCP app and publish from a chat.
        </li>
        <li>
          <Link href="/guidelines">Community guidelines</Link>: what&apos;s allowed on Habiv.
        </li>
      </ul>
    </DocsPage>
  );
}
