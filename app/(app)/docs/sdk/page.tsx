import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/habiv/docs-code";
import { DocsPage, Note, Table } from "@/components/habiv/docs-page";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Game SDK",
  description: "The Habiv game SDK: report runs, scores, levels and wins, save progress, and react to pause and mute. Added to every game automatically.",
  alternates: { canonical: "/docs/sdk" },
};

const toc = [
  { id: "setup", label: "Setup" },
  { id: "quick-start", label: "Quick start" },
  { id: "runs", label: "Runs" },
  { id: "scores", label: "Scores & leaderboards" },
  { id: "levels", label: "Levels" },
  { id: "saves", label: "Saves" },
  { id: "controls", label: "Pause, mute & player" },
  { id: "more", label: "Other calls" },
  { id: "portals", label: "Poki, CrazyGames, Newgrounds" },
  { id: "testing", label: "Testing" },
  { id: "reference", label: "Reference" },
];

const quickStart = `// Habiv adds window.Habiv to your game when you upload it.
// On your own computer it's missing, so use ?. and keep the calls in.
const habiv = window.Habiv;

// 1. Everything has loaded and the game can be played.
habiv?.ready();

// 2. The player starts a round.
function startRound() {
  habiv?.runStart();
}

// 3. The round is over.
function gameOver(score) {
  habiv?.scoreSubmit({ value: score });       // leaderboard, if it's on
  habiv?.runEnd({ outcome: "fail", score });  // "complete" if they won
}`;

const runsCode = `habiv?.runStart();                    // or runStart({ level: "1" })

habiv?.runEnd({
  outcome: "complete",                // "complete", "fail" or "quit"
  score: 1840,                        // optional, a whole number
  level: "3",                         // optional
  progress_pct: 60,                   // optional, 0-100
});`;

const timeCode = `// For a "lowest wins" board, send the time in milliseconds as a whole number.
const ms = Math.round(performance.now() - startedAt);
habiv?.scoreSubmit({ value: ms });
habiv?.runEnd({ outcome: "complete", score: ms });`;

const levelsCode = `habiv?.levelStart({ level: "3" });
habiv?.levelComplete({ level: "3", score: 1200 });
habiv?.levelFail({ level: "3", score: 400 });

habiv?.beatGame();  // the player finished the whole game`;

const savesCode = `// Save any value that JSON can hold.
habiv?.save({ key: "progress", value: { level: 4, coins: 120 } });

// Load it back. You get null if nothing was saved.
const progress = (await habiv?.load({ key: "progress" })) ?? { level: 1, coins: 0 };`;

const controlsCode = `habiv?.on("pause", () => game.pause());
habiv?.on("resume", () => game.resume());
habiv?.on("mute", (msg) => audio.setMuted(msg.on));

// Who is playing (null until Habiv has started the game)
const player = habiv?.player;  // { id, handle, muted, locale }`;

const moreCode = `habiv?.gameplayStart();   // real play begins (not menus or cutscenes)
habiv?.gameplayStop();    // back to a menu, paused, game over
habiv?.happytime();       // a great moment: Habiv shows a small "Nice!"
habiv?.design({ key: "picked_class", value: "mage" });  // your own stat
habiv?.error("Level file failed to load");`;

