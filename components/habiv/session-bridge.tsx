import { createClient } from "@/lib/supabase/server";
import { getOwnProfile } from "@/lib/db/profiles";
import { unreadCount } from "@/lib/db/notifications";
import { SessionClient } from "@/components/habiv/session-client";
import type { ShellSession } from "@/components/habiv/shell-context";
import { getFeed } from "@/lib/db/games";
import { getBuiltThisWeek, getTotalPlays } from "@/lib/db/feed";
import { fromFeedGame } from "@/lib/habiv/games";

/**
 * Server component that reads the cookie session once per request and hands it to the
 * client shell. Render inside <Suspense> (it reads cookies, so it is always dynamic).
 */
export async function SessionBridge() {
  const supabase = await createClient();
  const [own, featured, builtThisWeek, totalPlays] = await Promise.all([
    getOwnProfile(supabase),
    getFeed({ sort: "featured", limit: 5 }),
    getBuiltThisWeek(),
    getTotalPlays(),
  ]);
  const pinned = featured.items.map(fromFeedGame);
  let session: ShellSession = { profile: null, savedIds: [], unread: 0, pinned, builtThisWeek, totalPlays };
  if (own) {
    const [{ data: saves }, unread] = await Promise.all([
      supabase.from("saves").select("game_id").eq("user_id", own.id).order("created_at", { ascending: false }).limit(500),
      unreadCount(supabase),
    ]);
    session = {
      profile: {
        id: own.id,
        name: own.displayName,
        handle: own.handle,
        bio: own.bio ?? "",
        avatarUrl: own.avatarUrl,
        isAdmin: own.isAdmin,
        isCreator: own.isCreator,
        handleSet: own.handleSet,
      },
      savedIds: (saves ?? []).map((s) => s.game_id),
      unread,
      pinned,
      builtThisWeek,
      totalPlays,
    };
  }
  return <SessionClient session={session} />;
}
