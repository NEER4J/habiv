#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
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
const handles = ["pixelpita", "moonmoss", "neonkiwi", "cozycircuit", "ghostsnack", "tinytrail", "velvetbyte", "frogform", "orbitmiso", "cloudcrumb", "prismpond", "noodleloop", "lanternleaf", "glitchgarden", "rooftoprush", "jellyjolt", "nightparcel", "beatbloom", "luckyrelay", "signalpocket"];
const features = ["scores", "runs", "levels", "beat", "saves", "happytime"];

async function main() {
  const { data: profiles, error: profileError } = await admin.from("profiles").select("id,handle").in("handle", handles);
  if (profileError) throw profileError;
  if ((profiles ?? []).length !== handles.length) throw new Error(`Expected ${handles.length} dummy profiles, got ${(profiles ?? []).length}`);
  const byHandle = new Map(profiles.map((p) => [p.handle, p]));
  const accounts = handles.map((handle) => byHandle.get(handle));
  const { data: games, error: gameError } = await admin.from("games").select("id,title,slug,creator_id,current_version_id,status").eq("status", "published").order("published_at", { ascending: true });
  if (gameError) throw gameError;
  if ((games ?? []).length < 50) throw new Error(`Expected at least 50 published games, got ${(games ?? []).length}`);

  const leaderboardRows = games.flatMap((game) => ["daily", "weekly", "alltime"].map((period) => ({ game_id: game.id, key: "main", period, sort: "desc", min_duration_ms: 1000 })));
  const { error: leaderboardError } = await admin.from("leaderboards").upsert(leaderboardRows, { onConflict: "game_id,key,period", ignoreDuplicates: true });
  if (leaderboardError) throw leaderboardError;

  const runScores = new Map();
  let runsCreated = 0;
  for (let gameIndex = 0; gameIndex < games.length; gameIndex += 1) {
    const game = games[gameIndex];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const player = accounts[(gameIndex + attempt) % accounts.length];
      const runId = randomUUID();
      const durationMs = 12000 + ((gameIndex * 1739 + attempt * 811) % 22000);
      const score = 420 + ((gameIndex * 137 + attempt * 83) % 2700);
      const startedAt = new Date(Date.now() - durationMs).toISOString();
      const tokenHash = createHash("sha256").update(runId).digest("hex");
      const { error: startError } = await admin.rpc("start_run", { p_id: runId, p_started_at: startedAt, p_game_id: game.id, p_version_id: game.current_version_id, p_player_id: player.id, p_user_id: player.id, p_session_id: randomUUID(), p_level: "1", p_auto: false, p_preview: false, p_token_hash: tokenHash });
      if (startError) throw startError;
      const outcome = attempt === 4 ? "fail" : "complete";
      const { error: endError } = await admin.rpc("end_run", { p_id: runId, p_outcome: outcome, p_score: score, p_level: "1", p_progress_pct: outcome === "complete" ? 100 : 72, p_flag: null });
      if (endError) throw endError;
      if (outcome === "complete") {
        const { error: scoreError } = await admin.rpc("submit_score", { p_run: runId, p_key: "main", p_score: score, p_flag: null });
        if (scoreError) throw scoreError;
      }
      runsCreated += 1;
      runScores.set(game.id, Math.max(runScores.get(game.id) ?? 0, score));
    }
    if ((gameIndex + 1) % 10 === 0) console.log(`runs ${gameIndex + 1}/${games.length} games`);
  }

  const followRows = accounts.flatMap((account, index) => [accounts[(index + 1) % accounts.length], accounts[(index + 3) % accounts.length]].filter((creator) => creator.id !== account.id).map((creator) => ({ follower_id: account.id, creator_id: creator.id })));
  const { error: followError } = await admin.from("follows").upsert(followRows, { onConflict: "follower_id,creator_id", ignoreDuplicates: true });
  if (followError) throw followError;

  const likeRows = games.flatMap((game, index) => [1, 5, 9].map((offset) => accounts[(index + offset) % accounts.length]).filter((account) => account.id !== game.creator_id).map((account) => ({ user_id: account.id, game_id: game.id })));
  const { error: likeError } = await admin.from("likes").upsert(likeRows, { onConflict: "user_id,game_id", ignoreDuplicates: true });
  if (likeError) throw likeError;

  const saveRows = games.map((game, index) => ({ user_id: accounts[(index + 7) % accounts.length].id, game_id: game.id }));
  const { error: saveError } = await admin.from("saves").upsert(saveRows, { onConflict: "user_id,game_id", ignoreDuplicates: true });
  if (saveError) throw saveError;

  const commentRows = games.flatMap((game, index) => [0, 1].map((offset) => ({ game_id: game.id, author_id: accounts[(index + 11 + offset) % accounts.length].id, body: offset === 0 ? `The ${game.title} loop is wonderfully replayable.` : `That last round of ${game.title} got me — one more run.` })));
  const { data: comments, error: commentError } = await admin.from("comments").insert(commentRows).select("id");
  if (commentError) throw commentError;
  const commentLikeRows = (comments ?? []).map((comment, index) => ({ user_id: accounts[(index + 4) % accounts.length].id, comment_id: comment.id }));
  const { error: commentLikeError } = await admin.from("comment_likes").upsert(commentLikeRows, { onConflict: "user_id,comment_id", ignoreDuplicates: true });
  if (commentLikeError) throw commentLikeError;

  const { error: rollupError } = await admin.rpc("rollup_5m");
  if (rollupError) console.warn(`rollup_5m deferred: ${rollupError.message}`);
  const { error: rankError } = await admin.rpc("rank_feed");
  if (rankError) console.warn(`rank_feed deferred: ${rankError.message}`);
  const { error: dailyError } = await admin.rpc("pick_daily_challenge");
  if (dailyError) console.warn(`daily challenge deferred: ${dailyError.message}`);

  const { data: stats, error: statsError } = await admin.from("game_stats").select("game_id,plays,runs,completions,unique_players,best_score,trending_score,hot_score").in("game_id", games.map((g) => g.id));
  if (statsError) throw statsError;
  for (const stat of stats ?? []) {
    const best = runScores.get(stat.game_id) ?? 0;
    const patch = { plays: Math.max(Number(stat.plays ?? 0), 5), runs: Math.max(Number(stat.runs ?? 0), 4), completions: Math.max(Number(stat.completions ?? 0), 4), unique_players: Math.max(Number(stat.unique_players ?? 0), 5), best_score: Math.max(Number(stat.best_score ?? 0), best), trending_score: Math.max(Number(stat.trending_score ?? 0), 4), hot_score: Math.max(Number(stat.hot_score ?? 0), 2) };
    const { error } = await admin.from("game_stats").update(patch).eq("game_id", stat.game_id);
    if (error) throw error;
  }

  console.log(JSON.stringify({ accounts: accounts.length, games: games.length, leaderboards: leaderboardRows.length, runs: runsCreated, follows: followRows.length, likes: likeRows.length, saves: saveRows.length, comments: comments?.length ?? 0, commentLikes: commentLikeRows.length, sdkFeatures: features }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
