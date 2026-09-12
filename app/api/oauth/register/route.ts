import { createAdminClient } from "@/lib/supabase/admin";
import { cleanClientName, clientIp, encodeClientId, isAllowedRedirectUri, OAUTH_SCOPE, oauthError, oauthJson, preflight } from "@/lib/oauth/core";

/**
 * RFC 7591 dynamic client registration. Nothing is stored: the returned client_id is the signed
 * registration itself. Every client is public (PKCE, no secret).
 */
export async function POST(request: Request) {
  const { data: allowed } = await createAdminClient().rpc("rate_limit_hit", { p_key: `oauth:register:${clientIp(request)}`, p_window: "1 hour", p_limit: 30 });
  if (allowed === false) return oauthError("invalid_request", "Too many registrations from this address. Try again later.", 429);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return oauthError("invalid_client_metadata", "Send the client metadata as a JSON object.");

  const uris = body.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > 10 || !uris.every((u) => typeof u === "string")) {
    return oauthError("invalid_redirect_uri", "redirect_uris must list 1 to 10 URLs.");
  }
  const bad = (uris as string[]).find((u) => !isAllowedRedirectUri(u));
  if (bad) return oauthError("invalid_redirect_uri", `Not allowed: ${bad.slice(0, 200)}. Use https, http on localhost, or an app scheme.`);
  if (Array.isArray(body.grant_types) && !body.grant_types.includes("authorization_code")) {
    return oauthError("invalid_client_metadata", "Only the authorization_code grant is supported.");
  }

  const name = cleanClientName(body.client_name);
  return oauthJson(
    {
      client_id: encodeClientId({ name, redirectUris: uris as string[] }),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: name,
      redirect_uris: uris,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: OAUTH_SCOPE,
    },
    201,
  );
}

export const OPTIONS = preflight;
