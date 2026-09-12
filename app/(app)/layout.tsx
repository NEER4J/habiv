import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/habiv/app-shell";
import { ShellProvider } from "@/components/habiv/shell-context";
import { SessionBridge } from "@/components/habiv/session-bridge";
import { AuthSync } from "@/components/habiv/auth-sync";

/**
 * The shell reads the pathname (a runtime value on dynamic routes), so the whole provider sits
 * inside Suspense and streams in after the static document shell under cacheComponents.
 */
export default function HabivLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <ShellProvider>
        <Suspense fallback={null}>
          <SessionBridge />
        </Suspense>
        <AuthSync />
        <AppShell>{children}</AppShell>
      </ShellProvider>
    </Suspense>
  );
}
