import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A player's result on one game, packed into the ?s= token of a shared game link. It is signed so
 * nobody can mint a card with a score they never got; the server builds it from the viewer's own
 * saved runs (lib/actions/share.ts).
 */
export type ScoreShare = {
  gameId: string;
  /** Best score, or null for a game without scores (the card then shows rounds played). */
  score: number | null;
  /** All-time board place and board size, when the game has a board. */
  rank: number | null;
  total: number | null;
  rounds: number;
  playedMs: number;
  /** Player handle; null for guests. */
  name: string | null;
  /** When the token was made (epoch seconds). */
  at: number;
  /** When the shared run was played (epoch seconds); null when this is the player's best. */
  runAt: number | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function key() {
  const s = process.env.RUN_TOKEN_SECRET;
  if (!s) throw new Error("RUN_TOKEN_SECRET is not set");
  return createHmac("sha256", s).update("habiv-score-share-v1").digest();
}

const sign = (body: string) => createHmac("sha256", key()).update(body).digest("base64url").slice(0, 22);

export function signScoreShare(s: ScoreShare): string {
  const body = Buffer.from(JSON.stringify([s.gameId, s.score, s.rank, s.total, s.rounds, s.playedMs, s.name, s.at, s.runAt])).toString("base64url");
  return `${body}.${sign(body)}`;
}

const int = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** The share in a token, or null when it is malformed or the signature does not match. */
export function readScoreShare(token: string | null | undefined): ScoreShare | null {
  if (!token || token.length > 600) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  try {
    const want = Buffer.from(sign(body));
    const got = Buffer.from(sig);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    const [gameId, score, rank, total, rounds, playedMs, name, at, runAt] = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as unknown[];
    if (typeof gameId !== "string" || !UUID_RE.test(gameId)) return null;
    return {
      gameId,
      score: int(score),
      rank: int(rank),
      total: int(total),
      rounds: int(rounds) ?? 0,
      playedMs: int(playedMs) ?? 0,
      name: typeof name === "string" && name ? name : null,
      at: int(at) ?? 0,
      runAt: int(runAt),
    };
  } catch {
    return null;
  }
}

/** "34m", "1h 5m": time played for cards and share text. */
export function playedLabel(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
