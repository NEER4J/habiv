import { task, logger } from "@trigger.dev/sdk";
import { admin, loadVersion } from "../lib/supabase";
import { makeCard, makeCover, smokeTest } from "../lib/smoke";
import { putBuffer } from "../lib/r2";
import { jobEnv } from "../lib/env";

/**
 * Loads the version in headless Chromium behind a habiv.com harness page, records console errors,
 * bridge readiness, first paint and load time into `smoke`, and writes cover/card thumbnails unless
 * the creator uploaded their own art. A page that never paints is the only outcome that rejects.
 */
export const smokeVersion = task({
  id: "smoke-version",
  retry: { maxAttempts: 1 },
  machine: "small-2x",
  run: async (payload: { versionId: string; force?: boolean }) => {
    const v = await loadVersion(payload.versionId);
    if (!v || v.status !== "ready") return { ran: false, reason: "not_ready" };
    const result = await smokeTest(v.id);
    const smoke = {
      ran: true,
      at: new Date().toISOString(),
      ready: result.ready,
      painted: result.painted,
      load_ms: result.loadMs,
      console_errors: result.consoleErrors,
      page_errors: result.pageErrors,
    };
    logger.info("smoke result", smoke);

    if (!result.painted && !result.ready) {
      await admin().from("game_versions").update({ smoke, status: "rejected", reject_reason: "never_painted" }).eq("id", v.id);
      return { ran: true, rejected: true };
    }
    await admin().from("game_versions").update({ smoke }).eq("id", v.id);

    const game = v.games;
    const needsArt = payload.force || !game?.cover_path;
    if (needsArt && result.landscape && result.portrait) {
      const bucket = jobEnv.publicBucket();
      const coverKey = `covers/${v.game_id}/${v.id}.webp`;
      const cardKey = `cards/${v.game_id}/${v.id}.webp`;
      await Promise.all([
        putBuffer(bucket, coverKey, await makeCover(result.landscape), { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" }),
        putBuffer(bucket, cardKey, await makeCard(result.portrait), { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" }),
      ]);
      await admin().from("games").update({ cover_path: coverKey, card_path: cardKey }).eq("id", v.game_id);
    }
    return { ran: true, ready: result.ready, painted: result.painted };
  },
});
