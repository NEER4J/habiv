import type { Database } from "@/lib/supabase/database.types";

/** Row type of a view in the public schema (generated view columns are all nullable). */
export type Views<T extends keyof Database["public"]["Views"]> = Database["public"]["Views"][T]["Row"];

/**
 * Passes a nullable value to an RPC argument that Postgres declares without a default.
 * The generated types mark such arguments non-null even though the function accepts null.
 */
export function nullable<T>(v: T | null | undefined): T {
  return v as T;
}
