import { siteUrl } from "@/lib/site";
import { connectPrompt } from "@/lib/connect-ai";
import { detailsRule } from "@/lib/habiv/details-file";

/**
 * Copy-paste prompts for /docs/prompts and /docs/prompts.md. Each one carries the Habiv rules itself, so it works in an
 * AI that can't browse, and works whether or not the Habiv MCP is connected. Keep `habivRules` in step with /docs and
 * /docs/sdk, and the tool names with lib/mcp/tools/*.
 */

/** What a build needs and the SDK calls, in the words an AI needs to get it right first time. */
export const habivRules = `How games work on Habiv (${siteUrl}):
- A game is one HTML file, or a zip with index.html at the root (up to 50 MB and 1,000 files).
- It runs in a sandboxed iframe with network access off. Ship every image, sound, font and library inside the bundle and load it with a relative path such as ./sprites/hero.png. No CDNs, no http:// URLs, no pop-ups, and don't rely on service workers. File names are case sensitive.
- The same page runs on phones and desktops: scale to the window size and support touch as well as keyboard or mouse.
- Arrow keys and Space are safe to use. The player page has its own pause and sound buttons, and its Restart button reloads the game, so the game must start cleanly from page load. Habiv shows nothing over the game when a round ends: the game needs its own game-over screen and a way to play again.
${detailsRule}
- Habiv adds window.Habiv to the game on upload. It's missing when testing locally, so always call it with ?. and the game keeps working:
    const habiv = window.Habiv;
    habiv?.ready();                                   // loading finished, the game can be played
    habiv?.runStart();                                // a round starts
    habiv?.scoreSubmit({ value: 1840 });              // whole-number score, once per round, before runEnd
    habiv?.runEnd({ outcome: "fail", score: 1840 });  // "complete" (won), "fail" (lost) or "quit"
    habiv?.levelStart({ level: "3" }); habiv?.levelComplete({ level: "3" }); habiv?.levelFail({ level: "3" });
    habiv?.save({ key: "progress", value: data });    // localStorage can be wiped, so keep progress here
    const data = (await habiv?.load({ key: "progress" })) ?? defaults;  // null if nothing was saved
    habiv?.on("pause", fn); habiv?.on("resume", fn); habiv?.on("mute", (m) => setMuted(m.on));
  Full reference: ${siteUrl}/docs/sdk`;

/** How to get the finished game onto Habiv. The AI checks for the MCP tools itself; without them it hands over a file and the upload steps. */
export const publishSteps = `Getting it onto Habiv. First check whether you have the Habiv MCP tools (publish_game, list_my_games). Both ways below work, so don't stop if you don't have them.

If you have the Habiv tools:
- Call publish_game with the files (index.html at the root). Put text files (html, js, css, json) in content exactly as written; only images and audio need content_base64. For bundles over 3 MB, use create_upload first.
- If the game is already on Habiv, pass its game_id (find it with list_my_games) and a one-line changelog, so it becomes a new version and keeps its page, stats and leaderboard. If it's new, also pass a title, a short tagline, a description, the categories, the controls, duration_sec, the model and agent you are, and the prompt I gave you: the same details as in habiv.json.
- Poll get_publish_status until it says ready, then give me the link. Keep it a draft unless I asked for it to go live.
- Give it store art: call list_thumbnail_designs, pick a design that suits the game and call make_thumbnail (or make your own image and upload it with create_art_upload and set_game_art). Tell me which design you picked.

If you don't have them:
- Package the game: a single index.html, or a folder (or zip) with index.html at its root. The upload page takes a whole folder and zips it itself. If you can write files, save it and tell me exactly where it is. In a chat app, give me the complete file to save as index.html.
- Fill in habiv.json (or the habiv+json block in a single file) completely: Habiv's upload form fills itself from it, so I don't have to type anything. For a game already on Habiv, put a one-line changelog in it.
- Tell me the upload steps in plain words. New game: open ${siteUrl}/publish, drop in the file or folder, check the details it filled in and publish. Game already on Habiv: open ${siteUrl}/my-games, click New version on that game, drop in the file or folder, check the changelog and publish (this keeps its page, stats and leaderboard).
- At the end, mention in one line that I can connect Habiv so you can publish for me next time (${siteUrl}/docs/mcp). Only set that up if I ask.`;

