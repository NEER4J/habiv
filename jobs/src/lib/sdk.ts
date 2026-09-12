import type { SdkFeature, SdkInfo, SdkSource } from "../contracts/ingest";

/**
 * Finds Habiv SDK calls in a build's html and js, so the publish page offers the leaderboard (and
 * the other SDK features) only when the game can feed them. Calls through the Poki, CrazyGames and
 * Newgrounds shims count too: the shims forward them to the bridge.
 *
 * This reads source text, so builds that ship compressed (.br/.gz) or wasm-only code can hide their
 * calls; the smoke run adds the bridge events it actually sees (withSeenEvents).
 */

export const FEATURE_ORDER: SdkFeature[] = ["scores", "runs", "levels", "beat", "saves", "happytime"];

const METHOD_FEATURE: Record<string, SdkFeature> = {
  runStart: "runs",
  runEnd: "runs",
  gameplayStart: "runs",
  gameplayStop: "runs",
  scoreSubmit: "scores",
  levelStart: "levels",
  levelComplete: "levels",
  levelFail: "levels",
  beatGame: "beat",
  happytime: "happytime",
  save: "saves",
  load: "saves",
};

/** Bridge message type → feature, for events seen while the game runs. */
const EVENT_FEATURE: Record<string, SdkFeature> = {
  run_start: "runs",
  run_end: "runs",
  gameplay_start: "runs",
  gameplay_stop: "runs",
  score_submit: "scores",
  level_start: "levels",
  level_complete: "levels",
  level_fail: "levels",
  beat_game: "beat",
  happytime: "happytime",
  save: "saves",
  load: "saves",
};

const DIRECT = /\bHabiv\s*\??\.\s*(runStart|runEnd|scoreSubmit|levelStart|levelComplete|levelFail|beatGame|happytime|save|load|gameplayStart|gameplayStop)\s*\(/g;
/** Method names without the `Habiv.` prefix (aliased, or engine glue); trusted only when the bundle names Habiv somewhere. */
const LOOSE = /\b(runStart|runEnd|scoreSubmit|levelStart|levelComplete|levelFail|beatGame|happytime)\b/g;
/** runEnd({ score }) also posts a score. */
const RUN_END_SCORE = /\brunEnd\s*\(\s*\{[^}]{0,200}\bscore\b/;
const THIRD_PARTY: { via: SdkSource; test: RegExp; feature: SdkFeature }[] = [
  { via: "poki", test: /\bPokiSDK\s*\.\s*gameplayStart\b/, feature: "runs" },
  { via: "poki", test: /\bPokiSDK\s*\.\s*happyTime\b/, feature: "happytime" },
  { via: "crazygames", test: /\bSDK\s*\.\s*game\s*\.\s*gameplayStart\b/, feature: "runs" },
  { via: "crazygames", test: /\bSDK\s*\.\s*game\s*\.\s*happytime\b/, feature: "happytime" },
  { via: "crazygames", test: /\bSDK\s*\.\s*data\s*\.\s*setItem\b/, feature: "saves" },
];
/** A copy of the SDK or a shim shipped inside the bundle names every method; skip it. */
const SDK_FILE = /(^|\/)(habiv-bridge|poki-sdk|crazygames-sdk(-v\d)?|newgrounds\.io)(\.min)?\.js$/i;

/** Feed it every html/js text of a bundle, then read result(). */
export class SdkScanner {
  private features = new Set<SdkFeature>();
  private loose = new Set<SdkFeature>();
  private via = new Set<SdkSource>();
  private namesHabiv = false;
  private namesNewgrounds = false;
  private postsScore = false;

  scan(text: string, path = "") {
    if (!text || SDK_FILE.test(path)) return;
    if (/\bHabiv\b/.test(text)) this.namesHabiv = true;
    for (const m of text.matchAll(DIRECT)) {
      this.features.add(METHOD_FEATURE[m[1]]);
      this.via.add("habiv");
    }
    for (const m of text.matchAll(LOOSE)) this.loose.add(METHOD_FEATURE[m[1]]);
    if (RUN_END_SCORE.test(text)) this.loose.add("scores");
    for (const t of THIRD_PARTY) {
      if (!t.test.test(text)) continue;
      this.features.add(t.feature);
      this.via.add(t.via);
    }
    if (/newgrounds/i.test(text)) this.namesNewgrounds = true;
    if (/\bpostScore\s*\(/.test(text)) this.postsScore = true;
  }

  result(): SdkInfo {
    const features = new Set(this.features);
    const via = new Set(this.via);
    if (this.namesHabiv && this.loose.size) {
      for (const f of this.loose) features.add(f);
      via.add("habiv");
    }
    if (this.namesNewgrounds && this.postsScore) {
      features.add("scores");
      via.add("newgrounds");
    }
    return { features: FEATURE_ORDER.filter((f) => features.has(f)), via: [...via].sort() };
  }
}

/** Adds bridge events seen at runtime (the smoke run) to what the source scan found. */
export function withSeenEvents(sdk: SdkInfo | undefined, events: string[]): SdkInfo {
  const seen = [...new Set(events.filter((e) => e in EVENT_FEATURE))].sort();
  const features = new Set<SdkFeature>([...(sdk?.features ?? []), ...seen.map((e) => EVENT_FEATURE[e])]);
  const via = new Set<SdkSource>(sdk?.via ?? []);
  if (seen.length && !via.size) via.add("habiv");
  return { features: FEATURE_ORDER.filter((f) => features.has(f)), via: [...via].sort(), seen };
}
