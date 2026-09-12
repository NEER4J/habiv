import { siteUrl } from "@/lib/site";

/** The "connect your AI" setup, shared by Settings → Connect AI and the MCP docs so both always say the same thing. */

export const mcpUrl = `${siteUrl}/api/mcp`;

export const mcpConfig = JSON.stringify({ mcpServers: { habiv: { type: "http", url: mcpUrl } } }, null, 2);

export const claudeCodeCommand = `claude mcp add --transport http --scope user habiv ${mcpUrl}`;

export const codexCommand = `codex mcp add habiv --url ${mcpUrl}\ncodex mcp login habiv`;

/** Pasted into Claude Code or Codex as-is: the agent does the setup and walks the user through approving. */
export const connectPrompt = `Please connect yourself to Habiv (${siteUrl}) so you can publish the browser games we make together.

Habiv is a remote MCP server:
  URL: ${mcpUrl}
  Transport: Streamable HTTP
  Sign-in: OAuth in my browser (no API key needed)

Steps:
1. Add it as an MCP server named "habiv", available in all my projects.
   - Claude Code: ${claudeCodeCommand}
   - Codex: codex mcp add habiv --url ${mcpUrl}
   - Any other app: add a remote HTTP MCP server with the URL above.
2. Start the sign-in.
   - Codex: run codex mcp login habiv (it opens my browser).
   - Claude Code: tell me to restart Claude Code, type /mcp, pick "habiv" and choose Authenticate.
3. A Habiv page will open in my browser. Tell me to click Approve, then wait for me.
4. Once the habiv tools show up, call list_my_games to confirm we're connected.

Keep your replies short and in plain words, not technical. From then on, when I say "publish this to Habiv", use publish_game with the game's files (index.html at the root) and share the link when it's live.`;

export const manualSetup = [
  { label: "Claude Code", text: claudeCodeCommand },
  { label: "Codex", text: codexCommand },
  { label: "Other apps", text: mcpConfig },
];

export const connectSteps = ["Copy the message", "Paste it into Claude Code or Codex", "Click Approve when Habiv opens"];
