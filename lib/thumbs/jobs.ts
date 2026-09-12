import "server-only";
import { buckets, getObjectBytes, putObject } from "@/lib/storage";
import { dispatchJob } from "@/lib/jobs/trigger";
import { thumbJobKey, type ThumbJob, type ThumbKind } from "@/lib/contracts/thumb-job";

/**
 * Thumbnail designs are HTML, and Vercel has no browser to draw them, so rendering outside the web
 * picker goes to the GitHub Actions jobs workflow (jobs/src/lib/thumb-render.ts).
 */

export const writeThumbJob = (job: ThumbJob) => putObject(buckets().uploads, thumbJobKey(job.id), JSON.stringify(job), "application/json");

/** Stores the request and fires the workflow. Null when the workflow can't be reached. */
export async function queueThumbJob(a: { gameId: string; userId: string; docs: Partial<Record<ThumbKind, string>> }): Promise<ThumbJob | null> {
  const job: ThumbJob = { id: crypto.randomUUID(), ...a, status: "queued", createdAt: new Date().toISOString() };
  await writeThumbJob(job);
  return (await dispatchJob("render-thumb", job.id)) ? job : null;
}

export async function readThumbJob(id: string): Promise<ThumbJob | null> {
  const bytes = await getObjectBytes(buckets().uploads, thumbJobKey(id));
  if (!bytes) return null;
  try {
    return JSON.parse(Buffer.from(bytes).toString()) as ThumbJob;
  } catch {
    return null;
  }
}
