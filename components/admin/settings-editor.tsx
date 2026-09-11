"use client";

import { useState, type CSSProperties } from "react";
import { setSiteSetting } from "@/lib/actions/admin";
import { ActionText, smallPrimaryBtn, useAdminAction } from "@/components/admin/action-button";
import { bpanel, fieldLabelStyle, fieldStyle, mono, monoLabel } from "@/lib/habiv/ui";

const KNOWN = ["announcement", "hero_game_id"];
const KEY_RE = /^[a-z][a-z0-9_.]{1,60}$/;

const textarea: CSSProperties = { ...fieldStyle, height: "auto", minHeight: "88px", padding: "10px 14px", fontFamily: mono, fontSize: "12.5px", resize: "vertical" };

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function AnnouncementField({ value }: { value: unknown }) {
  const { pending, msg, run } = useAdminAction();
  const obj = asObj(value);
  const [text, setText] = useState(typeof obj.text === "string" ? obj.text : "");
  const [url, setUrl] = useState(typeof obj.url === "string" ? obj.url : "");
  return (
    <section style={{ ...bpanel, padding: "18px" }}>
      <div style={monoLabel}>announcement</div>
      <p style={{ margin: "6px 0 0", fontSize: "12.5px", color: "var(--ink-5)" }}>Site-wide banner. Leave text empty to hide it.</p>
      <label htmlFor="ann-text" style={fieldLabelStyle}>Text</label>
      <input id="ann-text" value={text} disabled={pending} onChange={(e) => setText(e.target.value)} style={fieldStyle} maxLength={200} />
      <label htmlFor="ann-url" style={fieldLabelStyle}>URL (optional)</label>
      <input id="ann-url" value={url} disabled={pending} onChange={(e) => setUrl(e.target.value)} style={fieldStyle} placeholder="/explore or https://…" />
      <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "14px" }}>
        <button id="ann-save" type="button" disabled={pending} style={smallPrimaryBtn} onClick={() => run(() => setSiteSetting("announcement", { text: text.trim(), url: url.trim() || null }), "Saved")}>{pending ? "…" : "Save"}</button>
        <ActionText msg={msg} />
      </div>
    </section>
  );
}

function HeroGameField({ value }: { value: unknown }) {
  const { pending, msg, run } = useAdminAction();
  const [id, setId] = useState(typeof value === "string" ? value : "");
  return (
    <section style={{ ...bpanel, padding: "18px" }}>
      <div style={monoLabel}>hero_game_id</div>
      <p style={{ margin: "6px 0 0", fontSize: "12.5px", color: "var(--ink-5)" }}>Game id pinned to the home hero. Empty falls back to featured games.</p>
      <label htmlFor="hero-game-id" style={fieldLabelStyle}>Game id</label>
      <input id="hero-game-id" value={id} disabled={pending} onChange={(e) => setId(e.target.value)} style={{ ...fieldStyle, fontFamily: mono }} placeholder="uuid" />
      <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "14px" }}>
        <button id="hero-save" type="button" disabled={pending} style={smallPrimaryBtn} onClick={() => run(() => setSiteSetting("hero_game_id", id.trim() || null), "Saved")}>{pending ? "…" : "Save"}</button>
        <ActionText msg={msg} />
      </div>
    </section>
  );
}

function JsonField({ k, value }: { k: string; value: unknown }) {
  const { pending, msg, run } = useAdminAction();
  const initial = JSON.stringify(value ?? null, null, 2);
  const [text, setText] = useState(initial);
  const [parseErr, setParseErr] = useState<string | null>(null);
  return (
    <div style={{ paddingTop: "14px", borderTop: "1px solid var(--divider)" }}>
      <label htmlFor={`setting-${k}`} style={{ ...monoLabel, display: "block", marginBottom: "6px" }}>{k}</label>
      <textarea id={`setting-${k}`} value={text} disabled={pending} spellCheck={false} onChange={(e) => { setText(e.target.value); setParseErr(null); }} style={textarea} />
      <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "8px" }}>
        <button
          id={`setting-save-${k}`}
          type="button"
          disabled={pending || text === initial}
          style={{ ...smallPrimaryBtn, opacity: pending || text === initial ? 0.45 : 1 }}
          onClick={() => {
            let parsed: unknown;
            try { parsed = JSON.parse(text); } catch (e) { setParseErr(e instanceof Error ? e.message : "Invalid JSON"); return; }
            run(() => setSiteSetting(k, parsed), "Saved");
          }}
        >
          {pending ? "…" : "Save"}
        </button>
        {parseErr ? <ActionText msg={{ kind: "err", text: parseErr }} /> : <ActionText msg={msg} />}
      </div>
    </div>
  );
}

function AddSetting() {
  const { pending, msg, run } = useAdminAction();
  const [k, setK] = useState("");
  const [text, setText] = useState("");
  const [parseErr, setParseErr] = useState<string | null>(null);
  const keyOk = KEY_RE.test(k);
  return (
    <form
      style={{ paddingTop: "14px", borderTop: "1px solid var(--divider)" }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!keyOk) return;
        let parsed: unknown;
        try { parsed = JSON.parse(text); } catch (err) { setParseErr(err instanceof Error ? err.message : "Invalid JSON"); return; }
        run(async () => { const r = await setSiteSetting(k, parsed); if (r.ok) { setK(""); setText(""); } return r; }, "Added");
      }}
    >
      <div style={monoLabel}>New key</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "8px" }}>
        <input id="new-setting-key" value={k} disabled={pending} placeholder="key_name" pattern="^[a-z][a-z0-9_.]{1,60}$" required onChange={(e) => setK(e.target.value)} style={{ ...fieldStyle, height: "34px", width: "200px", fontFamily: mono, fontSize: "12.5px" }} />
        <textarea id="new-setting-value" value={text} disabled={pending} placeholder='JSON value, e.g. {"enabled": true}' spellCheck={false} onChange={(e) => { setText(e.target.value); setParseErr(null); }} style={{ ...textarea, minHeight: "34px", flex: "1 1 240px" }} />
      </div>
      <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "8px" }}>
        <button id="new-setting-submit" type="submit" disabled={pending || !keyOk || !text.trim()} style={{ ...smallPrimaryBtn, opacity: pending || !keyOk || !text.trim() ? 0.45 : 1 }}>{pending ? "…" : "Add"}</button>
        {parseErr ? <ActionText msg={{ kind: "err", text: parseErr }} /> : <ActionText msg={msg} />}
      </div>
    </form>
  );
}

export function SettingsEditor({ settings }: { settings: Record<string, unknown> }) {
  const other = Object.keys(settings).filter((k) => !KNOWN.includes(k)).sort();
  return (
    <div style={{ display: "grid", gap: "14px", maxWidth: "720px" }}>
      <AnnouncementField value={settings.announcement} />
      <HeroGameField value={settings.hero_game_id} />
      <section style={{ ...bpanel, padding: "18px", display: "grid", gap: "14px" }}>
        <div>
          <div style={monoLabel}>All settings (raw JSON)</div>
          <p style={{ margin: "6px 0 0", fontSize: "12.5px", color: "var(--ink-5)" }}>{other.length === 0 ? "No other keys stored." : `${other.length} other key${other.length === 1 ? "" : "s"}.`}</p>
        </div>
        {other.map((k) => <JsonField key={k} k={k} value={settings[k]} />)}
        <AddSetting />
      </section>
    </div>
  );
}
