import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken, prefixOf } from "@/lib/tokens/format";
import { clientIp, decodeClientId, OAUTH_SCOPE, oauthError, oauthJson, openCode, pkceMatches, preflight, tokenForCode } from "@/lib/oauth/core";

async function readParams(request: Request): Promise<Record<string, string>> {
  const params: Record<string, string> = {};
  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    for (const [k, v] of Object.entries(body ?? {})) if (typeof v === "string") params[k] = v;
  } else {
    for (const [k, v] of new URLSearchParams(await request.text())) params[k] = v;
  }
  // Some clients send client_id via HTTP Basic even when registered as public.
  const basic = request.headers.get("authorization");
  if (!params.client_id && basic?.toLowerCase().startsWith("basic ")) {
    params.client_id = decodeURIComponent(Buffer.from(basic.slice(6), "base64").toString().split(":")[0] ?? "");
  }
  return params;
}

/**
 * Authorization-code exchange. The token is derived from the code, so a replayed code collides on
 * api_tokens.token_hash; the token first issued from it is then revoked (OAuth 2.1 §4.1.2).
 * Tokens do not expire; they last until revoked in Settings, like personal tokens.
 */
export async function POST(request: Request) {
  const admin = createAdminClient();
  const { data: allowed } = await admin.rpc("rate_limit_hit", { p_key: `oauth:token:${clientIp(request)}`, p_window: "1 hour", p_limit: 60 });
  if (allowed === false) return oauthError("invalid_request", "Too many token requests from this address. Try again later.", 429);

  const p = await readParams(request);
  if (p.grant_type !== "authorization_code") return oauthError("unsupported_grant_type", "Only authorization_code is supported.");
  const client = decodeClientId(p.client_id);
  if (!client) return oauthError("invalid_client", "Unknown client_id. Register again.", 401);
  const grant = p.code ? openCode(p.code, p.client_id) : null;
  if (!grant) return oauthError("invalid_grant", "The authorization code is invalid or expired.");
  if (p.redirect_uri !== grant.redirectUri) return oauthError("invalid_grant", "redirect_uri does not match the authorization request.");
  if (!pkceMatches(p.code_verifier, grant.codeChallenge)) return oauthError("invalid_grant", "PKCE verification failed.");

  const token = tokenForCode(p.code);
  const { error } = await admin
    .from("api_tokens")
    .insert({ user_id: grant.userId, name: client.name.slice(0, 40), token_hash: hashToken(token), prefix: prefixOf(token), scopes: [OAUTH_SCOPE] });
  if (error?.code === "23505") {
    await admin.from("api_tokens").update({ revoked_at: new Date().toISOString() }).eq("token_hash", hashToken(token)).is("revoked_at", null);
    return oauthError("invalid_grant", "This authorization code was already used.");
  }
  if (error) {
    console.error("oauth token", error);
    return oauthError("server_error", "Could not issue a token.", 500);
  }
  return oauthJson({ access_token: token, token_type: "Bearer", scope: OAUTH_SCOPE });
}

export const OPTIONS = preflight;
