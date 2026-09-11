/**
 * Engine-specific conversions that add or replace files before upload to R2.
 * Each returns extra files to write and, when it generates an entry, the new index.html.
 */
import type { EngineId } from "../../contracts/ingest";
import { ruffleFiles, ruffleIndexHtml } from "./ruffle";
import { packageScratch } from "./turbowarp";
import { buildLove } from "./love";

export type ExtraFile = { path: string; body: Buffer };

export type ConversionResult = {
  /** Files to add to the bundle (in addition to the originals, unless `replaceAll`). */
  extra: ExtraFile[];
  /** When true, only `extra` is uploaded (the source archive was consumed). */
  replaceAll: boolean;
  /** Generated entry html, if any (already includes nothing; the bridge is injected afterwards). */
  indexHtml?: string;
  notes: string[];
};

export function needsConversion(engine: EngineId, paths: string[]): boolean {
  if (engine === "flash") return !paths.some((p) => /^index\.html?$/i.test(p));
  if (engine === "scratch") return paths.some((p) => /\.sb3$/i.test(p)) && !paths.some((p) => /^index\.html?$/i.test(p));
  if (engine === "love") return paths.some((p) => /\.love$/i.test(p)) && !paths.some((p) => /love\.wasm$/i.test(p));
  return false;
}

export async function convert(engine: EngineId, paths: string[], read: (path: string) => Promise<Buffer>, title: string): Promise<ConversionResult> {
  if (engine === "flash") {
    const swf = paths.find((p) => /\.swf$/i.test(p))!;
    const target = swf.includes("/") ? swf.slice(swf.lastIndexOf("/") + 1) : swf;
    const extra = await ruffleFiles();
    if (target !== swf) extra.push({ path: target, body: await read(swf) });
    return { extra, replaceAll: false, indexHtml: ruffleIndexHtml(target, title), notes: ["Wrapped .swf with self-hosted Ruffle."] };
  }
  if (engine === "scratch") {
    const sb3 = paths.find((p) => /\.sb3$/i.test(p))!;
    const html = await packageScratch(await read(sb3), title);
    return { extra: [], replaceAll: true, indexHtml: html.toString("utf8"), notes: ["Packaged .sb3 with the TurboWarp packager."] };
  }
  if (engine === "love") {
    const love = paths.find((p) => /\.love$/i.test(p))!;
    const files = await buildLove(await read(love), title);
    const index = files.find((f) => f.path === "index.html")!;
    return { extra: files.filter((f) => f.path !== "index.html"), replaceAll: true, indexHtml: index.body.toString("utf8"), notes: ["Built .love with love.js (compat build)."] };
  }
  return { extra: [], replaceAll: false, notes: [] };
}
