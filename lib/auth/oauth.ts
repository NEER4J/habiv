"use client";

import { createClient } from "@/lib/supabase/client";

export type OAuthProvider = "github" | "google";

/**
 * Starts an OAuth sign-in. Supabase redirects back to /auth/callback, which exchanges the
 * code for a session and sends the user to `next` (or to handle onboarding first).
 */
export async function signInWithProvider(provider: OAuthProvider, next = "/") {
  const supabase = createClient();
  const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, ...(provider === "google" ? { queryParams: { prompt: "select_account" } } : {}) },
  });
  if (error) throw error;
}
