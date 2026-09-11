# Habiv platform plan: from mock UI to a working game platform

Status: proposal, 11 Sep 2026, revised the same day for a zero-cost launch on `habiv.com`. Supersedes `docs/backend-plan.md` (kept for history; everything still valid from it is folded in here).

Habiv today is a finished Next.js UI running on mock data in `lib/habiv/games.ts`, plus the Supabase starter auth flow. Nothing is persisted, nothing is uploaded, no game actually runs. This document is the plan to make it real: accounts and @handles, uploads of any size, a conversion pipeline that turns whatever creators export into something that plays in the feed, a safe game runtime, and analytics for runs, beats and leaderboards.

Everything below was checked against vendor docs and pricing on 11 Sep 2026. Everything runs on free tiers until real traffic arrives; §0.1 lists the caps. Links are at the end of each section.

---

> Implementation status (11 Sep 2026): Phases 0–5 are implemented in the repo (migrations, `lib/db`, `lib/actions`, `app/api`, `workers/game-origin`, `jobs`). The UI wiring contract lives in [ui-handoff.md](ui-handoff.md). Deviations from this plan: `events`, `runs` and `rate_limits` live in a private `analytics` schema (not exposed by PostgREST) instead of `public`; `rename_handle` is folded into `set_handle`; pygbag runtimes are not mirrored yet (flagged `uses_network` instead).

## 0. Decisions in one screen

Constraint: **no spend right now.** Every service below is on its free tier, and the only thing that costs money is the domain, `habiv.com`, which we already have. Each row lists the free cap that matters and the point at which it would need upgrading, so we know what to watch.

| Concern | Decision | Why |
|---|---|---|
| Domain | **`habiv.com`**, DNS on Cloudflare (free) | Cloudflare DNS is needed for an R2 custom domain (`cdn.habiv.com`) and gives us the WAF and cache for free. Vercel records stay DNS-only (grey cloud) |
| App hosting | Next.js on **Vercel Hobby** (unchanged) | Free. Note: Hobby is licensed for non-commercial use, so this becomes Pro ($20) the day Habiv takes money |
| Auth, database, realtime | **Supabase Free** (Auth, Postgres with RLS, `pg_cron`, `pg_partman`, Realtime) | Already wired; one place for identity, catalog, social graph and analytics rollups |
| Game bundle storage | **Cloudflare R2 free tier** (buckets `uploads`, `games`, `public`) | 10 GB storage, 1M writes and 10M reads a month, **zero egress**, S3 presigned multipart from the browser. Supabase Storage is out: it serves HTML as `text/plain` on purpose and its free egress is 5 GB |
| Game origin (serving) | **Cloudflare Worker free plan** with an R2 binding, on `habiv-play.<account>.workers.dev` | `workers.dev` is on the Public Suffix List, so each worker is its own site: game code can never touch habiv.com cookies, and it costs nothing. One place to set Content-Type, `Content-Encoding` for `.br/.gz`, COOP/COEP per game, CSP and cache headers. Swap to a bought domain like `habivgames.com` later with zero code change |
| Images (covers, cards, avatars, OG) | R2 bucket `public` on **`cdn.habiv.com`** (R2 custom domain, no Worker) | Free egress and no Worker requests consumed. Keeps Supabase's 5 GB egress for the API only |
| Browser uploads | **Uppy** (`@uppy/aws-s3`) with presigned multipart parts signed by a Next.js route | Open source, resumable, parallel parts, works with R2 |
| Ingest and conversion jobs | **Trigger.dev Free** ($5 usage credit a month, no timeouts) running `yauzl` streaming extraction + Playwright | A 100 MB unzip on the smallest machine costs well under a cent, so the credit covers hundreds of publishes a month. Supabase Edge Functions cap at 2 s CPU, Vercel Hobby functions at 300 s, Workers Free at 10 ms CPU |
| Transactional email | **Resend Free** (3,000 emails/month, 100/day) as Supabase's custom SMTP | Supabase's built-in mailer is rate-limited to a handful of auth emails an hour; Resend needs only a DNS record on habiv.com |
| Analytics | **Postgres-only** in Supabase: partitioned `events` table, `pg_cron` rollups, RLS-scoped creator dashboards | No new vendor. Raw events kept 14 days on the free 500 MB database; rollups keep the history forever |
| Rate limiting | Vercel WAF rule (available on Hobby) on `/api/ingest` + a Postgres fixed-window table | Zero extra vendors |
| Agent publishing | Remote MCP server at `/api/mcp` with personal tokens | The Settings screen already promises this |
| Keep-alive | A GitHub Actions cron (free) that pings the site every 6 hours | Supabase Free pauses projects after 7 days without requests |

### 0.1 Free-tier budget and upgrade triggers

| Service | Free cap that matters | What it means for Habiv | Upgrade when |
|---|---|---|---|
| R2 | 10 GB stored; 1M Class A (writes), 10M Class B (reads) per month; egress free | ~100 games at 100 MB, or ~2,000 tiny AI games. Every extracted file is one write, so a 500-file bundle costs 500 Class A ops | Storage passes 8 GB. Then it is $0.015/GB, so 100 GB is $1.35/month |
| Workers Free | 100,000 requests/day, 10 ms CPU per request | A game load is 5–50 requests, so roughly 3,000–10,000 plays/day. Serving R2 objects is streamed and uses almost no CPU | Sustained 80k requests/day. Workers Paid is $5/month |
| Supabase Free | 500 MB database, 1 GB storage, 5 GB egress, 50,000 MAU, 200 realtime connections, 2 projects, pauses after 7 idle days | Fine for the catalog and social tables. Raw `events` must be short-lived (14 days) and API responses must stay small | Database passes 400 MB or egress 4 GB. Pro is $25/month and lifts the pause |
| Vercel Hobby | 100 GB bandwidth, 1M function invocations, 300 s max function duration, 1 WAF rate-limit rule, non-commercial | Plenty for the app. Ingest batches are tiny. Covers come from `cdn.habiv.com`, not Vercel, so bandwidth stays low | Any revenue, or bandwidth near 80 GB. Pro is $20/month |
| Trigger.dev Free | $5 usage credit/month, limited concurrency | ~$0.01 per 5-minute job on the small machine, so ~400 ingests/month | More than ~300 publishes/month. Hobby is $10/month |
| Resend Free | 3,000 emails/month, 100/day | Magic links, password resets, a few notifications | Notification digests to more than ~100 people a day |
| GitHub OAuth, Google OAuth | Free | | Never |

