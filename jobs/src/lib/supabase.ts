import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { jobEnv } from "./env";

let client: SupabaseClient | null = null;

/** Service-role client (jobs run trusted code after the app has authorised the upload). */
export function admin(): SupabaseClient {
  if (client) return client;
  client = createClient(jobEnv.supabaseUrl(), jobEnv.serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}

export type VersionRow = {
  id: string;
  game_id: string;
  version: number;
  status: "uploaded" | "processing" | "ready" | "rejected";
  source: string;
  upload_key: string | null;
  bundle_prefix: string | null;
  entry_path: string;
  size_bytes: number | null;
  sha256: string | null;
  engine: string | null;
  needs_isolation: boolean;
  uses_network: boolean;
  manifest: unknown;
  auto_publish: boolean;
  games: {
    id: string;
    creator_id: string;
    status: string;
    cover_path: string | null;
    card_path: string | null;
    title: string;
    tagline: string | null;
    category: string;
    accent_hue: number;
  } | null;
};

export async function loadVersion(versionId: string): Promise<VersionRow | null> {
  const { data, error } = await admin()
    .from("game_versions")
    .select("id, game_id, version, status, source, upload_key, bundle_prefix, entry_path, size_bytes, sha256, engine, needs_isolation, uses_network, manifest, auto_publish, games!game_versions_game_id_fkey(id, creator_id, status, cover_path, card_path, title, tagline, category, accent_hue)")
    .eq("id", versionId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as VersionRow) ?? null;
}

export async function setVersionStatus(versionId: string, patch: Record<string, unknown>) {
  const { error } = await admin().from("game_versions").update(patch).eq("id", versionId);
  if (error) throw error;
}

/** Notifications table arrives in Phase 3; until then this is a best-effort insert. */
export async function notify(userId: string, kind: string, gameId: string) {
  const { error } = await admin().from("notifications").insert({ user_id: userId, kind, game_id: gameId });
  if (error && !/relation .* does not exist|schema cache/i.test(error.message)) {
    console.warn("notify failed", error.message);
  }
}
