import "server-only";
import { McpServer } from "@modelcontextprotocol/server";
import type { TokenAuth } from "@/lib/mcp/auth";
import { siteUrl } from "@/lib/site";
import { registerPublishTools } from "@/lib/mcp/tools/publish";
import { registerGameTools } from "@/lib/mcp/tools/games";
import { registerArtTools } from "@/lib/mcp/tools/art";

/** One server per request (stateless), bound to the authenticated token owner. */
export function buildHabivServer(auth: TokenAuth): McpServer {
  const server = new McpServer(
    { name: "habiv", version: "0.1.0", title: "Habiv" },
    {
      instructions:
        "Habiv hosts tiny browser games made with AI. Publish with publish_game (inline files under 3 MB, or create_upload for bigger zips; " +
        "pass game_id to add a new version of an existing game), then poll get_publish_status until it is 'ready' and share the url. " +
        "Find games with list_my_games and get_game. To keep working on a game, read its code with get_game_files, edit it, and publish_game with its game_id. " +
        "Manage releases with list_versions, publish_version (switch the live version or roll back), update_version (changelog, prompt) and delete_version. " +
        "Edit details with update_game; hide a game with unpublish_game. " +
        "Give every game store art, a cover (16:9) and a card (3:4): make_thumbnail renders one of Habiv's ready-made designs (list_thumbnail_designs) " +
        "or your own HTML design; for an image file you made or generated, use create_art_upload and then set_game_art. " +
        "Games run in a sandboxed iframe on a separate origin with network off by default; include an index.html at the bundle root. " +
        "Always describe the game for its page: pass tagline, description and controls (each key and what it does, plus a touch hint) to publish_game, " +
        `and include a habiv.json with the same details at the bundle root so they stay with the code (format: ${siteUrl}/docs/details). ` +
        "get_publish_status reports the details found in the build and which page fields are still empty; fill those with update_game. " +
        "The person you are helping is usually not technical: describe results in plain words and always give them the game link.",
    },
  );
  registerPublishTools(server, auth);
  registerGameTools(server, auth);
  registerArtTools(server, auth);
  return server;
}