Total today: **$0/month.** First paid line item will most likely be Supabase Pro or Vercel Pro, both of which are triggered by real users, not by building.

---

## 1. Architecture

```
                      habiv.com  (Next.js on Vercel Hobby)
  ┌───────────────────────────────────────────────────────────────────┐
  │ Server Components / Route Handlers ── @supabase/ssr ──► Supabase   │
  │   /api/upload/*   presign R2 multipart parts                       │
  │   /api/ingest     analytics event batches ──► Postgres events      │
  │   /api/mcp        remote MCP server (publish_game …)               │
  │   /api/runs/*     run tokens + score submits                       │
  │                                                                    │
  │ Player page  <iframe sandbox src="https://habiv-play.<account>.workers.dev/v/{ver}/">│
  │              ▲ postMessage bridge (run_start, run_end, score …)     │
  └──────────────┼─────────────────────────────────────────────────────┘
                 │
     ┌───────────┴────────────┐        ┌──────────────────────────────┐
     │ Cloudflare Worker      │◄──R2──►│ R2 bucket `games`            │
     │ *.workers.dev (free)   │binding │ {game_id}/{version_id}/...   │
     │ headers, COOP/COEP,    │        │ + per-file httpMetadata      │
     │ CSP, cache, SDK shims  │        └──────────────────────────────┘
     └────────────────────────┘                    ▲
                                                   │ writes
  Browser ──Uppy multipart──► R2 bucket `uploads` ─┼─► Trigger.dev task `ingest-version`
  Agent (MCP) ──files/zip──►                       │     unzip (yauzl, streaming, limits)
                                                   │     detect engine, normalize, inject SDK
                                                   │     Playwright smoke test + thumbnail
                                                   │     set game_versions.status = ready|rejected
  Supabase Postgres ◄──────────────────────────────┘
    profiles, games, game_versions, follows, likes, comments, runs, events, rollups
    pg_cron: rollups every 5 min, daily aggregates, feed score, partition maintenance
```

Principles carried over: RLS on every table, service-role key only in jobs and `/api/mcp`, game code never runs on the habiv origin.

---

## 2. Identity: users, @handles, profiles

The UI already shows `@rahul`, follower counts, "kaveri.b and 2 others you follow played this", and creator profile pages. This is what backs it.

### 2.1 Handles

- Every account gets one **handle**: 3–20 chars, `[a-z0-9_]`, must start with a letter, no double underscores, stored in `citext` so uniqueness is case-insensitive. Display form keeps the user's casing.
- **Reserved list** (blocked at signup and rename): route names (`g`, `explore`, `trending`, `saved`, `settings`, `publish`, `auth`, `api`, `admin`, `mcp`, `play`, `help`, `about`, `login`, `signup`), brand names (`habiv`, `habiv_official`), and a small profanity list. Stored in a `reserved_handles` table so it is editable without a deploy.
- **Onboarding**: after first sign-in, if `profiles.handle_set = false` the app forces a "pick your handle" screen. A trigger on `auth.users` inserts the profile with a placeholder handle `user_<8 random chars>`. GitHub sign-in prefills the GitHub login if it is free.
- **Renames**: allowed at most once every 30 days. The old handle goes into `handle_history` (`handle`, `user_id`, `released_at`) and stays reserved for 90 days, so `/@oldname` redirects to the new profile and nobody can impersonate a creator right after a rename.
- **Live availability check** in the onboarding and settings forms via an RPC `is_handle_available(text)` that checks `profiles`, `reserved_handles`, and `handle_history` holds.

### 2.2 URLs

| URL | What |
|---|---|
| `/@{handle}` | Public profile: games, followers, remix tree, badges |
| `/@{handle}/{game_slug}` | Canonical game page (slug unique per creator, like itch.io) |
| `/g/{short_id}` | Permanent short link, redirects to the canonical URL. Keep the existing `/g/[id]` route and make it do this |
| `/@{handle}/{game_slug}/v/{n}` | A specific version (for version history in the watch view) |

Next.js: `app/@[handle]` is not a valid folder name, so use `app/(app)/[handle]/page.tsx` and match `handle.startsWith("@")` in the route, or a rewrite in `next.config.ts` from `/@:handle` to `/u/:handle`.

### 2.3 Profile

`profiles`: `id` (= `auth.users.id`), `handle citext unique`, `display_name`, `avatar_path`, `bio` (≤160), `links jsonb` (up to 3 URLs), `pronouns`, `is_creator`, `is_verified`, `is_admin`, `handle_set`, `handle_changed_at`, `created_at`.

Badges shown on profile and cards: `verified` (manual), `founder` (first 100 creators), `top_creator` (computed weekly by `pg_cron` from plays). Stored in `profile_badges(user_id, badge, granted_at)`.

Avatars: R2 bucket `public` under `avatars/{user_id}.webp`, served from `cdn.habiv.com`, resized to 256 px by a Next.js route using `sharp` before upload (2 MB cap on the input).

### 2.4 @mentions and notifications

