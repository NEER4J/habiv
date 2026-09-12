import { authorizationServerMetadata, oauthJson, preflight, requestOrigin } from "@/lib/oauth/core";

/** RFC 8414 metadata: where MCP clients register, send the user to approve, and exchange the code. */
export function GET(request: Request) {
  return oauthJson(authorizationServerMetadata(requestOrigin(request)));
}

export const OPTIONS = preflight;
