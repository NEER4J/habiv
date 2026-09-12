import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { siteUrl } from "@/lib/site";

/**
 * Upload URLs on habiv.com itself. Agent sandboxes often reach only an allowlist of domains, which
 * can include habiv.com but rarely the storage host behind presigned URLs, so uploads that fit in a
 * Vercel request body go through /api/mcp/upload/<token>, which writes the same storage key the
 * presigned URL would. The token is signed and names the key, content type, size cap and expiry,
 * so nothing is stored.
 */

/** Vercel rejects request bodies over 4.5 MB. */
export const RELAY_MAX_BYTES = 4 * 1024 * 1024;

type RelayBody = { k: string; t: string; m: number; e: number };
export type Relay = { key: string; contentType: string; maxBytes: number };

function secret(): Buffer {
  const s = process.env.RUN_TOKEN_SECRET;
  if (!s) throw new Error("RUN_TOKEN_SECRET is not set");
  return createHmac("sha256", s).update("habiv-relay-v1").digest();
}

const sign = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url");

/** A habiv.com URL that accepts one PUT of the file into the uploads bucket at `key`. */
export function relayUrl(a: { key: string; contentType: string; maxBytes: number; ttlSec: number }): string {
  const payload: RelayBody = { k: a.key, t: a.contentType, m: Math.min(a.maxBytes, RELAY_MAX_BYTES), e: Math.floor(Date.now() / 1000) + a.ttlSec };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${siteUrl}/api/mcp/upload/${body}.${sign(body)}`;
}

export function openRelay(token: string): Relay | null {
  const [body, sig] = token.split(".");
  if (!body || !sig || token.length > 2048) return null;
  const want = Buffer.from(sign(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as RelayBody;
    if (typeof p.k !== "string" || typeof p.t !== "string" || typeof p.m !== "number" || typeof p.e !== "number") return null;
    if (p.e < Date.now() / 1000) return null;
    return { key: p.k, contentType: p.t, maxBytes: p.m };
  } catch {
    return null;
  }
}