export default function DocsSdkPage() {
  return (
    <DocsPage
      path="/docs/sdk"
      title="Game SDK"
      intro="A small script Habiv adds to every game. Without it your game still works and still counts runs. Call it when you want leaderboards, level stats, saves or pause and mute."
      toc={toc}
    >
      <JsonLd
        data={[
          breadcrumbLd([
            ["Home", "/"],
            ["Docs", "/docs"],
            ["Game SDK", "/docs/sdk"],
          ]),
        ]}
      />

      <h2 id="setup">Setup</h2>
      <p>
        <strong>There is nothing to install.</strong> When you upload, Habiv adds <code>&lt;script src=&quot;/sdk/habiv-bridge.js&quot;&gt;</code> before
        your first script, so <code>window.Habiv</code> is ready before your own code runs.
      </p>
      <p>
        On your own computer, or on any other website, <code>window.Habiv</code> is either missing or switched off (<code>Habiv.enabled</code> is{" "}
        <code>false</code>), and every call does nothing. Write calls as <code>window.Habiv?.runStart()</code> and you can leave them in everywhere.
      </p>

      <Note>
        <p>
          The page around your game (title, description, how to play) isn&apos;t set through the SDK. Put it in a{" "}
          <Link href="/docs/details">habiv.json</Link> next to your game and the publish form fills itself in.
        </p>
      </Note>

      <h2 id="quick-start">Quick start</h2>
      <p>Most games only need these four calls:</p>
      <CodeBlock label="JavaScript" code={quickStart} />
      <p>
        <code>ready()</code> is sent for you shortly after the page loads if you never call it. Call it yourself when a loading screen finishes, so Habiv
        knows exactly when your game can be played.
      </p>

      <h2 id="runs">Runs</h2>
      <p>A run is one attempt: from pressing start to winning, losing or giving up. Runs are what the &ldquo;runs&rdquo; count on your game shows.</p>
      <h3>Without the SDK</h3>
      <p>
        Habiv works runs out for you. A run starts a moment after the player first clicks or presses a key inside your game, and ends as a
        &ldquo;quit&rdquo; when they leave the page or switch tabs. That gives you run counts and play time, but not wins, losses or scores.
      </p>
      <h3>With the SDK</h3>
      <p>
        As soon as your game calls <code>runStart()</code>, Habiv stops guessing and uses your calls for the rest of the visit. Call{" "}
        <code>runStart()</code> each time a round begins and <code>runEnd()</code> when it finishes:
      </p>
      <CodeBlock label="JavaScript" code={runsCode} />
      <ul>
        <li>
          <strong>Outcome.</strong> <code>&quot;complete&quot;</code> means they won or finished, <code>&quot;fail&quot;</code> means they lost,{" "}
          <code>&quot;quit&quot;</code> means they gave up. Anything else counts as quit.
        </li>
        <li>
          <strong>Results screen.</strong> Ending with <code>complete</code> or <code>fail</code> shows Habiv&apos;s results screen over your game,
          with a Play again button. Pass a <code>score</code> to add &ldquo;you beat X% of today&apos;s players&rdquo;.
        </li>
        <li>
          <strong>Starting again.</strong> Calling <code>runStart()</code> while a run is going ends the old one as a quit first.
        </li>
        <li>
          <strong>Timing</strong> is measured on Habiv&apos;s servers, not the player&apos;s device. Runs under half a second are flagged and left out of play-time stats.
        </li>
      </ul>
      <Note>
        <p>
          Run counts refresh every few minutes. Plays on a draft and in the preview are never counted, so publish the game before you test counting.
        </p>
      </Note>

      <h2 id="scores">Scores &amp; leaderboards</h2>
      <p>
        First turn the leaderboard on: in the <strong>Details</strong> step when you publish, on the game&apos;s edit page in My games, or with{" "}
        <code>update_game</code> over <Link href="/docs/mcp">MCP</Link>. Pick <strong>Highest wins</strong> for points or <strong>Lowest wins</strong> for
        times. Then send the score during a run:
      </p>
      <CodeBlock label="JavaScript" code={`habiv?.scoreSubmit({ value: 1840 });`} />
      <ul>
        <li>
          <strong>Send it before <code>runEnd()</code>.</strong> A score needs a run that&apos;s still going.
        </li>
        <li>
          <strong>Whole numbers only.</strong> Round decimals first. For times, send milliseconds.
        </li>
        <li>
          <strong>One score per run.</strong> The first one counts. Each player keeps their best score on the daily, weekly and all-time boards.
        </li>
        <li>
          <strong>Cheat checks.</strong> Scores from runs shorter than 1 second are thrown out, and you can set a maximum number of points per second.
          Players who break the rules are flagged instead of ranked.
        </li>
      </ul>
      <CodeBlock label="JavaScript · lowest wins" code={timeCode} />

      <h2 id="levels">Levels</h2>
      <p>
        Level calls feed the drop-off chart in your stats, so you can see which level players give up on. A level is any text up to 64 characters.
      </p>
      <CodeBlock label="JavaScript" code={levelsCode} />

      <h2 id="saves">Saves</h2>
      <p>
        Your game&apos;s own <code>localStorage</code> can be wiped between visits, because the game runs in an isolated frame. <code>save</code> and{" "}
        <code>load</code> keep data on Habiv&apos;s side instead, in the player&apos;s browser and separate for each game.
      </p>
      <CodeBlock label="JavaScript" code={savesCode} />
      <p>
        <code>load</code> always resolves: with your value, with <code>null</code> if nothing was saved, or with <code>null</code> after 5 seconds if
        Habiv doesn&apos;t answer (for example on your own computer).
      </p>

      <h2 id="controls">Pause, mute &amp; player</h2>
      <p>The player page has Pause and Sound buttons. Listen for them so your game follows along:</p>
      <CodeBlock label="JavaScript" code={controlsCode} />
      <p>
        <code>player.id</code> is an anonymous ID for this browser. <code>player.handle</code> is the player&apos;s Habiv handle, or <code>null</code> if
        they aren&apos;t signed in. Games start muted, and the <code>mute</code> event tells you when that changes. <code>Habiv.mode</code> is{" "}
        <code>&quot;play&quot;</code> on the game page and <code>&quot;preview&quot;</code> in the publish wizard.
      </p>

      <h2 id="more">Other calls</h2>
      <CodeBlock label="JavaScript" code={moreCode} />
      <p>
        <code>design</code> lets you track your own choices and events, up to 100 different keys per game, with a number, text or true/false value.
        Uncaught errors are reported for you, so <code>error()</code> is only for problems you catch yourself.
      </p>

      <h2 id="portals">Poki, CrazyGames and Newgrounds</h2>
      <p>
        Already built for a game portal? Keep your code. Habiv swaps the Poki SDK v2, the CrazyGames SDK v2 and v3, and Newgrounds.io for local versions
        that talk to Habiv:
      </p>
      <ul>
        <li>Loading finished becomes <code>ready()</code>, the first gameplay start becomes <code>runStart()</code>, and happy time works as usual.</li>
        <li>Ads never show. Ad breaks finish at once, and rewarded ads grant the reward.</li>
        <li>Newgrounds scoreboard posts become <code>scoreSubmit()</code>, and medals are recorded as your own stats.</li>
      </ul>

      <h2 id="testing">Testing</h2>
      <ol>
        <li>
          Upload the build on the <Link href="/publish">publish page</Link>. The preview in the Art step runs the SDK but records nothing.
        </li>
        <li>Publish it, open the game page and play a round.</li>
        <li>
          Open the browser console on the game page. SDK calls show up there as <code>postMessage</code> traffic from the game frame, and game errors are
          logged as <code>[habiv] game error</code>.
        </li>
        <li>Check the runs count and your stats in My games after a few minutes.</li>
      </ol>

      <h2 id="reference">Reference</h2>
      <Table
        head={["Call", "What it does"]}
        rows={[
          [<code key="c">ready()</code>, "The game can be played. Sent automatically after load if you don't call it."],
          [<code key="c">runStart({"{ level? }"})</code>, "Starts a run. Switches off automatic run counting for this visit."],
          [<code key="c">runEnd({"{ outcome, score?, level?, progress_pct? }"})</code>, "Ends the run as complete, fail or quit."],
          [<code key="c">scoreSubmit({"{ value }"})</code>, "Sends a whole-number score to the leaderboard. Once per run, before runEnd."],
          [<code key="c">levelStart / levelComplete / levelFail</code>, "Level progress: { level, score? }. Feeds the drop-off chart."],
          [<code key="c">beatGame()</code>, "The player finished the whole game."],
          [<code key="c">save({"{ key, value }"})</code>, "Stores a JSON value for this game in the player's browser."],
          [<code key="c">load({"{ key }"})</code>, "Promise of the saved value, or null."],
          [<code key="c">gameplayStart / gameplayStop</code>, "Marks active play versus menus."],
          [<code key="c">happytime()</code>, "Shows a small “Nice!” on the player page."],
          [<code key="c">design({"{ key, value? }"})</code>, "Your own stat. Up to 100 keys."],
          [<code key="c">error(message)</code>, "Reports a problem you caught."],
          [<code key="c">on(type, fn) / off(type, fn)</code>, "Listen for pause, resume, mute or init."],
          [<code key="c">player</code>, "{ id, handle, muted, locale }, or null before init."],
          [<code key="c">enabled</code>, "true only when running on Habiv."],
          [<code key="c">mode</code>, "\"play\" or \"preview\"."],
        ]}
      />
    </DocsPage>
  );
}
