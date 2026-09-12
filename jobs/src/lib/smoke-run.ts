import { admin, loadVersion } from "./supabase";
import { makeCard, makeCover, smokeTest } from "./smoke";
import { renderDocs } from "./thumb-render";
import { putBuffer } from "./storage";
import { jobEnv } from "./env";
import { withSeenEvents } from "./sdk";
import type { IngestManifest } from "../contracts/ingest";
import { defaultThumbDocuments } from "../../../lib/thumbs/defaults";

/**
 * Loads a ready version in headless Chromium behind a habiv.com harness page, records console
 * errors, bridge readiness, first paint and load time into `smoke`, and writes cover/card
 * thumbnails unless the creator uploaded their own art. A page that never paints is the only
 * outcome that rejects. Runs in the GitHub Actions jobs workflow (it needs Chromium).
 */
export async function runSmoke(versionId: string, force = false) {
  const v = await loadVersion(versionId);
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
    bridge_events: result.bridgeEvents,
  };
  console.log("smoke result", JSON.stringify(smoke));

  if (!result.painted && !result.ready) {
    await admin().from("game_versions").update({ smoke, status: "rejected", reject_reason: "never_painted" }).eq("id", v.id);
    return { ran: true, rejected: true };
  }
  // SDK calls the source scan could not see (compressed or wasm builds) still count once the game makes them.
  const manifest = (v.manifest ?? null) as IngestManifest | null;
  const update = manifest ? { smoke, manifest: { ...manifest, sdk: withSeenEvents(manifest.sdk, result.bridgeEvents) } } : { smoke };
  await admin().from("game_versions").update(update).eq("id", v.id);

  // Only empty slots get a screenshot, so a cover or card the creator uploaded is never replaced.
  const needsCover = force || !v.games?.cover_path;
  const needsCard = force || !v.games?.card_path;
  if ((needsCover || needsCard) && result.landscape && result.portrait) {
    // Use one of the thumbnail-lab treatments for automatic art. If a render ever fails,
    // keep the smoke screenshot as a safe last-resort cover instead of blocking publishing.
    let designed: Partial<Record<"cover" | "card", Buffer>> = {};
    try {
      designed = await renderDocs(
        defaultThumbDocuments({
          seed: v.game_id,
          title: v.games?.title ?? "Untitled game",
          tagline: v.games?.tagline,
          category: v.games?.category,
          engine: v.engine,
          hue: v.games?.accent_hue ?? 220,
        }),
      );
    } catch (error) {
      console.warn("automatic thumbnail render failed; using smoke screenshots", error);
    }
    const bucket = jobEnv.publicBucket();
    const opts = { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" };
    const patch: { cover_path?: string; card_path?: string } = {};
    if (needsCover) {
      patch.cover_path = `covers/${v.game_id}/${v.id}.webp`;
      await putBuffer(bucket, patch.cover_path, designed.cover ? await makeCover(designed.cover) : await makeCover(result.landscape), opts);
    }
    if (needsCard) {
      patch.card_path = `cards/${v.game_id}/${v.id}.webp`;
      await putBuffer(bucket, patch.card_path, designed.card ? await makeCard(designed.card) : await makeCard(result.portrait), opts);
    }
    await admin().from("games").update(patch).eq("id", v.game_id);
  }
  return { ran: true, ready: result.ready, painted: result.painted };
}