- Comments and game descriptions support `@handle`. On insert, a trigger parses `@[a-z0-9_]{3,20}`, resolves handles to user ids into `comment_mentions(comment_id, user_id)`, and inserts a `notifications` row per mentioned user (skip self, skip blocked).
- `notifications(id, user_id, kind, actor_id, game_id, comment_id, read_at, created_at)` with kinds: `mention`, `reply`, `follow`, `like_milestone`, `remix`, `version_ready`, `version_rejected`, `report_resolved`.
- Realtime: subscribe to `notifications` for the current user only (RLS `user_id = auth.uid()`) to drive the bell in the header. Daily email digest later via Supabase Auth SMTP or Resend.
- Client side: a small mention autocomplete in the comment box backed by RPC `search_handles(prefix)` (trigram index on `handle` and `display_name`).

### 2.5 Social graph

- `follows(follower_id, creator_id)` PK, both FK to profiles. Counters (`followers_count`, `following_count`) kept on `profiles` by trigger.
- `blocks(blocker_id, blocked_id)`: blocked users cannot comment on your games or mention you; RLS policies on `comments` check it.
- "People you follow played this": `SELECT ... FROM runs JOIN follows` limited to the last 7 days, cached per user for 5 minutes.

### 2.6 Auth

- Supabase Auth: email magic link + GitHub + Google. Anonymous players never need an account.
- Keep `proxy.ts` as is: only `/publish`, `/my-games`, `/settings` require a session.
- Anonymous players get a first-party `hv_pid` cookie (UUID, 400 days, `SameSite=Lax`) set by the app; on sign-in the app calls `link_player(pid)` so past plays attach to the account.

---

## 3. Data model

All tables in `public`, `id uuid default gen_random_uuid()`, `created_at timestamptz default now()`. Migrations in `supabase/migrations/` via the Supabase CLI, types generated to `lib/supabase/database.types.ts`.

### 3.1 Catalog

| Table | Key columns | Notes |
|---|---|---|
| `games` | `creator_id`, `slug`, `short_id` (8-char base62, unique), `title`, `tagline`, `description`, `category` (`arcade/puzzle/reaction/ambient/...`), `orientation` (`portrait/landscape/any`), `status` (`draft/processing/published/hidden/removed`), `current_version_id`, `remixed_from_game_id`, `remix_licence` (`open/no_remix`), `cover_path`, `card_path`, `duration_sec`, `controls jsonb` (keyboard/touch/gamepad flags), `published_at` | Unique `(creator_id, slug)` |
| `game_versions` | `game_id`, `version` int, `status` (`uploaded/processing/ready/rejected`), `source` (`web/mcp/remix`), `agent` text, `model` text, `prompt` text, `engine` (detected, see §5), `entry_path` (default `index.html`), `upload_key` (R2 key in `uploads`), `bundle_prefix` (R2 prefix in `games`), `size_bytes`, `file_count`, `sha256`, `needs_isolation` bool (COOP/COEP), `uses_network` bool, `manifest jsonb` (per-file content-type/encoding), `smoke jsonb` (console errors, first-frame ok, load ms), `reject_reason`, `changelog` | Immutable once `ready`. The watch view's "Prompt that generated v1" and version history read from here |
| `tags`, `game_tags` | | |
| `game_stats` | `game_id` PK, `plays`, `unique_players`, `runs`, `completions`, `likes`, `saves`, `remixes`, `comments`, `best_score`, `trending_score`, `hot_score`, `updated_at` | Denormalized, written only by triggers and `pg_cron` |

### 3.2 Social

`likes(user_id, game_id)`, `saves(user_id, game_id)` (the Saved page), `comments(id, game_id, author_id, parent_id, body ≤500, likes_count, deleted_at)`, `comment_likes`, `comment_mentions`, `follows`, `blocks`, `notifications`, `reports(game_id | comment_id | user_id, reporter_id, reason, details, status)`.

### 3.3 Play and analytics (detail in §7)

`runs`, `events` (partitioned), `game_stats_5m`, `game_daily`, `retention_daily`, `leaderboard_entries`, `leaderboards`, `rate_limits`.

### 3.4 Creator tooling

`api_tokens(user_id, name, token_hash, prefix, scopes text[], last_used_at, revoked_at)`, `upload_sessions(id, user_id, game_id, version_id, r2_upload_id, key, parts jsonb, expires_at)`.

### 3.5 RLS summary

- `profiles`, `games` (published), `game_versions` (ready, of published games), `likes`, `follows`, `comments`, `game_stats`, `leaderboard_entries`: public select.
- Creators: full select on their own games and versions; insert/update on own `games`; no direct write to `game_versions.status` or `bundle_prefix` (service role only).
- `runs`, `events`, `rate_limits`: no client access at all. Written only by route handlers using the service role after validation.
- `notifications`, `saves`, `api_tokens`, `upload_sessions`: owner only.
- `reports`: insert by any signed-in user; select by `is_admin()`.

---

## 4. Upload pipeline

The publish wizard already has three steps (Source, Details, Preview) and a validation panel. This is what runs behind it.

### 4.1 Limits

| Limit | Value | Reason |
|---|---|---|
| Max upload (zip or single html) | **100 MB while on R2's free 10 GB**; 500 MB once we pay for storage | 100 MB fits every AI-made game, Godot 4, most Unity builds and Construct/GDevelop. Big Ren'Py and RPG Maker bundles wait for the paid tier |
| Max extracted size | 300 MB now; 1 GB later | |
| Max file count | 1,000 now (each file is an R2 write); 2,000 later | RPG Maker with RTP blows past this; excluded unused files is the fix |
| Max single file | 100 MB now; 300 MB later | |
| Max path length | 240 chars | |
| Allowed file types | html htm js mjs css json wasm pck data br gz unityweb apk(pygbag) png jpg jpeg webp gif svg avif ico mp3 ogg wav m4a webm mp4 woff woff2 ttf otf txt xml csv glb gltf bin swf tic p8 love sb3 | Anything else is dropped with a warning; `.exe/.dll/.sh/.php` reject the bundle |
| Compression ratio | Reject an entry over 200:1, or a bundle over 100:1 | Zip bombs |

