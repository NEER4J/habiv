import "server-only";
import { McpServer } from "@modelcontextprotocol/server";
import type { TokenAuth } from "@/lib/mcp/auth";
import { registerPublishTools } from "@/lib/mcp/tools/publish";
import { registerGameTools } from "@/lib/mcp/tools/games";

/** One server per request (stateless), bound to the authenticated token owner. */
export function buildHabivServer(auth: TokenAuth): McpServer {
  const server = new McpServer(
    { name: "habiv", version: "0.1.0", title: "Habiv" },
    {
      instructions:
        "Habiv hosts tiny browser games made with AI. Use publish_game to upload and publish a game (inline files under 3 MB, " +
        "or create_upload for bigger zips), get_publish_status to wait for processing, and update_game / unpublish_game to manage it. " +
        "Games run in a sandboxed iframe on a separate origin; include an index.html at the bundle root.",
    },
  );
  registerPublishTools(server, auth);
  registerGameTools(server, auth);
  return server;
}
