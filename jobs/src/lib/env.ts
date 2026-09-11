function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export const jobEnv = {
  supabaseUrl: () => req("SUPABASE_URL"),
  serviceRoleKey: () => req("SUPABASE_SERVICE_ROLE_KEY"),
  /** Supabase Storage's S3 endpoint for the project unless overridden (e.g. to move to R2). */
  s3Endpoint: () => process.env.STORAGE_S3_ENDPOINT || `https://${new URL(req("SUPABASE_URL")).hostname.split(".")[0]}.storage.supabase.co/storage/v1/s3`,
  s3Region: () => req("STORAGE_S3_REGION"),
  s3AccessKeyId: () => req("STORAGE_S3_ACCESS_KEY_ID"),
  s3SecretAccessKey: () => req("STORAGE_S3_SECRET_ACCESS_KEY"),
  uploadsBucket: () => process.env.STORAGE_UPLOADS_BUCKET ?? "habiv-uploads",
  gamesBucket: () => process.env.STORAGE_GAMES_BUCKET ?? "habiv-games",
  publicBucket: () => process.env.STORAGE_PUBLIC_BUCKET ?? "habiv-public",
  gameOrigin: () => (process.env.GAME_ORIGIN ?? "").replace(/\/$/, ""),
};
