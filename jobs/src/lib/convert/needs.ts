/**
 * Which bundles need an engine conversion, without loading the converters themselves. The app
 * imports this on Vercel, where the converters (Ruffle, TurboWarp, love.js) are not installed.
 */
import type { EngineId } from "../../contracts/ingest";

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

export type ConvertFn = (engine: EngineId, paths: string[], read: (path: string) => Promise<Buffer>, title: string) => Promise<ConversionResult>;

export function needsConversion(engine: EngineId, paths: string[]): boolean {
  if (engine === "flash") return !paths.some((p) => /^index\.html?$/i.test(p));
  if (engine === "scratch") return paths.some((p) => /\.sb3$/i.test(p)) && !paths.some((p) => /^index\.html?$/i.test(p));
  if (engine === "love") return paths.some((p) => /\.love$/i.test(p)) && !paths.some((p) => /love\.wasm$/i.test(p));
  return false;
}