### 4.2 Browser flow

1. Creator drops a file. The client hashes it with `hash-wasm` SHA-256 in a worker (dedupe: if a `game_versions.sha256` already exists for this creator, skip the upload and reuse the bundle).
2. `POST /api/upload/create` → creates a `games` row (draft) if new, a `game_versions` row (`uploaded`), an R2 `CreateMultipartUpload` on key `uploads/{user_id}/{version_id}/{filename}`, stores it in `upload_sessions`, returns `{uploadId, key}`. Single files under 20 MB use one presigned `PUT` instead.
3. Uppy `@uppy/aws-s3` uploads parts (8 MB, 4 parallel) using `POST /api/upload/sign-part` per part; `POST /api/upload/complete` calls `CompleteMultipartUpload` and enqueues the Trigger.dev task `ingest-version`.
4. The wizard's Details step is filled in while the job runs; the validation panel polls `game_versions.status` and `manifest/smoke` via Supabase Realtime on that row.
5. Preview step embeds the game from `habiv-play.<account>.workers.dev/v/{version_id}/` in `preview` mode (not indexed, not counted). "Publish now" flips `games.status = published` and `current_version_id`.

R2 notes: presign against `<account>.r2.cloudflarestorage.com` (custom domains cannot sign), set bucket CORS with `ExposeHeaders: [ETag]`, uploads expire after 24 h via a lifecycle rule on the `uploads` bucket.

### 4.3 `ingest-version` job (Trigger.dev, Node 22 image with Playwright)

```
1. load version row, mark processing
2. open the zip from R2 with yauzl.fromRandomAccessReader (range reads, no full download)
   - validateEntrySizes on, strictFileNames on, reject '..', absolute paths, symlinks
   - enforce counts, sizes, ratios from §4.1
3. re-root: if index.html is not at root but exactly one directory contains it, treat that as root
   - drop __MACOSX/, .DS_Store, .git/, node_modules/, source maps over 5 MB
4. detect engine (§5) → decide normalizations, needs_isolation, uses_network
5. normalize (§5): rename entry to index.html, wrap .swf, package .sb3, strip service workers,
   rewrite Poki/CrazyGames/Newgrounds SDK <script src> to our shims, inject habiv-bridge.js
6. static checks on index.html and referenced files:
   - absolute "/..." paths (rewrite to relative where safe, else warn)
   - case-mismatched references (warn, list them)
   - external http:// (reject), external https:// (list; flag uses_network)
7. stream every file to R2 `games/{game_id}/{version_id}/{path}` with httpMetadata:
   contentType from extension, contentEncoding br|gzip for .br/.gz, cacheControl immutable
8. write manifest jsonb (path, bytes, type, encoding)
9. smoke test: Playwright Chromium loads https://habiv-play.<account>.workers.dev/v/{version_id}/?smoke=1
   - wait for bridge `ready` or 15 s; capture console errors, uncaught exceptions,
     first non-blank frame, load time; screenshot at 1280×720 and 720×1280
   - failure here is a warning, not a rejection, unless the page never paints
10. thumbnails: screenshot → sharp → cover (1280×720 webp) + card (600×800 webp)
    to R2 `public/covers/{game_id}/{version_id}.webp` (served from cdn.habiv.com) unless creator uploaded art
11. status = ready (or rejected + reject_reason), notify creator (notifications row)
```

Fallback path for bundles under 100 MB if we ever want a single vendor: the same code runs in a Cloudflare Queue consumer with `fflate`, but Workers have 128 MB memory and no ZIP64, so Trigger.dev stays the default.

### 4.4 Remix

"Remix" clones `games/{src}/{version}/` to a new draft game for the remixer with `remixed_from_game_id` set, copies the prompt, and opens the publish wizard at Details. R2 server-side copy is one Class A op per file, so it is cheap. Only allowed when `remix_licence = open`.

---

## 5. Conversion matrix: what creators upload and what we do with it

Detection runs on the extracted file list plus a grep of `index.html`. Each row: how we recognize it, what we change, what the game origin must send.

