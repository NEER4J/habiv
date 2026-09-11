import { chromium, type Page } from "playwright";
import sharp from "sharp";
import { jobEnv } from "./env";

export type SmokeResult = {
  ran: true;
  ready: boolean;
  painted: boolean;
  loadMs: number;
  consoleErrors: string[];
  pageErrors: string[];
  landscape: Buffer | null;
  portrait: Buffer | null;
};

const HARNESS_ORIGIN = "https://habiv.com";

/** Harness page on the habiv.com origin so the bridge accepts the parent and posts `ready`. */
function harnessHtml(src: string, w: number, h: number) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#000}iframe{display:block;border:0;width:${w}px;height:${h}px}</style></head>
<body><iframe id="f" src="${src}" sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-forms allow-modals" allow="autoplay; fullscreen; gamepad"></iframe>
<script>window.__habiv={ready:false,msgs:[]};window.addEventListener("message",function(e){if(e.data&&e.data.v===1){window.__habiv.msgs.push(e.data.type);if(e.data.type==="ready")window.__habiv.ready=true;}});</script></body></html>`;
}

async function isPainted(png: Buffer): Promise<boolean> {
  const stats = await sharp(png).stats();
  // A blank frame has near-zero variance on every channel.
  return stats.channels.some((c) => c.stdev > 6);
}

export async function smokeTest(versionId: string, opts: { timeoutMs?: number } = {}): Promise<SmokeResult> {
  const origin = jobEnv.gameOrigin();
  if (!origin) throw new Error("GAME_ORIGIN is not set");
  const timeout = opts.timeoutMs ?? 15000;
  const src = `${origin}/v/${versionId}/?mode=smoke&origin=${encodeURIComponent(HARNESS_ORIGIN)}`;
  const browser = await chromium.launch({ headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  try {
    const load = async (w: number, h: number, capture: boolean): Promise<{ ready: boolean; loadMs: number; shot: Buffer | null }> => {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      const page: Page = await ctx.newPage();
      await page.route(`${HARNESS_ORIGIN}/__smoke`, (route) => route.fulfill({ status: 200, contentType: "text/html", body: harnessHtml(src, w, h) }));
      page.on("console", (m) => { if (m.type() === "error" && consoleErrors.length < 50) consoleErrors.push(m.text().slice(0, 300)); });
      page.on("pageerror", (e) => { if (pageErrors.length < 50) pageErrors.push(String(e.message).slice(0, 300)); });
      const t0 = Date.now();
      await page.goto(`${HARNESS_ORIGIN}/__smoke`, { waitUntil: "domcontentloaded" });
      let ready = false;
      try {
        await page.waitForFunction("window.__habiv && window.__habiv.ready === true", null, { timeout });
        ready = true;
      } catch {
        ready = false;
      }
      const loadMs = Date.now() - t0;
      // Give the first frame a moment after ready (or after the timeout) before capturing.
      await page.waitForTimeout(ready ? 1200 : 300);
      // Nudge games that wait for input (click-to-start) so the capture is not a blank cover.
      try { await page.locator("#f").click({ position: { x: Math.floor(w / 2), y: Math.floor(h / 2) }, timeout: 1000 }); } catch { /* ignore */ }
      await page.waitForTimeout(800);
      const shot = capture ? await page.locator("#f").screenshot({ type: "png" }) : null;
      await ctx.close();
      return { ready, loadMs, shot };
    };
    const land = await load(1280, 720, true);
    const port = await load(720, 1280, true);
    const painted = !!(land.shot && (await isPainted(land.shot)));
    return {
      ran: true,
      ready: land.ready || port.ready,
      painted,
      loadMs: land.loadMs,
      consoleErrors: Array.from(new Set(consoleErrors)),
      pageErrors: Array.from(new Set(pageErrors)),
      landscape: land.shot,
      portrait: port.shot,
    };
  } finally {
    await browser.close();
  }
}

export async function makeCover(png: Buffer): Promise<Buffer> {
  return sharp(png).resize(1280, 720, { fit: "cover", position: "centre" }).webp({ quality: 82 }).toBuffer();
}

export async function makeCard(png: Buffer): Promise<Buffer> {
  return sharp(png).resize(600, 800, { fit: "cover", position: "centre" }).webp({ quality: 82 }).toBuffer();
}
