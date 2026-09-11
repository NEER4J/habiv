import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAnonClient } from "@/lib/supabase/anon";
import { asFeedRow, toFeedGame } from "@/lib/db/games";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import type { TokenAuth } from "@/lib/mcp/auth";
import { gameUrls, guarded, handleOf, ok, ownedGame, ToolError } from "@/lib/mcp/tools/shared";

const category = z.enum(["arcade", "puzzle", "reaction", "ambient", "rhythm", "racing", "cozy", "horror", "experimental", "other"]);

export function registerGameTools(server: McpServer, auth: TokenAuth) {
  server.registerTool(
    "get_game",
    {
      title: "Get a game",
      description: "Public details and stats for a game by id, short id, or handle + slug. Your own drafts are included.",
      inputSchema: z
        .object({ game_id: z.string().uuid().optional(), short_id: z.string().optional(), handle: z.string().optional(), slug: z.string().optional() })
        .refine((v) => v.game_id || v.short_id || (v.handle && v.slug), { message: "Pass game_id, short_id, or handle + slug." }),
    },
    (args) =>
      guarded(async () => {
        const anon = createAnonClient();
        let q = anon.from("game_feed_v").select("*");
        if (args.game_id) q = q.eq("id", args.game_id);
        else if (args.short_id) q = q.eq("short_id", args.short_id);
        else q = q.eq("creator_handle", args.handle!.replace(/^@/, "").toLowerCase()).eq("slug", args.slug!);
        const { data } = await q.maybeSingle();
        if (data?.id) return ok({ ...toFeedGame(asFeedRow(data)), description: data.description });
        if (args.game_id) {
          const g = await ownedGame(auth, args.game_id);
          return ok({ id: g.id, short_id: g.short_id, slug: g.slug, title: g.title, status: g.status, category: g.category, orientation: g.orientation, current_version_id: g.current_version_id, ...gameUrls(await handleOf(auth.userId), g.slug, g.short_id) });
        }
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
    "update_game",
    {
      title: "Update game metadata or status",
      description: "Edit title, tagline, description, category, tags, orientation, remix licence, leaderboard, or set status to 'published' / 'draft'.",
      inputSchema: z.object({
        game_id: z.string().uuid(),
        title: z.string().min(1).max(80).optional(),
        tagline: z.string().max(140).nullable().optional(),
        description: z.string().max(4000).nullable().optional(),
        category: category.optional(),
        tags: z.array(z.string().max(24)).max(5).optional(),
        orientation: z.enum(["portrait", "landscape", "any"]).optional(),
        remix_licence: z.enum(["open", "no_remix"]).optional(),
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
        if (args.orientation !== undefined) patch.orientation = args.orientation;
        if (args.remix_licence !== undefined) patch.remix_licence = args.remix_licence;

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
        const updated = await ownedGame(auth, g.id);
        return ok({ id: updated.id, short_id: updated.short_id, slug: updated.slug, title: updated.title, status: updated.status, current_version_id: updated.current_version_id, ...gameUrls(await handleOf(auth.userId), updated.slug, updated.short_id) });
      }),
  );

  server.registerTool(
    "unpublish_game",
    {
      title: "Unpublish a game",
      description: "Hides a published game. It stays in your list and can be re-published with update_game.",
      inputSchema: z.object({ game_id: z.string().uuid() }),
    },
    (args) =>
      guarded(async () => {
        const g = await ownedGame(auth, args.game_id);
        if (g.status !== "published") return ok({ game_id: g.id, status: g.status, changed: false });
        await createAdminClient().from("games").update({ status: "hidden", hidden_reason: "creator" }).eq("id", g.id);
        return ok({ game_id: g.id, status: "hidden", changed: true });
      }),
  );
}
