import { describe, expect, it } from "vitest";
import { readGameMeta } from "../game-meta";

describe("readGameMeta", () => {
  it("reads a full habiv.json", () => {
    const json = JSON.stringify({
      title: "Paper Plane",
      tagline: "Dodge the birds with one button",
      description: "Fly as far as you can.\r\n\r\n\r\nTips: stay low.",
      categories: ["Arcade", "reaction"],
      tags: ["One Button", "endless", "!!bad"],
      orientation: "landscape",
      duration_sec: 60,
      controls: { keys: [{ key: "Space", action: "Flap" }], touch: "Tap to flap" },
      model: "Claude Sonnet 4.5",
      agent: "Claude Code",
      prompt: "Make a paper plane game",
    });
    const { meta, warnings } = readGameMeta({ json, html: "<title>Ignored</title>" });
    expect(warnings).toEqual([]);
    expect(meta).toMatchObject({
      sources: ["habiv.json"],
      title: "Paper Plane",
      tagline: "Dodge the birds with one button",
      description: "Fly as far as you can.\n\nTips: stay low.",
      categories: ["arcade", "reaction"],
      tags: ["one button", "endless"],
      orientation: "landscape",
      durationSec: 60,
      controls: { keys: [{ key: "Space", action: "Flap" }], touch: "Tap to flap" },
      model: "Claude Sonnet 4.5",
      agent: "Claude Code",
      prompt: "Make a paper plane game",
    });
  });

  it("reads the inline block in a single html file and fills gaps from <title> and <meta>", () => {
    const html = `<!doctype html><html><head><title>Blink &amp; Buffet</title>
      <meta content="Eat everything before the lights go out." name="description">
      <script type="application/habiv+json">{ "controls": { "← →": "Move", "Space": "Chomp", "touch": "Drag to move" }, "category": "arcade" }</script>
      </head><body></body></html>`;
    const { meta } = readGameMeta({ html });
    expect(meta).toMatchObject({
      sources: ["inline", "html"],
      title: "Blink & Buffet",
      tagline: "Eat everything before the lights go out.",
      categories: ["arcade"],
      controls: { keys: [{ key: "← →", action: "Move" }, { key: "Space", action: "Chomp" }], touch: "Drag to move" },
    });
  });

  it("accepts row lists as strings and caps everything to the form limits", () => {
    const json = JSON.stringify({
      title: "x".repeat(200),
      controls: ["Space: Jump", "Arrow keys → Move", "nonsense", "A: 1", "B: 2", "C: 3", "D: 4", "E: 5"],
      tags: "cozy, relaxing, pixel art, retro, idle, hard",
      duration_sec: 99999,
    });
    const { meta } = readGameMeta({ json });
    expect(meta?.title).toHaveLength(80);
    expect(meta?.controls?.keys).toHaveLength(6);
    expect(meta?.controls?.keys[1]).toEqual({ key: "Arrow keys", action: "Move" });
    expect(meta?.tags).toEqual(["cozy", "relaxing", "pixel art", "retro", "idle"]);
    expect(meta?.durationSec).toBe(3600);
  });

  it("warns and moves on when habiv.json is broken", () => {
    const { meta, warnings } = readGameMeta({ json: "{ title: 'nope' ", html: "<title>Drift Dodge</title>" });
    expect(warnings[0]).toMatch(/habiv.json is not valid JSON/);
    expect(meta).toEqual({ sources: ["html"], title: "Drift Dodge" });
  });

  it("ignores engine placeholder titles and finds nothing in a bare page", () => {
    expect(readGameMeta({ html: "<title>Document</title>" }).meta).toBeUndefined();
    expect(readGameMeta({ html: "<title>Unity WebGL Player | Space Goats</title>" }).meta?.title).toBe("Space Goats");
  });
});
