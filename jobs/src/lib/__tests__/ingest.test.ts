import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { detectEngine } from "../detect";
import { normalizeHtml, planNormalization, scanJsForNetwork } from "../normalize";
import { reroot } from "../reroot";
import { validateEntries, RejectError } from "../validate";
import { contentTypeFor, cacheControlFor } from "../mime";
import type { ZipEntry } from "../zip";

const fixtures = join(__dirname, "../../../../fixtures/bundles");
const entry = (name: string, size = 100, extra: Partial<ZipEntry> = {}): ZipEntry =>
  ({ name, size, compressed: Math.max(1, Math.floor(size / 2)), isDir: name.endsWith("/"), isSymlink: false, raw: {} as ZipEntry["raw"], ...extra });

describe("detectEngine", () => {
  it("classifies the single html fixture", () => {
    const html = readFileSync(join(fixtures, "single-html/index.html"), "utf8");
    expect(detectEngine(["index.html"], "index.html", html).engine).toBe("single_html");
  });
  it("classifies the generic zip fixture", () => {
    const html = readFileSync(join(fixtures, "generic-zip/index.html"), "utf8");
    const d = detectEngine(["index.html", "style.css", "js/game.js"], "index.html", html);
    expect(d.engine).toBe("generic");
    expect(d.needsIsolation).toBe(false);
  });
  it("detects Unity and Godot", () => {
    expect(detectEngine(["index.html", "Build/x.loader.js", "Build/x.wasm.br"], "index.html", "createUnityInstance(canvas, config)").engine).toBe("unity");
    const g = detectEngine(["index.html", "game.pck", "game.js", "game.wasm"], "index.html", 'const GODOT_CONFIG = {"threads":true};');
    expect(g.engine).toBe("godot4");
    expect(g.needsIsolation).toBe(true);
  });
  it("detects flash and scratch by extension", () => {
    expect(detectEngine(["game.swf"], "game.swf", "").engine).toBe("flash");
    expect(detectEngine(["project.sb3"], "project.sb3", "").engine).toBe("scratch");
  });
});

describe("validateEntries", () => {
  it("rejects executables and traversal", () => {
    expect(() => validateEntries([entry("index.html"), entry("payload.exe")], 1000)).toThrow(RejectError);
    expect(() => validateEntries([entry("../index.html")], 1000)).toThrow(RejectError);
  });
  it("drops junk and warns on unknown types", () => {
    const { kept, warnings } = validateEntries([entry("index.html"), entry("__MACOSX/._index.html"), entry(".DS_Store"), entry("notes.weird")], 1000);
    expect(kept.map((k) => k.name)).toEqual(["index.html"]);
    expect(warnings.some((w) => w.includes("notes.weird"))).toBe(true);
  });
  it("rejects too many files", () => {
    const many = Array.from({ length: 1001 }, (_, i) => entry(`a/${i}.png`));
    expect(() => validateEntries([entry("index.html"), ...many], 1000)).toThrow(/capped/);
  });
});

describe("reroot", () => {
  it("strips a wrapping folder", () => {
    const r = reroot([entry("MyGame/index.html"), entry("MyGame/js/app.js")]);
    expect(r.rerooted).toBe("MyGame/");
    expect(r.files.map((f) => f.path)).toEqual(["index.html", "js/app.js"]);
  });
  it("falls back to the only html", () => {
    const r = reroot([entry("game.html"), entry("a.png")]);
    expect(r.entry).toBe("game.html");
    expect(planNormalization(["game.html", "a.png"], "game.html", "single_html").renames.get("game.html")).toBe("index.html");
  });
});

describe("normalizeHtml", () => {
  it("injects the bridge before the first script and rewrites absolute paths", () => {
    const out = normalizeHtml('<html><head><link href="/style.css"></head><body><script src="/js/app.js"></script></body></html>', { paths: ["style.css", "js/app.js"] });
    expect(out.html).toContain('<script src="/sdk/habiv-bridge.js"></script>');
    expect(out.html.indexOf("habiv-bridge")).toBeLessThan(out.html.indexOf("js/app.js"));
    expect(out.html).toContain('href="./style.css"');
    expect(out.html).toContain('src="./js/app.js"');
    expect(out.usesNetwork).toBe(false);
  });
  it("rejects http resources and flags https ones", () => {
    expect(() => normalizeHtml('<script src="http://example.org/x.js"></script>', { paths: [] })).toThrow(RejectError);
    const out = normalizeHtml('<script src="https://cdn.jsdelivr.net/npm/phaser@3/dist/phaser.min.js"></script>', { paths: [] });
    expect(out.usesNetwork).toBe(true);
    expect(out.externalHosts).toEqual(["cdn.jsdelivr.net"]);
  });
  it("swaps portal SDKs for shims", () => {
    const out = normalizeHtml('<script src="https://game-cdn.poki.com/scripts/v2/poki-sdk.js"></script>', { paths: [] });
    expect(out.html).toContain('src="/sdk/poki-sdk.js"');
    expect(out.usesNetwork).toBe(false);
  });
  it("warns on case mismatches", () => {
    const out = normalizeHtml('<script src="JS/App.js"></script>', { paths: ["js/app.js"] });
    expect(out.warnings.some((w) => w.includes("case"))).toBe(true);
  });
  it("scans js for network hosts", () => {
    expect(scanJsForNetwork('fetch("https://api.example.net/x")')).toEqual(["api.example.net"]);
    expect(scanJsForNetwork('// https://github.com/foo/bar')).toEqual([]);
  });
});

describe("mime", () => {
  it("serves compressed wasm correctly", () => {
    expect(contentTypeFor("Build/game.wasm.br")).toEqual({ type: "application/wasm", encoding: "br" });
    expect(contentTypeFor("game.pck").type).toBe("application/octet-stream");
    expect(cacheControlFor("index.html")).toContain("max-age=60");
    expect(cacheControlFor("a.png")).toContain("immutable");
  });
});
