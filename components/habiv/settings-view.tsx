"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { checkHandle } from "@/lib/actions/handles";
import { renameHandle, updateProfile } from "@/lib/actions/profile";
import { createToken, revokeToken } from "@/lib/actions/tokens";
import type { ApiTokenSummary } from "@/lib/db/tokens";
import { normalizeHandle, validateHandle, handleReasonMessage } from "@/lib/handles";
import { relativeTime } from "@/lib/habiv/games";
import type { SettingsData } from "@/lib/habiv/page-data";
import {
  bpanel,
  chipBtn,
  chipStyle,
  dangerBtn,
  fieldLabelStyle,
  fieldStyle,
  handleInputStyle,
  mono,
  pill,
  primaryBtn,
} from "@/lib/habiv/ui";
import { connectPrompt, connectSteps, manualSetup, mcpUrl } from "@/lib/connect-ai";
import { createClient } from "@/lib/supabase/client";
import { UserAvatar } from "./avatar";
import { BentoAutoGrid, PageHead } from "./game-card";
import { useShell } from "./shell-context";

const tabs = ["Account", "Connect AI", "Playback", "Safety"] as const;
type Tab = (typeof tabs)[number];

const tabKeys: Record<Tab, string> = { Account: "account", "Connect AI": "api", Playback: "playback", Safety: "safety" };

function tabFromKey(key: string | undefined): Tab {
  const found = tabs.find((t) => tabKeys[t] === key);
  return found ?? "Account";
}

const BIO_MAX = 160;
const PREFS_KEY = "habiv-prefs";

const toggleDefs = [
  { key: "autoplay", label: "Autoplay the next game", note: "Starts the top of your queue when a run ends." },
  { key: "sound", label: "Sound on by default", note: "Games still never autoplay audio before you press play." },
  { key: "reduced", label: "Reduce motion", note: "Cross-fades instead of transitions and parallax." },
  { key: "mature", label: "Show mature games", note: "Off hides anything flagged by moderation." },
  { key: "data", label: "Data saver", note: "Loads lower resolution covers on slow networks." },
] as const;

const defaultPrefs: Record<string, boolean> = { autoplay: false, sound: false, reduced: false, mature: false, data: true };

const safetyItems = [
  { label: "Sandboxed iframe, separate origin", value: "enforced" },
  { label: "No network access from games", value: "enforced" },
  { label: "Downloads, popups, top navigation", value: "blocked" },
  { label: "Every publish stored as a version", value: "rollback" },
];

const panel: CSSProperties = { ...bpanel, gridColumn: "1 / -1", borderRadius: "14px", padding: "22px" };

const errInk = "oklch(0.62 0.16 25)";

const codeWell: CSSProperties = {
  marginTop: "16px",
  padding: "14px 16px",
  borderRadius: "10px",
  background: "var(--well)",
  fontFamily: mono,
  fontSize: "12px",
  lineHeight: 1.7,
  color: "var(--ink-3)",
  overflowX: "auto",
  whiteSpace: "pre",
};

/** Centre-crops and resizes an image to 256×256 (webp, png fallback) on a canvas. */
async function resizeAvatar(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Could not read that image."));
      i.src = url;
    });
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process the image.");
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
    const toBlob = (type: string, quality?: number) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, quality));
    let blob = await toBlob("image/webp", 0.86);
    if (!blob || blob.type !== "image/webp") blob = await toBlob("image/png");
    if (!blob) throw new Error("Could not process the image.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function uploadAvatar(file: File): Promise<{ ok: true; avatarUrl: string } | { ok: false; error: string }> {
  try {
    const blob = await resizeAvatar(file);
    const form = new FormData();
    form.append("file", blob, blob.type === "image/png" ? "avatar.png" : "avatar.webp");
    const res = await fetch("/api/avatar", { method: "POST", body: form });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; avatarUrl?: string; error?: string } | null;
    if (!res.ok || !json?.ok || !json.avatarUrl) return { ok: false, error: json?.error ?? "Could not upload the avatar." };
    return { ok: true, avatarUrl: json.avatarUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not upload the avatar." };
  }
}

function copyText(text: string) {
  return navigator.clipboard.writeText(text);
}

