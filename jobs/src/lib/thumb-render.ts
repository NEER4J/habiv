import { chromium } from "playwright";
import sharp from "sharp";
import { admin } from "./supabase";
import { downloadToBuffer, putBuffer } from "./storage";
import { jobEnv } from "./env";
import { THUMB_SIZES, thumbJobKey, type ThumbJob, type ThumbKind } from "../contracts/thumb-job";

/** Designs are self-contained (inline CSS, SVG, data: URIs); Google Fonts is the only network they get. */
const FONT_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);
const KINDS: ThumbKind[] = ["cover", "card"];

export async function renderDocs(docs: ThumbJob["docs"]): Promise<Partial<Record<ThumbKind, Buffer>>> {
  const browser = await chromium.launch({ headless: true });
  try {
    const out: Partial<Record<ThumbKind, Buffer>> = {};
    for (const kind of KINDS) {
      const html = docs[kind];
      if (!html) continue;
      const { w, h } = THUMB_SIZES[kind];
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, javaScriptEnabled: false });
      await ctx.route("**/*", (route) => {
        const url = new URL(route.request().url());
        return url.protocol === "https:" && FONT_HOSTS.has(url.hostname) ? route.continue() : route.abort();
      });
      const page = await ctx.newPage();
      // networkidle: the font stylesheet and the font files it names have arrived.
      await page.setContent(html, { waitUntil: "networkidle", timeout: 30_000 });
      await page.waitForTimeout(250);
      out[kind] = await page.screenshot({ type: "png" });
      await ctx.close();
    }
    return out;
  } finally {
    await browser.close();
  }
}

/**
 * Renders a thumbnail request (MCP make_thumbnail) in Chromium with scripts off and saves the
 * images as the game's cover and card, like art the creator picked. The outcome is written back
 * into the request; the app expires its caches and deletes the replaced art when it next reads it.
 */
export async function runThumbJob(id: string) {
  const bucket = jobEnv.uploadsBucket();
  const job = JSON.parse((await downloadToBuffer(bucket, thumbJobKey(id))).toString()) as ThumbJob;
  if (job.status !== "queued") return { ran: false, reason: job.status };
  const finish = (patch: Partial<ThumbJob>) =>
    putBuffer(bucket, thumbJobKey(id), Buffer.from(JSON.stringify({ ...job, ...patch, finishedAt: new Date().toISOString() })), { contentType: "application/json" });

  try {
    const { data: game, error } = await admin().from("games").select("id, creator_id, cover_path, card_path").eq("id", job.gameId).maybeSingle();
    if (error) throw error;
    if (!game || game.creator_id !== job.userId) throw new Error("Game not found.");

    const shots = await renderDocs(job.docs);
    const pub = jobEnv.publicBucket();
    const stamp = Date.now();
    const paths: Partial<Record<ThumbKind, string>> = {};
    const replaced: string[] = [];
    for (const kind of KINDS) {
      const png = shots[kind];
      if (!png) continue;
      const { w, h } = THUMB_SIZES[kind];
      const path = `${kind === "cover" ? "covers" : "cards"}/${job.gameId}/t-${stamp}.webp`;
      const webp = await sharp(png).resize(w, h, { fit: "cover", position: "centre" }).webp({ quality: 82 }).toBuffer();
      await putBuffer(pub, path, webp, { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" });
      paths[kind] = path;
      const previous: string | null = kind === "cover" ? game.cover_path : game.card_path;
      if (previous) replaced.push(previous);
    }
    const { error: updateError } = await admin()
      .from("games")
      .update({ ...(paths.cover ? { cover_path: paths.cover } : {}), ...(paths.card ? { card_path: paths.card } : {}) })
      .eq("id", job.gameId);
    if (updateError) throw updateError;
    await finish({ status: "done", paths, replaced });
    return { ran: true, paths };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("thumb render failed", message);
    await finish({ status: "failed", error: message.slice(0, 300) });
    return { ran: true, failed: true };
  }
}
