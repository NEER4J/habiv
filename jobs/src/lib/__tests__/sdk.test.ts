import { describe, expect, it } from "vitest";
import { SdkScanner, withSeenEvents } from "../sdk";

const scan = (...files: [string, string][]) => {
  const s = new SdkScanner();
  for (const [path, text] of files) s.scan(text, path);
  return s.result();
};

describe("SdkScanner", () => {
  it("finds direct Habiv calls", () => {
    const r = scan(["game.js", "Habiv.ready(); Habiv.runStart(); Habiv.scoreSubmit({ value: 10 }); Habiv.levelComplete({ level: 1 });"]);
    expect(r.features).toEqual(["scores", "runs", "levels"]);
    expect(r.via).toEqual(["habiv"]);
  });

  it("counts runEnd with a score as scores", () => {
    expect(scan(["index.html", "<script>Habiv.runEnd({ outcome: 'fail', score: s })</script>"]).features).toEqual(["scores", "runs"]);
  });

  it("trusts aliased calls only when the bundle names Habiv", () => {
    expect(scan(["a.js", "const h = window.Habiv;"], ["b.js", "h.beatGame()"]).features).toEqual(["beat"]);
    expect(scan(["b.js", "player.beatGame(); scoreSubmit(x)"]).features).toEqual([]);
  });

  it("ignores a copy of the SDK shipped in the bundle", () => {
    expect(scan(["lib/habiv-bridge.js", "Habiv.scoreSubmit(); Habiv.beatGame();"]).features).toEqual([]);
  });

  it("maps shim SDK calls", () => {
    expect(scan(["poki.js", "PokiSDK.gameplayStart(); PokiSDK.happyTime(0.5);"])).toEqual({ features: ["runs", "happytime"], via: ["poki"] });
    expect(scan(["ng.js", "new Newgrounds.io.core(id); board.postScore(100);"])).toEqual({ features: ["scores"], via: ["newgrounds"] });
  });

  it("reports nothing for a plain game", () => {
    expect(scan(["index.html", "<canvas></canvas><script>requestAnimationFrame(loop)</script>"])).toEqual({ features: [], via: [] });
  });
});

describe("withSeenEvents", () => {
  it("adds runtime events to the scan", () => {
    const r = withSeenEvents({ features: ["runs"], via: ["habiv"] }, ["ready", "score_submit", "run_end", "score_submit"]);
    expect(r).toEqual({ features: ["scores", "runs"], via: ["habiv"], seen: ["run_end", "score_submit"] });
  });
});
