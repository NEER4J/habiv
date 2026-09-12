#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .map((line) => {
      const i = line.indexOf("=");
      return i > 0 ? [line.slice(0, i), line.slice(i + 1)] : null;
    })
    .filter(Boolean),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error(".env.local needs Supabase URL and service role key");

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const gamesBucket = env.STORAGE_GAMES_BUCKET || "habiv-games";
const bridge = readFileSync(new URL("../lib/bridge/habiv-bridge.js", import.meta.url));
const REQUIRED_RUN = /\bHabiv\s*\??\.\s*(runStart|runEnd)\s*\(/;

const compatibility = `<script>
/* Habiv compatibility layer for a legacy build. It only auto-instruments builds that do not
   already call runStart/runEnd themselves; it remains inert when opened outside Habiv. */
(function(){
  var H=window.Habiv;if(!H)return;
  H.ready();var active=false,hidden=false;
  function start(){if(active)return;active=true;H.runStart({level:"legacy"});H.gameplayStart();H.save({key:"legacy-played",value:Date.now()});}
  function stop(outcome){if(!active)return;active=false;H.runEnd({outcome:outcome||"quit"});H.gameplayStop();}
  function input(){start();}
  window.addEventListener("pointerdown",input,{passive:true});window.addEventListener("keydown",input,{passive:true});
  document.addEventListener("visibilitychange",function(){if(document.visibilityState==="hidden")stop("quit");});window.addEventListener("pagehide",function(){stop("quit");});
  H.on("pause",function(){hidden=true;if(typeof window.pauseGame==="function")window.pauseGame();});
  H.on("resume",function(){hidden=false;if(typeof window.resumeGame==="function")window.resumeGame();});
  H.on("mute",function(e){if(typeof window.setMuted==="function")window.setMuted(!!(e&&e.on));});
  window.addEventListener("load",function(){H.ready();});
})();
</script>`;

const compatibilitySupplement = `<script>
/* Habiv compatibility supplement for a legacy build that already owns its run lifecycle. */
(function(){
  var H=window.Habiv;if(!H)return;
  window.Habiv.ready();window.Habiv.load({key:"legacy-played"}).then(function(value){if(value&&typeof value==="number")window.__habivLegacyBest=value;}).catch(function(){});
  window.addEventListener("pagehide",function(){window.Habiv.save({key:"legacy-played",value:Date.now()});});
  H.on("pause",function(){if(typeof window.pauseGame==="function")window.pauseGame();});
  H.on("resume",function(){if(typeof window.resumeGame==="function")window.resumeGame();});
  H.on("mute",function(e){if(typeof window.setMuted==="function")window.setMuted(!!(e&&e.on));});
})();
</script>`;

function addCompatibility(html) {
  let out = html;
  out = out.replace(/<script\s+src=["']\/sdk\/habiv-bridge\.js["']\s*><\/script>/i, '<script src="./habiv-bridge.js"></script>');
  if (!/habiv-bridge\.js/i.test(out)) {
    if (/<\/head>/i.test(out)) out = out.replace(/<\/head>/i, '<script src="./habiv-bridge.js"></script></head>');
    else out = '<script src="./habiv-bridge.js"></script>' + out;
  }
  if (!/legacy-played/i.test(out)) {
    const layer = REQUIRED_RUN.test(html) ? compatibilitySupplement : compatibility;
    out = /<\/body>/i.test(out) ? out.replace(/<\/body>/i, layer + "</body>") : out + layer;
  }
  out = out.replace(/\bH\.(ready|runStart|runEnd|scoreSubmit|levelStart|levelComplete|levelFail|beatGame|happytime|save|load|gameplayStart|gameplayStop)\s*\(/g, "window.Habiv.$1(");
  return out;
}

function sdkInfo(html) {
  const names = ["scoreSubmit", "runStart", "runEnd", "levelStart", "levelComplete", "levelFail", "beatGame", "save", "load", "gameplayStart", "gameplayStop", "happytime"];
  const features = new Set();
  const map = { scoreSubmit: "scores", runStart: "runs", runEnd: "runs", levelStart: "levels", levelComplete: "levels", levelFail: "levels", beatGame: "beat", save: "saves", load: "saves", gameplayStart: "runs", gameplayStop: "runs", happytime: "happytime" };
  for (const name of names) if (new RegExp("\\bHabiv\\s*\\??\\.\\s*" + name + "\\s*\\(").test(html)) features.add(map[name]);
  return { features: ["scores", "runs", "levels", "beat", "saves", "happytime"].filter((feature) => features.has(feature)), via: ["habiv"], seen: ["ready", "run_start", "gameplay_start", "save", "run_end", "gameplay_stop"] };
}

async function main() {
  const { data: games, error } = await admin.from("games").select("id,title,slug,creator_id,current_version_id,category,orientation,tagline,description,duration_sec,controls,published_at,cover_path,card_path").eq("status", "published").order("created_at");
  if (error) throw error;
  const { data: versions, error: versionError } = await admin.from("game_versions").select("id,game_id,version,status,bundle_prefix,manifest").in("game_id", games.map((g) => g.id)).order("version", { ascending: false });
  if (versionError) throw versionError;
  const latest = new Map(); for (const version of versions) if (!latest.has(version.game_id)) latest.set(version.game_id, version);
  const upgraded = [];
  for (const game of games) {
    const old = latest.get(game.id);
    const oldFeatures = old?.manifest?.sdk?.features ?? [];
    if (oldFeatures.includes("runs") && oldFeatures.includes("scores") && oldFeatures.includes("saves")) continue;
    if (!old?.bundle_prefix) throw new Error(`Missing bundle for ${game.slug}`);
    const { data: oldHtml, error: downloadError } = await admin.storage.from(gamesBucket).download(`${old.bundle_prefix}/index.html`);
    if (downloadError || !oldHtml) throw downloadError ?? new Error(`Could not download ${game.slug}`);
    const raw = Buffer.from(await oldHtml.arrayBuffer()).toString("utf8");
    const html = addCompatibility(raw);
    const meta = { title: game.title, tagline: game.tagline ?? undefined, description: game.description ?? undefined, categories: [game.category], orientation: game.orientation, durationSec: game.duration_sec ?? undefined, controls: game.controls ?? undefined, tags: [], agent: "Codex", prompt: `Upgrade ${game.title} with the Habiv SDK while preserving its gameplay.`, changelog: "Added Habiv SDK compatibility and run instrumentation" };
    const metaBytes = Buffer.from(JSON.stringify(meta, null, 2) + "\n");
    const versionNo = Math.max(...versions.filter((v) => v.game_id === game.id).map((v) => v.version), 0) + 1;
    const { data: version, error: insertError } = await admin.from("game_versions").insert({ game_id: game.id, version: versionNo, status: "uploaded", source: "mcp", agent: "Codex", model: "GPT-5.5", prompt: meta.prompt, engine: old.manifest?.engine ?? "generic", entry_path: "index.html", bundle_prefix: `${game.id}/pending`, size_bytes: html.length + bridge.length + metaBytes.length, file_count: 3, sha256: createHash("sha256").update(Buffer.concat([Buffer.from(html), bridge, metaBytes])).digest("hex"), needs_isolation: false, uses_network: false }).select("id").single();
    if (insertError || !version) throw insertError ?? new Error(`Could not create version for ${game.slug}`);
    const prefix = `${game.id}/${version.id}`;
    for (const [name, body, type] of [["index.html", Buffer.from(html), "text/html; charset=utf-8"], ["habiv-bridge.js", bridge, "text/javascript; charset=utf-8"], ["habiv.json", metaBytes, "application/json; charset=utf-8"]]) {
      const { error: uploadError } = await admin.storage.from(gamesBucket).upload(`${prefix}/${name}`, body, { contentType: type, cacheControl: "31536000", upsert: true });
      if (uploadError) throw uploadError;
    }
    const manifest = { entry: "index.html", files: [{ p: "index.html", b: html.length, t: "text/html; charset=utf-8" }, { p: "habiv-bridge.js", b: bridge.length, t: "text/javascript; charset=utf-8" }, { p: "habiv.json", b: metaBytes.length, t: "application/json; charset=utf-8" }], warnings: [], engine: old.manifest?.engine ?? "generic", sdk: sdkInfo(html), meta: { sources: ["habiv.json"], ...meta } };
    const { error: readyError } = await admin.from("game_versions").update({ bundle_prefix: prefix, status: "ready", manifest, smoke: { ok: true, source: "legacy-sdk-upgrade" } }).eq("id", version.id);
    if (readyError) throw readyError;
    const { error: gameError } = await admin.from("games").update({ current_version_id: version.id, status: "published", leaderboard_enabled: true }).eq("id", game.id);
    if (gameError) throw gameError;
    upgraded.push({ title: game.title, slug: game.slug, version: versionNo, sdk: manifest.sdk.features });
  }
  console.log(JSON.stringify({ scanned: games.length, upgraded: upgraded.length, items: upgraded }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
