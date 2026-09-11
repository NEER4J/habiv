import { schedules, logger } from "@trigger.dev/sdk";
import { admin } from "../lib/supabase";
import { deleteKeys, listPrefix } from "../lib/storage";
import { jobEnv } from "../lib/env";

const KEEP_PER_GAME = Number(process.env.KEEP_VERSIONS_PER_GAME ?? 3);

/**
 * Nightly: keep the last N ready versions per game; older bundles leave storage and their rows
 * become `archived` (history stays, bundle does not).
 */
export const pruneVersions = schedules.task({
  id: "prune-versions",
  cron: "30 3 * * *",
  run: async () => {
    const db = admin();
    const { data: versions, error } = await db
      .from("game_versions")
      .select("id, game_id, version, status, bundle_prefix, games!game_versions_game_id_fkey(current_version_id)")
      .eq("status", "ready")
      .order("game_id")
      .order("version", { ascending: false });
    if (error) throw error;

    const byGame = new Map<string, typeof versions>();
    for (const v of versions ?? []) {
      const list = byGame.get(v.game_id) ?? [];
      list.push(v);
      byGame.set(v.game_id, list);
    }

    let archived = 0;
    for (const [, list] of byGame) {
      const current = (list[0] as unknown as { games?: { current_version_id: string | null } }).games?.current_version_id ?? null;
      const keep = new Set(list.slice(0, KEEP_PER_GAME).map((v) => v.id));
      if (current) keep.add(current);
      for (const v of list) {
        if (keep.has(v.id) || !v.bundle_prefix) continue;
        const keys = await listPrefix(jobEnv.gamesBucket(), `${v.bundle_prefix}/`);
        if (keys.length) await deleteKeys(jobEnv.gamesBucket(), keys);
        await db.from("game_versions").update({ status: "archived", bundle_prefix: null }).eq("id", v.id);
        archived++;
      }
    }
    logger.info("prune complete", { archived });
    return { archived };
  },
});
