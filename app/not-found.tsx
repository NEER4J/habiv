import Link from "next/link";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="hb-theme" style={{ minHeight: "100svh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", background: "var(--bg)", color: "var(--ink)" }}>
      <div style={{ maxWidth: "440px", textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: "12px", letterSpacing: "0.16em", color: "var(--ink-5)" }}>404</div>
        <h1 style={{ margin: "12px 0 0", fontSize: "30px", fontWeight: 600, letterSpacing: "-0.03em" }}>This page isn&apos;t here.</h1>
        <p style={{ margin: "12px 0 0", fontSize: "15px", lineHeight: 1.6, color: "var(--ink-4)" }}>
          The game may have been renamed, unpublished or removed. There are plenty more to play.
        </p>
        <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginTop: "22px", flexWrap: "wrap" }}>
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", height: "38px", padding: "0 16px", borderRadius: "19px", background: "var(--ink)", color: "var(--ink-invert)", fontSize: "14px", fontWeight: 600 }}>
            Go home
          </Link>
          <Link href="/explore" style={{ display: "inline-flex", alignItems: "center", height: "38px", padding: "0 16px", borderRadius: "19px", background: "var(--chip)", color: "var(--ink)", fontSize: "14px", fontWeight: 500 }}>
            Explore games
          </Link>
        </div>
      </div>
    </main>
  );
}