| Engine / format | Detect | Normalize | Serve |
|---|---|---|---|
| Single `.html` (AI-generated, Twine, Bitsy, PICO-8 inline) | One html file, or `<tw-storydata>`, `exportedGameData` | Rename to `index.html` | `text/html` |
| Generic zip (Phaser, PixiJS, Three.js, vanilla, GDevelop, Construct) | `index.html` + js/assets; `phaser*.js`, `pixi*.js`, `data.json`+`c3runtime.js`, `data.js`+`code0.js` | Re-root; strip `sw.js`/`register-sw.js`/`offline.json` (service workers on a shared origin are a hazard); CDN scripts get flagged `uses_network` | Standard MIME |
| Unity WebGL 2020–6.x | `Build/*.loader.js` + `createUnityInstance` | Nothing to rewrite if headers are right. `.unityweb` (decompression fallback) needs no encoding header | `.wasm.br` → `application/wasm` + `Content-Encoding: br`; `.js.br` → `application/javascript` + `br`; `.data.br` → `application/octet-stream` + `br`; gzip variants likewise. Native multithreading (Unity 6) → `needs_isolation` |
| Godot 4.x | `.pck` + `GODOT_CONFIG` in html | Rename `<name>.html` to `index.html` (js references keep the export name, so do not rename the others); drop PWA service worker files | `.pck` → `application/octet-stream`, `.wasm` → `application/wasm`. 4.0–4.2, or 4.3+ with Thread Support → `needs_isolation`. 4.3+ single-thread default needs nothing |
| Godot 3.x | `.pck` + `Engine` glue, no `GODOT_CONFIG` | Same rename | Threads template → `needs_isolation` |
| Defold | `dmloader.js` + `archive/archive_files.json` | None | `application/wasm`; `wasm_pthread` build → `needs_isolation` |
| Construct 2/3 | `c2runtime.js` / `c3runtime.js` + `data.json` | Strip SW | Standard |
| GDevelop 5 | `data.js` + `gdjs` | Strip SW | Standard |
| Ren'Py web | `renpy.js` + `game.zip` | If `game.zip` is present keep it (R2 does not care), no rename needed | `index.wasm.gz` → `application/wasm` + `gzip` |
| PICO-8 / TIC-80 | `_cartdat` in `.js`; `tic80.wasm` + `cart.tic` | Do not rename the `.js` | `application/wasm` |
| LÖVE (love.js) | `love.wasm` | None | Default build → `needs_isolation`; `-c` compat build does not |
| RPG Maker MV/MZ | `js/rpg_core.js` or `js/rmmz_core.js` | Re-root if wrapped in `www/`; warn if MV lacks `.m4a` for Safari | Standard; file count is the risk |
| Scratch `.sb3` | Extension | Package server-side with `@turbowarp/packager` (Node API) into a zip bundle | Standard |
| Flash `.swf` | Extension | Generate `index.html` that loads self-hosted Ruffle (`@ruffle-rs/ruffle`, pinned nightly) and the swf. Same trick Newgrounds uses | Ruffle `.wasm` must be `application/wasm` |
| `.love` file | Extension | Build with `npx love.js -c` in the job | Standard |
| pygbag | `.apk` + html referencing `pygame-web.github.io/archives` | Mirror the runtime into the bundle (`--cdn` style rewrite) so it works under COEP and without third-party requests | `application/wasm` |
| Unreal | `*.UE4.js` | Unsupported officially; treat as a generic Emscripten bundle if it arrives | |
| Anything else with `index.html` | | Serve as-is, `engine = unknown` | |

Ruffle, TurboWarp packager, love.js and pygbag are all MIT/Apache and run in Node, so they live in the ingest image.

---

## 6. Game origin and player

### 6.1 Worker at `habiv-play.<account>.workers.dev`

Route `/v/{version_id}/{path}` (path defaults to `index.html`). Worker Free plan, `wrangler deploy`, R2 binding `GAMES`:

1. Look up the version in a KV cache (id → `game_id`, `status`, `needs_isolation`, `uses_network`, `frame_ancestors`) populated by a Supabase webhook on `game_versions` update; fall back to a Supabase REST call with the service key.
2. `env.GAMES.get("{game_id}/{version_id}/{path}")`, `obj.writeHttpMetadata(headers)` so stored Content-Type and Content-Encoding come through, and return with `encodeBody: "manual"` so the runtime does not re-compress `.br` bodies.
3. Headers on every response:
   - `Cross-Origin-Resource-Policy: cross-origin`
   - `X-Content-Type-Options: nosniff`
   - `Content-Security-Policy: frame-ancestors https://habiv.com https://*.habiv.com https://*.vercel.app http://localhost:3000`
   - `Cache-Control: public, max-age=31536000, immutable` for assets (paths are version-scoped, so they never change); `max-age=60` on `index.html`
   - if `needs_isolation`: `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`
   - if not `uses_network`: `Content-Security-Policy` also gets `default-src 'self' data: blob: 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; connect-src 'self' https://habiv.com` (bridge only). Games flagged `uses_network` get a looser `connect-src https:` and are labelled on the game page.
4. Serve `/sdk/habiv-bridge.js`, `/sdk/poki-sdk.js`, `/sdk/crazygames-sdk-v3.js`, `/sdk/newgrounds.io.js` shims from the Worker itself.
5. `caches.default` in front of R2 reads. R2 egress is free either way; the cache just cuts latency and Class B ops.

A bought domain (`habivgames.com`) or per-game subdomains are later upgrades if we want nicer URLs or per-game storage isolation; a shared origin with version-scoped paths is what itch.io does and is fine for launch.

### 6.2 Iframe on the watch page

```html
<iframe
  src="https://habiv-play.<account>.workers.dev/v/{version_id}/?pid={player_id}&run={run_token}"
  sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-forms allow-modals allow-orientation-lock"
  allow="autoplay; fullscreen *; gamepad; xr-spatial-tracking; cross-origin-isolated; accelerometer; gyroscope"
  allowfullscreen
  credentialless
  referrerpolicy="origin">
```

- `allow-same-origin` is safe here because the frame is on a different registrable domain; without it the game gets an opaque origin and Unity PlayerPrefs, Godot `user://`, Ren'Py saves and localStorage all throw. Never `allow-top-navigation`.
- Click-to-play overlay before the iframe mounts (audio autoplay rules, and it stops the feed from loading 20 games at once).
- Mobile: portrait games render in a 9:16 box; landscape games open in fullscreen on tap, like itch.
- The existing watch view's "Sandbox: allow-scripts · no top navigation · no network" copy stays true for non-network games.

### 6.3 Bridge SDK (`habiv-bridge.js`, ~2 KB)

Injected into every `index.html` at ingest (before the first `<script>`), and also available for creators to call explicitly. Game side is nothing but `parent.postMessage({v:1, type, ...}, "https://habiv.com")`.

