export interface Env {
  GAMES_BUCKET: string;
  VERSIONS: KVNamespace;
  ASSETS: Fetcher;
  FRAME_ANCESTORS: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  HOOK_SECRET: string;
}

/** Compact version metadata stored in KV (keys are short to stay well under limits). */
export type VersionMeta = {
  /** game id */
  g: string;
  /** version status */
  s: "uploaded" | "processing" | "ready" | "rejected";
  /** needs cross-origin isolation (COOP/COEP) */
  iso: boolean;
  /** may talk to the network */
  net: boolean;
  /** entry path, default index.html */
  e: string;
};

const KV_TTL_SECONDS = 24 * 60 * 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

export async function getVersion(env: Env, versionId: string): Promise<VersionMeta | null> {
  const cached = await env.VERSIONS.get<VersionMeta>(versionId, "json");
  if (cached) return cached;
  const fetched = await fetchVersionFromSupabase(env, versionId);
  if (fetched) {
    await env.VERSIONS.put(versionId, JSON.stringify(fetched), { expirationTtl: KV_TTL_SECONDS });
  }
  return fetched;
}

export async function isGameBlocked(env: Env, gameId: string): Promise<boolean> {
  return (await env.VERSIONS.get(`blocked:${gameId}`)) !== null;
}

async function fetchVersionFromSupabase(env: Env, versionId: string): Promise<VersionMeta | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/game_versions`);
  url.searchParams.set("id", `eq.${versionId}`);
  url.searchParams.set("select", "game_id,status,needs_isolation,uses_network,entry_path");
  const res = await fetch(url.toString(), {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      accept: "application/json",
    },
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{
    game_id: string;
    status: VersionMeta["s"];
    needs_isolation: boolean;
    uses_network: boolean;
    entry_path: string;
  }>;
  const row = rows[0];
  if (!row) return null;
  return { g: row.game_id, s: row.status, iso: !!row.needs_isolation, net: !!row.uses_network, e: row.entry_path || "index.html" };
}

/** Payload posted by the database trigger (pg_net) when a version or game changes. */
export type HookPayload =
  | { version_id: string; game_id: string; status: VersionMeta["s"]; needs_isolation: boolean; uses_network: boolean; entry_path: string | null }
  | { game_id: string; game_status: string };

export async function applyHook(env: Env, payload: HookPayload): Promise<void> {
  if ("version_id" in payload) {
    const meta: VersionMeta = {
      g: payload.game_id,
      s: payload.status,
      iso: !!payload.needs_isolation,
      net: !!payload.uses_network,
      e: payload.entry_path || "index.html",
    };
    await env.VERSIONS.put(payload.version_id, JSON.stringify(meta), { expirationTtl: KV_TTL_SECONDS });
    return;
  }
  if (payload.game_status === "removed") {
    await env.VERSIONS.put(`blocked:${payload.game_id}`, "1");
  } else {
    await env.VERSIONS.delete(`blocked:${payload.game_id}`);
  }
}
