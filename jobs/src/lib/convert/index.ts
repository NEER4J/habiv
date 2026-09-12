/**
 * Engine-specific conversions that add or replace files before upload to storage.
 * Each returns extra files to write and, when it generates an entry, the new index.html.
 */
import type { EngineId } from "../../contracts/ingest";
import type { ConversionResult } from "./needs";
import { ruffleFiles, ruffleIndexHtml } from "./ruffle";
import { packageScratch } from "./turbowarp";
import { buildLove } from "./love";

export { needsConversion, type ConversionResult, type ConvertFn, type ExtraFile } from "./needs";

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
