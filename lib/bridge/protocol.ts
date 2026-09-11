/** postMessage protocol between a game (inside the iframe on the game origin) and the watch page. */

export type RunOutcome = "complete" | "fail" | "quit";

export type GameToParent =
  | { v: 1; type: "ready" }
  | { v: 1; type: "run_start"; level?: string }
  | { v: 1; type: "run_end"; outcome: RunOutcome; score?: number; level?: string; progress_pct?: number }
  | { v: 1; type: "level_start"; level?: string }
  | { v: 1; type: "level_complete"; level?: string; score?: number }
  | { v: 1; type: "level_fail"; level?: string; score?: number }
  | { v: 1; type: "beat_game" }
  | { v: 1; type: "score_submit"; board: string; value?: number }
  | { v: 1; type: "gameplay_start" }
  | { v: 1; type: "gameplay_stop" }
  | { v: 1; type: "happytime" }
  | { v: 1; type: "save"; key: string; value: unknown }
  | { v: 1; type: "load"; key: string; req_id: string }
  | { v: 1; type: "design"; key?: string; value?: unknown }
  | { v: 1; type: "error"; message: string };

export type ParentToGame =
  | { v: 1; type: "init"; player_id: string | null; handle: string | null; run_token: string | null; muted: boolean; locale: string }
  | { v: 1; type: "pause" }
  | { v: 1; type: "resume" }
  | { v: 1; type: "mute"; on: boolean }
  | { v: 1; type: "load_result"; req_id: string; value: unknown };

export const GAME_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  "ready", "run_start", "run_end", "level_start", "level_complete", "level_fail", "beat_game",
  "score_submit", "gameplay_start", "gameplay_stop", "happytime", "save", "load", "design", "error",
]);

export function isGameMessage(data: unknown): data is GameToParent & { t?: number } {
  if (!data || typeof data !== "object") return false;
  const d = data as { v?: unknown; type?: unknown };
  return d.v === 1 && typeof d.type === "string" && GAME_MESSAGE_TYPES.has(d.type);
}
