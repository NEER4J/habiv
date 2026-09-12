"use client";

import { useState } from "react";
import { copyText } from "@/components/habiv/docs-code";
import type { PromptFill } from "@/lib/ai-prompts";

/** One copy-paste prompt on /docs/prompts. With `fill`, what the user types goes into the prompt before it's copied. */
export function PromptCard({ id, title, when, text, fill }: { id: string; title: string; when: string; text: string; fill?: PromptFill }) {
  const [value, setValue] = useState("");
  const [copied, setCopied] = useState(false);
  const prompt = fill ? text.replace(fill.token, () => value.trim() || fill.blank) : text;
  const copy = () =>
    void copyText(prompt).then((ok) => {
      if (!ok) return;
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    });

  return (
    <section id={id} className="hb-docs-prompt">
      <h3>{title}</h3>
      <p>{when}</p>
      {fill && (
        <label>
          <span className="hb-docs-prompt-label">{fill.label}</span>
          <textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder={fill.placeholder} rows={3} />
        </label>
      )}
      <div className="hb-docs-prompt-actions">
        <button type="button" onClick={copy} className="hb-docs-prompt-copy">
          {copied ? "Copied" : "Copy prompt"}
        </button>
        <span>Then paste it into your AI</span>
      </div>
      <details>
        <summary>Show the full prompt</summary>
        <pre>{prompt}</pre>
      </details>
    </section>
  );
}
