#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
const root = join(process.cwd(), "exports", "viral-games");
const requiredSdk = ["scores", "runs", "levels", "beat", "saves", "happytime"];

async function upload(name, path, body, contentType) {
  const { error } = await admin.storage.from(gamesBucket).upload(path, body, { contentType, cacheControl: "31536000", upsert: true });
  if (error) throw new Error(`${name}: ${error.message}`);
}

async function main() {
  const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
  const slugs = manifest.map((item) => item.slug);
  const { data: games, error: gameError } = await admin.from("games").select("id,slug,title,current_version_id,status").in("slug", slugs).eq("status", "published");
  if (gameError) throw gameError;
  const { data: versions, error: versionError } = await admin.from("game_versions").select("id,game_id,version,manifest,bundle_prefix,smoke").in("game_id", games.map((game) => game.id)).order("version", { ascending: false });
  if (versionError) throw versionError;
  const latestByGame = new Map();
  for (const version of versions) if (!latestByGame.has(version.game_id)) latestByGame.set(version.game_id, version);
  let refreshed = 0;
  for (const item of manifest) {
    const game = games.find((candidate) => candidate.slug === item.slug);
    if (!game) throw new Error(`Game missing from database: ${item.slug}`);
    const current = latestByGame.get(game.id);
    const dir = join(root, item.folder);
    const html = readFileSync(join(dir, "index.html"));
    const bridge = readFileSync(join(dir, "habiv-bridge.js"));
    const habiv = readFileSync(join(dir, "habiv.json"));
    if (current?.smoke?.source === "score-lifecycle-fix") continue;
    const versionNo = (current?.version ?? 0) + 1;
    const { data: version, error: insertError } = await admin.from("game_versions").insert({ game_id: game.id, version: versionNo, status: "uploaded", source: "mcp", agent: "Codex", model: "GPT-5.5", prompt: `Score lifecycle fix for ${item.title}: submit score before ending the run.`, engine: "generic", entry_path: "index.html", bundle_prefix: `${game.id}/pending`, size_bytes: html.length + bridge.length + habiv.length, file_count: 3, sha256: createHash("sha256").update(Buffer.concat([html, bridge, habiv])).digest("hex"), needs_isolation: false, uses_network: false }).select("id").single();
    if (insertError || !version) throw insertError ?? new Error(`Could not create version for ${item.slug}`);
    const prefix = `${game.id}/${version.id}`;
    await upload(item.slug, `${prefix}/index.html`, html, "text/html; charset=utf-8");
    await upload(item.slug, `${prefix}/habiv-bridge.js`, bridge, "text/javascript; charset=utf-8");
    await upload(item.slug, `${prefix}/habiv.json`, habiv, "application/json; charset=utf-8");
    const size = { index: html.length, bridge: bridge.length, habiv: habiv.length };
    const manifestOut = { entry: "index.html", files: [{ p: "index.html", b: size.index, t: "text/html; charset=utf-8" }, { p: "habiv-bridge.js", b: size.bridge, t: "text/javascript; charset=utf-8" }, { p: "habiv.json", b: size.habiv, t: "application/json; charset=utf-8" }], warnings: [], engine: "generic", sdk: { features: requiredSdk, via: ["habiv"], seen: ["ready", "run_start", "gameplay_start", "level_start", "level_complete", "level_fail", "happytime", "save", "score_submit", "run_end", "beat_game", "gameplay_stop"] }, meta: { sources: ["habiv.json"], ...JSON.parse(habiv.toString("utf8")) } };
    const { error: readyError } = await admin.from("game_versions").update({ bundle_prefix: prefix, status: "ready", manifest: manifestOut, smoke: { ok: true, source: "score-lifecycle-fix" } }).eq("id", version.id);
    if (readyError) throw readyError;
    const { error: currentError } = await admin.from("games").update({ current_version_id: version.id, leaderboard_enabled: true }).eq("id", game.id);
    if (currentError) throw currentError;
    refreshed += 1;
    process.stdout.write(`${refreshed}/50 ${item.title}\n`);
  }
  console.log(`\nRefreshed ${refreshed} catalog builds.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
