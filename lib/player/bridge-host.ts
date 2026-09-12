"use client";

import { attachGameFrame } from "@/lib/bridge/parent";
import type { GameToParent, ParentToGame, RunOutcome } from "@/lib/bridge/protocol";
import { getCollector, type Collector } from "@/lib/analytics/collector";
import { gameOrigin as defaultGameOrigin } from "@/lib/site";

export type HostEvent =
  | { type: "ready" }
  | { type: "run_start"; runId: string | null; auto: boolean; counted: boolean }
  | { type: "run_end"; outcome: RunOutcome; score: number | null; durationMs: number | null; beatPct: number | null }
  | { type: "score_result"; accepted: boolean; flagged: string | null; boards: { period: string; rank: number; personal_best: boolean }[] }
  | { type: "happytime" }
  | { type: "level"; kind: "start" | "complete" | "fail"; level: string | null; score: number | null }
  | { type: "beat_game" }
  | { type: "error"; message: string };

export type BridgeHostOptions = {
  iframe: HTMLIFrameElement;
  gameId: string;
  versionId: string;
  playerId: string | null;
  handle?: string | null;
  muted?: boolean;
  locale?: string;
  /** Preview mode never mints runs or sends events. */
  preview?: boolean;
  gameOrigin?: string;
  collector?: Collector;
  /** Transparent layer over the iframe for the first interaction; enables auto-instrumentation. */
  overlay?: HTMLElement | null;
  onEvent?: (e: HostEvent) => void;
  /** Board key to submit scores to in addition to "main" (e.g. "daily"). */
  extraBoard?: string | null;
  /** Mint a run as soon as the host mounts (the Play click), so the play counts right away. */
  startOnMount?: boolean;
};

export type BridgeHost = {
  destroy(): void;
  pause(): void;
  resume(): void;
  mute(on: boolean): void;
  isRunning(): boolean;
};

type CurrentRun = { id: string; token: string; auto: boolean; startedAt: number };

const AUTO_START_GRACE_MS = 1500;
const MAX_DESIGN_KEYS = 100;

async function postJson<T>(url: string, body: unknown, keepalive = false): Promise<T | null> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), keepalive, credentials: "same-origin" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Parent side of the bridge: authenticates messages, mints server runs, forwards events to the
 * collector and instruments games that never call the SDK (first input starts a run, unmount
 * or tab hide ends it as "quit").
 */
