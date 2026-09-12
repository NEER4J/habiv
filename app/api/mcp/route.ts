import { createMcpHandler } from "@modelcontextprotocol/server";
import { authenticateToken, toAuthInfo, type TokenAuth } from "@/lib/mcp/auth";
import { buildHabivServer } from "@/lib/mcp/server";
import { requestOrigin, resourceMetadataUrl } from "@/lib/oauth/core";
import { siteUrl } from "@/lib/site";


/**
 * Remote MCP server (Streamable HTTP, stateless, JSON responses). Auth is `Authorization: Bearer hbv_live_...`,
 * issued by the OAuth browser approval or created by hand in Settings > Connect AI.
 */
const handler = createMcpHandler(
  (ctx) => {
    const extra = ctx.authInfo?.extra as { userId?: string; tokenId?: string } | undefined;
    const auth: TokenAuth = { userId: extra?.userId ?? "", tokenId: extra?.tokenId ?? "", scopes: ctx.authInfo?.scopes ?? [] };
    return buildHabivServer(auth);
  },
  { responseMode: "json", legacy: "stateless", onerror: (e) => console.error("mcp", e) },
);

/** The challenge points MCP clients at the OAuth metadata, which starts the browser approval flow. */
const unauthorized = (request: Request) =>
  Response.json(
    { error: "unauthorized", message: "Connect with OAuth (your MCP client opens Habiv to approve) or pass a personal token: Authorization: Bearer hbv_live_..." },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": `Bearer realm="habiv", resource_metadata="${resourceMetadataUrl(requestOrigin(request))}"`,
        "cache-control": "no-store",
      },
    },
  );

export async function POST(request: Request) {
  const auth = await authenticateToken(request.headers.get("authorization"));
  if (!auth) return unauthorized(request);
  return handler.fetch(request, { authInfo: toAuthInfo(auth) });
}

export function GET() {
  return Response.json(
    { name: "habiv", transport: "streamable-http", hint: `POST JSON-RPC here with a Bearer token; see ${siteUrl}/settings?tab=api` },
    { status: 405, headers: { allow: "POST" } },
  );
}

export function DELETE() {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}
