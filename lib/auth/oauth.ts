"use client";

import { createClient } from "@/lib/supabase/client";

export type OAuthProvider = "github" | "google";

/**
 * Opens an empty sign-in popup. Call it straight from the click, before any await, or the browser
 * blocks it. Returns null (use the redirect instead) on touch screens, where a popup opens as a
 * separate tab, where BroadcastChannel is missing, or when the popup was blocked.
 */
export function openOAuthPopup(): Window | null {
  if (typeof BroadcastChannel === "undefined" || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return null;
  const w = 500;
  const h = 640;
  const left = Math.round(window.screenX + Math.max(0, (window.outerWidth - w) / 2));
  const top = Math.round(window.screenY + Math.max(0, (window.outerHeight - h) / 2));
  return window.open("", "habiv-oauth", `popup,width=${w},height=${h},left=${left},top=${top}`);
}

/**
 * Starts an OAuth sign-in. Supabase sends the browser back to /auth/callback, which exchanges the
 * code for a session. Without `popup` the whole page goes and comes back to `next` (with profile
 * setup open if there is no handle yet); with it only the popup does, and it reports back to this
 * tab (lib/auth/popup.ts).
 */
export async function signInWithProvider(provider: OAuthProvider, next = "/", popup?: { window: Window; id: string }) {
  const supabase = createClient();
  const params = new URLSearchParams({ next });
  if (popup) params.set("popup", popup.id);
  const redirectTo = `${window.location.origin}/auth/callback?${params.toString()}`;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: !!popup,
      ...(provider === "google" ? { queryParams: { prompt: "select_account" } } : {}),
    },
  });
  if (error) throw error;
  if (popup) popup.window.location.href = data.url;
}
