# UI ↔ backend wiring (status: wired)

All Habiv views are wired to the backend as of 11 Sep 2026; nothing renders static data. This file records the
contracts so future changes stay consistent. Server pages under `app/(app)/*` load data with
`lib/habiv/page-data.ts` inside `<Suspense>` and pass typed props to the client views in `components/habiv/*`.
The view model components render is `Game` / `GameFull` in `lib/habiv/games.ts`, built from `FeedGame` / `GameDetail`.

| Page | Loader | View props |
|---|---|---|
| `/` | `loadHome()` | `HomeView({ data: HomeData })` |
| `/explore?sort=&category=&model=&tool=` | `loadExplore(sort, category, model, tool)` | `ExploreView({ data, initialSort, initialCategory, initialModel, initialTool })` |
| `/saved` | `loadSaved(supabase)` + `getDaily()` | `SavedView({ games, daily })` |
| `/@handle` | `resolveHandle` + `loadProfile(profile)` | `ProfileView({ data: ProfileData })` |
| `/@handle/slug` | `loadWatch(handle, slug)` | `WatchView({ data: WatchData })` (iframe + bridge host) |
| `/g/shortId` | route handler | 308 → `/@handle/slug` |
| `/my-games` | `loadMyGames(supabase, own)` | `MyGamesView({ data: MyGamesData })` |
| `/my-games/[gameId]/edit` | `loadGameEdit(supabase, own, gameId)` + categories | `GameEditView({ data: GameEditData, categories })` |
| `/publish?game=` | categories + `loadGameEdit` (prefills a new version) | `PublishView({ categories, existingGame, handle })` |
| `/settings?tab=` | `loadSettings(supabase, own)` | `SettingsView({ initialTab, data })` |
| `/onboarding?next=&suggest=&step=` | own profile | `OnboardingView({ initialStep, next, suggested })` |
| `/profile` | redirect | → `/@handle` |
| `/docs`, `/docs/prompts`, `/docs/details`, `/docs/sdk`, `/docs/mcp` | static | `DocsPage` (`components/habiv/docs-page.tsx`); tab list in `lib/docs.ts`. Update the SDK page when `lib/bridge/*` changes and the MCP page when `lib/mcp/tools/*` changes. The copy-paste prompts live in `lib/ai-prompts.ts` (also served as Markdown at `/docs/prompts.md`); keep their rules and tool names in step with both. `/docs/details` documents habiv.json from `lib/habiv/details-file.ts` (also the JSON Schema at `/habiv.schema.json`); keep its fields in step with the ingest reader `jobs/src/lib/game-meta.ts` |
| `/admin/*` | `lib/db/admin.ts` | admin pages in `app/admin/*` (admin-only, see `admin_emails`) |

Auth: there are no login/sign-up pages. `components/habiv/auth-modal.tsx` is the single auth surface (sign in, create
account, reset password, new password, Google/GitHub). Open it with `useShell().openAuth(mode, next)` or by linking to
`/?auth=signin|signup|reset|newpassword&next=/path`. The proxy sends guests on creator routes to `/?auth=signin&next=…`;
`/auth/login`, `/auth/sign-up`, `/auth/forgot-password`, `/auth/update-password` and `/auth/error` are redirect
handlers kept for old links and email templates. Only `/auth/callback`, `/auth/confirm` and `/auth/post-login` do work.

Session: `app/(app)/layout.tsx` renders `<SessionBridge/>` (server) inside Suspense, which hands
`{ profile, savedIds, unread, pinned, builtThisWeek }` to `ShellProvider` via `SessionClient`. Client code reads
`useShell()`: `profile` (guest when signed out), `signedIn`, `requireAuth()`, `toggleSaved` (real), `pinned`, `unread`.

Note on uploads: `@uppy/aws-s3` v6 no longer exposes per-part signing hooks, so `publish-view.tsx` drives the
multipart flow itself against `/api/upload/{create,sign-part,complete,abort}` (4 parts in flight). Storage is
Supabase Storage over its S3 API (`lib/storage.ts`); its CORS already exposes the `ETag` header.

