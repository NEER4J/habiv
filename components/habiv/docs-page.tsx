import Link from "next/link";
import type { ReactNode } from "react";
import { bpanel, mono } from "@/lib/habiv/ui";
import { docsPages, type DocsPath } from "@/lib/docs";

const css = `
.hb-docs-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:22px 0 0}
.hb-docs-tab{display:inline-flex;align-items:center;height:34px;padding:0 14px;border-radius:17px;font-size:13.5px;font-weight:500;color:var(--ink-3);background:var(--chip)}
.hb-docs-tab:hover{color:var(--ink)}
.hb-docs-tab[aria-current="page"]{background:var(--ink);color:var(--ink-invert)}
.hb-docs-grid{display:grid;grid-template-columns:minmax(0,1fr) 210px;gap:40px;margin-top:30px;padding-top:28px;border-top:1px solid var(--divider)}
.hb-docs-toc{position:sticky;top:96px;align-self:start;display:flex;flex-direction:column;gap:2px}
.hb-docs-toc a{display:block;padding:5px 10px;border-radius:7px;font-size:13px;color:var(--ink-5)}
.hb-docs-toc a:hover{color:var(--ink);background:var(--chip)}
@media (max-width: 1100px){
  .hb-docs-grid{grid-template-columns:minmax(0,1fr);gap:0}
  .hb-docs-toc{position:static;order:-1;flex-direction:row;flex-wrap:wrap;gap:6px;margin-bottom:26px}
  .hb-docs-toc a{background:var(--chip);color:var(--ink-3)}
  .hb-docs-toc-title{display:none}
}
.hb-docs-body{max-width:760px;min-width:0}
.hb-docs-body h2{margin:44px 0 12px;font-size:21px;font-weight:600;letter-spacing:-0.02em;color:var(--ink);scroll-margin-top:96px}
.hb-docs-body > h2:first-of-type{margin-top:0}
.hb-docs-body h3{margin:26px 0 8px;font-size:16px;font-weight:600;color:var(--ink);scroll-margin-top:96px}
.hb-docs-body p,.hb-docs-body li{font-size:15px;line-height:1.75;color:var(--ink-3)}
.hb-docs-body p{margin:0 0 12px}
.hb-docs-body ul,.hb-docs-body ol{margin:0 0 14px;padding-left:22px}
.hb-docs-body ul{list-style:disc}
.hb-docs-body ol{list-style:decimal}
.hb-docs-body li{margin:4px 0}
.hb-docs-body strong{color:var(--ink);font-weight:600}
.hb-docs-body a{color:var(--ink);text-decoration:underline;text-underline-offset:3px}
.hb-docs-body :not(pre)>code{font-family:${mono};font-size:12.5px;padding:2px 6px;border-radius:5px;background:var(--chip);color:var(--ink-2);word-break:break-word}
.hb-docs-note{padding:14px 16px;border-radius:12px;background:var(--chip);margin:0 0 18px}
.hb-docs-note p:last-child{margin-bottom:0}
.hb-docs-table{overflow-x:auto;margin:0 0 18px}
.hb-docs-body table{width:100%;border-collapse:collapse;font-size:13.5px;line-height:1.55}
.hb-docs-body th,.hb-docs-body td{text-align:left;vertical-align:top;padding:10px 14px 10px 0;border-bottom:1px solid var(--divider);color:var(--ink-3)}
.hb-docs-body th{color:var(--ink);font-weight:600}
.hb-docs-body td:first-child{white-space:nowrap}
.hb-docs-code{margin:0 0 18px;border-radius:12px;background:var(--well, var(--chip));overflow:hidden}
.hb-docs-code-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px 0 14px}
.hb-docs-copy{height:26px;padding:0 11px;border-radius:13px;background:var(--chip);color:var(--ink-3);font-size:12px;font-weight:500;cursor:pointer}
.hb-docs-copy:hover{color:var(--ink)}
.hb-docs-code pre{margin:0;padding:8px 14px 14px;overflow-x:auto}
.hb-docs-code code{font-family:${mono};font-size:12.5px;line-height:1.7;color:var(--ink-2);white-space:pre}
.hb-docs-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin:0 0 8px}
.hb-docs-card{display:flex;flex-direction:column;gap:6px;padding:16px;border-radius:12px;background:var(--chip);text-decoration:none!important}
.hb-docs-card:hover{background:var(--chip-2)}
.hb-docs-card strong{font-size:15px}
.hb-docs-card span{font-size:13px;line-height:1.55;color:var(--ink-4)}
.hb-docs-prompt{padding:18px;border-radius:14px;background:var(--chip);margin:0 0 12px;scroll-margin-top:96px}
.hb-docs-body .hb-docs-prompt h3{margin:0 0 4px}
.hb-docs-body .hb-docs-prompt p{font-size:14px;line-height:1.6;color:var(--ink-4);margin:0 0 14px}
.hb-docs-prompt-label{display:block;margin:0 0 6px;font-size:12.5px;font-weight:600;color:var(--ink)}
.hb-docs-prompt textarea{display:block;width:100%;margin:0 0 12px;padding:10px 12px;border-radius:10px;border:1px solid var(--divider);background:var(--bg);color:var(--ink);font:inherit;font-size:14px;line-height:1.5;resize:vertical}
.hb-docs-prompt-actions{display:flex;flex-wrap:wrap;align-items:center;gap:12px;font-size:13px;color:var(--ink-5)}
.hb-docs-prompt-copy{height:36px;padding:0 18px;border-radius:18px;background:var(--ink);color:var(--ink-invert);font-size:13.5px;font-weight:600;cursor:pointer}
.hb-docs-prompt details{margin-top:12px}
.hb-docs-prompt summary{cursor:pointer;font-size:13px;color:var(--ink-4)}
.hb-docs-prompt summary:hover{color:var(--ink)}
.hb-docs-prompt pre{margin:10px 0 0;padding:14px;border-radius:10px;background:var(--bg);max-height:420px;overflow:auto;font-family:${mono};font-size:12.5px;line-height:1.65;color:var(--ink-2);white-space:pre-wrap;word-break:break-word}
`;

