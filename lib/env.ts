import "server-only";
import { z } from "zod";

/**
 * Server-side environment. Importing this module from client code is a build error
 * (server-only). Missing required values throw at first import so misconfiguration
 * fails fast instead of surfacing as a broken upload at runtime.
 */
const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Object storage over the S3 API. The endpoint defaults to the project's Supabase Storage.
  STORAGE_S3_ENDPOINT: z.preprocess((v) => v || undefined, z.string().url().optional()),
  STORAGE_S3_REGION: z.string().min(1),
  STORAGE_S3_ACCESS_KEY_ID: z.string().min(1),
  STORAGE_S3_SECRET_ACCESS_KEY: z.string().min(1),
  STORAGE_UPLOADS_BUCKET: z.string().min(1).default("habiv-uploads"),
  STORAGE_GAMES_BUCKET: z.string().min(1).default("habiv-games"),
  STORAGE_PUBLIC_BUCKET: z.string().min(1).default("habiv-public"),
  // Checked where jobs are enqueued (lib/jobs/trigger.ts), so storage-only routes work without it.
  TRIGGER_SECRET_KEY: z.string().min(1).optional(),
  RUN_TOKEN_SECRET: z.string().min(16),
  GAME_ORIGIN_HOOK_SECRET: z.string().min(16).optional(),
});

type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

/** Lazily parsed so routes that never touch storage (health, auth) do not require storage vars. */
export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Missing or invalid server environment variables: ${missing}`);
  }
  cached = parsed.data;
  return cached;
}

/** Reads a single optional server var without triggering the full schema check. */
export function optionalEnv(name: keyof ServerEnv): string | undefined {
  return process.env[name];
}