Game details: the publish wizard's Details step and the edit page share `GameExtraFields` (long description,
how-to-play controls, touch hint, tags, run length); form state and limits live in `lib/habiv/game-details.ts`, the
server schema for `controls` in `lib/contracts/game-details.ts`. MCP `publish_game` / `update_game` take the same
`controls` and `duration_sec`. Tags have one-click suggestions (`SUGGESTED_TAGS` in `game-extra-fields.tsx`).

Categories: a game has up to three (`CategoryChips`, rules in `lib/habiv/categories.ts`). `games.categories` holds all
of them, main first; `games.category` stays the main one (cards, game page). The `games_sync_categories` trigger keeps
the two in step whichever is written, so older writers that only set `category` keep working. The feed filter and
`category_counts` match any listed category. `updateGameMeta({ categories })`, MCP `categories`.

SDK detection: ingest scans the build's html/js for Habiv SDK calls (and Poki / CrazyGames / Newgrounds calls the shims
forward) with `jobs/src/lib/sdk.ts` and stores `manifest.sdk = { features, via }`; the smoke run adds bridge events it
sees (`seen`). Features: scores, runs, levels, beat, saves, happytime (`lib/habiv/sdk.ts`). The upload status
response, `GameEditData.sdk` and MCP `get_publish_status` (`sdk_features`, `sdk_hint`) expose it. `SdkFeatureTags`
and `LeaderboardSettings` (`components/habiv/sdk-features.tsx`) show it on the publish and edit pages: the leaderboard
switches on by default when scores are found, and is replaced by an explanation (with "Turn on anyway") when the build
was scanned and sends none.

Store art: the Art step and the edit page share `GameArtFields` (cover 16:9 at 1280×720, card 3:4 at 600×800). The
client centre-crops on a canvas and posts `file` + `kind` to `POST /api/games/[gameId]/art`, which saves at once via
`saveGameArt` (`lib/art.ts`, 3 MB input cap, PNG/JPEG/WebP), which re-encodes with sharp to a WebP at the slot size
(quality 80) before storing. MCP `set_game_art` takes the same image as base64. The smoke
job only fills empty slots, so uploaded art is kept across new versions.

---

# Original contract reference (kept for the API shapes)


The backend session owns `lib/db/*`, `lib/actions/*`, `lib/player/*`, `lib/analytics/*`, `lib/bridge/*`, `app/api/*`,
`app/auth/*`, `app/onboarding/*`, `app/(app)/[handle]/*`, `supabase/`, `workers/`, `jobs/`.
The UI session owns `components/habiv/*` and the `(app)` view pages. This file is the contract between the two.

Rules that keep `cacheComponents: true` happy:

- Public reads (`getFeed`, `getGameByHandleSlug`, `getProfileByHandle`, `getTrending`, `getLeaderboard`, …) are `"use cache"` and take no cookies. Call them from any server component.
- Anything user-scoped (`getOwnProfile`, `getOwnGames`, `getViewerState`, `getSavedGames`, `listComments`, `listNotifications`, `getStatsForGame`) takes the cookie client from `lib/supabase/server.ts` and must render inside `<Suspense>`.
- Never add a session read to `app/(app)/layout.tsx` outside a `<Suspense>` boundary.
- Server actions return discriminated unions (`{ ok: true, … } | { ok: false, code, error }`) and never throw for expected failures.

## 1. Auth and identity (Phase 0)

| UI piece | Wire to |
|---|---|
| Sign-in modal "Continue with GitHub / Google" | `signInWithProvider("github" \| "google", nextPath)` from `lib/auth/oauth.ts` (client). |
| Password sign-in success | `router.push("/auth/post-login?next=" + encodeURIComponent(path))`. |
| After any sign-in | call `linkPlayer()` from `lib/analytics/link-player.ts` once (attaches anonymous plays). |
| Handle onboarding | `/onboarding` (bento `OnboardingView`). Proxy redirects creators there until `handle_set`. |
| Settings → handle | `checkHandle(input)` (debounce 300 ms) and `setHandle(input)` from `lib/actions/handles.ts`. `lib/handles.ts` has `normalizeHandle`, `validateHandle`, `HANDLE_MAX`. `takenHandles` mock is gone. |
| Settings → profile | `updateProfile({ displayName, bio, pronouns, links })` from `lib/actions/profile.ts`; avatar: `POST /api/avatar` multipart `file` (resize to 256 px client-side first), `DELETE /api/avatar` to clear. |
| Header profile / avatar | `getOwnProfile(await createClient())` → `OwnProfile` (`lib/db/profiles.ts`), inside Suspense. |
| `/@handle` page | `app/(app)/[handle]/page.tsx` already resolves the handle (with rename redirects) and renders a placeholder body. Replace the JSX inside `ProfileContent` with `ProfileView` fed `PublicProfile` + `FeedGame[]` (`getCreatorGames(profile.id)`). Followers: `getFollowers(userId)`. |
| `app/layout.tsx` metadataBase | `siteUrl` from `lib/site.ts`. |

