import type { Database } from "@/lib/supabase/database.types";

/** Row type of a view in the public schema (generated view columns are all nullable). */
export type Views<T extends keyof Database["public"]["Views"]> = Database["public"]["Views"][T]["Row"];

/**
 * Passes a nullable value to an RPC argument that Postgres declares without a default.
 * The generated types mark such arguments non-null even though the function accepts null.
 * undefined becomes null: JSON drops undefined keys, and PostgREST then finds no function
 * with the shorter argument list ("Could not find the function ... in the schema cache").
 */
export function nullable<T>(v: T | null | undefined): T {
  return (v ?? null) as T;
}
