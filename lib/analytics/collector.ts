"use client";

import type { IngestEvent } from "@/lib/analytics/schema";

/** Event as the UI or bridge host tracks it; session and client time are stamped here. */
export type CollectorEvent = Omit<IngestEvent, "session_id" | "client_ts">;

export type Collector = {
  sessionId: string;
  track(e: CollectorEvent): void;
  flush(reason?: "timer" | "batch" | "hide" | "manual"): Promise<void>;
  destroy(): void;
};

type Options = { endpoint?: string; flushMs?: number; maxBatch?: number; maxQueue?: number };

const SESSION_KEY = "hv_sid";
const SESSION_IDLE_MS = 30 * 60 * 1000;

function sessionId(): string {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const [id, at] = raw.split("|");
      if (id && Date.now() - Number(at) < SESSION_IDLE_MS) {
        sessionStorage.setItem(SESSION_KEY, `${id}|${Date.now()}`);
        return id;
      }
    }
    const id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, `${id}|${Date.now()}`);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function pageContext() {
  const ctx: Record<string, string> = {};
  try {
    if (document.referrer) {
      const host = new URL(document.referrer).host;
      if (host && host !== location.host) ctx.referrer_host = host;
    }
    const q = new URLSearchParams(location.search);
    for (const k of ["utm_source", "utm_medium", "utm_campaign"]) {
      const v = q.get(k);
      if (v) ctx[k] = v.slice(0, 100);
    }
  } catch {
    /* ignore */
  }
  return ctx;
}

/**
 * Buffers events and posts them in batches: every 5 s, at 50 events, and on tab hide via
 * sendBeacon. Cookies (hv_pid, session) travel with the same-origin request.
 */
export function createCollector(opts: Options = {}): Collector {
  const endpoint = opts.endpoint ?? "/api/ingest";
  const flushMs = opts.flushMs ?? 5000;
  const maxBatch = opts.maxBatch ?? 50;
  const maxQueue = opts.maxQueue ?? 500;
  const sid = sessionId();
  const ctx = pageContext();
  let queue: IngestEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inflight = false;

  const schedule = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      void flush("timer");
    }, flushMs);
  };

  const send = async (batch: IngestEvent[], beacon: boolean) => {
    const body = JSON.stringify({ ctx, events: batch });
    if (beacon && typeof navigator.sendBeacon === "function") {
      if (navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }))) return true;
    }
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true, credentials: "same-origin" });
      return res.ok || res.status < 500;
    } catch {
      return false;
    }
  };

  const flush = async (reason: "timer" | "batch" | "hide" | "manual" = "manual") => {
    if (!queue.length) return;
    if (inflight && reason !== "hide") {
      schedule();
      return;
    }
    const batch = queue.splice(0, maxBatch);
    inflight = true;
    const ok = await send(batch, reason === "hide");
    inflight = false;
    if (!ok) queue = [...batch, ...queue].slice(0, maxQueue);
    if (queue.length) {
      if (reason === "hide") void flush("hide");
      else schedule();
    }
  };

  const onHide = () => {
    if (document.visibilityState === "hidden") void flush("hide");
  };
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", onHide);

  return {
    sessionId: sid,
    track(e) {
      if (queue.length >= maxQueue) queue.shift();
      queue.push({ ...e, session_id: sid, client_ts: new Date().toISOString() });
      if (queue.length >= maxBatch) void flush("batch");
      else schedule();
    },
    flush,
    destroy() {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      if (timer) clearTimeout(timer);
      void flush("hide");
    },
  };
}

let singleton: Collector | null = null;

/** App-wide collector (lazy; safe to call from any client component). */
export function getCollector(): Collector {
  if (!singleton) singleton = createCollector();
  return singleton;
}

/** Reads the first-party player id set by proxy.ts. */
export function getPlayerId(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)hv_pid=([0-9a-f-]{36})/i);
  return m ? m[1] : null;
}
