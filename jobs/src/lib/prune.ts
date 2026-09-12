import { admin } from "./supabase";
import { deleteKeys, listPrefix } from "./storage";
import { jobEnv } from "./env";

/**
 * Keeps the last N ready versions per game (plus the current one); older bundles leave storage
 * and their rows become `archived` (history stays, bundle does not). Runs from the daily cron
 * route (app/api/jobs/cron).
 *
 * Off by default (KEEP_VERSIONS_PER_GAME unset or 0): players can open any older version from the
 * game page, so creators decide what goes by deleting versions themselves; the per-creator storage
 * quota bounds the total. Set KEEP_VERSIONS_PER_GAME to a number to prune again.
 */
export async function pruneVersions(keepPerGame = Number(process.env.KEEP_VERSIONS_PER_GAME ?? 0)): Promise<{ archived: number }> {
  if (!(keepPerGame > 0)) return { archived: 0 };
  const db = admin();
  const { data: versions, error } = await db
    .from("game_versions")
    .select("id, game_id, version, status, bundle_prefix, games!game_versions_game_id_fkey(current_version_id)")
    .eq("status", "ready")
    .order("game_id")
    .order("version", { ascending: false });
  if (error) throw error;

  const byGame = new Map<string, NonNullable<typeof versions>>();
  for (const v of versions ?? []) {
    const list = byGame.get(v.game_id) ?? [];
    list.push(v);
    byGame.set(v.game_id, list);
  }

  let archived = 0;
  for (const [, list] of byGame) {
    const current = (list[0] as unknown as { games?: { current_version_id: string | null } }).games?.current_version_id ?? null;
    const keep = new Set(list.slice(0, keepPerGame).map((v) => v.id));
    if (current) keep.add(current);
    for (const v of list) {
      if (keep.has(v.id) || !v.bundle_prefix) continue;
      const keys = await listPrefix(jobEnv.gamesBucket(), `${v.bundle_prefix}/`);
      if (keys.length) await deleteKeys(jobEnv.gamesBucket(), keys);
      await db.from("game_versions").update({ status: "archived", bundle_prefix: null }).eq("id", v.id);
      archived++;
    }
  }
  return { archived };
}
