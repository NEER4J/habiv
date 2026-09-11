import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Cookie-less client with the publishable key. It only ever sees rows that RLS exposes
 * to `anon`, so it is safe inside `"use cache"` functions (which must not read cookies).
 * Never use it for user-scoped reads; use lib/supabase/server.ts for those.
 */
export function createAnonClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}
