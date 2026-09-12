import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/habiv/docs-code";
import { DocsPage, Note, Table } from "@/components/habiv/docs-page";
import { JsonLd } from "@/components/seo/json-ld";
import { detailFields, detailsRule, exampleInline, exampleJson, schemaUrl } from "@/lib/habiv/details-file";
import { breadcrumbLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Game details",
  description: "Ship a habiv.json with your game and Habiv fills in its title, description, how to play, categories and tags for you, on upload and from AI agents.",
  alternates: { canonical: "/docs/details" },
};

const toc = [
  { id: "why", label: "Why a details file" },
  { id: "file", label: "habiv.json" },
  { id: "single", label: "Single HTML files" },
  { id: "fields", label: "Fields" },
  { id: "what-happens", label: "What Habiv does with it" },
  { id: "ai", label: "Ask your AI" },
];

const code = (s: string) => <code key={s}>{s}</code>;

export default function DocsDetailsPage() {
  return (
    <DocsPage
      path="/docs/details"
      title="Game details"
      intro="Your game's page needs a title, a line for the cards, a description and how to play. The AI that made the game already knows all of that, so let it write them into a small file next to the game and Habiv fills them in for you."
      toc={toc}
    >
      <JsonLd
        data={[
          breadcrumbLd([
            ["Home", "/"],
            ["Docs", "/docs"],
            ["Game details", "/docs/details"],
          ]),
        ]}
      />

      <h2 id="why">Why a details file</h2>
      <p>
        Without it you type the details into the <Link href="/publish">publish form</Link> every time. With it, the form is already filled in when your
        upload finishes. You only check it and publish. The details also travel with the code: a new version, a remix or an agent reading the game with{" "}
        <Link href="/docs/mcp#tools">get_game_files</Link> finds them in the same place.
      </p>

      <h2 id="file">habiv.json</h2>
      <p>
        Put a file named <code>habiv.json</code> at the root of the zip or folder, next to <code>index.html</code>. Every field is optional.
      </p>
      <CodeBlock label="habiv.json" code={exampleJson} />
      <p>
        The <code>$schema</code> line is optional too. It points editors such as VS Code at <a href={schemaUrl}>the schema</a>, so they autocomplete the
        fields and flag mistakes.
      </p>

      <h2 id="single">Single HTML files</h2>
      <p>
        A game that is one HTML file can&apos;t carry a second file, so put the same JSON in a script tag instead. The browser ignores it, and Habiv reads it
        on upload:
      </p>
      <CodeBlock label="HTML" code={exampleInline} />
      <p>
        With neither, Habiv still uses the page&apos;s <code>&lt;title&gt;</code> for the title and <code>&lt;meta name=&quot;description&quot;&gt;</code>{" "}
        for the one-line description. Placeholder titles like &ldquo;Document&rdquo; or &ldquo;Unity WebGL Player&rdquo; are skipped.
      </p>

      <h2 id="fields">Fields</h2>
      <Table head={["Field", "Type", "What it's for"]} rows={detailFields.map((f) => [code(f.name), f.type, f.about])} />
      <Note>
        <p>
          Anything too long is cut to fit, and anything Habiv can&apos;t read is skipped. A mistake in the file never stops your game from uploading: the
          checks step shows a warning and you fill that field in by hand.
        </p>
      </Note>

      <h2 id="what-happens">What Habiv does with it</h2>
      <ul>
        <li>
          <strong>Uploading on the website.</strong> Once the checks finish, the Details step is filled in from the file and says which fields came from it.
          Anything you already typed stays as it is.
        </li>
        <li>
          <strong>A new version of a game.</strong> Your game&apos;s current details stay. If the new file says something different, the Details step offers a{" "}
          <strong>Use the build&apos;s details</strong> button, so nothing changes unless you ask.
        </li>
        <li>
          <strong>Publishing from an AI agent.</strong> Details the agent passes to {code("publish_game")} win. The file fills in whatever is still empty,
          and {code("get_publish_status")} tells the agent what it found and what the page is still missing, so it can fill the rest with{" "}
          {code("update_game")}.
        </li>
      </ul>
      <p>You can change every detail later in My games → Edit, whatever the file says.</p>

      <h2 id="ai">Ask your AI</h2>
      <p>
        Every prompt on the <Link href="/docs/prompts">AI prompts</Link> page already asks for the file. For a game you made another way, paste this into
        the AI that has the game open:
      </p>
      <CodeBlock label="Prompt" wrap code={`Write the Habiv details for this game.\n\n${detailsRule}\n\nRead the game's code to get the controls right. Write the description for players, not developers: no build steps.`} />
    </DocsPage>
  );
}
