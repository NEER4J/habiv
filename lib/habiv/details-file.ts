import { siteUrl } from "@/lib/site";
import { CONTROL_ACTION_MAX, CONTROL_KEY_MAX, DESCRIPTION_MAX, MAX_CONTROL_ROWS, MAX_TAGS, TOUCH_HINT_MAX } from "@/lib/habiv/game-details";

/**
 * The habiv.json format: game details a build carries so the publish form and MCP publishes start
 * filled in. Read at ingest by jobs/src/lib/game-meta.ts (keep the fields in step), documented at
 * /docs/details and served as a JSON Schema at /habiv.schema.json.
 */

export const schemaUrl = `${siteUrl}/habiv.schema.json`;

export const exampleDetails = {
  $schema: schemaUrl,
  title: "Paper Plane",
  tagline: "Fold, fly and dodge the birds with one button.",
  description:
    "Guide a paper plane through a sky full of grumpy birds. Hold to climb, let go to dive, and grab the stars for bonus points.\n\nThe wind picks up every 20 seconds. Stay low when it gusts.",
  categories: ["arcade", "reaction"],
  tags: ["one button", "endless", "high score"],
  orientation: "landscape",
  duration_sec: 60,
  controls: {
    keys: [
      { key: "Space", action: "Climb (hold)" },
      { key: "P", action: "Pause" },
    ],
    touch: "Hold anywhere to climb",
  },
  model: "Claude Sonnet 4.5",
  agent: "Claude Code",
  prompt: "Make a one-button game where a paper plane dodges birds. Rounds last about a minute.",
};

export const exampleJson = JSON.stringify(exampleDetails, null, 2);

export const exampleInline = `<!-- In the <head> of a single-file game -->
<script type="application/habiv+json">
{
  "title": "Paper Plane",
  "tagline": "Fold, fly and dodge the birds with one button.",
  "description": "Guide a paper plane through a sky full of grumpy birds.",
  "categories": ["arcade"],
  "controls": {
    "keys": [{ "key": "Space", "action": "Climb (hold)" }],
    "touch": "Hold anywhere to climb"
  }
}
</script>`;

/** One line an AI prompt can carry, so any AI writes the file without reading the docs. */
export const detailsRule = `- Describe the game for its Habiv page in a habiv.json file at the root of the bundle. For a single HTML file, put the same JSON inside <script type="application/habiv+json"> in the <head>. Habiv fills in the upload form from it. Fields: title; tagline (one line, up to 140 characters); description (plain text for players: the goal, how a round goes, tips; up to ${DESCRIPTION_MAX.toLocaleString()} characters); categories (1 to 3 of arcade, puzzle, reaction, ambient, rhythm, racing, cozy, horror, experimental, other, main one first); tags (up to ${MAX_TAGS}, lower case); orientation (portrait, landscape or any); duration_sec (a typical round in seconds, 3600 for endless); controls ({ "keys": [{ "key": "Space", "action": "Jump" }], "touch": "Tap to jump" }, up to ${MAX_CONTROL_ROWS} keys); model and agent (the AI model and tool that made it); prompt (what I asked for); changelog (for a new version). Format: ${siteUrl}/docs/details`;

export const detailFields: { name: string; type: string; about: string }[] = [
  { name: "title", type: "text, 80", about: "The game's name." },
  { name: "tagline", type: "text, 140", about: "One line shown on cards and in link previews." },
  { name: "description", type: `text, ${DESCRIPTION_MAX.toLocaleString()}`, about: "About the game on its page: the goal, how a round goes, tips and credits. Line breaks are kept." },
  { name: "categories", type: "list, up to 3", about: "Main one first: arcade, puzzle, reaction, ambient, rhythm, racing, cozy, horror, experimental or other. \"category\" with one value also works." },
  { name: "tags", type: `list, up to ${MAX_TAGS}`, about: "Lower case words like \"one button\" or \"pixel art\", 24 characters each." },
  { name: "orientation", type: "text", about: "portrait, landscape or any." },
  { name: "duration_sec", type: "number", about: "How long a typical round lasts, in seconds. 3600 means endless. 45 or less puts the game in Quick play." },
  { name: "controls", type: "object", about: `How to play: "keys" is up to ${MAX_CONTROL_ROWS} rows of { "key", "action" } (${CONTROL_KEY_MAX} and ${CONTROL_ACTION_MAX} characters), "touch" a hint for phones (${TOUCH_HINT_MAX}).` },
  { name: "model", type: "text, 80", about: "The AI model that made it, e.g. Claude Sonnet 4.5." },
  { name: "agent", type: "text, 80", about: "The tool or agent, e.g. Claude Code, Codex, Cursor." },
  { name: "prompt", type: "text, 8,000", about: "The prompt or brief behind the game, shown on its page." },
  { name: "changelog", type: "text, 500", about: "What changed, for a new version of a game already on Habiv." },
];

const text = (maxLength: number, description: string) => ({ type: "string", maxLength, description });

export const detailsJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: schemaUrl,
  title: "Habiv game details (habiv.json)",
  description: `Details a game build carries for its Habiv page. Put habiv.json at the root of the bundle. Docs: ${siteUrl}/docs/details`,
  type: "object",
  properties: {
    $schema: { type: "string" },
    title: text(80, "The game's name."),
    tagline: text(140, "One line shown on cards."),
    description: text(DESCRIPTION_MAX, "About the game: the goal, how a round goes, tips and credits. Plain text."),
    categories: {
      type: "array",
      maxItems: 3,
      items: { type: "string", pattern: "^[a-z][a-z0-9_]{1,23}$", examples: ["arcade", "puzzle", "reaction", "ambient", "rhythm", "racing", "cozy", "horror", "experimental", "other"] },
      description: "Main category first.",
    },
    category: { type: "string", description: "Shorthand for a single category." },
    tags: { type: "array", maxItems: MAX_TAGS, items: { type: "string", pattern: "^[a-z0-9][a-z0-9 -]{0,23}$" } },
    orientation: { enum: ["portrait", "landscape", "any"] },
    duration_sec: { type: "integer", minimum: 1, maximum: 3600, description: "Typical round length in seconds; 3600 = endless." },
    controls: {
      type: "object",
      properties: {
        keys: {
          type: "array",
          maxItems: MAX_CONTROL_ROWS,
          items: {
            type: "object",
            properties: { key: text(CONTROL_KEY_MAX, "A key or gesture, e.g. Space or ← →."), action: text(CONTROL_ACTION_MAX, "What it does, e.g. Jump.") },
            required: ["key", "action"],
          },
        },
        touch: text(TOUCH_HINT_MAX, "How to play on a touch screen."),
      },
    },
    model: text(80, "AI model that made the game."),
    agent: text(80, "Tool or agent that made the game."),
    prompt: text(8000, "The prompt or brief behind the game."),
    changelog: text(500, "What changed in this version."),
  },
};