| Game → parent | Payload | Parent does |
|---|---|---|
| `ready` | | Hides loader, starts the session |
| `run_start` | `{level?}` | Mints `run_id`, asks `/api/runs/start` for a server token |
| `run_end` | `{outcome: complete\|fail\|quit, score?, level?, progress_pct?}` | Posts to `/api/runs/end`; counts a play, a run, a beat |
| `level_start` / `level_complete` / `level_fail` | `{level, score?}` | Drop-off analytics |
| `beat_game` | | Completion, "Beat 68% of players today" |
| `score_submit` | `{board?, value}` | Leaderboard write with anti-cheat (§7.4) |
| `gameplay_start` / `gameplay_stop` | | Poki/CrazyGames semantics for pause and menus |
| `happytime` | | Confetti moment; feeds the "highlight" clip later |
| `save` / `load` | `{key, value}` | Cloud saves for logged-in players (CrazyGames `data` module shape) |
| `design` | `{key: "a:b:c", value?}` | Creator-defined events, cardinality capped at 100 keys per game |

Parent → game: `init {player_id, handle?, run_token, muted, locale}`, `pause`, `resume`, `mute {on}`.

Auto-instrumentation when a game never calls the bridge: parent counts `run_start` on first pointer/key input inside the frame (via a transparent overlay on first interaction) and `run_end {outcome: quit}` on unmount or tab hide, so every game gets plays and durations, and only games that opt in get scores and beats.

The Poki, CrazyGames and Newgrounds shims map their calls onto these messages, so games exported with those SDKs work with zero changes.

---

## 7. Analytics: runs, beats, leaderboards, dashboards

### 7.1 Ingest

- The parent page buffers bridge events plus its own (`view`, `play_click`, `share`, `like`) and sends batches of up to 50 to `POST /api/ingest` every 5 s and on `visibilitychange` via `sendBeacon`.
- The route stamps server `ts`, `country` (Vercel geo header), parsed UA, `referrer_host`, UTM, `player_id` from the `hv_pid` cookie, `user_id` if signed in, checks a Vercel WAF rate-limit rule (IP, 600 req/10 min) and a Postgres `rate_limits` fixed window (player, 2,000 events/hour), then does one `INSERT ... SELECT FROM jsonb_to_recordset`.
- Nothing is trusted from the client for counting: `runs` durations use server timestamps, and `plays` require a server-minted run.

### 7.2 Schema

```sql
create table events (
  id bigint generated always as identity,
  ts timestamptz not null default now(),
  client_ts timestamptz,
  game_id uuid not null, version_id uuid,
  player_id uuid not null, user_id uuid, session_id uuid not null, run_id uuid,
  name text not null,
  level text, outcome text, score bigint, value double precision,
  props jsonb not null default '{}',
  referrer_host text, utm_source text, utm_medium text, utm_campaign text,
  device_type text, os text, browser text, country char(2),
  primary key (ts, id)
) partition by range (ts);
-- pg_partman: daily partitions, 14-day retention on Supabase Free (90 days on Pro); pg_cron runs partman.run_maintenance() hourly

create table runs (
  id uuid primary key, game_id uuid, version_id uuid, player_id uuid, user_id uuid, session_id uuid,
  started_at timestamptz not null, ended_at timestamptz,
  duration_ms int, outcome text, score bigint, level_reached text,
  token_hash bytea not null, flagged text
);

create table game_stats_5m (game_id uuid, bucket timestamptz, plays int, uniques int, primary key (game_id, bucket));
create table game_daily (
  game_id uuid, day date, views int, plays int, unique_players int, runs int, completions int,
  median_duration_ms int, p90_duration_ms int, score_submits int, likes int, saves int, remixes int,
  by_country jsonb, by_device jsonb, by_referrer jsonb, dropoff jsonb,   -- {level: runs_reaching}
  primary key (game_id, day)
);
create table retention_daily (game_id uuid, cohort_day date, cohort_size int, d1 int, d7 int, primary key (game_id, cohort_day));
```

Definitions (also shown in the creator dashboard tooltips):

- **Play**: a server-minted run started (`run_start` or first input).
- **Run**: one `run_start` → `run_end`, duration from server clocks.
- **Beat**: `run_end{outcome: complete}` or `beat_game`. "Beat 68% of players today" = this player's score percentile among today's runs.
- **Unique player**: distinct `player_id` in the window.
- **Drop-off**: for level-based games, runs reaching each level ÷ runs started.
- **D1/D7**: players with any event on `first_seen + 1` / `+7` days.

### 7.3 Rollups and ranking (`pg_cron`)

| Job | Every | Writes |
|---|---|---|
| `rollup_5m` | 5 min | `game_stats_5m` from the last 10 min of `events`, then `game_stats.plays/runs/completions/unique_players` |
| `rollup_daily` | 02:00 UTC | `game_daily`, `retention_daily`, `profile` weekly badges |
| `rank_feed` | 10 min | `game_stats.trending_score = (plays_7d + 3*completions_7d + 0.5*uniques_7d) / (hours_since_publish + 2)^1.5` and `hot_score = Σ plays_last_48h * 0.5^(age_h/12)` |
| `partman` | hourly | partition maintenance |
| `daily_challenge` | 00:00 UTC | picks tomorrow's daily from published games with `completion_rate` 20–70% and no repeat in 30 days |

The home feed's Trending, "18,402 runs today", the daily challenge countdown and the creator dashboard's Runs tile all read from `game_stats` and `game_daily`; nothing reads raw `events` on the request path.

### 7.4 Leaderboards and anti-cheat

