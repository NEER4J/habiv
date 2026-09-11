import "server-only";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl, gameOrigin } from "@/lib/site";
import type { TokenAuth } from "@/lib/mcp/auth";

export class ToolError extends Error {
  constructor(message: string, public code = "error") {
    super(message);
  }
}

export function ok(result: Record<string, unknown>): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
}

export function fail(message: string, code = "error"): CallToolResult {
  return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: code, message }) }] };
}

/** Wraps a tool body so thrown ToolErrors become MCP error results instead of transport failures. */
export async function guarded(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ToolError) return fail(e.message, e.code);
    console.error("mcp tool error", e);
    return fail("Something went wrong on Habiv's side. Try again in a moment.", "internal");
  }
}

export async function assertPublishRate(auth: TokenAuth) {
  const { data } = await createAdminClient().rpc("rate_limit_hit", { p_key: `publish:${auth.tokenId}`, p_window: "1 hour", p_limit: 20 });
  if (data === false) throw new ToolError("This token has published 20 times in the last hour. Wait a bit.", "rate_limited");
}

export async function ownedGame(auth: TokenAuth, gameId: string) {
  const { data } = await createAdminClient().from("games").select("*").eq("id", gameId).maybeSingle();
  if (!data || data.creator_id !== auth.userId) throw new ToolError("Game not found (or not yours).", "not_found");
  return data;
}

export async function handleOf(userId: string): Promise<string> {
  const { data } = await createAdminClient().from("profiles").select("handle").eq("id", userId).maybeSingle();
  return data?.handle ?? "";
}

export function gameUrls(handle: string, slug: string, shortId: string) {
  return { url: `${siteUrl}/@${handle}/${slug}`, short_url: `${siteUrl}/g/${shortId}` };
}

export function previewUrl(versionId: string) {
  return gameOrigin ? `${gameOrigin}/v/${versionId}/?mode=preview` : null;
}
