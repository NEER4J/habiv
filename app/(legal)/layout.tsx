import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/habiv/site-footer";

/** About and legal pages: a plain reading layout without the app shell (no sidebar, search or bottom nav). */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="hb-theme" style={{ minHeight: "100svh", background: "var(--bg)", color: "var(--ink)" }}>
      <div style={{ maxWidth: "760px", margin: "0 auto", paddingInline: "20px" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", height: "64px", borderBottom: "1px solid var(--divider)" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "9px", color: "var(--ink)" }}>
            <svg width="20" height="20" viewBox="0 0 773 764" fill="currentColor" aria-hidden="true" style={{ display: "block" }}>
              <path d="M0.769531 600L266.27 0.5H589.77L447.27 326H771.77L578.27 763H253.77L447.27 326H286.27L166.77 600H0.769531Z" />
            </svg>
            <span style={{ fontSize: "18px", fontWeight: 600, letterSpacing: "-0.03em" }}>habiv</span>
          </Link>
          <Link href="/" style={{ fontSize: "13.5px", fontWeight: 500, color: "var(--ink-3)" }}>
            Back to Habiv →
          </Link>
        </header>
        <main style={{ paddingBlock: "clamp(28px, 6vw, 56px) 8px" }}>{children}</main>
        <SiteFooter />
        <div style={{ height: "24px" }} />
      </div>
    </div>
  );
}
