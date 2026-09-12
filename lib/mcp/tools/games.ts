import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAnonClient } from "@/lib/supabase/anon";
import { asFeedRow, toFeedGame } from "@/lib/db/games";
import type { Json, TablesUpdate } from "@/lib/supabase/database.types";
import { controlsSchema, toStoredControls } from "@/lib/contracts/game-details";
import { normalizeAgent, normalizeModel } from "@/lib/ai/catalog";
import type { IngestManifest, ManifestFile } from "@/lib/contracts/ingest";
import { buckets, getObjectBytes } from "@/lib/storage";
import type { TokenAuth } from "@/lib/mcp/auth";
import { ART_MAX_BYTES, saveGameArt } from "@/lib/art";
import { cdnUrl } from "@/lib/site";
import { deleteVersionForCreator } from "@/lib/versions/cleanup";
import { gameUrls, guarded, handleOf, ok, ownedGame, previewUrl, refreshGame, ToolError, versionBaseUrl } from "@/lib/mcp/tools/shared";

const category = z.enum(["arcade", "puzzle", "reaction", "ambient", "rhythm", "racing", "cozy", "horror", "experimental", "other"]);

const MAX_FILE_BYTES = 512 * 1024;
const MAX_READ_BYTES = 2 * 1024 * 1024;

type OwnedGame = Awaited<ReturnType<typeof ownedGame>>;

/** Source files an agent can edit; pre-compressed engine builds (.br/.gz) and media come back as URLs only. */
const isReadable = (f: ManifestFile) => !f.e && /^text\/|javascript|json|xml/.test(f.t);