- `leaderboards(game_id, key default 'main', period daily|weekly|alltime, sort desc|asc, max_per_second numeric, min_duration_ms int)` configured by the creator in Details.
- `leaderboard_entries(leaderboard_id, period_start, player_id, user_id, run_id, score, flagged, created_at)` with a partial unique index on the best score per player per period.
- Flow: `run_start` → server returns `run_token = HMAC-SHA256(secret, run_id|game_id|player_id|started_at)` and stores `started_at`. `score_submit` carries `run_id` + token; the server recomputes the HMAC, uses its own `now() - started_at`, checks `score / duration_s ≤ max_per_second`, `duration ≥ min_duration_ms`, one submit per run, and per-player rate. Failing rows are stored with `flagged` and excluded from the public view.
- Ranked boards (the watch view's leaderboard with HUMAN/BOT tags) require a signed-in user; anonymous scores still count for "personal best" via `player_id`.
- Agent ghosts ("ghost · sonnet 4.5") are `leaderboard_entries` with `is_bot = true` written by a Trigger.dev task that plays the game with Playwright and the bridge, later.

### 7.5 Dashboards

- Creator (`/my-games/{slug}/stats`): tiles (plays, uniques, runs, beats, completion rate, median run, D1) with sparklines from `game_daily`; drop-off funnel; country/device/referrer tables; versions compared side by side. All queries hit rollup tables via RLS.
- Admin (`/admin`): platform totals, ingest health (events/min, rejects), moderation queue, top games, storage used per creator (from `game_versions.size_bytes`).
- Charts with an open-source library (Recharts or `@observablehq/plot`), following the `dataviz` skill palette rules already used in the app.

### 7.6 Later, at scale

Same ingest route, same schema: dual-write into ClickHouse Cloud (~$40–160/month) or Tinybird Developer ($49/month) for ad-hoc exploration when events pass ~20–50M/month, and move rate limits to Upstash. Supabase's own Analytics Buckets/Warehouse is still early access and not usable today.

---

## 8. Publishing from agents (MCP)

Unchanged in shape from the old plan; the Settings screen already lists the tools.

- Remote MCP server (Streamable HTTP) at `/api/mcp`, auth `Authorization: Bearer hbv_live_...`, checked against `api_tokens.token_hash` (sha256, prefix stored for display). Tokens are shown once.
- Tools: `publish_game {title, tagline?, category?, tags?, orientation?, prompt?, model?, files:[{path, content_base64}] | bundle_url | upload_id, remix_of?}`, `get_game`, `list_my_games`, `update_game`, `get_publish_status`, `unpublish_game`, `create_upload` (returns presigned multipart for big bundles so agents do not base64 100 MB through MCP).
- The tool writes the files to the `uploads` bucket and enqueues the same `ingest-version` job.
- Rate limit: 20 publishes/hour per token in Postgres.
- Also a plain REST equivalent (`POST /api/v1/games`) and a tiny `habiv` CLI later, modelled on itch's `butler push`.

---

## 9. Moderation and safety

- `reports` on games, comments and users; admin queue at `/admin/reports`; auto-hide a game at 5 unique reports in 24 h pending review.
- Bundle hash blocklist checked at ingest.
- Ingest rejects executables, `http://` references, and bundles that fail to paint in the smoke test.
- CSP and separate origin (§6) contain anything that gets through.
- Comment filters: link limit (2), duplicate detection, blocked words list, and `blocks`.
- Storage quotas: **250 MB per creator and the last 3 versions kept** while on R2's free tier (2 GB and 5 versions once storage is paid), tracked from `game_versions.size_bytes`. Older versions are deleted from R2 by a nightly job; the version row stays for history.

---

## 10. Rollout

| Phase | Weeks | Scope | Done when |
|---|---|---|---|
| **0. Foundation** | 1 | habiv.com DNS on Cloudflare, Vercel + Resend wired to it; Supabase project + CLI + migrations for `profiles`, handles, reserved list, onboarding screen, `/@handle` routes, GitHub + email auth, generated types; R2 buckets, `cdn.habiv.com`, Worker skeleton on workers.dev; Trigger.dev project; keep-alive cron | Sign up, pick a handle, see your empty profile at `/@handle` |
| **1. Upload and play** | 2–3 | `games`, `game_versions`, Uppy multipart upload, `ingest-version` with generic zip + single html + Unity + Godot, Worker serving with headers, watch page iframe, click-to-play, publish wizard wired end to end | A Unity build and a single-file AI game both play on the watch page from R2 |
| **2. Signals** | 2 | Bridge SDK + auto-instrumentation, `/api/ingest`, `events` partitions, `runs`, 5-min and daily rollups, `game_stats`, trending/hot scores, home feed on real data, likes, saves, follows | Feed ranks by real plays; creator dashboard shows runs and beats |
| **3. Social and identity polish** | 2 | Comments with @mentions, notifications + realtime bell, blocks, reports, profile badges, handle rename with history, share links and OG images | A mention notifies the right person; a rename redirects |
| **4. Conversion breadth** | 2 | Remaining engine rows in §5: Ruffle for swf, TurboWarp for sb3, love.js, pygbag mirroring, Ren'Py, RPG Maker checks; Poki/CrazyGames/Newgrounds shims; smoke test + thumbnails | Every fixture in `fixtures/bundles/` ingests green in CI |
| **5. Leaderboards and MCP** | 2 | Leaderboard config, anti-cheat, daily challenge job, `/api/mcp` with all tools, API tokens screen, REST + CLI | Claude Code publishes a game; a score lands on the board |
| **6. Trust and scale** | ongoing | Admin, moderation automation, quotas, cost alerts, ClickHouse when needed, per-game subdomains if needed | |

Roughly 11–13 weeks for one full-time engineer to Phase 5; Phases 1 and 2 are the ones that make the product real.

---

## 11. Repo changes

```
app/api/upload/{create,sign-part,complete}/route.ts
app/api/ingest/route.ts
app/api/runs/{start,end,score}/route.ts
app/api/mcp/route.ts
app/(app)/[handle]/page.tsx                 profile (matches @handle)
app/(app)/[handle]/[slug]/page.tsx          canonical game page
app/(app)/g/[id]/page.tsx                   becomes a redirect by short_id
app/(app)/onboarding/page.tsx
lib/habiv/games.ts                          replaced by typed queries in lib/db/*
lib/r2.ts                                   S3 client (aws-sdk v3) for presigning
lib/bridge/                                 habiv-bridge.js + shims, published to R2/Worker
supabase/migrations/*.sql
supabase/functions/                         (only small webhooks; no heavy work)
workers/game-origin/                        Cloudflare Worker (wrangler)
jobs/                                       Trigger.dev tasks: ingest-version, thumbnails, ghost-runner
fixtures/bundles/                           one sample export per engine for ingest tests
```

New dependencies: `@uppy/core @uppy/dashboard @uppy/aws-s3`, `@aws-sdk/client-s3 @aws-sdk/s3-request-presigner`, `hash-wasm`, `@trigger.dev/sdk`, `yauzl`, `mime-types`, `sharp`, `playwright`, `@ruffle-rs/ruffle`, `@turbowarp/packager`, `@modelcontextprotocol/sdk`, `wrangler`.

Environment: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_UPLOADS_BUCKET`, `R2_GAMES_BUCKET`, `GAME_ORIGIN=https://habiv-play.<account>.workers.dev`, `CDN_ORIGIN=https://cdn.habiv.com`, `RESEND_API_KEY`, `RUN_TOKEN_SECRET`, `TRIGGER_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only).

---

## 12. Decisions to confirm

1. **Game origin URL.** `habiv-play.<account>.workers.dev` is free and safely isolated. A subdomain of habiv.com is not an option because cookies are scoped to the registrable site. When we want a prettier URL, buy `habivgames.com` (about $10/year) and point the same Worker at it.
2. **Network access for games.** Default off with an explicit `uses_network` flag and a label on the game page, as proposed. Alternative: allow `https:` everywhere and skip the label.
3. **Upload cap.** 100 MB per upload and 250 MB per creator while storage is free. Raising it is a config change once we pay ~$1–2/month for R2.
4. **Analytics vendor.** Postgres-only as proposed. If you want session replays or funnels on day one, add PostHog Cloud free tier in anonymous mode for the site only.
5. **Handle rename cooldown and hold period.** 30 days / 90 days as proposed.
6. **Trigger.dev Free vs. a Vercel background function** for ingest. Trigger.dev Free ($5 credit) has no timeouts and can run Playwright. The all-Vercel fallback is a route handler using `after()` that streams the zip from R2 within Hobby's 300 s limit, with no smoke test. Same job code either way.
7. **Vercel Hobby's non-commercial licence.** Fine while Habiv is free to use and pre-revenue. Move to Pro before charging anyone.

---

## Sources

Storage and serving: [R2 pricing](https://developers.cloudflare.com/r2/pricing/) · [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) · [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/) · [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) · [Cloudflare Containers pricing](https://developers.cloudflare.com/containers/pricing/) · [Supabase Storage file limits](https://supabase.com/docs/guides/storage/uploads/file-limits) · [Supabase text/plain for HTML](https://github.com/orgs/supabase/discussions/39110) · [Supabase Edge Function limits](https://supabase.com/docs/guides/functions/limits) · [Trigger.dev pricing](https://trigger.dev/pricing) · [Uppy AWS S3](https://uppy.io/docs/aws-s3/) · [yauzl](https://github.com/thejoshwolfe/yauzl) · [Backblaze B2 pricing](https://www.backblaze.com/cloud-storage/pricing) · [Bunny Edge Rules](https://bunny.net/docs/cdn/edge-rules)

Engines and runtime: [itch.io HTML5 docs](https://itch.io/docs/creators/html5) · [itch.io SharedArrayBuffer support](https://itch.io/t/2025776/experimental-sharedarraybuffer-support) · [Unity WebGL deploying](https://docs.unity3d.com/6000.0/Documentation/Manual/webgl-deploying.html) · [Unity server config](https://docs.unity3d.com/6000.0/Documentation/Manual/web-server-config-nginx.html) · [Godot 4 web export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html) · [Godot 4.3 single-thread export](https://godotengine.org/article/progress-report-web-export-in-4-3/) · [Defold HTML5](https://defold.com/manuals/html5/) · [Ren'Py web](https://www.renpy.org/doc/html/web.html) · [Ruffle self-hosted](https://github.com/ruffle-rs/ruffle/blob/master/web/packages/selfhosted/README.md) · [TurboWarp packager](https://github.com/TurboWarp/packager) · [love.js](https://github.com/Davidobot/love.js) · [pygbag](https://github.com/pygame-web/pygbag) · [CrazyGames requirements](https://docs.crazygames.com/requirements/technical/) · [CrazyGames SDK game module](https://docs.crazygames.com/sdk/game/) · [Poki SDK](https://developers.poki.com/guide/sdk-html5) · [Newgrounds.io](https://www.newgrounds.io/help/components/) · [MDN iframe](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe) · [MDN COEP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy) · [CodePen on separate preview domains](https://blog.codepen.io/2019/10/03/changed-domains-for-iframe-previews/)

Analytics: [Supabase pricing](https://supabase.com/pricing) · [Supabase partitions](https://supabase.com/docs/guides/database/partitions) · [pg_partman on Supabase](https://supabase.com/docs/guides/database/extensions/pg_partman) · [TimescaleDB deprecation on Supabase](https://supabase.com/docs/guides/database/extensions/timescaledb) · [PostHog pricing](https://posthog.com/pricing) · [Tinybird pricing](https://www.tinybird.co/pricing) · [ClickHouse Cloud billing](https://clickhouse.com/docs/cloud/manage/billing) · [Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting) · [Upstash Redis pricing](https://upstash.com/pricing/redis) · [Chrome storage partitioning](https://privacysandbox.google.com/3pcd/storage-partitioning) · [Leaderboard anti-cheat that works](https://marvinadvergames.itch.io/cloud-leaderboard-kit-for-construct-3/devlog/1642569/your-leaderboards-anti-cheat-probably-does-nothing-heres-what-actually-works) · [HN ranking](https://www.righto.com/2013/11/how-hacker-news-ranking-really-works.html)
