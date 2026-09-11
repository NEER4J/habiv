import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type RunTokenFields = { runId: string; gameId: string; playerId: string; startedAt: string };

function secret(): string {
  const s = process.env.RUN_TOKEN_SECRET;
  if (!s) throw new Error("RUN_TOKEN_SECRET is not set");
  return s;
}

/** Binds a run to its game, player and server start time. The client cannot forge or reuse it. */
export function mintRunToken(f: RunTokenFields): string {
  return createHmac("sha256", secret()).update(`${f.runId}|${f.gameId}|${f.playerId}|${f.startedAt}`).digest("base64url");
}

export function verifyRunToken(f: RunTokenFields, token: string): boolean {
  const expected = Buffer.from(mintRunToken(f));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Stored in analytics.runs.token_hash; lets a leaked database not yield usable tokens. */
export function hashRunToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isoNow(): string {
  return new Date().toISOString();
}
