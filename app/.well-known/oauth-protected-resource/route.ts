import { oauthJson, preflight, protectedResourceMetadata, requestOrigin } from "@/lib/oauth/core";

/** RFC 9728 metadata for the MCP endpoint (root form; the path-suffixed form lives in ./api/mcp). */
export function GET(request: Request) {
  return oauthJson(protectedResourceMetadata(requestOrigin(request)));
}

export const OPTIONS = preflight;
