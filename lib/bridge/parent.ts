"use client";

import { gameOrigin } from "@/lib/site";
import { isGameMessage, type GameToParent, type ParentToGame } from "@/lib/bridge/protocol";

export type FrameMode = "play" | "preview" | "smoke";

/**
 * Builds the iframe src for a version. `origin` tells the bridge who to talk to; `muted` lets it
 * silence the game from its first sound, before the init message arrives.
 */
export function gameFrameSrc(opts: { versionId: string; mode?: FrameMode; playerId?: string | null; origin?: string; muted?: boolean }): string {
  const base = opts.origin ?? gameOrigin;
  const params = new URLSearchParams();
  params.set("origin", typeof window !== "undefined" ? window.location.origin : "https://habiv.com");
  if (opts.mode && opts.mode !== "play") params.set("mode", opts.mode);
  if (opts.playerId) params.set("pid", opts.playerId);
  if (opts.muted) params.set("muted", "1");
  return `${base}/v/${opts.versionId}/?${params.toString()}`;
}

export type AttachedFrame = {
  post(msg: ParentToGame): void;
  detach(): void;
};

/**
 * Low-level listener: only accepts messages from the configured game origin and this
 * exact iframe. Prefer lib/player/bridge-host.ts, which builds on this and adds runs/analytics.
 */
export function attachGameFrame(
  iframe: HTMLIFrameElement,
  opts: { gameOrigin?: string; onMessage: (msg: GameToParent) => void },
): AttachedFrame {
  const origin = (opts.gameOrigin ?? gameOrigin).replace(/\/$/, "");
  const handler = (ev: MessageEvent) => {
    if (ev.origin !== origin) return;
    if (ev.source !== iframe.contentWindow) return;
    if (!isGameMessage(ev.data)) return;
    opts.onMessage(ev.data);
  };
  window.addEventListener("message", handler);
  return {
    post(msg) {
      iframe.contentWindow?.postMessage(msg, origin);
    },
    detach() {
      window.removeEventListener("message", handler);
    },
  };
}
