import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/supabase/database.types";
import { cdnUrl } from "@/lib/site";

export type NotificationKind = Tables<"notifications">["kind"];

export type NotificationItem = {
  id: string;
  kind: string;
  createdAt: string;
  read: boolean;
  actor: { id: string; handle: string; displayName: string; avatarUrl: string | null } | null;
  game: { id: string; title: string; url: string } | null;
  comment: { id: string; snippet: string } | null;
};

/** The viewer's notifications, newest first. Never cached. */
export async function listNotifications(supabase: SupabaseClient<Database>, opts: { limit?: number; before?: string } = {}): Promise<NotificationItem[]> {
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return [];
  let q = supabase.from("notifications").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(Math.min(opts.limit ?? 20, 50));
  if (opts.before) q = q.lt("created_at", opts.before);
  const { data: rows } = await q;
  if (!rows?.length) return [];

  const actorIds = Array.from(new Set(rows.map((r) => r.actor_id).filter((x): x is string => !!x)));
  const gameIds = Array.from(new Set(rows.map((r) => r.game_id).filter((x): x is string => !!x)));
  const commentIds = Array.from(new Set(rows.map((r) => r.comment_id).filter((x): x is string => !!x)));
  const [{ data: actors }, { data: games }, { data: comments }] = await Promise.all([
    actorIds.length ? supabase.from("profiles").select("id, handle, display_name, avatar_path").in("id", actorIds) : Promise.resolve({ data: [] as Pick<Tables<"profiles">, "id" | "handle" | "display_name" | "avatar_path">[] }),
    gameIds.length ? supabase.from("games").select("id, title, slug, creator_id").in("id", gameIds) : Promise.resolve({ data: [] as Pick<Tables<"games">, "id" | "title" | "slug" | "creator_id">[] }),
    commentIds.length ? supabase.from("comments").select("id, body").in("id", commentIds) : Promise.resolve({ data: [] as Pick<Tables<"comments">, "id" | "body">[] }),
  ]);
  const creatorIds = Array.from(new Set((games ?? []).map((g) => g.creator_id)));
  const { data: creators } = creatorIds.length ? await supabase.from("profiles").select("id, handle").in("id", creatorIds) : { data: [] as { id: string; handle: string }[] };
  const creatorHandle = new Map((creators ?? []).map((c) => [c.id, c.handle]));
  const actorMap = new Map((actors ?? []).map((a) => [a.id, a]));
  const gameMap = new Map((games ?? []).map((g) => [g.id, g]));
  const commentMap = new Map((comments ?? []).map((c) => [c.id, c]));

  return rows.map((r) => {
    const a = r.actor_id ? actorMap.get(r.actor_id) : null;
    const g = r.game_id ? gameMap.get(r.game_id) : null;
    const c = r.comment_id ? commentMap.get(r.comment_id) : null;
    return {
      id: r.id,
      kind: r.kind,
      createdAt: r.created_at,
      read: !!r.read_at,
      actor: a ? { id: a.id, handle: a.handle, displayName: a.display_name ?? a.handle, avatarUrl: cdnUrl(a.avatar_path) } : null,
      game: g ? { id: g.id, title: g.title, url: `/@${creatorHandle.get(g.creator_id) ?? ""}/${g.slug}` } : null,
      comment: c ? { id: c.id, snippet: c.body.slice(0, 80) } : null,
    };
  });
}

export async function unreadCount(supabase: SupabaseClient<Database>): Promise<number> {
  const { data } = await supabase.rpc("unread_notifications");
  return data ?? 0;
}
