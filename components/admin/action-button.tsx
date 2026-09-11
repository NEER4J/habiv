"use client";

import { useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { chipBtn, dangerBtn, mono, primaryBtn } from "@/lib/habiv/ui";

export type ActionResult = { ok: true } | { ok: false; error: string };
export type ActionMessage = { kind: "ok" | "err"; text: string } | null;

/** Runs an admin server action inside a transition, refreshes the router on success and exposes pending/error state. */
export function useAdminAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionMessage>(null);
  const run = (fn: () => Promise<ActionResult>, okText = "Done") =>
    start(async () => {
      setMsg(null);
      try {
        const r = await fn();
        if (r.ok) {
          setMsg({ kind: "ok", text: okText });
          router.refresh();
        } else setMsg({ kind: "err", text: r.error });
      } catch (e) {
        setMsg({ kind: "err", text: e instanceof Error ? e.message : "Action failed." });
      }
    });
  return { pending, msg, run, clear: () => setMsg(null) };
}

export const smallBtn: CSSProperties = { ...chipBtn, height: "28px", padding: "0 10px", borderRadius: "8px", fontSize: "12px" };
export const smallPrimaryBtn: CSSProperties = { ...primaryBtn, height: "28px", padding: "0 10px", borderRadius: "8px", fontSize: "12px" };
export const smallDangerBtn: CSSProperties = { ...dangerBtn, height: "28px", padding: "0 10px", borderRadius: "8px", fontSize: "12px" };

export function ActionText({ msg }: { msg: ActionMessage }) {
  if (!msg) return null;
  return (
    <span role="status" style={{ fontFamily: mono, fontSize: "11px", color: msg.kind === "ok" ? "var(--pos-ink)" : "var(--danger-ink)", whiteSpace: "nowrap" }}>
      {msg.text}
    </span>
  );
}

type Props = {
  id?: string;
  label: ReactNode;
  /** Receives the prompt answer when `prompt` is set. */
  run: (input?: string) => Promise<ActionResult>;
  okText?: string;
  variant?: "chip" | "primary" | "danger";
  /** window.confirm text before running. */
  confirm?: string;
  /** window.prompt text; cancelling aborts. */
  prompt?: string;
  disabled?: boolean;
  title?: string;
  style?: CSSProperties;
};

/** Self-contained action button: pending state, inline ok/error text, router.refresh() on success. */
export function ActionButton({ id, label, run, okText, variant = "chip", confirm, prompt, disabled, title, style }: Props) {
  const { pending, msg, run: exec } = useAdminAction();
  const base = variant === "primary" ? smallPrimaryBtn : variant === "danger" ? smallDangerBtn : smallBtn;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
      <button
        id={id}
        type="button"
        title={title}
        disabled={disabled || pending}
        style={{ ...base, ...style, opacity: disabled || pending ? 0.55 : 1, cursor: disabled || pending ? "default" : "pointer" }}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          let input: string | undefined;
          if (prompt) {
            const v = window.prompt(prompt);
            if (v === null) return;
            input = v;
          }
          exec(() => run(input), okText);
        }}
      >
        {pending ? "…" : label}
      </button>
      <ActionText msg={msg} />
    </span>
  );
}
