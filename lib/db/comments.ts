import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { avatarUrlOf } from "@/lib/site";

export type CommentAuthor = { id: string; handle: string; displayName: string; avatarUrl: string | null; isVerified: boolean; isGameCreator: boolean };

export type CommentItem = {
  id: string;
  body: string;
  likesCount: number;
  replyCount: number;
  pinned: boolean;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  author: CommentAuthor;
  liked: boolean;
  mine: boolean;
  replies: CommentItem[];
};

export type CommentSort = "top" | "newest";

/** Comment threads for a game (first 3 replies each). User-scoped: blocks and viewer likes apply. Never cached. */
export async function listComments(
  supabase: SupabaseClient<Database>,
  gameId: string,
  opts: { sort?: CommentSort; limit?: number; offset?: number } = {},
): Promise<{ items: CommentItem[]; nextOffset: number | null }> {
  const limit = Math.min(opts.limit ?? 20, 50);
  const offset = opts.offset ?? 0;
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub ?? null;

  let q = supabase.from("comments").select("*").eq("game_id", gameId).is("parent_id", null).is("deleted_at", null);
  q = opts.sort === "newest" ? q.order("pinned", { ascending: false }).order("created_at", { ascending: false }) : q.order("pinned", { ascending: false }).order("likes_count", { ascending: false }).order("created_at", { ascending: false });
  const { data: top } = await q.range(offset, offset + limit);
  const tops = (top ?? []).slice(0, limit);
  const nextOffset = (top ?? []).length > limit ? offset + limit : null;
  if (!tops.length) return { items: [], nextOffset };

  const topIds = tops.map((c) => c.id);
  const [{ data: replies }, { data: game }, blocked] = await Promise.all([
    supabase.from("comments").select("*").in("parent_id", topIds).is("deleted_at", null).order("created_at", { ascending: true }),
    supabase.from("games").select("creator_id").eq("id", gameId).maybeSingle(),
    uid ? supabase.from("blocks").select("blocked_id").eq("blocker_id", uid).then((r) => new Set((r.data ?? []).map((b) => b.blocked_id))) : Promise.resolve(new Set<string>()),
  ]);

  const all = [...tops, ...(replies ?? [])].filter((c) => !blocked.has(c.author_id));
  const authorIds = Array.from(new Set(all.map((c) => c.author_id)));
  const [{ data: profiles }, likedIds] = await Promise.all([
    supabase.from("profiles").select("id, handle, display_name, avatar_path, is_verified").in("id", authorIds),
    uid ? supabase.from("comment_likes").select("comment_id").eq("user_id", uid).in("comment_id", all.map((c) => c.id)).then((r) => new Set((r.data ?? []).map((x) => x.comment_id))) : Promise.resolve(new Set<string>()),
  ]);
  const authors = new Map((profiles ?? []).map((p) => [p.id, p]));
  const creatorId = game?.creator_id ?? null;

  const toItem = (c: (typeof all)[number], children: CommentItem[]): CommentItem => {
    const a = authors.get(c.author_id);
    return {
      id: c.id,
      body: c.body,
      likesCount: c.likes_count,
      replyCount: c.reply_count,
      pinned: c.pinned,
      createdAt: c.created_at,
      editedAt: c.edited_at,
      deleted: !!c.deleted_at,
      author: {
        id: c.author_id,
        handle: a?.handle ?? "unknown",
        displayName: a?.display_name ?? a?.handle ?? "unknown",
        avatarUrl: avatarUrlOf(a?.avatar_path),
        isVerified: !!a?.is_verified,
        isGameCreator: c.author_id === creatorId,
      },
      liked: likedIds.has(c.id),
      mine: c.author_id === uid,
      replies: children,
    };
  };

  const repliesByParent = new Map<string, CommentItem[]>();
  for (const r of replies ?? []) {
    if (blocked.has(r.author_id) || !r.parent_id) continue;
    const list = repliesByParent.get(r.parent_id) ?? [];
    if (list.length < 3) list.push(toItem(r, []));
    repliesByParent.set(r.parent_id, list);
  }
  const items = tops.filter((c) => !blocked.has(c.author_id)).map((c) => toItem(c, repliesByParent.get(c.id) ?? []));
  return { items, nextOffset };
}

/** All replies of one comment (for "show more replies"). */
export async function listReplies(supabase: SupabaseClient<Database>, commentId: string): Promise<CommentItem[]> {
  const { data: parent } = await supabase.from("comments").select("game_id").eq("id", commentId).maybeSingle();
  if (!parent) return [];
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub ?? null;
  const { data: replies } = await supabase.from("comments").select("*").eq("parent_id", commentId).is("deleted_at", null).order("created_at", { ascending: true }).limit(200);
  if (!replies?.length) return [];
  const { data: game } = await supabase.from("games").select("creator_id").eq("id", parent.game_id).maybeSingle();
  const { data: profiles } = await supabase.from("profiles").select("id, handle, display_name, avatar_path, is_verified").in("id", Array.from(new Set(replies.map((r) => r.author_id))));
  const authors = new Map((profiles ?? []).map((p) => [p.id, p]));
  const liked = uid ? new Set(((await supabase.from("comment_likes").select("comment_id").eq("user_id", uid).in("comment_id", replies.map((r) => r.id))).data ?? []).map((x) => x.comment_id)) : new Set<string>();
  return replies.map((c) => {
    const a = authors.get(c.author_id);
    return {
      id: c.id, body: c.body, likesCount: c.likes_count, replyCount: c.reply_count, pinned: c.pinned, createdAt: c.created_at, editedAt: c.edited_at, deleted: false,
      author: { id: c.author_id, handle: a?.handle ?? "unknown", displayName: a?.display_name ?? a?.handle ?? "unknown", avatarUrl: avatarUrlOf(a?.avatar_path), isVerified: !!a?.is_verified, isGameCreator: c.author_id === game?.creator_id },
      liked: liked.has(c.id), mine: c.author_id === uid, replies: [],
    };
  });
}