export function mountBridgeHost(opts: BridgeHostOptions): BridgeHost {
  const origin = (opts.gameOrigin ?? defaultGameOrigin).replace(/\/$/, "");
  const collector = opts.collector ?? getCollector();
  const preview = !!opts.preview;
  const base = { game_id: opts.gameId, version_id: opts.versionId };
  let muted = !!opts.muted;
  let current: CurrentRun | null = null;
  let gameUsesBridgeRuns = false;
  let autoTimer: ReturnType<typeof setTimeout> | null = null;
  let starting: Promise<void> | null = null;
  /** Bumped when a round starts, so a late /api/runs/end reply can tell a newer round is already running. */
  let runSeq = 0;
  // The run minted on mount is taken over by the game's first SDK run_start instead of counting twice.
  let adoptLaunchRun = false;
  const designKeys = new Set<string>();
  let destroyed = false;

  const track = (e: Parameters<Collector["track"]>[0]) => {
    if (preview) return;
    collector.track({ ...e, run_id: e.run_id ?? current?.id });
  };
  const emit = (e: HostEvent) => opts.onEvent?.(e);

  const initMessage = (): ParentToGame => ({
    v: 1,
    type: "init",
    player_id: opts.playerId,
    handle: opts.handle ?? null,
    run_token: current?.token ?? null,
    muted,
    locale: opts.locale ?? (typeof navigator !== "undefined" ? navigator.language : "en"),
  });

  const startRun = async (level: string | undefined, auto: boolean) => {
    if (starting) await starting;
    if (destroyed) return;
    if (current) await endRun("quit", {}, false);
    runSeq += 1;
    starting = (async () => {
      let counted = false;
      if (preview) {
        current = { id: crypto.randomUUID(), token: "", auto, startedAt: Date.now() };
      } else {
        const res = await postJson<{ run_id: string | null; run_token: string | null; counted?: boolean }>("/api/runs/start", { ...base, session_id: collector.sessionId, level, auto });
        if (res?.run_id && res.run_token) current = { id: res.run_id, token: res.run_token, auto, startedAt: Date.now() };
        else current = null;
        // The server counts only the session's first run of this game; restarts come back uncounted.
        counted = !!current && !!res?.counted;
      }
      frame.post(initMessage());
      track({ ...base, name: "run_start", level });
      emit({ type: "run_start", runId: current?.id ?? null, auto, counted });
    })();
    await starting;
    starting = null;
  };

  const endRun = async (outcome: RunOutcome, extra: { score?: number; level?: string; progress_pct?: number }, keepalive: boolean) => {
    const run = current;
    current = null;
    adoptLaunchRun = false;
    if (!run) {
      // No server run (minting failed or was refused): the round still ended in the game, so the
      // page shows its result the same way every time. Quits come only from the host, never here.
      if (outcome !== "quit") emit({ type: "run_end", outcome, score: extra.score ?? null, durationMs: null, beatPct: null });
      return;
    }
    track({ ...base, name: "run_end", outcome, score: extra.score, level: extra.level, run_id: run.id });
    if (preview || !run.token) {
      emit({ type: "run_end", outcome, score: extra.score ?? null, durationMs: Date.now() - run.startedAt, beatPct: null });
      return;
    }
    const seq = runSeq;
    const res = await postJson<{ duration_ms: number; beat_pct: number | null }>("/api/runs/end", { run_id: run.id, run_token: run.token, outcome, ...extra }, keepalive);
    // The player retried inside the game before this reply came back: the old round's result would land
    // in the middle of the new one. The run is closed on the server either way.
    if (seq !== runSeq) return;
    emit({ type: "run_end", outcome, score: extra.score ?? null, durationMs: res?.duration_ms ?? Date.now() - run.startedAt, beatPct: res?.beat_pct ?? null });
  };

  const submitScore = async (board: string, value: number | undefined) => {
    track({ ...base, name: "score_submit", value, props: { board } });
    // A score sent right after runStart would otherwise find no run while /api/runs/start is still answering.
    if (starting) await starting;
    // Held here because the game's runEnd usually follows at once and clears `current` mid-loop.
    const run = current;
    if (preview || !run?.token || value === undefined) {
      if (!preview && value !== undefined) console.warn("[habiv] score dropped: no server run to attach it to");
      return;
    }
    const boards = [board, opts.extraBoard].filter((b): b is string => !!b);
    for (const key of boards) {
      const res = await postJson<{ accepted: boolean; flagged: string | null; boards: { period: string; rank: number; personal_best: boolean }[] }>(
        "/api/runs/score",
        { run_id: run.id, run_token: run.token, board: key, value },
      );
      if (res) emit({ type: "score_result", accepted: res.accepted, flagged: res.flagged, boards: res.boards ?? [] });
    }
  };

  const onMessage = (msg: GameToParent) => {
    switch (msg.type) {
      case "ready":
        frame.post(initMessage());
        track({ ...base, name: "ready" });
        emit({ type: "ready" });
        break;
      case "run_start":
        gameUsesBridgeRuns = true;
        if (autoTimer) clearTimeout(autoTimer);
        if (adoptLaunchRun) {
          adoptLaunchRun = false;
          void (async () => {
            if (starting) await starting;
            if (!current) await startRun(msg.level, false);
          })();
          break;
        }
        void startRun(msg.level, false);
        break;
      case "run_end": {
        // A round that ends while its run is still being minted (a crash within a second of a retry)
        // waits for the run, so it is closed and its result shown instead of the end being lost.
        // A score sent just before is handled first: it awaited the same promise earlier.
        const end = () => endRun(msg.outcome, { score: msg.score, level: msg.level, progress_pct: msg.progress_pct }, false);
        void (starting ? starting.then(end) : end());
        break;
      }
      case "level_start":
      case "level_complete":
      case "level_fail": {
        const kind = msg.type === "level_start" ? "start" : msg.type === "level_complete" ? "complete" : "fail";
        track({ ...base, name: msg.type, level: msg.level, score: "score" in msg ? msg.score : undefined });
        emit({ type: "level", kind, level: msg.level ?? null, score: ("score" in msg ? msg.score : undefined) ?? null });
        break;
      }
      case "beat_game":
        track({ ...base, name: "beat_game" });
        emit({ type: "beat_game" });
        break;
      case "score_submit":
        void submitScore(msg.board || "main", msg.value);
        break;
      case "gameplay_start":
      case "gameplay_stop":
      case "happytime":
        track({ ...base, name: msg.type });
        if (msg.type === "happytime") emit({ type: "happytime" });
        break;
      case "design":
        if (!msg.key) break;
        if (!designKeys.has(msg.key)) {
          if (designKeys.size >= MAX_DESIGN_KEYS) break;
          designKeys.add(msg.key);
        }
        track({ ...base, name: "design", props: { key: msg.key.slice(0, 64), ...(typeof msg.value === "number" || typeof msg.value === "string" || typeof msg.value === "boolean" ? { value: msg.value } : {}) } });
        break;
      case "save":
        try {
          localStorage.setItem(`hv:save:${opts.gameId}:${msg.key}`, JSON.stringify(msg.value ?? null));
        } catch {
          /* ignore */
        }
        break;
      case "load": {
        let value: unknown = null;
        try {
          const raw = localStorage.getItem(`hv:save:${opts.gameId}:${msg.key}`);
          value = raw ? JSON.parse(raw) : null;
        } catch {
          value = null;
        }
        frame.post({ v: 1, type: "load_result", req_id: msg.req_id, value });
        break;
      }
      case "error":
        track({ ...base, name: "error", props: { message: msg.message.slice(0, 200) } });
        emit({ type: "error", message: msg.message });
        break;
    }
  };

  const frame = attachGameFrame(opts.iframe, { gameOrigin: origin, onMessage });

  // Auto-instrumentation for games that never call the SDK.
  const onFirstInteraction = () => {
    if (gameUsesBridgeRuns || current || autoTimer) return;
    autoTimer = setTimeout(() => {
      autoTimer = null;
      if (!gameUsesBridgeRuns && !current && !destroyed) void startRun(undefined, true);
    }, AUTO_START_GRACE_MS);
  };
  const overlay = opts.overlay ?? null;
  overlay?.addEventListener("pointerdown", onFirstInteraction);
  overlay?.addEventListener("keydown", onFirstInteraction);
  const onBlur = () => {
    if (document.activeElement === opts.iframe) onFirstInteraction();
  };
  window.addEventListener("blur", onBlur);

  const onHide = () => {
    if (document.visibilityState === "hidden" && current) void endRun("quit", {}, true);
  };
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", onHide);

  if (opts.startOnMount) {
    adoptLaunchRun = true;
    void startRun(undefined, true);
  }

  return {
    destroy() {
      destroyed = true;
      if (autoTimer) clearTimeout(autoTimer);
      overlay?.removeEventListener("pointerdown", onFirstInteraction);
      overlay?.removeEventListener("keydown", onFirstInteraction);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      if (current) void endRun("quit", {}, true);
      frame.detach();
    },
    pause() {
      frame.post({ v: 1, type: "pause" });
    },
    resume() {
      frame.post({ v: 1, type: "resume" });
    },
    mute(on) {
      muted = on;
      frame.post({ v: 1, type: "mute", on });
    },
    isRunning() {
      return current !== null;
    },
  };
}
