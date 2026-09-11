import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/admin";

export type RequestUser = {
  userId: string;
  /** A client acting as the user (RLS applies). */
  supabase: SupabaseClient<Database>;
};

/**
 * Resolves the caller of an API route from either the cookie session (browser) or an
 * `Authorization: Bearer <supabase jwt>` header (scripts, tests). Returns null when
 * neither is valid. Personal API tokens (hbv_live_...) are handled separately in lib/mcp.
 */
export async function getRequestUser(request: NextRequest): Promise<RequestUser | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

  const bearer = request.headers.get("authorization");
  if (bearer?.toLowerCase().startsWith("bearer ")) {
    const jwt = bearer.slice(7).trim();
    if (jwt.startsWith("hbv_")) return null;
    const admin = createAdminClient();
    const { data, error } = await admin.auth.getUser(jwt);
    if (error || !data.user) return null;
    const supabase = createServerClient<Database>(url, key, {
      cookies: { getAll: () => [], setAll: () => {} },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    return { userId: data.user.id, supabase };
  }

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      // Route handlers do not refresh sessions; proxy.ts does that on every request.
      setAll: () => {},
    },
  });
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (!sub) return null;
  return { userId: sub, supabase };
}
