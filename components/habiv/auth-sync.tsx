"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useShell } from "@/components/habiv/shell-context";

const CHANNEL = "habiv-auth";

/**
 * Keeps every open tab's sign-in state in step. The shell gets the user from the server once per
 * render (session-bridge.tsx), so a tab left open while you sign in or out elsewhere would keep the
 * old state. Whenever something suggests the session changed, the tab compares the session cookie
 * with the user it shows and refreshes its server data when they differ:
 * - Supabase's cross-tab auth events (password sign-in, sign-out, token refresh from another tab);
 * - a Habiv channel each tab posts to when it loads or its user changes, which covers Google,
 *   GitHub and email-link sign-ins (they finish on the server, so Supabase broadcasts nothing);
 * - the tab becoming visible or focused again, or coming back from the back/forward cache.
 * router.refresh() also clears the router's cache, so pages it cached or prefetched under the old
 * session (x-nextjs-stale-time is up to 5 minutes) aren't reused. The tab where you sign in or out
 * does a full page load instead (auth-modal.tsx, app-shell.tsx).
 * Only a mismatch refreshes, so tabs settle instead of refreshing each other in a loop.
 */
export function AuthSync() {
  const { profile, sessionReady, modal, closeModal, authIntent } = useShell();
  const router = useRouter();
  const uid = profile.id;
  const uidRef = useRef(uid);
  const refreshing = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    uidRef.current = uid;
    refreshing.current = false;
    if (sessionReady) channel.current?.postMessage({ uid });
  }, [uid, sessionReady]);

  useEffect(() => {
    if (!sessionReady) return;
    const supabase = createClient();
    const check = async () => {
      if (refreshing.current) return;
      const { data } = await supabase.auth.getSession();
      if ((data.session?.user.id ?? null) === uidRef.current) return;
      refreshing.current = true;
      router.refresh();
    };
    // Supabase warns against awaiting its own calls inside this callback, so the check runs after it.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") setTimeout(() => void check(), 0);
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    // Back/forward restores a frozen copy of the page, which can predate a sign-in or sign-out.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("pageshow", onPageShow);
    if ("BroadcastChannel" in window) {
      channel.current = new BroadcastChannel(CHANNEL);
      channel.current.onmessage = (e: MessageEvent<{ uid: string | null }>) => {
        if (e.data?.uid !== uidRef.current) void check();
      };
      channel.current.postMessage({ uid: uidRef.current });
    }
    return () => {
      sub.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      channel.current?.close();
      channel.current = null;
    };
  }, [sessionReady, router]);

  // Signed in (here or in another tab) while this tab's sign-in box was open: close it and carry
  // on to where the box was sending you, e.g. the MCP approval page.
  useEffect(() => {
    if (!sessionReady || !uid || modal !== "signin") return;
    if (authIntent.mode !== "signin" && authIntent.mode !== "signup") return;
    closeModal();
    if (authIntent.next) router.push(authIntent.next);
  }, [sessionReady, uid, modal, authIntent, closeModal, router]);

  return null;
}
