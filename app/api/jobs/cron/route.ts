import { timingSafeEqual } from "node:crypto";
import { pruneVersions } from "@/jobs/src/lib/prune";
import { sweepStuckVersions } from "@/lib/jobs/trigger";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/**
 * Scheduled maintenance. Vercel Cron calls it daily (vercel.json: sweep + prune); pg_cron calls
 * `?task=sweep` every 5 minutes, but only while a version looks stuck (migration
 * 20260912000100_jobs_sweep_cron.sql). Both send `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const task = new URL(request.url).searchParams.get("task") ?? "all";
  const swept = await sweepStuckVersions();
  const pruned = task === "all" ? await pruneVersions() : null;
  return Response.json({ swept, pruned }, { headers: { "cache-control": "no-store" } });
}
