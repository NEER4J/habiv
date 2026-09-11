function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export const jobEnv = {
  supabaseUrl: () => req("SUPABASE_URL"),
  serviceRoleKey: () => req("SUPABASE_SERVICE_ROLE_KEY"),
  r2AccountId: () => req("R2_ACCOUNT_ID"),
  r2AccessKeyId: () => req("R2_ACCESS_KEY_ID"),
  r2SecretAccessKey: () => req("R2_SECRET_ACCESS_KEY"),
  uploadsBucket: () => process.env.R2_UPLOADS_BUCKET ?? "habiv-uploads",
  gamesBucket: () => process.env.R2_GAMES_BUCKET ?? "habiv-games",
  publicBucket: () => process.env.R2_PUBLIC_BUCKET ?? "habiv-public",
  gameOrigin: () => (process.env.GAME_ORIGIN ?? "").replace(/\/$/, ""),
};
