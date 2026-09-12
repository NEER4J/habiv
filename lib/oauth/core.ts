import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { TOKEN_ALPHABET, TOKEN_PREFIX } from "@/lib/tokens/format";

/**
 * OAuth 2.1 authorization server for the remote MCP endpoint, per the MCP auth spec:
 * RFC 9728 resource metadata, RFC 8414 server metadata, RFC 7591 dynamic client registration
 * and PKCE (S256 only).
 *
 * Stateless: client ids are HMAC-signed registrations and authorization codes are AES-GCM
 * sealed, so only the issued token touches the database. That token is an ordinary hbv_live_
 * row in api_tokens derived from the code, so the unique token_hash makes each code single-use
 * and the connection is listed and revocable in Settings like any personal token.
 */

export const OAUTH_SCOPE = "publish";
const CODE_TTL_S = 300;
const CLIENT_PREFIX = "hbvc_";
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const BANNED_SCHEMES = new Set(["javascript:", "data:", "file:", "vbscript:", "blob:", "about:"]);

function subkey(label: string): Buffer {
  const s = process.env.RUN_TOKEN_SECRET;
  if (!s) throw new Error("RUN_TOKEN_SECRET is not set");
  return createHmac("sha256", s).update(`habiv-oauth-v1:${label}`).digest();
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// ── Clients ─────────────────────────────────────────────────────────────────

export type OAuthClient = { name: string; redirectUris: string[] };

const sign = (body: string) => createHmac("sha256", subkey("client")).update(body).digest("base64url").slice(0, 32);

export function encodeClientId(client: OAuthClient): string {
  const body = Buffer.from(JSON.stringify({ n: client.name, r: client.redirectUris })).toString("base64url");
  return `${CLIENT_PREFIX}${body}.${sign(body)}`;
}

export function decodeClientId(id: string | null | undefined): OAuthClient | null {
  if (!id?.startsWith(CLIENT_PREFIX) || id.length > 4096) return null;
  const [body, sig] = id.slice(CLIENT_PREFIX.length).split(".");
  if (!body || !sig || !safeEqual(sig, sign(body))) return null;
  try {
    const v = JSON.parse(Buffer.from(body, "base64url").toString()) as { n?: unknown; r?: unknown };
    if (typeof v.n !== "string" || !Array.isArray(v.r) || !v.r.every((u) => typeof u === "string")) return null;
    return { name: v.n, redirectUris: v.r as string[] };
  } catch {
    return null;
  }
}

const clientHash = (clientId: string) => createHash("sha256").update(clientId).digest("base64url");

export function cleanClientName(v: unknown): string {
  const s = typeof v === "string" ? v.replace(/\p{Cc}/gu, "").trim().slice(0, 60) : "";
  return s || "An MCP client";
}

/** https, loopback http (any port), or a native app's custom scheme (cursor://, vscode://). */
export function isAllowedRedirectUri(raw: string): boolean {
  if (raw.length > 500) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.hash || u.username || u.password || BANNED_SCHEMES.has(u.protocol)) return false;
  if (u.protocol === "http:") return LOOPBACK.has(u.hostname);
  if (u.protocol === "https:") return true;
  return /^[a-z][a-z0-9+.-]*:$/.test(u.protocol);
}

/** Exact match, except loopback redirects may use any port (RFC 8252 §7.3). */
export function matchRedirectUri(client: OAuthClient, requested: string): boolean {
  if (client.redirectUris.includes(requested)) return true;
  let r: URL;
  try {
    r = new URL(requested);
  } catch {
    return false;
  }
  if (r.protocol !== "http:" || !LOOPBACK.has(r.hostname)) return false;
  return client.redirectUris.some((raw) => {
    const u = new URL(raw);
    u.port = r.port;
    return u.href === r.href;
  });
}

// ── Authorization request ───────────────────────────────────────────────────

export type AuthorizeCheck =
  | { ok: true; clientId: string; client: OAuthClient; redirectUri: string; state: string | null; codeChallenge: string }
  /** Bad client or redirect: never redirect to an unverified address, show the error instead. */
  | { ok: false; fatal: true; message: string }
  | { ok: false; fatal: false; redirect: string };