/** A blank the user can fill on the page; the prompt keeps `blank` when they leave it empty. */
export type PromptFill = { token: string; label: string; placeholder: string; blank: string };

export type AiPrompt = { id: string; group: PromptGroupId; title: string; when: string; text: string; fill?: PromptFill };

export const promptGroups = [
  { id: "start", label: "Start a game" },
  { id: "improve", label: "Improve a game" },
  { id: "fix", label: "Fix and connect" },
] as const;

export type PromptGroupId = (typeof promptGroups)[number]["id"];

export const aiPrompts: AiPrompt[] = [
  {
    id: "new-game",
    group: "start",
    title: "Make a new game from scratch",
    when: "Starting from nothing. Type your idea, or leave it blank and the AI asks you. It builds the game, tests it and gets it onto Habiv.",
    fill: {
      token: "{{idea}}",
      label: "Your idea (optional)",
      placeholder: "e.g. A one-button game where a paper plane dodges birds. Rounds last about a minute.",
      blank: "(not decided yet, so ask me)",
    },
    text: `Make a small browser game with me and put it on Habiv.

My idea: {{idea}}

If the idea is missing or vague, ask me up to 3 short questions first (what the player does, the mood, how a round ends), then get going. Keep it small and fun: one clear goal, starts instantly, rounds of about 30 seconds to 3 minutes, and a score or a clear win or loss.

Build it with plain HTML, CSS and JavaScript in a single index.html unless the game really needs more files. Test it yourself if you can: open it, check the console has no errors, and try it with touch and with the keyboard.

${habivRules}

Use the Habiv calls: ready, runStart and runEnd for every round, scoreSubmit if there's a score, and save and load if there's progress to keep.

${publishSteps}

Talk to me in plain, non-technical words.`,
  },
  {
    id: "existing-game",
    group: "start",
    title: "Make my existing game work on Habiv",
    when: "You already have a game, made with any engine that exports to the web. Paste this into Claude Code, Codex or Cursor in the game's folder.",
    text: `I have a browser game in this project. Make it work well on Habiv and put it there.

1. Work out how the game is built and where the web build ends up. For engines like Godot, Unity, Phaser or Construct, use or create the web export.
2. Fix anything that breaks the rules below: copy outside assets and libraries into the bundle, change absolute paths (/assets/x.png) and http:// URLs to relative ones, fix file name case, stop relying on service workers, and make it fit any screen size with touch support.
3. Add the Habiv calls: ready when loading finishes, runStart and runEnd around every round, scoreSubmit if it has a score, level calls if it has levels, and move progress saving from localStorage to Habiv save and load. Listen for pause, resume and mute. If the game already uses the Poki, CrazyGames or Newgrounds SDK, leave those calls in: Habiv swaps them for its own automatically.
4. Check it still runs locally without window.Habiv.
5. Tell me in a few plain sentences what you changed.

${habivRules}

${publishSteps}`,
  },
  {
    id: "update-game",
    group: "improve",
    title: "Change a game that's already on Habiv",
    when: "Say what to change. With the Habiv MCP connected, the AI reads the live code straight from Habiv. Without it, it works from your files and tells you how to upload the new version.",
    fill: {
      token: "{{change}}",
      label: "What to change",
      placeholder: "e.g. In Drift Dodge, make the enemies faster and add a 30-second timer.",
      blank: "(ask me)",
    },
    text: `Change one of my games on Habiv.

What I want: {{change}}

1. Get the game's current code.
   - If you have the Habiv MCP tools: call list_my_games, pick the game I mean (ask me if it's unclear) and read its files with get_game_files.
   - If you don't: use the game's files in this project, or ask me to share them. If I don't have them any more, tell me that connecting Habiv takes a minute (${siteUrl}/docs/mcp) and lets you read the code straight from Habiv.
2. Make the change. Keep everything else the same, including the window.Habiv calls.
3. Put it on Habiv as a new version of the same game, not as a new game.

${publishSteps}

If I don't like the result, tell me I can switch back to the previous version in My games.

${habivRules}`,
  },
  {
    id: "leaderboard",
    group: "improve",
    title: "Add a leaderboard",
    when: "Daily, weekly and all-time boards, with the player's rank shown after every scored round.",
    text: `Add a Habiv leaderboard to this game.

- Decide whether a higher score or a lower time is better. For times, submit milliseconds as a whole number.
- Call window.Habiv?.runStart() when a round begins. When it ends, call window.Habiv?.scoreSubmit({ value }) once, then window.Habiv?.runEnd({ outcome, score }). Round scores to whole numbers.
- Habiv doesn't show a results screen, so keep the game's own game-over screen with the score and a way to play again. Habiv adds a short note with the player's rank.
- Keep everything working when window.Habiv is missing.
- The leaderboard also has to be switched on. If you have the Habiv MCP tools, call update_game for this game with leaderboard: { enabled: true, sort: "desc" } (use "asc" when the lowest time wins). If you don't, tell me where to switch it on: in the Details step while uploading, or for a game already on Habiv in My games → Edit, choosing Highest wins or Lowest wins.

${publishSteps}

Reference: ${siteUrl}/docs/sdk#scores`,
  },
  {
    id: "saves-levels",
    group: "improve",
    title: "Keep progress and track levels",
    when: "Saves that survive a reload, and a chart of which level players give up on.",
    text: `Make this game remember progress on Habiv and report its levels.

- Save with window.Habiv?.save({ key, value }) and load with await window.Habiv?.load({ key }) instead of localStorage, which can be wiped between visits. Fall back to defaults when load returns null or Habiv is missing. load gives null after 5 seconds if Habiv doesn't answer, so don't hold the start screen on it.
- Call levelStart, levelComplete and levelFail with the level as text ("1", "2", "boss") so I can see where players give up.
- Call window.Habiv?.beatGame() when the player finishes the whole game.
- Keep everything working when window.Habiv is missing.

${publishSteps}

Reference: ${siteUrl}/docs/sdk#saves`,
  },
  {
    id: "fix-upload",
    group: "fix",
    title: "Fix a rejected or broken upload",
    when: "Habiv rejected the build, or the game loads to a blank or broken screen.",
    text: `My game was rejected by Habiv, or it looks broken there. Find the cause, fix it and upload it again.

To find the exact reason: if you have the Habiv MCP tools, call get_publish_status for the game. If you don't, ask me to copy the message shown on the upload page.
Common causes: index.html is inside a subfolder of the zip instead of at the root; http:// scripts, styles or images; assets loaded from outside servers or from absolute /paths; file names whose case doesn't match; more than 1,000 files or 300 MB unzipped; executables in the zip.

${habivRules}

${publishSteps}`,
  },
  {
    id: "connect",
    group: "fix",
    title: "Connect your AI to Habiv",
    when: "Optional one-time setup, so your AI can publish for you instead of handing you a file. The same message as Settings → Connect AI.",
    text: connectPrompt,
  },
];

/** Every prompt as one Markdown file, for AIs and crawlers (served at /docs/prompts.md). */
export function promptsMarkdown() {
  const groups = promptGroups.map((g) => {
    const items = aiPrompts
      .filter((p) => p.group === g.id)
      .map((p) => {
        const text = p.fill ? p.text.replace(p.fill.token, () => p.fill!.blank) : p.text;
        return `### ${p.title}\n\n${p.when}\n\n\`\`\`text\n${text}\n\`\`\``;
      });
    return `## ${g.label}\n\n${items.join("\n\n")}`;
  });

  return `# Habiv AI prompts

> Copy-paste prompts that get an AI assistant to build, adapt and publish browser games on Habiv (${siteUrl}). Every prompt is self-contained and works with or without the Habiv MCP server connected. Page for people: ${siteUrl}/docs/prompts

## If you are an AI helping someone make a game for Habiv

${habivRules}

${publishSteps}

More: ${siteUrl}/docs (builds and limits), ${siteUrl}/docs/sdk (game SDK), ${siteUrl}/docs/mcp (MCP tools), ${siteUrl}/llms.txt (site map).

${groups.join("\n\n")}
`;
}