function AccountPanel({ data }: { data: SettingsData }) {
  const router = useRouter();
  const { profile, setProfile, showToast } = useShell();
  const own = data.profile;

  // Baseline the form compares against; updated after a successful save.
  const [saved, setSaved] = useState({
    name: own.displayName,
    handle: own.handle,
    bio: own.bio ?? "",
    pronouns: own.pronouns ?? "",
  });
  const [name, setName] = useState(saved.name);
  const [handle, setHandle] = useState(saved.handle);
  const [bio, setBio] = useState(saved.bio);
  const [pronouns, setPronouns] = useState(saved.pronouns);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(own.avatarUrl);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [handleCheck, setHandleCheck] = useState<{ ok: boolean; label: string }>({ ok: true, label: "Current handle" });
  const fileRef = useRef<HTMLInputElement>(null);

  // Local validation first, then a debounced availability check for a changed handle.
  useEffect(() => {
    if (handle === saved.handle) {
      setHandleCheck({ ok: true, label: "Current handle" });
      return;
    }
    if (!handle) {
      setHandleCheck({ ok: false, label: "Handle required" });
      return;
    }
    const v = validateHandle(handle);
    if (!v.ok) {
      setHandleCheck({ ok: false, label: handleReasonMessage(v.reason) });
      return;
    }
    setHandleCheck({ ok: false, label: "Checking…" });
    let cancelled = false;
    const t = setTimeout(() => {
      void checkHandle(handle).then((res) => {
        if (cancelled) return;
        setHandleCheck(res.available ? { ok: true, label: "Available" } : { ok: false, label: res.reason ?? "Unavailable" });
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [handle, saved.handle]);

  const dirty = name !== saved.name || handle !== saved.handle || bio !== saved.bio || pronouns !== saved.pronouns;
  const canSave = dirty && handleCheck.ok && name.trim().length > 0 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const fieldsChanged = name !== saved.name || bio !== saved.bio || pronouns !== saved.pronouns;
      if (fieldsChanged) {
        const res = await updateProfile({ displayName: name.trim(), bio: bio.trim() || null, pronouns: pronouns.trim() || null });
        if (!res.ok) {
          showToast(res.error);
          return;
        }
      }
      let nextHandle = saved.handle;
      if (handle !== saved.handle) {
        const res = await renameHandle(handle);
        if (!res.ok) {
          setHandleCheck({ ok: false, label: res.error });
          showToast(res.error);
          // Keep the other field edits if they went through.
          if (fieldsChanged) setSaved((s) => ({ ...s, name: name.trim(), bio: bio.trim(), pronouns: pronouns.trim() }));
          return;
        }
        nextHandle = res.handle;
      }
      const next = { name: name.trim(), handle: nextHandle, bio: bio.trim(), pronouns: pronouns.trim() };
      setSaved(next);
      setName(next.name);
      setBio(next.bio);
      setPronouns(next.pronouns);
      setHandle(next.handle);
      setProfile({ ...profile, name: next.name, handle: next.handle, bio: next.bio, handleSet: true });
      showToast("Profile updated");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    const res = await uploadAvatar(file);
    setUploading(false);
    if (!res.ok) {
      showToast(res.error);
      return;
    }
    setAvatarUrl(res.avatarUrl);
    setProfile({ ...profile, avatarUrl: res.avatarUrl });
    showToast("Avatar updated");
    router.refresh();
  };

  const signOut = async () => {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <div style={panel}>
      <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
        <UserAvatar url={avatarUrl} seed={saved.handle} size={64} radius="19px" />
        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <div style={{ fontSize: "16px", fontWeight: 600 }}>{saved.name}</div>
          <div style={{ marginTop: "4px", fontFamily: mono, fontSize: "11.5px", color: "var(--ink-5)" }}>
            @{saved.handle} · signed in with {data.provider ?? "email"}
            {data.email ? ` · ${data.email}` : ""}
          </div>
        </div>
        {own.isAdmin ? (
          <Link href="/admin" style={chipBtn}>
            Admin panel
          </Link>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            void onPickFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <Link href="/onboarding?step=avatar&next=/settings" style={chipBtn}>
          Choose avatar
        </Link>
        <button onClick={() => fileRef.current?.click()} disabled={uploading} style={uploading ? { ...chipBtn, opacity: 0.6, cursor: "wait" } : chipBtn}>
          {uploading ? "Uploading…" : "Upload photo"}
        </button>
      </div>

      <div style={fieldLabelStyle}>Display name</div>
      <input className="hb-input" value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} placeholder="Your name" style={fieldStyle} />

      <div style={fieldLabelStyle}>Handle</div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "0 14px", height: "44px", borderRadius: "9px", background: "var(--chip)" }}>
        <span style={{ fontFamily: mono, fontSize: "14px", color: "var(--ink-5)" }}>@</span>
        <input
          className="hb-input"
          value={handle}
          onChange={(e) => setHandle(normalizeHandle(e.target.value))}
          placeholder="handle"
          style={{ ...handleInputStyle, fontSize: "15px" }}
        />
        <span
          style={{
            fontFamily: mono,
            fontSize: "10.5px",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: handleCheck.ok ? "var(--pos-ink)" : handleCheck.label === "Checking…" ? "var(--ink-5)" : errInk,
            textAlign: "right",
          }}
        >
          {handleCheck.label}
        </span>
      </div>
      <div style={{ marginTop: "8px", fontFamily: mono, fontSize: "10.5px", color: "var(--ink-6)" }}>
        You can change your handle once every 30 days. Old links keep working for 90 days.
      </div>

      <div style={fieldLabelStyle}>Pronouns</div>
      <input className="hb-input" value={pronouns} onChange={(e) => setPronouns(e.target.value.slice(0, 24))} placeholder="Optional" style={fieldStyle} />

      <div style={fieldLabelStyle}>Bio</div>
      <input
        className="hb-input"
        value={bio}
        onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
        placeholder="One or two lines about what you build"
        style={fieldStyle}
      />
      <div style={{ marginTop: "8px", display: "flex", justifyContent: "flex-end", fontFamily: mono, fontSize: "10.5px", color: "var(--ink-6)" }}>
        {bio.length} / {BIO_MAX}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "18px", flexWrap: "wrap" }}>
        <button onClick={() => void save()} disabled={!canSave} style={canSave ? primaryBtn : { ...pill(), color: "var(--ink-5)", cursor: "not-allowed" }}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        {dirty ? (
          <button
            onClick={() => {
              setName(saved.name);
              setHandle(saved.handle);
              setBio(saved.bio);
              setPronouns(saved.pronouns);
            }}
            style={chipBtn}
          >
            Discard
          </button>
        ) : null}
        <div style={{ flex: 1 }} />
        <button onClick={() => void signOut()} style={chipBtn}>
          Sign out
        </button>
      </div>
    </div>
  );
}

function CopyBlock({ text, label }: { text: string; label: string }) {
  const { showToast } = useShell();
  return (
    <div style={{ position: "relative" }}>
      <div style={{ ...codeWell, marginTop: "8px", paddingRight: "72px" }}>{text}</div>
      <button
        onClick={() => void copyText(text).then(() => showToast(`${label} copied`))}
        style={{ ...chipBtn, position: "absolute", top: "16px", right: "8px", height: "28px", padding: "0 11px", fontSize: "12px" }}
      >
        Copy
      </button>
    </div>
  );
}

function ApiPanel({ initialTokens }: { initialTokens: ApiTokenSummary[] }) {
  const { showToast } = useShell();
  const [tokens, setTokens] = useState(() => initialTokens.filter((t) => !t.revokedAt));
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [reveal, setReveal] = useState<{ name: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const create = async () => {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    const res = await createToken(name);
    setCreating(false);
    if (!res.ok) {
      showToast(res.error);
      return;
    }
    setTokens((x) => [{ id: res.id, name: res.name, prefix: res.prefix, scopes: ["publish"], lastUsedAt: null, revokedAt: null, createdAt: res.createdAt }, ...x]);
    setReveal({ name: res.name, token: res.token });
    setNaming(false);
    setNewName("");
  };

  const revoke = async (t: ApiTokenSummary) => {
    if (!window.confirm(`Revoke "${t.name}"? Anything using it will stop publishing.`)) return;
    const res = await revokeToken(t.id);
    if (!res.ok) {
      showToast(res.error);
      return;
    }
    setTokens((x) => x.filter((y) => y.id !== t.id));
    showToast("Token revoked");
  };

  const copyPrompt = () =>
    void copyText(connectPrompt).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });

  return (
    <div style={panel}>
      <div style={{ fontSize: "16px", fontWeight: 600 }}>Connect your AI to Habiv</div>
      <div style={{ marginTop: "8px", fontSize: "14px", lineHeight: 1.6, color: "var(--ink-4)", maxWidth: "64ch" }}>
        Copy the message below and paste it into Claude Code or Codex. It sets everything up for you. Once it&apos;s connected, just ask
        it to &ldquo;publish this game to Habiv&rdquo; and it goes straight to your profile.
      </div>

      <ol style={{ display: "flex", gap: "8px", flexWrap: "wrap", margin: "16px 0 0", padding: 0, listStyle: "none" }}>
        {connectSteps.map((s, i) => (
          <li key={s} style={{ ...chipStyle, display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
            <span style={{ fontFamily: mono, fontSize: "11px", color: "var(--ink-5)" }}>{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>

      <div style={{ ...codeWell, whiteSpace: "pre-wrap", maxHeight: "240px", overflowY: "auto" }}>{connectPrompt}</div>
      <button onClick={copyPrompt} style={{ ...primaryBtn, marginTop: "12px" }}>
        {copied ? "Copied" : "Copy message"}
      </button>

      <div style={{ marginTop: "22px", fontSize: "14px", lineHeight: 1.6, color: "var(--ink-4)", maxWidth: "64ch" }}>
        <span style={{ fontWeight: 600, color: "var(--ink)" }}>Using the Claude app on the web or desktop?</span> Open Settings → Connectors → Add custom
        connector, name it Habiv and paste this link:
      </div>
      <CopyBlock text={mcpUrl} label="Link" />

      <details style={{ marginTop: "18px" }}>
        <summary style={{ cursor: "pointer", fontSize: "13px", color: "var(--ink-4)" }}>Prefer to set it up yourself?</summary>
        {manualSetup.map((m) => (
          <div key={m.label} style={{ marginTop: "14px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600 }}>{m.label}</div>
            <CopyBlock text={m.text} label={m.label} />
          </div>
        ))}
      </details>

      {reveal ? (
        <div style={{ marginTop: "18px", padding: "14px 16px", borderRadius: "10px", background: "var(--pos-bg)", color: "var(--pos-ink)" }}>
          <div style={{ fontSize: "14px", fontWeight: 600 }}>Token for {reveal.name}</div>
          <div style={{ marginTop: "6px", fontSize: "12.5px", lineHeight: 1.5 }}>
            Copy it now. This is the only time the full token is shown.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
            <code style={{ flex: "1 1 240px", minWidth: 0, fontFamily: mono, fontSize: "12px", wordBreak: "break-all", color: "var(--ink)" }}>{reveal.token}</code>
            <button onClick={() => void copyText(reveal.token).then(() => showToast("Token copied"))} style={{ ...primaryBtn, height: "32px", padding: "0 13px", fontSize: "12.5px" }}>
              Copy token
            </button>
            <button onClick={() => setReveal(null)} style={{ ...chipBtn, height: "32px", padding: "0 13px", fontSize: "12.5px" }}>
              Done
            </button>
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: "22px", fontFamily: mono, fontSize: "10.5px", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-5)" }}>
        Connected apps and tokens
      </div>
      <div style={{ marginTop: "8px", fontSize: "13px", lineHeight: 1.55, color: "var(--ink-5)", maxWidth: "64ch" }}>
        Every app you approve shows up here. Revoke one to disconnect it. You only need to create a token for scripts or CI.
      </div>
      <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
        {tokens.length === 0 ? (
          <div style={{ padding: "12px 14px", borderRadius: "10px", background: "var(--chip)", fontSize: "13px", color: "var(--ink-5)" }}>
            Nothing connected yet.
          </div>
        ) : null}
        {tokens.map((t) => (
          <div
            key={t.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
              padding: "12px 14px",
              borderRadius: "10px",
              background: "var(--chip)",
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: "1 1 180px", minWidth: 0 }}>
              <div style={{ fontSize: "14px", fontWeight: 600 }}>{t.name}</div>
              <div style={{ marginTop: "4px", fontFamily: mono, fontSize: "11px", color: "var(--ink-5)" }}>
                hbv_live_{t.prefix}… · last used {t.lastUsedAt ? relativeTime(t.lastUsedAt) : "never"} · created {relativeTime(t.createdAt)}
              </div>
            </div>
            <button onClick={() => void revoke(t)} style={chipBtn}>
              Revoke
            </button>
          </div>
        ))}
      </div>

      {naming ? (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "16px", flexWrap: "wrap" }}>
          <input
            autoFocus
            className="hb-input"
            value={newName}
            onChange={(e) => setNewName(e.target.value.slice(0, 40))}
            onKeyDown={(e) => {
              if (e.key === "Enter") void create();
              if (e.key === "Escape") setNaming(false);
            }}
            placeholder="Token name, e.g. Claude Code — laptop"
            style={{ ...fieldStyle, flex: "1 1 220px", width: "auto" }}
          />
          <button onClick={() => void create()} disabled={!newName.trim() || creating} style={newName.trim() && !creating ? primaryBtn : { ...pill(), color: "var(--ink-5)", cursor: "not-allowed" }}>
            {creating ? "Creating…" : "Create"}
          </button>
          <button onClick={() => setNaming(false)} style={chipBtn}>
            Cancel
          </button>
        </div>
      ) : (
        <button onClick={() => setNaming(true)} style={{ ...primaryBtn, marginTop: "16px" }}>
          Create token
        </button>
      )}
    </div>
  );
}

function PlaybackPanel() {
  const [prefs, setPrefs] = useState<Record<string, boolean>>(defaultPrefs);
  const [loaded, setLoaded] = useState(false);

  // Read after mount so server and first client render agree.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PREFS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const next = { ...defaultPrefs };
        for (const k of Object.keys(next)) if (typeof parsed[k] === "boolean") next[k] = parsed[k] as boolean;
        setPrefs(next);
      }
    } catch {
      // ignore unreadable storage
    }
    setLoaded(true);
  }, []);

  const toggle = (key: string) => {
    setPrefs((p) => {
      const next = { ...p, [key]: !p[key] };
      try {
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        // storage may be unavailable
      }
      return next;
    });
  };

  return (
    <div style={{ ...panel, display: "flex", flexDirection: "column", gap: "4px", opacity: loaded ? 1 : 0.7, transition: "opacity 120ms ease" }}>
      {toggleDefs.map((t) => {
        const on = prefs[t.key];
        return (
          <div key={t.key} style={{ display: "flex", alignItems: "center", gap: "16px", padding: "14px 0", borderBottom: "1px solid var(--divider)" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "14.5px", fontWeight: 600 }}>{t.label}</div>
              <div style={{ marginTop: "4px", fontSize: "13px", color: "var(--ink-5)" }}>{t.note}</div>
            </div>
            <button
              onClick={() => toggle(t.key)}
              aria-pressed={on}
              aria-label={t.label}
              style={{
                width: "44px",
                height: "26px",
                flex: "0 0 auto",
                borderRadius: "13px",
                padding: "3px",
                display: "flex",
                justifyContent: on ? "flex-end" : "flex-start",
                background: on ? "var(--ink)" : "var(--chip-2)",
                cursor: "pointer",
                transition: "background 160ms ease",
              }}
            >
              <span
                style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  background: on ? "var(--ink-invert)" : "var(--ink-5)",
                  transition: "background 160ms ease",
                }}
              />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function SafetyPanel() {
  const { openModal, showToast } = useShell();
  return (
    <div style={panel}>
      <div style={{ fontSize: "16px", fontWeight: 600 }}>Safety and data</div>
      <div style={{ marginTop: "8px", fontSize: "14px", lineHeight: 1.6, color: "var(--ink-4)", maxWidth: "64ch" }}>
        Every game runs in a sandboxed iframe on a separate origin, with no network access, no downloads and no top-window navigation.
      </div>
      <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {safetyItems.map((i) => (
          <div key={i.label} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", borderRadius: "10px", background: "var(--chip)" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--pos)" }} />
            <span style={{ flex: 1, fontSize: "13.5px" }}>{i.label}</span>
            <span style={{ fontFamily: mono, fontSize: "11px", color: "var(--ink-5)" }}>{i.value}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: "8px", marginTop: "18px", flexWrap: "wrap" }}>
        <button onClick={() => openModal("report")} style={chipBtn}>
          Report a game
        </button>
        <button onClick={() => showToast("Data export is coming soon")} style={chipBtn}>
          Download my data
        </button>
        <button
          onClick={() => {
            if (window.confirm("Delete your account? This removes your profile and games.")) showToast("Email support@habiv.com to delete your account");
          }}
          style={dangerBtn}
        >
          Delete account
        </button>
      </div>
    </div>
  );
}

export function SettingsView({ initialTab, data }: { initialTab?: string; data: SettingsData }) {
  const [tab, setTab] = useState<Tab>(() => tabFromKey(initialTab));

  // A link to /settings?tab=… while already here re-renders with a new initialTab.
  useEffect(() => setTab(tabFromKey(initialTab)), [initialTab]);

  // Tabs are client-only: keep the URL shareable without a server round trip per click.
  const pick = (t: Tab) => {
    setTab(t);
    window.history.replaceState(null, "", `/settings?tab=${tabKeys[t]}`);
  };

  return (
    <BentoAutoGrid>
      <PageHead title="Settings" sub="Account, publishing access, playback and safety." auto />
      <div style={{ gridColumn: "1 / -1", display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button key={t} onClick={() => pick(t)} style={chipStyle(tab === t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === "Account" ? <AccountPanel data={data} /> : null}
      {tab === "Connect AI" ? <ApiPanel initialTokens={data.tokens} /> : null}
      {tab === "Playback" ? <PlaybackPanel /> : null}
      {tab === "Safety" ? <SafetyPanel /> : null}
    </BentoAutoGrid>
  );
}