## 2. Feed, game page, player (Phases 1–2)

Data shapes live in `lib/db/types.ts`. Mapping from the old mock `Game`:

| Old mock field | New |
|---|---|
| `hue` | `accentHue` |
| `art(g)` / `poster(g)` | `coverUrl ?? null` / `cardUrl ?? null` (fall back to a gradient from `accentHue`) |
| `creator` (string) | `creator.handle`, `creator.displayName`, `creator.avatarUrl` |
| `plays`, `remixes` | `stats.plays`, `stats.remixes`, plus `stats.likes/saves/completions/runs/uniquePlayers` |
| `model`, `tool`, `engine`, `size` | `currentVersion.model`, `currentVersion.agent`, `currentVersion.engine`, `currentVersion.sizeBytes` |
| `versions` | `versions.length` on `GameDetail` |
| `desc`, `prompt` | `description` (GameDetail), `versions[0].prompt` |
| `/g/{id}` links | `game.url` (`/@handle/slug`), `game.shortUrl` (`/g/shortId`) |

Reads (`lib/db/games.ts`, `lib/db/feed.ts`):

- Home/explore: `getFeed({ sort: "new" | "trending" | "hot", category, model, agent, limit, offset })` → `{ items: FeedGame[], nextOffset }`; helpers `getTrending`, `getHot`, `getNewest`; `getRunsToday()`; `getDaily()` → `{ game, resetsAt, runsToday }`. `model` is a catalog name or `lab:<id>` (every model from one lab); explore reads them from `?model=` and `?tool=`. `getBuiltWithCounts()` → games per model and per tool for the filter chips.

AI model and tool catalog (`lib/ai/catalog.ts`): the one list behind the publish/edit pickers (`CatalogField`), the explore filters (`CatalogFilterChip`, both in `components/habiv/catalog-picker.tsx`), the search overlay shortcuts and tile labels (`shortModel`). Models are a snapshot of models.dev in `lib/ai/models.json`, refreshed with `node scripts/sync-ai-models.mjs`; tools and agents are hand-kept in `lib/ai/agents.ts`. Every write path (`setVersionMeta`, upload create, MCP `publish_game` / `update_version`) runs `normalizeModel` / `normalizeAgent`, so known spellings ("claude-sonnet-4-5", "sonnet 4.5", "codex cli") are stored under the catalog name and anything unknown is kept as typed.
- Game page: `app/(app)/[handle]/[slug]/page.tsx` loads `GameDetail`; replace the placeholder body with `WatchView` taking `GameDetail`. Public stats tiles: `getPublicStats(gameId)`. Leaderboard: `getLeaderboard(gameId, "main", "daily" | "weekly" | "alltime")` and `getViewerRank(gameId, playerId, userId)`.
- My games: `getOwnGames(await createClient())` → `CreatorGame[]` (all statuses); `getCreatorTotals(supabase, uid)`; per-game stats `getStatsForGame(supabase, gameId)`.
- Saved: `getSavedGames(await createClient())`.
- Viewer flags for like/save/follow buttons: `getViewerState(supabase, gameIds, creatorIds)` → `{ liked, saved, following }` sets.

`/g/[id]` route: delete `app/(app)/g/[id]/page.tsx` (mock `generateStaticParams`) and add this handler so short links redirect:

```ts
// app/(app)/g/[id]/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { getGameByShortId } from "@/lib/db/games";
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await getGameByShortId(id);
  if (!g) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(new URL(`/@${g.handle}/${g.slug}`, request.url), 308);
}
```

Player iframe (mount only after click-to-play):

```tsx
import { gameFrameSrc } from "@/lib/bridge/parent";
import { mountBridgeHost } from "@/lib/player/bridge-host";
import { getCollector, getPlayerId } from "@/lib/analytics/collector";

<iframe
  ref={ref}
  src={gameFrameSrc({ versionId, playerId: getPlayerId() })}
  sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-forms allow-modals allow-orientation-lock"
  allow="autoplay; fullscreen *; gamepad; xr-spatial-tracking; cross-origin-isolated; accelerometer; gyroscope"
  allowFullScreen
  referrerPolicy="origin"
  {...{ credentialless: "true" }}
/>

useEffect(() => {
  const host = mountBridgeHost({
    iframe: ref.current!, gameId, versionId, playerId: getPlayerId(), handle, muted, overlay: overlayRef.current,
    onEvent: (e) => { /* ready, run_start, run_end{beatPct}, score_result{boards}, happytime, level, beat_game, error */ },
  });
  return () => host.destroy();
}, [versionId]);
```

`host.pause()`, `host.resume()`, `host.mute(on)` drive the game. Page-level events go through `getCollector().track({ name: "view" | "play_click" | "share" | "like" | "save", game_id })`.
`overlay` is a transparent element over the iframe; its first pointer/key event starts an auto run for games that never call the SDK.

Social actions (`lib/actions/social.ts`): `toggleLike(gameId)`, `toggleSave(gameId)`, `toggleFollow(creatorId)` → `{ ok, active, count }`; use `useOptimistic`.

## 3. Publish wizard (Phase 1)

Order of calls (all from the client; `getRequestUser` accepts the cookie session):

1. On drop: hash with `hash-wasm` (`createSHA256()`) in a Web Worker → hex.
2. `POST /api/upload/create` `{ filename, size, sha256, title?, gameId? }` → `session` (`CreateUploadResponse` in `lib/contracts/upload.ts`). `mode` is `single`, `multipart` or `dedupe`.
3. `dedupe` → skip to 5. `single` → `PUT session.putUrl` with the file bytes (`content-type: application/zip` or `text/html`) then `POST /api/upload/complete { key }`. `multipart` → Uppy:

```ts
import Uppy from "@uppy/core";
import AwsS3 from "@uppy/aws-s3";
const uppy = new Uppy({ restrictions: { maxFileSize: MAX_UPLOAD_BYTES, maxNumberOfFiles: 1, allowedFileTypes: [".zip", ".html", ".htm"] } })
  .use(AwsS3, {
    shouldUseMultipart: () => true,
    getChunkSize: () => session.partSize,
    limit: 4,
    createMultipartUpload: async () => ({ uploadId: session.uploadId!, key: session.key }),
    signPart: async (_f, { uploadId, key, partNumber }) => postJson("/api/upload/sign-part", { uploadId, key, partNumber }),
    completeMultipartUpload: async (_f, { uploadId, key, parts }) => postJson("/api/upload/complete", { uploadId, key, parts }),
    abortMultipartUpload: async (_f, { uploadId, key }) => postJson("/api/upload/abort", { uploadId, key }),
    listParts: async () => [],
  });
```

   Resume (tab closed, network dropped): the wizard mirrors its state, session and finished part ETags to localStorage (`habiv:publish-draft:<gameId|new>`) and offers to continue on the next visit. The creator picks the same file again (matched by name, size and lastModified); `POST /api/upload/resume { key }` → `{ state: "open" | "completed" | "closed" | "expired", arrived?, putUrl? }` re-checks the session, gives single-PUT uploads a fresh URL (or `arrived: true` to go straight to complete), and only multipart parts without an ETag are sent again.
   My games shows unfinished and failed builds in the "In progress" and "Failed" tabs (`CreatorGame.latestVersion` carries `updatedAt`, `rejectMessage`, `uploadExpiresAt`; progress from this browser comes from `lib/habiv/publish-draft-progress.ts`). Controls are server actions in `lib/actions/uploads.ts`: `stopUpload`, `retryProcessing` (stuck > 10 min or `internal_error`), `deleteUnpublishedGame` (never-public games, with storage cleanup) and `deleteFailedVersion`. Ingest only marks a version ready while it is still `processing`, so Stop wins over a run that is mid-way.
   SDK prompt: when the scan finds missing SDK features, `SdkUpgradePrompt` (`components/habiv/sdk-features.tsx`) on the Checks and Details steps and the edit page builds a copyable prompt for the creator's AI (`buildSdkPrompt`); the new file uploads as the same game's next version.
