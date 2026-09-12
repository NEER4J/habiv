import "server-only";
import { createHash, randomInt } from "node:crypto";

export const TOKEN_PREFIX = "hbv_live_";
export const TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** hbv_live_ + 32 unbiased base62 characters (randomInt avoids modulo bias). */
export function generateToken(): string {
  let s = "";
  for (let i = 0; i < 32; i++) s += TOKEN_ALPHABET[randomInt(0, TOKEN_ALPHABET.length)];
  return TOKEN_PREFIX + s;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** First 12 characters of the random part, shown in the token list. */
export function prefixOf(token: string): string {
  return token.slice(TOKEN_PREFIX.length, TOKEN_PREFIX.length + 12);
}

export function looksLikeToken(v: string | null | undefined): v is string {
  return !!v && /^hbv_live_[A-Za-z0-9]{32}$/.test(v);
}
