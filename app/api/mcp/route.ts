import { createMcpHandler } from "@modelcontextprotocol/server";
import { authenticateToken, toAuthInfo, type TokenAuth } from "@/lib/mcp/auth";
import { buildHabivServer } from "@/lib/mcp/server";


/**
 * Remote MCP server (Streamable HTTP, stateless, JSON responses). Auth is a personal token:
 * `Authorization: Bearer hbv_live_...` created in Settings > API & MCP.
 */
const handler = createMcpHandler(
  (ctx) => {
    const extra = ctx.authInfo?.extra as { userId?: string; tokenId?: string } | undefined;
    const auth: TokenAuth = { userId: extra?.userId ?? "", tokenId: extra?.tokenId ?? "", scopes: ctx.authInfo?.scopes ?? [] };
    return buildHabivServer(auth);
  },
  { responseMode: "json", legacy: "stateless", onerror: (e) => console.error("mcp", e) },
);

const unauthorized = () =>
  Response.json(
    { error: "unauthorized", message: "Pass a Habiv API token: Authorization: Bearer hbv_live_..." },
    { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="habiv"', "cache-control": "no-store" } },
  );

export async function POST(request: Request) {
  const auth = await authenticateToken(request.headers.get("authorization"));
  if (!auth) return unauthorized();
  return handler.fetch(request, { authInfo: toAuthInfo(auth) });
}

export function GET() {
  return Response.json(
    { name: "habiv", transport: "streamable-http", hint: "POST JSON-RPC here with a Bearer token; see https://habiv.com/settings?tab=api" },
    { status: 405, headers: { allow: "POST" } },
  );
}

export function DELETE() {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}
