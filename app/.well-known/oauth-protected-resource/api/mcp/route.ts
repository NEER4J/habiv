import { oauthJson, preflight, protectedResourceMetadata, requestOrigin } from "@/lib/oauth/core";

/** RFC 9728 metadata for /api/mcp; the URL the MCP 401 challenge points clients to. */
export function GET(request: Request) {
  return oauthJson(protectedResourceMetadata(requestOrigin(request)));
}

export const OPTIONS = preflight;
