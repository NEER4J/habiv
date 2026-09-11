"use client";

import { useEffect } from "react";
import { useShell, type ShellSession } from "@/components/habiv/shell-context";
import { linkPlayer } from "@/lib/analytics/link-player";

/** Pushes the server-read session into the shell context after hydration. */
export function SessionClient({ session }: { session: ShellSession }) {
  const { setSession } = useShell();
  useEffect(() => {
    setSession(session);
    if (session.profile?.id) void linkPlayer();
  }, [session, setSession]);
  return null;
}
