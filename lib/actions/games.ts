"use server";

import { revalidateTag, updateTag } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { FEED_TAG, gameTag, slugify } from "@/lib/db/games";
import { profileTag } from "@/lib/db/profiles";
import type { Json, TablesUpdate } from "@/lib/supabase/database.types";

const categoryEnum = z.enum(["arcade", "puzzle", "reaction", "ambient", "rhythm", "racing", "cozy", "horror", "experimental", "other"]);
const orientationEnum = z.enum(["portrait", "landscape", "any"]);

type ActionError = { ok: false; code: "auth" | "invalid" | "not_found" | "conflict" | "not_ready" | "moderation" | "unknown"; error: string };

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub ?? null;
  return { supabase, uid };
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(80),
  category: categoryEnum.optional(),
  orientation: orientationEnum.optional(),
  remixedFromGameId: z.string().uuid().optional(),
});

/** Creates a draft game and returns its ids. Slugs are unique per creator; collisions get a numeric suffix. */
export async function createDraftGame(input: z.infer<typeof createSchema>): Promise<{ ok: true; gameId: string; slug: string; shortId: string } | ActionError> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid", error: "Check the title and category." };
  const { supabase, uid } = await requireUser();
  if (!uid) return { ok: false, code: "auth", error: "Sign in first." };

  const base = slugify(parsed.data.title);
  for (let attempt = 0; attempt < 6; attempt++) {
    const slug = attempt === 0 ? base : `${base.slice(0, 60)}-${attempt + 1}`;
    const { data, error } = await supabase
      .from("games")
      .insert({
        creator_id: uid,
        slug,
        short_id: "",
        title: parsed.data.title,
        category: parsed.data.category ?? "arcade",
        orientation: parsed.data.orientation ?? "any",
        remixed_from_game_id: parsed.data.remixedFromGameId ?? null,
      })
      .select("id, slug, short_id")
      .single();
    if (!error && data) return { ok: true, gameId: data.id, slug: data.slug, shortId: data.short_id };
    if (error?.code !== "23505") return { ok: false, code: "unknown", error: error?.message ?? "Could not create the game." };
  }
  return { ok: false, code: "conflict", error: "Pick a different title." };
}

const metaSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  tagline: z.string().trim().max(140).nullable().optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  category: categoryEnum.optional(),
  orientation: orientationEnum.optional(),
  remixLicence: z.enum(["open", "no_remix"]).optional(),
  durationSec: z.number().int().min(1).max(3600).nullable().optional(),
  controls: z.record(z.string(), z.unknown()).optional(),
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(64).optional(),
  tags: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9 -]{0,23}$/)).max(5).optional(),
});

export async function updateGameMeta(gameId: string, patch: z.infer<typeof metaSchema>): Promise<{ ok: true } | ActionError> {
  const parsed = metaSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, code: "invalid", error: parsed.error.issues[0]?.message ?? "Invalid fields." };
  const { supabase, uid } = await requireUser();
  if (!uid) return { ok: false, code: "auth", error: "Sign in first." };
  const p = parsed.data;

  const { data: before } = await supabase.from("games").select("id, slug, creator_id").eq("id", gameId).maybeSingle();
  if (!before || before.creator_id !== uid) return { ok: false, code: "not_found", error: "Game not found." };

  const update: TablesUpdate<"games"> = {};
  if (p.title !== undefined) update.title = p.title;
  if (p.tagline !== undefined) update.tagline = p.tagline;
  if (p.description !== undefined) update.description = p.description;
  if (p.category !== undefined) update.category = p.category;
  if (p.orientation !== undefined) update.orientation = p.orientation;
  if (p.remixLicence !== undefined) update.remix_licence = p.remixLicence;
  if (p.durationSec !== undefined) update.duration_sec = p.durationSec;
  if (p.controls !== undefined) update.controls = p.controls as Json;
  if (p.slug !== undefined) update.slug = p.slug;

  if (Object.keys(update).length) {
    const { error } = await supabase.from("games").update(update).eq("id", gameId);
    if (error) return { ok: false, code: error.code === "23505" ? "conflict" : "unknown", error: error.code === "23505" ? "You already have a game with that slug." : error.message };
  }

  if (p.tags) {
    const names = Array.from(new Set(p.tags));
    if (names.length) await supabase.from("tags").upsert(names.map((name) => ({ name })), { onConflict: "name", ignoreDuplicates: true });
    const { data: tagRows } = names.length ? await supabase.from("tags").select("id, name").in("name", names) : { data: [] as { id: string; name: string }[] };
    await supabase.from("game_tags").delete().eq("game_id", gameId);
    if (tagRows?.length) await supabase.from("game_tags").insert(tagRows.map((t) => ({ game_id: gameId, tag_id: t.id })));
  }

  updateTag(gameTag(gameId));
  revalidateTag(FEED_TAG, "max");
  return { ok: true };
}

