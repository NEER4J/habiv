import "server-only";
import { after } from "next/server";
import type { IngestPayload } from "@/lib/contracts/ingest";
import { createAdminClient } from "@/lib/supabase/admin";
import { rejectVersion, runIngest } from "@/jobs/src/lib/ingest";

/**
 * Background jobs without a job service. Ingest runs inside the calling Vercel function after the
 * response is sent (after()); plain html and zip bundles, nearly every AI-made game, are ready in
 * seconds. Two things need what Vercel lacks, so they go to the GitHub Actions jobs workflow
 * (.github/workflows/jobs.yml) via repository_dispatch: bundles that need an engine converter
 * (Flash, Scratch, LÖVE) and the Chromium smoke test that also makes cover screenshots.
 * A function that dies mid-ingest leaves the version "processing"; sweepStuckVersions re-runs it.
 */

const ENGINE_NAMES: Record<string, string> = { flash: "Flash", scratch: "Scratch", love: "LÖVE" };

export async function enqueueIngest(versionId: string, opts?: { dedupeFromVersionId?: string }): Promise<{ id: string }> {
  const payload: IngestPayload = { versionId, ...(opts?.dedupeFromVersionId ? { dedupeFromVersionId: opts.dedupeFromVersionId } : {}) };
  after(() => ingestInApp(payload));
  return { id: `app:${crypto.randomUUID()}` };
}

async function ingestInApp(payload: IngestPayload) {
  try {
    const result = await runIngest(payload);
    if (result.status === "deferred") {
      const sent = await dispatchJob("ingest-version", payload.versionId);
      if (!sent) {
        const engine = ENGINE_NAMES[result.engine] ?? "This";
        await rejectVersion(payload.versionId, "conversion_unavailable", `${engine} games need a conversion step that isn't available right now. Upload an HTML build instead.`);
      }
    } else if (result.status === "ready" && !result.already) {
      await dispatchJob("smoke-version", payload.versionId);
    }
  } catch (e) {
    // The version stays "processing"; the sweeper re-runs it.
    console.error("ingest crashed", payload.versionId, e);
  }
}

export type JobTask = "ingest-version" | "smoke-version" | "render-thumb";

/**
 * Fires the GitHub Actions jobs workflow for a version (ingest, smoke) or a thumbnail request
 * (render-thumb). False when it is not configured or GitHub refuses.
 */
export async function dispatchJob(task: JobTask, id: string): Promise<boolean> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const vercelRepo = process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}` : "";
  const repo = process.env.GITHUB_REPOSITORY || vercelRepo;
  if (!token || !repo) return false;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "content-type": "application/json" },
      body: JSON.stringify({ event_type: task, client_payload: task === "render-thumb" ? { requestId: id } : { versionId: id } }),
    });
    if (!res.ok) console.error("dispatch failed", task, res.status, (await res.text().catch(() => "")).slice(0, 200));
    return res.ok;
  } catch (e) {
    console.error("dispatch failed", task, e);
    return false;
  }
}

const MAX_SWEEPS = 3;
const STUCK_AFTER_MS = 10 * 60_000;

/**
 * Re-runs ingest for versions stuck in "processing". Attempts are counted in ingest_run_id
 * ("sweep:<n>:…"); after MAX_SWEEPS the version is rejected so nothing loops forever.
 */
export async function sweepStuckVersions(limit = 5): Promise<{ retried: number; failed: number }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("game_versions")
    .select("id, ingest_run_id")
    .eq("status", "processing")
    .lt("updated_at", new Date(Date.now() - STUCK_AFTER_MS).toISOString())
    .order("updated_at")
    .limit(limit);
  let retried = 0;
  let failed = 0;
  for (const v of data ?? []) {
    const n = Number(/^sweep:(\d+):/.exec(v.ingest_run_id ?? "")?.[1] ?? 0) + 1;
    if (n > MAX_SWEEPS) {
      await rejectVersion(v.id, "internal_error", "Processing kept failing. Upload the game again.");
      failed++;
      continue;
    }
    await admin.from("game_versions").update({ ingest_run_id: `sweep:${n}:${crypto.randomUUID()}` }).eq("id", v.id);
    await enqueueIngest(v.id);
    retried++;
  }
  return { retried, failed };
}
