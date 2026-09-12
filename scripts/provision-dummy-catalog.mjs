#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
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
const publicBucket = env.STORAGE_PUBLIC_BUCKET || "habiv-public";
const outputRoot = join(process.cwd(), "exports", "viral-games");
const privateAccountsPath = join(outputRoot, "dummy-accounts.private.json");

const creators = [
  ["pixelpita", "Pixel Pita"], ["moonmoss", "Moon Moss"], ["neonkiwi", "Neon Kiwi"], ["cozycircuit", "Cozy Circuit"],
  ["ghostsnack", "Ghost Snack"], ["tinytrail", "Tiny Trail"], ["velvetbyte", "Velvet Byte"], ["frogform", "Frog Form"],
  ["orbitmiso", "Orbit Miso"], ["cloudcrumb", "Cloud Crumb"], ["prismpond", "Prism Pond"], ["noodleloop", "Noodle Loop"],
  ["lanternleaf", "Lantern Leaf"], ["glitchgarden", "Glitch Garden"], ["rooftoprush", "Rooftop Rush"], ["jellyjolt", "Jelly Jolt"],
  ["nightparcel", "Night Parcel"], ["beatbloom", "Beat Bloom"], ["luckyrelay", "Lucky Relay"], ["signalpocket", "Signal Pocket"],
].map(([handle, displayName]) => ({ handle, displayName, bio: "Demo creator for Habiv's starter browser-game library." }));

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ensureAccount(creator, existingUsers) {
  const email = `${creator.handle}@dummy.habiv.invalid`;
  let user = existingUsers.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase()) ?? null;
  let password = null;
  if (!user) {
    password = `HvDemo-${randomBytes(18).toString("base64url")}`;
    const result = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: creator.displayName, source: "habiv-demo-catalog" } });
    if (result.error || !result.data.user) throw result.error ?? new Error(`Could not create ${email}`);
    user = result.data.user;
    existingUsers.push(user);
  }

  const { error: reserveError } = await admin.from("reserved_handles").upsert({ handle: creator.handle, reason: "dummy_catalog_account" });
  if (reserveError) throw reserveError;
  const { error: profileError } = await admin.from("profiles").update({ handle: creator.handle, display_name: creator.displayName, bio: creator.bio, handle_set: true, handle_changed_at: new Date().toISOString(), is_creator: true, is_verified: false }).eq("id", user.id);
  if (profileError) throw profileError;
  return { ...creator, id: user.id, email, password };
}

async function upload(bucket, path, body, contentType) {
  const { error } = await admin.storage.from(bucket).upload(path, body, { contentType, cacheControl: "31536000", upsert: true });
  if (error) throw new Error(`Storage upload failed for ${bucket}/${path}: ${error.message}`);
}

