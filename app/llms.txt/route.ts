import { siteDescription } from "@/lib/seo";
import { siteUrl } from "@/lib/site";

/** llms.txt (llmstxt.org): a plain-language map of the site for AI assistants and agents. */
export function GET() {
  const body = `# Habiv

> ${siteDescription}

Games are tiny HTML5 games (a single HTML file or a zip) that run sandboxed in the browser. Each game lives at ${siteUrl}/@handle/game-slug and each creator at ${siteUrl}/@handle.

## Browse
- [Home feed](${siteUrl}/): featured games, trending, quick play and new games
- [Explore](${siteUrl}/explore): every game, filterable by category (?category=arcade) and sort (?sort=trending)
- [Sitemap](${siteUrl}/sitemap.xml): every published game and creator

## Docs
- [Build for Habiv](${siteUrl}/docs): what a build looks like, upload checks, limits and how games run
- [Game details](${siteUrl}/docs/details): habiv.json, the file in a bundle that fills in a game's title, description, how to play, categories and tags (JSON Schema: ${siteUrl}/habiv.schema.json)
- [Game SDK](${siteUrl}/docs/sdk): window.Habiv calls for runs, scores, levels, saves and pause/mute (injected into every game)
- [MCP & agents](${siteUrl}/docs/mcp): connecting an agent, every tool, limits and troubleshooting
- [AI prompts](${siteUrl}/docs/prompts.md): copy-paste prompts to build a game from scratch, make an existing game work on Habiv, add a leaderboard and saves, and publish (Markdown; page at ${siteUrl}/docs/prompts)

## Publish from an AI agent
- Building a game for Habiv? Read ${siteUrl}/docs/prompts.md first: it has the build rules and SDK calls in one place.
- Describe every game in a habiv.json at the bundle root (or a <script type="application/habiv+json"> block in a single HTML file): ${siteUrl}/docs/details
- MCP server: ${siteUrl}/api/mcp (streamable HTTP, OAuth sign-in in the browser; no token needed)
- Tools: publish_game, create_upload, get_publish_status, get_game, list_my_games, list_versions, publish_version, update_version, get_game_files, update_game, unpublish_game, list_thumbnail_designs, make_thumbnail, get_thumbnail_status, create_art_upload, set_game_art
- publish_game takes text files as plain text (files[].content); only binary files need base64. Upload URLs from create_upload (up to 4 MB) and create_art_upload are on www.habiv.com, so a sandbox with a domain allowlist only needs that one domain.
- Claude Code: claude mcp add --transport http habiv ${siteUrl}/api/mcp

## Policies
- [About](${siteUrl}/about)
- [Terms of Service](${siteUrl}/terms)
- [Privacy Policy](${siteUrl}/privacy)
- [Community Guidelines](${siteUrl}/guidelines)
- [Copyright Policy](${siteUrl}/copyright)
`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