export type TocItem = { id: string; label: string };

/** Shell for the developer docs: title, tabs between the docs, an "on this page" list, then the text. */
export function DocsPage({ path, title, intro, toc, children }: { path: DocsPath; title: string; intro: string; toc: TocItem[]; children: ReactNode }) {
  return (
    <div style={{ ...bpanel, padding: "clamp(20px, 4vw, 40px)" }}>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <header>
        <div style={{ fontFamily: mono, fontSize: "11px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-5)" }}>Docs</div>
        <h1 style={{ margin: "10px 0 0", fontSize: "clamp(26px, 4.5vw, 36px)", fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.1 }}>{title}</h1>
        <p style={{ margin: "12px 0 0", maxWidth: "68ch", fontSize: "16px", lineHeight: 1.6, color: "var(--ink-4)" }}>{intro}</p>
      </header>
      <nav aria-label="Docs" className="hb-docs-tabs">
        {docsPages.map((p) => (
          <Link key={p.href} href={p.href} className="hb-docs-tab" aria-current={p.href === path ? "page" : undefined}>
            {p.label}
          </Link>
        ))}
      </nav>
      <div className="hb-docs-grid">
        <article className="hb-docs-body">{children}</article>
        <nav aria-label="On this page" className="hb-docs-toc">
          <div className="hb-docs-toc-title" style={{ padding: "0 10px 8px", fontFamily: mono, fontSize: "10.5px", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-5)" }}>
            On this page
          </div>
          {toc.map((t) => (
            <a key={t.id} href={`#${t.id}`}>
              {t.label}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}

export const Note = ({ children }: { children: ReactNode }) => <div className="hb-docs-note">{children}</div>;

export const Table = ({ head, rows }: { head: string[]; rows: ReactNode[][] }) => (
  <div className="hb-docs-table">
    <table>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
