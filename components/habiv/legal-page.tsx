import Link from "next/link";
import type { ReactNode } from "react";
import { mono } from "@/lib/habiv/ui";
import { legal, legalPages } from "@/lib/legal";

const css = `
.hb-legal-tabs{display:flex;flex-wrap:wrap;gap:6px 18px;margin:22px 0 0;padding:0 0 14px;border-bottom:1px solid var(--divider)}
.hb-legal-tab{font-size:13.5px;color:var(--ink-4)}
.hb-legal-tab:hover{color:var(--ink)}
.hb-legal-tab[aria-current="page"]{color:var(--ink);font-weight:600}
.hb-legal-body{padding-top:28px}
.hb-legal-body h2{margin:36px 0 10px;font-size:19px;font-weight:600;letter-spacing:-0.015em;color:var(--ink)}
.hb-legal-body h2:first-child{margin-top:0}
.hb-legal-body h3{margin:22px 0 8px;font-size:15.5px;font-weight:600;color:var(--ink)}
.hb-legal-body p,.hb-legal-body li{font-size:15px;line-height:1.75;color:var(--ink-3)}
.hb-legal-body p{margin:0 0 12px}
.hb-legal-body ul,.hb-legal-body ol{margin:0 0 14px;padding-left:22px}
.hb-legal-body ul{list-style:disc}
.hb-legal-body ol{list-style:decimal}
.hb-legal-body li{margin:4px 0}
.hb-legal-body strong{color:var(--ink);font-weight:600}
.hb-legal-body a{color:var(--ink);text-decoration:underline;text-underline-offset:3px}
.hb-legal-body .hb-legal-note{padding:14px 16px;border-radius:10px;background:var(--chip);margin:0 0 24px}
.hb-legal-table{overflow-x:auto;margin:0 0 16px}
.hb-legal-body table{width:100%;border-collapse:collapse;font-size:13.5px;line-height:1.55}
.hb-legal-body th,.hb-legal-body td{text-align:left;vertical-align:top;padding:10px 12px 10px 0;border-bottom:1px solid var(--divider);color:var(--ink-3)}
.hb-legal-body th{color:var(--ink);font-weight:600}
.hb-legal-body code{font-family:${mono};font-size:12.5px;color:var(--ink-2)}
`;

/** A plain document for the about and legal pages: title, links between the documents, then the text. */
export function LegalPage({ path, title, intro, children, showUpdated = true }: { path: string; title: string; intro: string; children: ReactNode; showUpdated?: boolean }) {
  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <header>
        <div style={{ fontFamily: mono, fontSize: "11px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-5)" }}>
          {path === "/about" ? "About" : "Legal"}
        </div>
        <h1 style={{ margin: "10px 0 0", fontSize: "clamp(28px, 5vw, 38px)", fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.1 }}>{title}</h1>
        <p style={{ margin: "12px 0 0", fontSize: "16px", lineHeight: 1.6, color: "var(--ink-4)" }}>{intro}</p>
        {showUpdated ? (
          <div style={{ marginTop: "12px", fontFamily: mono, fontSize: "11px", color: "var(--ink-5)" }}>Last updated {legal.updated}</div>
        ) : null}
      </header>
      <nav aria-label="Legal documents" className="hb-legal-tabs">
        {legalPages.map((p) => (
          <Link key={p.href} href={p.href} className="hb-legal-tab" aria-current={p.href === path ? "page" : undefined}>
            {p.label}
          </Link>
        ))}
      </nav>
      <article className="hb-legal-body">{children}</article>
    </div>
  );
}

export const Mail = ({ to = legal.email, subject }: { to?: string; subject?: string }) => (
  <a href={`mailto:${to}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`}>{to}</a>
);
