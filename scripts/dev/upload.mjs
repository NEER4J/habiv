#!/usr/bin/env node
/**
 * End-to-end upload test without the UI.
 *   node scripts/dev/upload.mjs <file.zip|file.html> [--title "Name"] [--game <gameId>] [--base http://localhost:3000]
 * Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, HABIV_TEST_EMAIL, HABIV_TEST_PASSWORD
 * Signs in with email + password, hashes the file, runs create -> PUT/parts -> complete -> status.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("usage: node scripts/dev/upload.mjs <file> [--title T] [--game id] [--base url]");
  process.exit(1);
}
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? def : args[i + 1];
};
const base = (opt("base", process.env.HABIV_BASE_URL ?? "http://localhost:3000")).replace(/\/$/, "");
const title = opt("title", basename(file).replace(/\.[^.]+$/, ""));
const gameId = opt("game", undefined);

const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key, HABIV_TEST_EMAIL: email, HABIV_TEST_PASSWORD: password } = process.env;
if (!url || !key || !email || !password) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, HABIV_TEST_EMAIL, HABIV_TEST_PASSWORD");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
if (authErr) throw authErr;
const jwt = auth.session.access_token;
const headers = { authorization: `Bearer ${jwt}`, "content-type": "application/json" };

const bytes = await readFile(file);
const sha256 = createHash("sha256").update(bytes).digest("hex");
console.log(`file ${file} ${bytes.length} bytes sha256 ${sha256}`);

const post = async (path, body) => {
  const res = await fetch(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok || json.ok === false) throw new Error(`${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
};

const session = await post("/api/upload/create", { filename: basename(file), size: bytes.length, sha256, title, gameId });
console.log("create:", session);

if (session.mode === "single") {
  const put = await fetch(session.putUrl, { method: "PUT", body: bytes, headers: { "content-type": file.endsWith(".zip") ? "application/zip" : "text/html" } });
  if (!put.ok) throw new Error(`PUT failed ${put.status} ${await put.text()}`);
  console.log("complete:", await post("/api/upload/complete", { key: session.key }));
} else if (session.mode === "multipart") {
  const parts = [];
  for (let i = 0, n = 1; i < bytes.length; i += session.partSize, n++) {
    const { url: partUrl } = await post("/api/upload/sign-part", { uploadId: session.uploadId, key: session.key, partNumber: n });
    const res = await fetch(partUrl, { method: "PUT", body: bytes.subarray(i, i + session.partSize) });
    if (!res.ok) throw new Error(`part ${n} failed ${res.status}`);
    parts.push({ PartNumber: n, ETag: res.headers.get("etag") });
    console.log(`part ${n} ok`);
  }
  console.log("complete:", await post("/api/upload/complete", { key: session.key, uploadId: session.uploadId, parts }));
} else {
  console.log("deduped: reusing an existing bundle");
}

for (let i = 0; i < 150; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const res = await fetch(`${base}/api/upload/status?versionId=${session.versionId}`, { headers });
  const s = await res.json();
  process.stdout.write(`status: ${s.status} ${s.engine ?? ""} ${s.rejectReason ?? ""}\n`);
  if (s.status === "ready") {
    console.log("preview:", s.previewUrl, "warnings:", s.warnings);
    console.log(`publish with: select publish_game_version('${session.gameId}','${session.versionId}');  (as the creator) or via the publishVersion action`);
    process.exit(0);
  }
  if (s.status === "rejected") {
    console.error("rejected:", s.rejectReason, s.warnings);
    process.exit(2);
  }
}
console.error("timed out waiting for ingest");
process.exit(3);
