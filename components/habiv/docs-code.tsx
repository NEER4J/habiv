"use client";

import { useState } from "react";
import { mono } from "@/lib/habiv/ui";

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** A copyable code block for the docs. `label` names the language or the app the snippet is for; `wrap` suits prose. */
export function CodeBlock({ code, label, wrap }: { code: string; label?: string; wrap?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    void copyText(code).then((ok) => {
      if (!ok) return;
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    });

  return (
    <div className="hb-docs-code">
      <div className="hb-docs-code-bar">
        <span style={{ fontFamily: mono, fontSize: "10.5px", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-5)" }}>{label ?? ""}</span>
        <button type="button" onClick={copy} className="hb-docs-copy">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>
        <code style={wrap ? { whiteSpace: "pre-wrap", wordBreak: "break-word" } : undefined}>{code}</code>
      </pre>
    </div>
  );
}