4. Poll `GET /api/upload/status?versionId=` every 2 s (`VersionStatusResponse`) until `ready` or `rejected`; show `engine`, `warnings`, `sizeBytes`, `rejectReason`.
5. Details: `updateGameMeta(gameId, { title, tagline, description, category, orientation, remixLicence, durationSec, controls, tags })` and `setVersionMeta(versionId, { model, agent, prompt, changelog })`; leaderboard toggle: `updateLeaderboardConfig(gameId, { enabled, sort, maxPerSecond, minDurationMs })`.
6. Preview: iframe with `gameFrameSrc({ versionId, mode: "preview" })` (no runs, no analytics).
7. `publishVersion({ gameId, versionId })` → `{ ok, url, shortUrl }`; `unpublishGame(gameId)` for the Hidden tab.

Caps: 50 MB per upload (Supabase Storage free plan), 250 MB per creator, 1,000 files, 300 MB extracted (constants in `lib/contracts/upload.ts`).

## 4. Comments, notifications, moderation (Phase 3)

- `listComments(supabase, gameId, { sort: "top" | "newest", limit, offset })` → `{ items: CommentItem[], nextOffset }`; `listReplies(supabase, commentId)`.
- Actions: `postComment(gameId, body, parentId?)`, `editComment(id, body)`, `deleteComment(id)`, `pinComment(id, pinned)`, `toggleCommentLike(id)`, `searchHandles(prefix)` (mention autocomplete).
- Notifications: `listNotifications(supabase, { limit, before })`, `unreadCount(supabase)`; actions `markRead(ids)`, `markAllRead()`. Realtime for the bell (signed-in, visible tabs only; unsubscribe 60 s after hide; poll `unreadCount` as fallback):

```ts
supabase.channel(`notifications:${userId}`)
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (p) => onNew(p.new))
  .subscribe();
```

- Report / block: `report({ gameId | commentId | userId, reason, details })`, `toggleBlock(userId)` from `lib/actions/moderation.ts`. Reasons: spam, abuse, sexual, violence, malware, copyright, broken, other.
- Share: OG image is automatic at `/@handle/slug/opengraph-image`.

## 5. Tokens and MCP (Phase 5)

Settings → Connect AI (`?tab=api`): the main path is a copyable plain-language message (`connectPrompt` in `settings-view.tsx`) the user pastes into Claude Code or Codex. The agent adds the server and starts the OAuth browser approval, so no token is needed. Below that: the server URL for the Claude app's custom connectors, then manual commands in a collapsed section. The list underneath shows OAuth connections and personal tokens together: `listTokens(supabase)`; actions `createToken(name)` (returns the full token once, only needed for scripts and CI) and `revokeToken(id)`. Client config with no headers, since OAuth handles sign-in:

```json
{ "mcpServers": { "habiv": { "type": "http", "url": "https://habiv.com/api/mcp" } } }
```

Tools exposed: `publish_game`, `create_upload`, `get_publish_status`, `get_game`, `list_my_games`, `list_versions`, `publish_version` (switch live version / roll back), `update_version` (changelog, prompt, model, agent), `get_game_files` (read a version's source), `update_game`, `set_game_art` (cover or card image, base64), `unpublish_game`. Edits made through MCP expire the same cache tags as the server actions.

## 6. Local setup for the UI session

`.env.local` needs at least `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_GAME_ORIGIN`, `RUN_TOKEN_SECRET`; R2 and Trigger vars only for the upload flow (see `.env.example`).
Type-check without the Worker/jobs packages: `npm run typecheck`.
