> Superseded by [platform-plan.md](platform-plan.md) (11 Sep 2026). Kept for history.

# Habiv backend plan (Supabase)

Habiv is a feed of tiny, untrusted, AI-made HTML games. The backend has four jobs:

1. **Identity**: players and creators sign in.
2. **Catalog**: games, versions, tags, remix lineage.
3. **Hosting**: store game bundles and serve them safely.
4. **Signals**: plays, likes, comments and reports, which drive the feed.

Creators can publish from the web UI or from coding agents over MCP.

Supabase covers 1, 2 and 4, plus bundle *storage* for 3. Serving the games needs its own origin (see §4).

---

## 1. Architecture

```
Browser (Next.js on Vercel)
  ├─ Server Components / Server Actions ──► Supabase Postgres (RLS)   @supabase/ssr, user JWT
  ├─ Supabase Auth (email magic link, GitHub, Google)
  └─ <iframe sandbox src="https://play.habiv.games/g/{version_id}/">  ◄── game origin (isolated)
                                                     ▲
Agent (Claude Code / Codex) ──MCP──► /api/mcp (Next route) ──► publish pipeline
                                                     │
Upload (web) ──► Storage bucket `uploads` (private) ─┘
                          │
                Edge Function `process-upload`: unzip → validate → write to `games` bucket,
                          │                          generate thumbnail, set version status
                          ▼
                Storage bucket `games` (private) ──► served by the game origin
```

Principles:
- **RLS on every table.** The browser only ever holds the anon/publishable key plus the user's JWT.
- **The service role key is used only** in Edge Functions and the `/api/mcp` route, never in client code.
- **Game code never runs on `habiv.vercel.app`.** It runs only on a separate registrable domain, inside a sandboxed iframe.

---

## 2. Data model (Postgres)

All tables live in `public`, with `id uuid default gen_random_uuid()` and `created_at timestamptz default now()`.

| Table | Key columns | Notes |
|---|---|---|
| `profiles` | `id` (= `auth.users.id`), `handle` unique citext, `display_name`, `avatar_url`, `bio`, `is_creator` | Created by a trigger on `auth.users` insert |
| `games` | `creator_id`, `slug`, `title`, `tagline`, `genre`, `status` (`draft/published/hidden/removed`), `current_version_id`, `remixed_from_game_id`, `thumbnail_path`, `duration_sec` (10–45 check) | Unique `(creator_id, slug)` |
| `game_versions` | `game_id`, `version` int, `bundle_path`, `entry_file` (default `index.html`), `size_bytes`, `sha256`, `status` (`pending/processing/ready/rejected`), `reject_reason`, `source` (`web/mcp`), `agent` (e.g. `claude-code`) | Immutable once `ready` |
| `tags` / `game_tags` | `name` / `(game_id, tag_id)` | |
| `plays` | `game_id`, `version_id`, `player_id` nullable, `session_id`, `duration_ms`, `completed` bool | Append-only, write via RPC only. Partition by month later |
| `likes` | `(user_id, game_id)` PK | |
| `comments` | `game_id`, `author_id`, `body` (≤ 500), `parent_id` | |
| `follows` | `(follower_id, creator_id)` PK | |
| `reports` | `game_id`, `reporter_id`, `reason`, `status` | Moderation queue |
| `api_tokens` | `user_id`, `name`, `token_hash`, `scopes text[]`, `last_used_at`, `revoked_at` | Personal tokens for MCP publishing. Only the hash is stored |
| `game_stats` | `game_id` PK, `plays`, `unique_players`, `likes`, `completion_rate`, `score`, `updated_at` | Denormalized counters for the feed |

Counters in `game_stats` are updated by triggers on `likes`, and by a `pg_cron` job every 5 min that aggregates `plays`. That keeps hot rows away from per-play writes. `score` is a time-decayed ranking, for example `(plays_24h * completion_rate + likes * 3) / (age_hours + 2)^1.5`.

### RLS sketch

- `profiles`: anyone can select. A user can update only their own row (`auth.uid() = id`).
- `games`: anyone can select rows where `status = 'published'`. The creator can select, insert and update their own rows. No client deletes (soft-delete via `status`).
- `game_versions`: anyone can select versions of published games that are `ready`. Creators can see all of their own versions. Inserts go through the upload RPC only. Status changes come only from the service role.
- `likes`, `follows`, `comments`: anyone can select. A user can insert and delete only their own rows.
- `plays`: no direct access. Writes go through `record_play(version_id, session_id, duration_ms, completed)`, a `security definer` function with basic rate limiting per `session_id`.
- `reports`: a user can insert. Only admins can select (via an `is_admin()` claim check).
- `api_tokens`: the owner can select and revoke. The raw token is shown once at creation.

Migrations live in `supabase/migrations/` (Supabase CLI). Generate types with `supabase gen types typescript --linked > lib/supabase/database.types.ts`.

---

## 3. Auth

- Supabase Auth with email magic link and OAuth (GitHub first, since the creators are developers, then Google).
- The existing starter wiring stays: `proxy.ts` refreshes the session and `lib/supabase/{server,client}.ts` create the clients.
  - Change `lib/supabase/proxy.ts` so it redirects to login only on creator/account routes (`/studio`, `/settings`). The feed and game pages must be public.
- Anonymous players get a random `session_id` cookie so plays can be counted without an account. Supabase anonymous sign-ins are an option later if we want likes without signup.
- Handle picked at onboarding. A `profiles` trigger reserves a placeholder handle.