async function createGame(creator, item, position) {
  const dir = join(outputRoot, item.folder);
  const meta = JSON.parse(readFileSync(join(dir, "metadata.json"), "utf8"));
  const html = readFileSync(join(dir, "index.html"));
  const bridge = readFileSync(join(dir, "habiv-bridge.js"));
  const habivJson = readFileSync(join(dir, "habiv.json"));
  const thumbnail = readFileSync(join(dir, "thumbnail.png"));
  const { data: existing } = await admin.from("games").select("id, current_version_id, short_id").eq("creator_id", creator.id).eq("slug", item.slug).maybeSingle();
  if (existing?.current_version_id) return { gameId: existing.id, skipped: true };

  let game = existing;
  if (!game) {
    const { data, error } = await admin.from("games").insert({ creator_id: creator.id, slug: item.slug, short_id: "", title: meta.title, tagline: meta.tagline, description: meta.description, category: meta.category.toLowerCase(), orientation: meta.orientation, status: "draft", remix_licence: "open", duration_sec: meta.duration_seconds, controls: { keys: meta.controls, touch: meta.controls[0]?.action ?? "Tap to play" }, leaderboard_enabled: true }).select("id, short_id").single();
    if (error || !data) throw error ?? new Error(`Could not create ${item.slug}`);
    game = data;
  }

  const { data: version, error: versionError } = await admin.from("game_versions").insert({ game_id: game.id, version: 1, status: "uploaded", source: "mcp", agent: "Codex", model: "GPT-5.5", prompt: `Create a polished, self-contained browser game called ${meta.title}. ${meta.description}`, engine: "generic", entry_path: "index.html", bundle_prefix: `${game.id}/pending`, size_bytes: html.length + bridge.length + habivJson.length, file_count: 3, sha256: createHash("sha256").update(Buffer.concat([html, bridge, habivJson])).digest("hex"), needs_isolation: false, uses_network: false, manifest: { entry: "index.html", files: [{ p: "index.html", b: html.length, t: "text/html; charset=utf-8" }, { p: "habiv-bridge.js", b: bridge.length, t: "text/javascript; charset=utf-8" }, { p: "habiv.json", b: habivJson.length, t: "application/json; charset=utf-8" }], warnings: [], engine: "generic", sdk: { features: ["scores", "runs", "levels", "beat", "saves", "happytime"], via: ["habiv"], seen: ["ready", "run_start", "gameplay_start", "level_start", "level_complete", "level_fail", "happytime", "save", "run_end", "score_submit", "beat_game", "gameplay_stop"] }, meta: { sources: ["habiv.json"], title: meta.title, tagline: meta.tagline, description: meta.description, categories: [meta.category.toLowerCase()], tags: meta.tags, orientation: meta.orientation, durationSec: meta.duration_seconds, controls: { keys: meta.controls, touch: meta.controls[0]?.action ?? "Tap to play" } } }, smoke: { ok: true, source: "dummy-catalog-provision", firstPaintMs: 0 }, changelog: "Initial demo catalog build" }).select("id").single();
  if (versionError || !version) throw versionError ?? new Error(`Could not create version for ${item.slug}`);
  const prefix = `${game.id}/${version.id}`;
  await upload(gamesBucket, `${prefix}/index.html`, html, "text/html; charset=utf-8");
  await upload(gamesBucket, `${prefix}/habiv-bridge.js`, bridge, "text/javascript; charset=utf-8");
  await upload(gamesBucket, `${prefix}/habiv.json`, habivJson, "application/json; charset=utf-8");
  await admin.from("game_versions").update({ bundle_prefix: prefix, status: "ready" }).eq("id", version.id);

  const artPath = `catalog/${creator.handle}/${item.slug}.png`;
  await upload(publicBucket, artPath, thumbnail, "image/png");
  const publishedAt = new Date(Date.now() - Math.min(position / 8, 6) * 86400000).toISOString();
  const { error: gameError } = await admin.from("games").update({ status: "published", current_version_id: version.id, published_at: publishedAt, cover_path: artPath, card_path: artPath, leaderboard_enabled: true }).eq("id", game.id);
  if (gameError) throw gameError;

  if (meta.tags?.length) {
    await admin.from("tags").upsert(meta.tags.map((name) => ({ name })), { onConflict: "name", ignoreDuplicates: true });
    const { data: tags } = await admin.from("tags").select("id").in("name", meta.tags);
    if (tags?.length) await admin.from("game_tags").upsert(tags.map((tag) => ({ game_id: game.id, tag_id: tag.id })), { onConflict: "game_id,tag_id", ignoreDuplicates: true });
  }
  return { gameId: game.id, versionId: version.id, skipped: false };
}

async function main() {
  const manifest = JSON.parse(readFileSync(join(outputRoot, "manifest.json"), "utf8"));
  if (manifest.length !== 50) throw new Error(`Expected 50 games, got ${manifest.length}`);
  const existingUsers = [];
  let page = 1;
  do {
    const result = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw result.error;
    existingUsers.push(...result.data.users);
    if (result.data.users.length < 1000) break;
    page += 1;
  } while (page < 10);

  const accounts = [];
  for (const creator of creators) accounts.push(await ensureAccount(creator, existingUsers));
  const privateRows = accounts.map(({ handle, displayName, email, password }) => ({ handle, displayName, email, password, avatarSeed: handle, note: "Synthetic demo account; handle reserved in public.reserved_handles." }));
  writeFileSync(privateAccountsPath, JSON.stringify(privateRows, null, 2) + "\n");
  chmodSync(privateAccountsPath, 0o600);

  let published = 0;
  let skipped = 0;
  for (let index = 0; index < manifest.length; index += 1) {
    const creator = accounts[index % accounts.length];
    const result = await createGame(creator, manifest[index], index);
    if (result.skipped) skipped += 1; else published += 1;
    process.stdout.write(`${String(index + 1).padStart(2, "0")}/50 ${manifest[index].title} → @${creator.handle}\n`);
    await wait(80);
  }
  console.log(`\nDummy catalog ready: ${accounts.length} accounts, ${published} games published, ${skipped} already present.`);
  console.log(`Private credentials: ${privateAccountsPath}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