export const AUTHORIZE_PARAMS = ["response_type", "client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "scope", "resource"] as const;

export function withParams(uri: string, params: Record<string, string | null | undefined>): string {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v);
  return u.toString();
}

export function checkAuthorize(p: Partial<Record<string, string>>): AuthorizeCheck {
  const client = decodeClientId(p.client_id);
  if (!client) return { ok: false, fatal: true, message: "This app isn't registered with Habiv. Start the connection again from your agent." };
  if (!p.redirect_uri || !matchRedirectUri(client, p.redirect_uri)) {
    return { ok: false, fatal: true, message: "The app asked to return to an address it didn't register, so Habiv stopped here." };
  }
  const state = p.state ?? null;
  const fail = (error: string, description: string) => ({ ok: false as const, fatal: false as const, redirect: withParams(p.redirect_uri!, { error, error_description: description, state }) });
  if (p.response_type !== "code") return fail("unsupported_response_type", "Only response_type=code is supported.");
  if (p.code_challenge_method !== "S256" || !p.code_challenge || !/^[A-Za-z0-9_-]{43}$/.test(p.code_challenge)) {
    return fail("invalid_request", "PKCE with code_challenge_method=S256 is required.");
  }
  return { ok: true, clientId: p.client_id!, client, redirectUri: p.redirect_uri, state, codeChallenge: p.code_challenge };
}

// ── Codes and tokens ────────────────────────────────────────────────────────

type CodePayload = { u: string; c: string; r: string; ch: string; e: number };

export function sealCode(a: { userId: string; clientId: string; redirectUri: string; codeChallenge: string }): string {
  const payload: CodePayload = { u: a.userId, c: clientHash(a.clientId), r: a.redirectUri, ch: a.codeChallenge, e: Math.floor(Date.now() / 1000) + CODE_TTL_S };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", subkey("code"), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64url");
}

export type OpenedCode = { userId: string; redirectUri: string; codeChallenge: string };

/** Returns the code's grant when it is authentic, unexpired and was issued to `clientId`. */
export function openCode(code: string, clientId: string): OpenedCode | null {
  try {
    const raw = Buffer.from(code, "base64url");
    if (raw.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", subkey("code"), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const p = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString()) as CodePayload;
    if (p.e < Date.now() / 1000 || !safeEqual(p.c, clientHash(clientId))) return null;
    return { userId: p.u, redirectUri: p.r, codeChallenge: p.ch };
  } catch {
    return null;
  }
}

export function pkceMatches(verifier: string | undefined, challenge: string): boolean {
  if (!verifier || !/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  return safeEqual(createHash("sha256").update(verifier).digest("base64url"), challenge);
}

/** hbv_live_ token derived from the code (unbiased base62 via rejection sampling). */
export function tokenForCode(code: string): string {
  const limit = 256 - (256 % TOKEN_ALPHABET.length);
  let out = "";
  for (let i = 0; out.length < 32; i++) {
    for (const b of createHmac("sha256", subkey("token")).update(`${code}:${i}`).digest()) {
      if (b < limit && out.length < 32) out += TOKEN_ALPHABET[b % TOKEN_ALPHABET.length];
    }
  }
  return TOKEN_PREFIX + out;
}

// ── HTTP helpers ────────────────────────────────────────────────────────────

export const requestOrigin = (request: Request) => new URL(request.url).origin;
export const resourceMetadataUrl = (origin: string) => `${origin}/.well-known/oauth-protected-resource/api/mcp`;

export function protectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}/api/mcp`,
    resource_name: "Habiv",
    authorization_servers: [origin],
    scopes_supported: [OAUTH_SCOPE],
    bearer_methods_supported: ["header"],
  };
}

export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/mcp/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    scopes_supported: [OAUTH_SCOPE],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    service_documentation: `${origin}/settings?tab=api`,
  };
}

/** No cookies are involved on these endpoints, so any origin may call them (browser-based MCP clients). */
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version",
  "access-control-max-age": "86400",
};

export const oauthJson = (body: unknown, status = 200) => Response.json(body, { status, headers: { ...cors, "cache-control": "no-store" } });
export const oauthError = (error: string, description: string, status = 400) => oauthJson({ error, error_description: description }, status);
export const preflight = () => new Response(null, { status: 204, headers: cors });
export const clientIp = (request: Request) => request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