---

## 4. Game hosting and security

This is the only part Supabase can't handle on its own. **Supabase Storage deliberately serves HTML as `text/plain`**, so games can't be served straight from a Storage URL. Uploaded code is also untrusted, so it needs an isolated origin anyway.

Plan:
- **Buckets**
  - `uploads` (private): raw zip or HTML from creators, 10 MB cap.
  - `games` (private): extracted, validated bundles at `{game_id}/{version_id}/...`.
  - `thumbnails` (public): images for the feed.
- **Game origin: `play.habiv.games`**, a separate registrable domain so it can't read habiv cookies. It's a small proxy (a Vercel project, or a Cloudflare Worker) that:
  - maps `/g/{version_id}/{path}` to the object in the `games` bucket (service key or signed URL, with a CDN cache),
  - sets the right `Content-Type`,
  - sets a strict CSP: `default-src 'self' 'unsafe-inline' data: blob:; connect-src 'none'` for v1, so no network access,
  - sets `frame-ancestors https://habiv.vercel.app` and `Cross-Origin-Resource-Policy`.
- **Embed**: `<iframe sandbox="allow-scripts allow-pointer-lock" allow="gamepad; fullscreen">`. No `allow-same-origin`. The game and the feed talk only through `postMessage` (`ready`, `score`, `end`).
- **Validation (Edge Function `process-upload`)**:
  - unzip with size and entry-count limits, and reject path traversal,
  - require `index.html`,
  - allowlist file types (html/js/css/png/jpg/webp/svg/wav/mp3/ogg/json/woff2),
  - enforce a max total size (e.g. 15 MB uncompressed),
  - compute `sha256`,
  - write to the `games` bucket,
  - set the version to `ready` or `rejected` with a reason.
  - Later: headless-browser smoke test and auto-thumbnail (a queued job via `pgmq` plus a worker).

---

## 5. Publishing API and MCP

A Next.js route at `/api/mcp` implements a remote MCP server (Streamable HTTP). Auth is `Authorization: Bearer <habiv_token>`, checked against `api_tokens.token_hash`.

| Tool | Does |
|---|---|
| `publish_game` | `{title, tagline?, genre?, tags?, files: [{path, content_base64}] \| bundle_url, remix_of?}`. Creates or updates the game, creates a `game_versions` row, uploads to `uploads`, triggers `process-upload`, and returns `{game_url, status}` |
| `get_publish_status` | Poll the version status and reject reason |
| `list_my_games` | The creator's games and latest version status |
| `update_game` | Metadata only |
| `unpublish_game` | Sets `status = hidden` |

The web upload flow uses the same pipeline:
1. A signed upload URL to `uploads`.
2. An RPC `create_game_version(game_id)`.
3. A Storage webhook or explicit invoke of `process-upload`.

Rate limits: per token and per user on `publish_game`, e.g. 20 per hour, enforced in Postgres.

---

## 6. Feed and read paths

- `/` feed: a server component that calls `get_feed(cursor, genre?)`, which reads `game_stats.score`. It uses cursor pagination and is cached with `revalidate` of about 60 s for anonymous users.
- `/g/[slug]` game page: game metadata, remix lineage and comments, plus the sandboxed iframe.
- `/@[handle]` creator page.
- `/studio`: the creator dashboard (games, versions, stats, API tokens). Protected.
- Realtime: optional, only for a live play-counter or comments on the game page. Don't put it on the feed.

---

## 7. Moderation and safety

- `reports` queue with an admin view at `/admin`, gated by an `is_admin` custom claim through an Auth hook.
- Auto-hide a game when it gets N unique reports within 24 h.
- Store bundle hashes and block known-bad hashes on re-upload.
- Terms of Service require creators to have the rights to their assets, and remixes credit the original.

---

## 8. Rollout phases

| Phase | Scope | Exit criteria |
|---|---|---|
| **0: Foundation** | Supabase project, CLI and migrations wired in, `profiles` trigger, GitHub and email auth, generated types. Landing page keeps working without env vars | Sign up and log in work on preview deploys |
| **1: Catalog and hosting** | `games`, `game_versions`, buckets, `process-upload`, `play.habiv.games` proxy, iframe player, game page | A hand-uploaded zip plays on `/g/[slug]` |
| **2: Creator publishing** | `/studio` upload flow, `api_tokens`, `/api/mcp` with `publish_game` / `get_publish_status` | Claude Code publishes a game end to end |
| **3: Feed and signals** | `record_play`, likes, follows, `game_stats` + `pg_cron`, ranked feed, creator pages | The feed ranks by real engagement |
| **4: Social and remix** | Comments, remix lineage ("remix this" clones the bundle into a new draft), sharing and OG images per game | Remix chain visible on the game page |
| **5: Trust and scale** | Reports and admin, auto-hide, headless smoke tests and thumbnails, `plays` partitioning, CDN tuning | Moderation SLA; p95 feed < 300 ms |

## 9. Decisions to confirm

1. Game origin domain and host: a Cloudflare Worker with R2 mirroring, or a Vercel proxy in front of Supabase Storage.
2. Whether v1 games may use the network (`connect-src`). The recommendation is no, and to add an allowlist later.
3. Whether anonymous players can like and comment (Supabase anonymous auth), or those actions require an account.
4. Separate Supabase projects for staging and prod (recommended) with branching on PRs.
