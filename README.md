# Habiv — a home for tiny games.

A browser-first marketplace for tiny (10–45 second) AI-made games. Discover, play, remix, and share. Creators upload finished games or publish directly from Codex, Claude Code, and other MCP-ready agents.

## Stack

- Next.js (App Router) + TypeScript + Tailwind, from the official `with-supabase` starter
- Supabase (Auth, Postgres, Storage, Edge Functions) via `@supabase/ssr`

## Run

```bash
cp .env.example .env.local   # fill in NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
npm install
npm run dev                  # http://localhost:3000
```

- `npm run build` — production build
- `npm run lint` — ESLint

## Routes

The UI is a port of the **Habiv Bento** Claude Design project: floating panels on a responsive bento grid (2 / 6 / 8 / 12 columns by width), with a light and dark theme toggled from the header and remembered per browser. Every screen runs on mock data from [lib/habiv/games.ts](lib/habiv/games.ts) — no backend is wired up yet.

| Route | Screen |
|---|---|
| `/` | Home feed — featured hero, categories, daily challenge, category rail, sections, infinite feed |
| `/explore`, `/trending` | Browse and sort the catalog |
| `/g/[id]` | Watch page — player, metadata, prompt and version history, leaderboard, queue rail, comments |
| `/saved` | Saved list (empty state until you save a game) |
| `/my-games` | Creator dashboard — published / drafts / hidden |
| `/profile` | Public creator profile |
| `/publish` | Five-step publish flow: source → automatic checks → details → store art → review with public / unlisted / draft visibility |
| `/settings` | Account, API & MCP tokens, playback toggles, safety |
| `/onboarding` | Player profile setup — handle, generated avatar, done (`?step=avatar` jumps to the avatar picker) |
| `/coming-soon` | The previous one-screen launch page |
| `/auth/*`, `/protected` | Supabase starter auth flow |

Shared shell (header, sidebar, search overlay, modals, toast, mobile bottom nav) lives in [components/habiv/](components/habiv/). The bento packer is [lib/habiv/bento.ts](lib/habiv/bento.ts), theme tokens are the `.theme-dark` / `.theme-light` blocks in [app/globals.css](app/globals.css), and player avatars are generated from a seed by [lib/habiv/avatar.ts](lib/habiv/avatar.ts). Browsing and playing are public; `/publish`, `/my-games` and `/settings` require a session once Supabase keys are set (see [lib/supabase/proxy.ts](lib/supabase/proxy.ts)).

Game art is bundled locally in `public/assets/games/`: each catalog entry has a generated landscape cover and portrait card variant, with a mix of 3D, 2D, paper-cut, and pixel-art treatments. Light alternate covers live in `public/assets/games/variants/light/`; six landscape games use those alternates in the current UI.

## Backend

See [docs/platform-plan.md](docs/platform-plan.md) for the full platform plan: identity and @handles, R2 storage and uploads, the ingest/conversion pipeline, the game origin, analytics, MCP and rollout. The older [docs/backend-plan.md](docs/backend-plan.md) is superseded.

### Backend layout (implemented)

- `supabase/migrations/` — schema, RLS, RPCs, cron jobs (apply with `npm run db:push`).
- `lib/db/*` typed reads, `lib/actions/*` server actions, `app/api/*` routes (upload, ingest, runs, mcp, avatar, health).
- `lib/bridge/` game-side SDK + shims, `lib/player/bridge-host.ts` parent side, `lib/analytics/collector.ts`.
- `workers/game-origin/` Cloudflare Worker serving bundles from R2; `jobs/` Trigger.dev ingest/conversion tasks.
- `docs/ui-handoff.md` — how the UI wires into all of the above.

## Assets

Static files live in `public/assets/` — `tiny-game-hero.png` (social image), the brand marks in `public/assets/brand/`, 24 primary generated game covers in `public/assets/games/`, and 14 alternate covers in `public/assets/games/variants/`.
