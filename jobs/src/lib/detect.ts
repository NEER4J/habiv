import type { EngineId } from "../contracts/ingest";

export type Detection = {
  engine: EngineId;
  needsIsolation: boolean;
  notes: string[];
};

/** Detects the engine from the file list and the entry html (platform-plan §5). */
export function detectEngine(paths: string[], entry: string, html: string): Detection {
  const lower = paths.map((p) => p.toLowerCase());
  const has = (re: RegExp) => lower.some((p) => re.test(p));
  const notes: string[] = [];
  const h = html;

  if (paths.length === 1 && /\.html?$/i.test(entry)) {
    if (/<tw-storydata/i.test(h)) return { engine: "twine", needsIsolation: false, notes };
    if (/exportedGameData/i.test(h)) return { engine: "bitsy", needsIsolation: false, notes };
    if (/_cartdat|pico-?8/i.test(h)) return { engine: "pico8", needsIsolation: false, notes };
    return { engine: "single_html", needsIsolation: false, notes };
  }

  if (has(/(^|\/)build\/[^/]*\.loader\.js$/) || /createUnityInstance/.test(h)) {
    // Unity 6 "native C/C++ multithreading" builds require cross-origin isolation.
    const threaded = /pthread|SharedArrayBuffer/.test(h) || has(/\.(wasm|js)\.(br|gz)$/) && /crossOriginIsolated/.test(h);
    if (threaded) notes.push("Unity build references threads; served with COOP/COEP.");
    return { engine: "unity", needsIsolation: threaded, notes };
  }

  if (has(/\.pck$/) && /GODOT_CONFIG/.test(h)) {
    // 4.0–4.2 and any thread-enabled template need SharedArrayBuffer.
    const single = /"threads"\s*:\s*false|threads:false/.test(h) || /godot\.(4\.[3-9]|[5-9])/i.test(h);
    const threads = /"threads"\s*:\s*true|threads:true|SharedArrayBuffer|crossOriginIsolated/.test(h) || !single;
    if (threads) notes.push("Godot export uses threads; served with COOP/COEP.");
    return { engine: "godot4", needsIsolation: threads, notes };
  }
  if (has(/\.pck$/) && /\bEngine\b/.test(h)) {
    const threads = /SharedArrayBuffer|pthread/.test(h);
    return { engine: "godot3", needsIsolation: threads, notes };
  }

  if (has(/dmloader\.js$/) && has(/archive\/archive_files\.json$/)) {
    const pthread = has(/wasm_pthread/) || /wasm_pthread/.test(h);
    return { engine: "defold", needsIsolation: pthread, notes };
  }

  if (has(/c[23]runtime\.js$/) && has(/data\.json$/)) return { engine: "construct", needsIsolation: false, notes };
  if (has(/(^|\/)data\.js$/) && has(/gdjs/)) return { engine: "gdevelop", needsIsolation: false, notes };
  if (has(/renpy\.js$/) || has(/(^|\/)game\.zip$/)) return { engine: "renpy", needsIsolation: false, notes };
  if (has(/tic80\.wasm$/) || has(/\.tic$/)) return { engine: "tic80", needsIsolation: false, notes };
  if (/_cartdat/.test(h) || has(/\.p8(\.png)?$/)) return { engine: "pico8", needsIsolation: false, notes };
  if (has(/love\.wasm$/) || has(/\.love$/)) {
    const compat = /love\.js.*-c|compat/i.test(h) || has(/love-compat|\/compat\//);
    if (!compat) notes.push("love.js default build uses threads; served with COOP/COEP.");
    return { engine: "love", needsIsolation: !compat, notes };
  }
  if (has(/js\/(rpg_core|rmmz_core)\.js$/)) return { engine: "rpgmaker", needsIsolation: false, notes };
  if (has(/\.sb3$/)) return { engine: "scratch", needsIsolation: false, notes };
  if (has(/\.swf$/) && !has(/ruffle/)) return { engine: "flash", needsIsolation: false, notes };
  if (has(/\.apk$/) && /pygame-web|pygbag/i.test(h)) return { engine: "pygbag", needsIsolation: true, notes: ["pygbag runtime needs COOP/COEP."] };
  if (has(/\.ue4\.js$/) || /UE4|UnrealEngine/.test(h)) {
    notes.push("Unreal HTML5 exports are not officially supported; served as a generic bundle.");
    return { engine: "unknown", needsIsolation: false, notes };
  }
  if (has(/phaser[^/]*\.js$/) || /phaser/i.test(h) || has(/pixi[^/]*\.js$/) || has(/three[^/]*\.js$/) || /<canvas/i.test(h)) {
    return { engine: "generic", needsIsolation: false, notes };
  }
  return { engine: /\.html?$/i.test(entry) ? "generic" : "unknown", needsIsolation: false, notes };
}