/** Everything the creator can edit on a game, so an agent can read it back before changing it. */
async function ownerView(auth: TokenAuth, g: OwnedGame) {
  const admin = createAdminClient();
  const [{ data: tagRows }, { data: latest }] = await Promise.all([
    admin.from("game_tags").select("tags(name)").eq("game_id", g.id),
    admin.from("game_versions").select("id, version, status, changelog, created_at").eq("game_id", g.id).order("version", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const tags = (tagRows ?? []).map((r) => (r as unknown as { tags: { name: string } | null }).tags?.name).filter((t): t is string => !!t);
  return {
    id: g.id,
    short_id: g.short_id,
    slug: g.slug,
    title: g.title,
    tagline: g.tagline,
    description: g.description,
    category: g.category,
    tags,
    orientation: g.orientation,
    controls: g.controls,
    duration_sec: g.duration_sec,
    remix_licence: g.remix_licence,
    leaderboard_enabled: g.leaderboard_enabled,
    cover_url: cdnUrl(g.cover_path),
    card_url: cdnUrl(g.card_path),
    status: g.status,
    live_version_id: g.status === "published" ? g.current_version_id : null,
    latest_version: latest ? { version_id: latest.id, version: latest.version, status: latest.status, changelog: latest.changelog, created_at: latest.created_at } : null,
    ...gameUrls(await handleOf(auth.userId), g.slug, g.short_id),
  };
}

/** The version files are read from: the one asked for, else the live one, else the newest ready one. */
async function resolveVersion(auth: TokenAuth, args: { game_id?: string; version_id?: string }) {
  const admin = createAdminClient();
  let versionId = args.version_id ?? null;
  if (!versionId) {
    const g = await ownedGame(auth, args.game_id!);
    versionId = g.current_version_id;
    if (!versionId) {
      const { data } = await admin.from("game_versions").select("id").eq("game_id", g.id).eq("status", "ready").order("version", { ascending: false }).limit(1).maybeSingle();
      versionId = data?.id ?? null;
    }
    if (!versionId) throw new ToolError("This game has no processed version yet. Check get_publish_status.", "not_ready");
  }
  const { data: v } = await admin.from("game_versions").select("id, game_id, version, status, manifest").eq("id", versionId).maybeSingle();
  if (!v) throw new ToolError("Version not found.", "not_found");
  await ownedGame(auth, v.game_id);
  if (v.status !== "ready") throw new ToolError(`Version ${v.version} is ${v.status}; files are only available once it is ready.`, "not_ready");
  return { ...v, manifest: (v.manifest ?? null) as IngestManifest | null };
}

export function registerGameTools(server: McpServer, auth: TokenAuth) {
  server.registerTool(
    "get_game",
    {
      title: "Get a game",
      description:
        "Details for a game by id, short id, or handle + slug. For your own games (drafts included) this returns every editable field " +
        "(tagline, description, tags, controls, run length, licence) plus the live and latest version; for others, the public page data and stats.",
      inputSchema: z
        .object({ game_id: z.string().uuid().optional(), short_id: z.string().optional(), handle: z.string().optional(), slug: z.string().optional() })
        .refine((v) => v.game_id || v.short_id || (v.handle && v.slug), { message: "Pass game_id, short_id, or handle + slug." }),
    },
    (args) =>
      guarded(async () => {
        const admin = createAdminClient();
        const handle = args.handle?.replace(/^@/, "").toLowerCase();
        let own = admin.from("games").select("*").eq("creator_id", auth.userId);
        if (args.game_id) own = own.eq("id", args.game_id);
        else if (args.short_id) own = own.eq("short_id", args.short_id);
        else own = handle === (await handleOf(auth.userId)) ? own.eq("slug", args.slug!) : own.eq("id", "00000000-0000-0000-0000-000000000000");
        const { data: mine } = await own.maybeSingle();

        const anon = createAnonClient();
        let q = anon.from("game_feed_v").select("*");
        if (mine) q = q.eq("id", mine.id);
        else if (args.game_id) q = q.eq("id", args.game_id);
        else if (args.short_id) q = q.eq("short_id", args.short_id);
        else q = q.eq("creator_handle", handle!).eq("slug", args.slug!);
        const { data } = await q.maybeSingle();
        const pub = data?.id ? { ...toFeedGame(asFeedRow(data)), description: data.description } : null;

        if (mine) return ok({ ...(await ownerView(auth, mine)), public: pub });
        if (pub) return ok(pub);
        throw new ToolError("Game not found.", "not_found");
      }),
  );

  server.registerTool(
    "list_my_games",
    {
      title: "List your games",
      description: "Your games in every status with their latest version state.",
      inputSchema: z.object({
        status: z.enum(["draft", "processing", "published", "hidden", "removed"]).optional(),
        limit: z.number().int().min(1).max(50).default(20),
        cursor: z.string().optional().describe("Opaque cursor from a previous call"),
      }),
    },
    (args) =>
      guarded(async () => {
        const admin = createAdminClient();
        const offset = Number(args.cursor ?? 0) || 0;
        let q = admin.from("games").select("id, short_id, slug, title, status, category, orientation, current_version_id, published_at, updated_at").eq("creator_id", auth.userId).order("updated_at", { ascending: false }).range(offset, offset + args.limit);
        if (args.status) q = q.eq("status", args.status);
        const { data: games } = await q;
        const rows = (games ?? []).slice(0, args.limit);
        const ids = rows.map((g) => g.id);
        const { data: versions } = ids.length ? await admin.from("game_versions").select("id, game_id, version, status, engine, reject_reason").in("game_id", ids).order("version", { ascending: false }) : { data: [] as { id: string; game_id: string; version: number; status: string; engine: string | null; reject_reason: string | null }[] };
        const latest = new Map<string, NonNullable<typeof versions>[number]>();
        for (const v of versions ?? []) if (!latest.has(v.game_id)) latest.set(v.game_id, v);
        const handle = await handleOf(auth.userId);
        return ok({
          games: rows.map((g) => ({ ...g, ...gameUrls(handle, g.slug, g.short_id), latest_version: latest.get(g.id) ?? null })),
          next_cursor: (games ?? []).length > args.limit ? String(offset + args.limit) : null,
        });
      }),
  );

  server.registerTool(
    "list_versions",
    {
      title: "List a game's versions",
      description:
        "Every version of one of your games, newest first: number, processing status, changelog, model/agent, which one is live, and a preview link " +
        "for ready versions. Use publish_version to switch the live version or roll back.",
      inputSchema: z.object({ game_id: z.string().uuid(), limit: z.number().int().min(1).max(50).default(20) }),
    },
    (args) =>
      guarded(async () => {
        const g = await ownedGame(auth, args.game_id);
        const { data: versions } = await createAdminClient()
          .from("game_versions")
          .select("id, version, status, engine, changelog, model, agent, source, size_bytes, file_count, reject_reason, created_at")
          .eq("game_id", g.id)
          .order("version", { ascending: false })
          .limit(args.limit);
        const live = g.status === "published" ? g.current_version_id : null;
        const pageUrl = gameUrls(await handleOf(auth.userId), g.slug, g.short_id).url;
        return ok({
          game_id: g.id,
          game_status: g.status,
          live_version_id: live,
          versions: (versions ?? []).map(({ id, ...v }) => ({
            version_id: id,
            ...v,
            is_live: id === live,
            preview_url: v.status === "ready" ? previewUrl(id) : null,
            // Players open older ready versions on the game page with ?v=N.
            play_url: v.status === "ready" && live ? (id === live ? pageUrl : `${pageUrl}?v=${v.version}`) : null,
          })),
        });
      }),
  );

  server.registerTool(
    "publish_version",
    {
      title: "Make a version live",
      description: "Publishes a specific ready version of your game, replacing the live one. Use it to roll back to an older version or to release one uploaded with publish_when_ready false.",
      inputSchema: z.object({ game_id: z.string().uuid(), version_id: z.string().uuid() }),
    },
    (args) =>
      guarded(async () => {
        const admin = createAdminClient();
        const g = await ownedGame(auth, args.game_id);
        if (g.status === "removed") throw new ToolError("This game was removed.", "removed");
        if (g.status === "hidden" && g.hidden_reason && g.hidden_reason !== "creator") throw new ToolError("This game was hidden by moderation.", "moderation");
        const { data: v } = await admin.from("game_versions").select("id, version, status").eq("id", args.version_id).eq("game_id", g.id).maybeSingle();
        if (!v) throw new ToolError("That version does not belong to this game.", "not_found");
        if (v.status !== "ready") throw new ToolError(`Version ${v.version} is ${v.status}; only ready versions can go live.`, "not_ready");
        const { error } = await admin
          .from("games")
          .update({ status: "published", current_version_id: v.id, published_at: g.published_at ?? new Date().toISOString(), hidden_reason: null })
          .eq("id", g.id);
        if (error) throw new ToolError(error.message, "update_failed");
        await admin.from("profiles").update({ is_creator: true }).eq("id", auth.userId).eq("is_creator", false);
        await refreshGame(auth, g.id);
        return ok({ game_id: g.id, version_id: v.id, version: v.version, status: "published", ...gameUrls(await handleOf(auth.userId), g.slug, g.short_id) });
      }),
  );

  server.registerTool(
    "update_version",
    {
      title: "Edit a version's notes",
      description: "Changes the changelog, prompt, model or agent shown for a version. Pass null to clear a field.",
      inputSchema: z.object({
        version_id: z.string().uuid(),
        changelog: z.string().max(500).nullable().optional(),
        prompt: z.string().max(8000).nullable().optional(),
        model: z.string().max(80).nullable().optional(),
        agent: z.string().max(80).nullable().optional(),
      }),
    },
    (args) =>
      guarded(async () => {
        const admin = createAdminClient();
        const { data: v } = await admin.from("game_versions").select("id, game_id, version").eq("id", args.version_id).maybeSingle();
        if (!v) throw new ToolError("Version not found.", "not_found");
        await ownedGame(auth, v.game_id);
        const patch: TablesUpdate<"game_versions"> = {};
        if (args.changelog !== undefined) patch.changelog = args.changelog;
        if (args.prompt !== undefined) patch.prompt = args.prompt;
        if (args.model !== undefined) patch.model = normalizeModel(args.model);
        if (args.agent !== undefined) patch.agent = normalizeAgent(args.agent);
        if (!Object.keys(patch).length) throw new ToolError("Pass at least one of changelog, prompt, model or agent.", "invalid");
        const { error } = await admin.from("game_versions").update(patch).eq("id", v.id);
        if (error) throw new ToolError(error.message, "update_failed");
        await refreshGame(auth, v.game_id);
        return ok({ version_id: v.id, version: v.version, game_id: v.game_id, updated: Object.keys(patch) });
      }),
  );

  server.registerTool(
    "delete_version",
    {
      title: "Delete a version",
      description:
        "Deletes one version of your game and its files for good: a failed upload, or an old build players should no longer open. " +
        "The live version can't be deleted; make another one live first with publish_version.",
      inputSchema: z.object({ version_id: z.string().uuid() }),
    },
    (args) =>
      guarded(async () => {
        const res = await deleteVersionForCreator(auth.userId, args.version_id);
        if (!res.ok) throw new ToolError(res.error, res.code);
        await refreshGame(auth, res.gameId);
        return ok({ deleted: true, version_id: args.version_id, version: res.version, game_id: res.gameId });
      }),
  );

  server.registerTool(
    "get_game_files",
    {
      title: "Read a game's files",
      description:
        "Fetches the code of one of your games so you can keep working on it. Without `paths` it lists every file in the version (live one by default); " +
        "with `paths` it returns the text of those files (up to 512 KB each, 2 MB per call). Images, audio and engine builds come back as URLs. " +
        "To ship your edits, call publish_game with the same game_id.",
      inputSchema: z
        .object({
          game_id: z.string().uuid().optional(),
          version_id: z.string().uuid().optional().describe("A specific version; defaults to the live one"),
          paths: z.array(z.string().max(240)).min(1).max(20).optional().describe("Files to read, as listed. Omit to list files"),
        })
        .refine((v) => v.game_id || v.version_id, { message: "Pass game_id or version_id." }),
    },
    (args) =>
      guarded(async () => {
        const v = await resolveVersion(auth, args);
        const files = v.manifest?.files ?? [];
        const base = versionBaseUrl(v.id);
        const urlOf = (p: string) => (base ? base + p.split("/").map(encodeURIComponent).join("/") : null);

        if (!args.paths) {
          return ok({
            game_id: v.game_id,
            version_id: v.id,
            version: v.version,
            entry: v.manifest?.entry ?? "index.html",
            file_count: files.length,
            files: files.map((f) => ({ path: f.p, bytes: f.b, type: f.t, readable: isReadable(f) })),
            hint: "Call again with paths to read readable files.",
          });
        }

        const byPath = new Map(files.map((f) => [f.p, f]));
        let budget = MAX_READ_BYTES;
        const out = [];
        for (const raw of args.paths) {
          const path = raw.replace(/^\.?\//, "");
          const f = byPath.get(path);
          if (!f) out.push({ path, error: "not_found" });
          else if (!isReadable(f)) out.push({ path, error: "binary", url: urlOf(f.p) });
          else if (f.b > MAX_FILE_BYTES) out.push({ path, error: "too_large", bytes: f.b, url: urlOf(f.p) });
          else if (f.b > budget) out.push({ path, error: "call_budget_exceeded", hint: "Ask for this file in another call." });
          else {
            const bytes = await getObjectBytes(buckets().games, `${v.game_id}/${v.id}/${f.p}`);
            if (!bytes) out.push({ path, error: "missing_in_storage" });
            else {
              budget -= bytes.length;
              out.push({ path, type: f.t, content: new TextDecoder().decode(bytes) });
            }
          }
        }
        return ok({ game_id: v.game_id, version_id: v.id, version: v.version, files: out });
      }),
  );

  server.registerTool(
    "update_game",
    {
      title: "Update game metadata or status",
      description:
        "Edit title, tagline, description, category, tags, orientation, remix licence, how-to-play controls, run length, leaderboard, or set status to 'published' / 'draft'. " +
        "When get_publish_status says the page is missing a description or controls, write them from what you know about the game and set them here.",
      inputSchema: z.object({
        game_id: z.string().uuid(),
        title: z.string().min(1).max(80).optional(),
        tagline: z.string().max(140).nullable().optional(),
        description: z.string().max(4000).nullable().optional(),
        category: category.optional(),
        categories: z.array(category).min(1).max(3).optional().describe("Up to 3 categories, main one first. Replaces the current list; wins over category"),
        tags: z.array(z.string().max(24)).max(5).optional(),
        orientation: z.enum(["portrait", "landscape", "any"]).optional(),
        remix_licence: z.enum(["open", "no_remix"]).optional(),
        controls: controlsSchema.optional().describe("How to play: up to 6 { key, action } rows plus an optional touch hint. Replaces the current controls"),
        duration_sec: z.number().int().min(1).max(3600).nullable().optional().describe("Typical run length in seconds (3600 = endless); null clears it"),
        leaderboard: z.object({ enabled: z.boolean(), sort: z.enum(["desc", "asc"]).default("desc"), max_per_second: z.number().positive().nullable().optional(), min_duration_ms: z.number().int().min(0).default(1000) }).optional(),
        status: z.enum(["published", "draft"]).optional(),
      }),
    },
    (args) =>
      guarded(async () => {
        const admin = createAdminClient();
        const g = await ownedGame(auth, args.game_id);
        const patch: TablesUpdate<"games"> = {};
        if (args.title !== undefined) patch.title = args.title;
        if (args.tagline !== undefined) patch.tagline = args.tagline;
        if (args.description !== undefined) patch.description = args.description;
        if (args.category !== undefined) patch.category = args.category;
        if (args.categories !== undefined) patch.categories = args.categories;
        if (args.orientation !== undefined) patch.orientation = args.orientation;
        if (args.remix_licence !== undefined) patch.remix_licence = args.remix_licence;
        if (args.controls !== undefined) patch.controls = toStoredControls(args.controls) as Json;
        if (args.duration_sec !== undefined) patch.duration_sec = args.duration_sec;

        if (args.status === "published") {
          if (g.status === "removed") throw new ToolError("This game was removed.", "removed");
          if (g.status === "hidden" && g.hidden_reason && g.hidden_reason !== "creator") throw new ToolError("This game was hidden by moderation.", "moderation");
          let versionId = g.current_version_id;
          if (!versionId) {
            const { data: v } = await admin.from("game_versions").select("id").eq("game_id", g.id).eq("status", "ready").order("version", { ascending: false }).limit(1).maybeSingle();
            versionId = v?.id ?? null;
          }
          if (!versionId) throw new ToolError("No ready version to publish yet. Check get_publish_status.", "not_ready");
          Object.assign(patch, { status: "published", current_version_id: versionId, published_at: g.published_at ?? new Date().toISOString(), hidden_reason: null });
        } else if (args.status === "draft") {
          Object.assign(patch, { status: "hidden", hidden_reason: "creator" });
        }

        if (Object.keys(patch).length) {
          const { error } = await admin.from("games").update(patch).eq("id", g.id);
          if (error) throw new ToolError(error.message, "update_failed");
        }
        if (args.tags) {
          const names = Array.from(new Set(args.tags.map((t) => t.toLowerCase().trim()).filter((t) => /^[a-z0-9][a-z0-9 -]{0,23}$/.test(t))));
          await admin.from("game_tags").delete().eq("game_id", g.id);
          if (names.length) {
            await admin.from("tags").upsert(names.map((name) => ({ name })), { onConflict: "name", ignoreDuplicates: true });
            const { data: rows } = await admin.from("tags").select("id").in("name", names);
            if (rows?.length) await admin.from("game_tags").insert(rows.map((r) => ({ game_id: g.id, tag_id: r.id })));
          }
        }
        if (args.leaderboard) {
          const lb = args.leaderboard;
          await admin.from("games").update({ leaderboard_enabled: lb.enabled }).eq("id", g.id);
          if (lb.enabled) {
            for (const period of ["daily", "weekly", "alltime"] as const) {
              await admin.from("leaderboards").upsert({ game_id: g.id, key: "main", period, sort: lb.sort, max_per_second: lb.max_per_second ?? null, min_duration_ms: lb.min_duration_ms }, { onConflict: "game_id,key,period" });
            }
          }
        }
        await refreshGame(auth, g.id);
        const updated = await ownedGame(auth, g.id);
        return ok({ id: updated.id, short_id: updated.short_id, slug: updated.slug, title: updated.title, status: updated.status, current_version_id: updated.current_version_id, ...gameUrls(await handleOf(auth.userId), updated.slug, updated.short_id) });
      }),
  );

  server.registerTool(
    "set_game_art",
    {
      title: "Set a game's cover or card image",
      description:
        "Uploads store art from a PNG, JPEG or WebP image (base64, max 3 MB). kind 'cover' is the 16:9 landscape image for feed tiles, the player " +
        "and link previews (1280x720 works best); 'card' is the 3:4 portrait poster (600x800). It is centre-cropped, resized and compressed to WebP. Uploaded art replaces " +
        "the automatic screenshot and is kept when new versions are published.",
      inputSchema: z.object({
        game_id: z.string().uuid(),
        kind: z.enum(["cover", "card"]),
        image_base64: z.string().min(1).max(Math.ceil((ART_MAX_BYTES * 4) / 3) + 200).describe("The image file as base64 (a data: URL prefix is accepted)"),
      }),
    },
    (args) =>
      guarded(async () => {
        const g = await ownedGame(auth, args.game_id);
        const bytes = new Uint8Array(Buffer.from(args.image_base64.replace(/^data:[^,]*,/, "").replace(/\s+/g, ""), "base64"));
        const res = await saveGameArt(auth.userId, g.id, args.kind, bytes);
        if (!res.ok) throw new ToolError(res.error, res.code);
        return ok({ game_id: g.id, kind: args.kind, url: res.url });
      }),
  );

  server.registerTool(
    "unpublish_game",
    {
      title: "Unpublish a game",
      description: "Hides a published game. It stays in your list and can be re-published with update_game or publish_version.",
      inputSchema: z.object({ game_id: z.string().uuid() }),
    },
    (args) =>
      guarded(async () => {
        const g = await ownedGame(auth, args.game_id);
        if (g.status !== "published") return ok({ game_id: g.id, status: g.status, changed: false });
        await createAdminClient().from("games").update({ status: "hidden", hidden_reason: "creator" }).eq("id", g.id);
        await refreshGame(auth, g.id);
        return ok({ game_id: g.id, status: "hidden", changed: true });
      }),
  );
}
