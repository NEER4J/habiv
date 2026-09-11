import { createRequire } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

/** Files to add to a bundle so a .swf plays through self-hosted Ruffle (MIT/Apache). */
export async function ruffleFiles(): Promise<{ path: string; body: Buffer }[]> {
  const dir = dirname(require.resolve("@ruffle-rs/ruffle/package.json"));
  const names = (await readdir(dir)).filter((n) => /\.(js|wasm)$/.test(n) && !n.endsWith(".map"));
  return Promise.all(names.map(async (n) => ({ path: `ruffle/${n}`, body: await readFile(join(dir, n)) })));
}

export function ruffleIndexHtml(swfPath: string, title: string): string {
  const safeTitle = title.replace(/[<>&"]/g, "");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}ruffle-player,#player{display:block;width:100%;height:100%}</style>
</head>
<body>
<script src="ruffle/ruffle.js"></script>
<script>
  window.RufflePlayer = window.RufflePlayer || {};
  window.RufflePlayer.config = { publicPath: "ruffle/", polyfills: false, autoplay: "on", unmuteOverlay: "visible", letterbox: "on", warnOnUnsupportedContent: false };
  window.addEventListener("load", function () {
    var ruffle = window.RufflePlayer.newest();
    var player = ruffle.createPlayer();
    player.id = "player";
    document.body.appendChild(player);
    var api = typeof player.ruffle === "function" ? player.ruffle() : player;
    var done = function () { if (window.Habiv) { Habiv.ready(); Habiv.runStart(); } };
    var p = api.load(${JSON.stringify(swfPath)});
    if (p && p.then) p.then(done, done); else done();
  });
</script>
</body>
</html>
`;
}