const versionMetaSchema = z.object({
  model: z.string().trim().max(80).nullable().optional(),
  agent: z.string().trim().max(80).nullable().optional(),
  prompt: z.string().trim().max(8000).nullable().optional(),
  changelog: z.string().trim().max(500).nullable().optional(),
});

/** Creator-editable version fields. Uses the service role after an ownership check because versions have no client update policy. */
export async function setVersionMeta(versionId: string, patch: z.infer<typeof versionMetaSchema>): Promise<{ ok: true } | ActionError> {
  const parsed = versionMetaSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, code: "invalid", error: "Invalid fields." };
  const { supabase, uid } = await requireUser();
  if (!uid) return { ok: false, code: "auth", error: "Sign in first." };
  const { data: v } = await supabase.from("game_versions").select("id, game_id, games!inner(creator_id)").eq("id", versionId).maybeSingle();
  const owner = (v as unknown as { games?: { creator_id: string } } | null)?.games?.creator_id;
  if (!v || owner !== uid) return { ok: false, code: "not_found", error: "Version not found." };
  const admin = createAdminClient();
  const { error } = await admin.from("game_versions").update(parsed.data).eq("id", versionId);
  if (error) return { ok: false, code: "unknown", error: error.message };
  updateTag(gameTag(v.game_id));
  return { ok: true };
}

/** Publishes a ready version and returns the canonical URL. */
export async function publishVersion(input: { gameId: string; versionId: string }): Promise<{ ok: true; url: string; shortUrl: string } | ActionError> {
  const { supabase, uid } = await requireUser();
  if (!uid) return { ok: false, code: "auth", error: "Sign in first." };
  const { data, error } = await supabase.rpc("publish_game_version", { p_game_id: input.gameId, p_version_id: input.versionId });
  if (error || !data) {
    const m = error?.message ?? "";
    if (m.includes("version_not_ready")) return { ok: false, code: "not_ready", error: "That version is still processing." };
    if (m.includes("hidden_by_moderation")) return { ok: false, code: "moderation", error: "This game was hidden by moderation." };
    if (m.includes("not_found") || m.includes("version_not_found")) return { ok: false, code: "not_found", error: "Game or version not found." };
    return { ok: false, code: "unknown", error: m || "Could not publish." };
  }
  const { data: me } = await supabase.from("profiles").select("handle").eq("id", uid).maybeSingle();
  updateTag(gameTag(data.id));
  revalidateTag(FEED_TAG, "max");
  revalidateTag(`creator-games:${uid}`, "max");
  if (me?.handle) revalidateTag(profileTag(me.handle), "max");
  return { ok: true, url: `/@${me?.handle ?? ""}/${data.slug}`, shortUrl: `/g/${data.short_id}` };
}

export async function unpublishGame(gameId: string): Promise<{ ok: true } | ActionError> {
  const { supabase, uid } = await requireUser();
  if (!uid) return { ok: false, code: "auth", error: "Sign in first." };
  const { error } = await supabase.rpc("unpublish_game", { p_game_id: gameId });
  if (error) return { ok: false, code: error.message.includes("not_found") ? "not_found" : "unknown", error: error.message };
  updateTag(gameTag(gameId));
  revalidateTag(FEED_TAG, "max");
  revalidateTag(`creator-games:${uid}`, "max");
  return { ok: true };
}

const lbSchema = z.object({
  enabled: z.boolean(),
  sort: z.enum(["desc", "asc"]).default("desc"),
  maxPerSecond: z.number().positive().nullable().optional(),
  minDurationMs: z.number().int().min(0).max(3600000).default(1000),
});

/** Turns the "main" leaderboard on/off for a game and sets its anti-cheat thresholds. */
export async function updateLeaderboardConfig(gameId: string, config: z.infer<typeof lbSchema>): Promise<{ ok: true } | ActionError> {
  const parsed = lbSchema.safeParse(config);
  if (!parsed.success) return { ok: false, code: "invalid", error: "Invalid leaderboard settings." };
  const { supabase, uid } = await requireUser();
  if (!uid) return { ok: false, code: "auth", error: "Sign in first." };
  const c = parsed.data;
  const { error } = await supabase.rpc("set_leaderboard_config", {
    p_game_id: gameId,
    p_enabled: c.enabled,
    p_sort: c.sort,
    p_max_per_second: c.maxPerSecond ?? undefined,
    p_min_duration_ms: c.minDurationMs,
  });
  if (error) return { ok: false, code: error.message.includes("not_found") ? "not_found" : "unknown", error: error.message };
  updateTag(gameTag(gameId));
  return { ok: true };
}
