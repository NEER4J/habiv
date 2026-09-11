import type { Env } from "./versions";

const PASS_THROUGH = ["range", "if-none-match", "if-modified-since"];

/**
 * Reads one bundle file from the private games bucket in Supabase Storage with the service
 * key, forwarding range and conditional headers so large assets can stream and revalidate.
 */
export function readObject(env: Env, key: string, method: "GET" | "HEAD", incoming: Headers): Promise<Response> {
  const headers = new Headers({
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  });
  for (const name of PASS_THROUGH) {
    const v = incoming.get(name);
    if (v) headers.set(name, v);
  }
  const path = key.split("/").map(encodeURIComponent).join("/");
  return fetch(`${env.SUPABASE_URL}/storage/v1/object/authenticated/${env.GAMES_BUCKET}/${path}`, { method, headers });
}
