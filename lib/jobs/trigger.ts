import "server-only";
import type { IngestPayload } from "@/lib/contracts/ingest";

const TRIGGER_API = process.env.TRIGGER_API_URL ?? "https://api.trigger.dev";

/**
 * Triggers a Trigger.dev task over its REST API. Keeping the SDK out of the Next bundle
 * avoids pulling job-only dependencies into the app.
 */
export async function triggerTask<T extends object>(taskId: string, payload: T, opts?: { idempotencyKey?: string }): Promise<{ id: string }> {
  const key = process.env.TRIGGER_SECRET_KEY;
  if (!key) throw new Error("TRIGGER_SECRET_KEY is not set");
  const res = await fetch(`${TRIGGER_API}/api/v1/tasks/${encodeURIComponent(taskId)}/trigger`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(opts?.idempotencyKey ? { "idempotency-key": opts.idempotencyKey } : {}),
    },
    body: JSON.stringify({ payload }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Trigger.dev ${taskId} failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { id: string };
  return { id: data.id };
}

export function enqueueIngest(versionId: string, opts?: { dedupeFromVersionId?: string }) {
  const payload: IngestPayload = { versionId, ...(opts?.dedupeFromVersionId ? { dedupeFromVersionId: opts.dedupeFromVersionId } : {}) };
  return triggerTask("ingest-version", payload, { idempotencyKey: `ingest:${versionId}` });
}
