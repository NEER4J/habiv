"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { checkHandle, setHandle as setHandleAction } from "@/lib/actions/handles";
import { createClient } from "@/lib/supabase/client";
import { handleReasonMessage, normalizeHandle, validateHandle, HANDLE_MAX } from "@/lib/handles";
import { chipBtn, handleInputStyle, modalScrimStyle, modalSmStyleFor, mono, primaryBtn, stepStyle } from "@/lib/habiv/ui";
import { avatarSeedOf, isAvatarPhoto } from "@/lib/site";
import { Avatar } from "./avatar";
import { useShell } from "./shell-context";

const steps = ["Username", "Avatar"];

type HandleState = { ok: boolean; label: string; checking?: boolean };

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

/** Suggestion chips derived from what the user typed; every one passes validateHandle. */
function suggestionsFor(raw: string): string[] {
  let base = normalizeHandle(raw || "player").replace(/_+$/, "");
  if (!/^[a-z]/.test(base)) base = `p${base}`;
  if (base.length < 2) base = "player";
  const fit = (prefix: string, suffix: string) => `${prefix}${base.slice(0, HANDLE_MAX - prefix.length - suffix.length)}${suffix}`;
  const out = [fit("", "_gg"), fit("", "_hv"), fit("quick_", "")];
  return Array.from(new Set(out)).filter((h) => validateHandle(h).ok);
}

/**
 * Profile setup popup: pick a username, then an avatar. Sign-in and the proxy send anyone without
 * a handle to a page with ?welcome=1 (lib/auth/protected.ts); useShell().openWelcome("avatar")
 * opens just the avatar step.
 */
export function WelcomeModal() {
  const { modal, sessionReady, signedIn, closeModal } = useShell();
  const open = modal === "welcome";

  // Guests have no profile to set up: drop a stale ?welcome link.
  useEffect(() => {
    if (open && sessionReady && !signedIn) closeModal();
  }, [open, sessionReady, signedIn, closeModal]);

  if (!open || !sessionReady || !signedIn) return null;
  return <WelcomeFlow />;
}

function WelcomeFlow() {
  const router = useRouter();
  const { closeModal, light, mobile, profile, setProfile, avatarSeed, setAvatarSeed, showToast, welcomeIntent } = useShell();
  const { next } = welcomeIntent;
  const avatarOnly = welcomeIntent.step === "avatar";
  // An old ?welcome link opened after the handle was set (in another tab, say): nothing to do.
  const [stale] = useState(() => !avatarOnly && profile.handleSet);
  const [step, setStep] = useState(avatarOnly ? 1 : 0);
  const [handle, setHandle] = useState(() => (avatarOnly ? profile.handle : normalizeHandle(welcomeIntent.suggest)));
  const [handleState, setHandleState] = useState<HandleState>({ ok: false, label: "Pick a username" });
  const [saving, setSaving] = useState(false);
  // Only an uploaded photo lives here; a picked generated face is avatarSeed.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(isAvatarPhoto(profile.avatarUrl) ? profile.avatarUrl : null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!stale) return;
    closeModal();
    if (next) window.location.assign(next);
  }, [stale, closeModal, next]);

  // GitHub sign-ins start from their GitHub username. Sign-ins that stay on the page carry no
  // ?suggest, so read it from the session (a local cookie read, no request).
  useEffect(() => {
    if (avatarOnly || welcomeIntent.suggest) return;
    let live = true;
    void createClient()
      .auth.getSession()
      .then(({ data }) => {
        const user = data.session?.user;
        const name = user?.app_metadata?.provider === "github" ? (user.user_metadata?.user_name ?? user.user_metadata?.preferred_username) : null;
        if (live && typeof name === "string" && name) setHandle((h) => h || normalizeHandle(name));
      });
    return () => {
      live = false;
    };
  }, [avatarOnly, welcomeIntent.suggest]);

  const isCurrent = !!profile.handle && handle === profile.handle && profile.handleSet;

  // Local rules first, then a debounced availability check.
  useEffect(() => {
    if (isCurrent) {
      setHandleState({ ok: true, label: "Your username" });
      return;
    }
    if (!handle) {
      setHandleState({ ok: false, label: "Pick a username" });
      return;
    }
    const v = validateHandle(handle);
    if (!v.ok) {
      setHandleState({ ok: false, label: handleReasonMessage(v.reason) });
      return;
    }
    setHandleState({ ok: false, label: "Checking…", checking: true });
    let cancelled = false;
    const t = setTimeout(() => {
      void checkHandle(handle).then((res) => {
        if (cancelled) return;
        setHandleState(res.available ? { ok: true, label: "Available" } : { ok: false, label: res.reason ?? "Taken" });
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [handle, isCurrent]);

  if (stale) return null;

  const preview = handle || "player";

  const face = (size: number, seed: string) => (
    <div style={{ flex: "none" }}>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatar URLs come from Supabase storage
        <img src={avatarUrl} alt="" style={{ display: "block", width: `${size}px`, height: `${size}px`, borderRadius: `${Math.round(size * 0.3)}px`, objectFit: "cover", background: "var(--chip)" }} />
      ) : (
        <Avatar seed={seed} size={size} />
      )}
    </div>
  );

  // Pages rendered before the handle was saved (creator links that bounced here) are stale now.
  const dismiss = () => {
    closeModal();
    if (!avatarOnly && profile.handleSet) router.refresh();
  };

  const continueToAvatar = async () => {
    if (!handleState.ok || saving) return;
    if (isCurrent) {
      setStep(1);
      return;
    }
    setSaving(true);
    const res = await setHandleAction(handle);
    setSaving(false);
    if (!res.ok) {
      setHandleState({ ok: false, label: res.error });
      showToast(res.error);
      return;
    }
    setHandle(res.handle);
    setProfile({ ...profile, handle: res.handle, handleSet: true });
    setAvatarSeed(avatarSeedOf(profile.avatarUrl) ?? res.handle);
    setStep(1);
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
    showToast("Photo uploaded");
  };

  const revertToGenerated = async () => {
    if (!avatarUrl) return;
    setUploading(true);
    const res = await fetch("/api/avatar", { method: "DELETE" }).catch(() => null);
    setUploading(false);
    if (!res?.ok) {
      showToast("Could not remove the photo.");
      return;
    }
    setAvatarUrl(null);
    setProfile({ ...profile, avatarUrl: null });
    showToast("Using a generated avatar");
  };

  const finish = async () => {
    if (uploading) return;
    // A generated face is saved as the profile's avatar so it shows everywhere, not just here.
    if (!avatarUrl) {
      setUploading(true);
      const res = await fetch("/api/avatar", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seed: avatarSeed }),
      }).catch(() => null);
      const json = (await res?.json().catch(() => null)) as { ok?: boolean; avatarUrl?: string; error?: string } | null;
      setUploading(false);
      if (!res?.ok || !json?.ok || !json.avatarUrl) {
        showToast(json?.error ?? "Could not save your avatar.");
        return;
      }
      setProfile({ ...profile, avatarUrl: json.avatarUrl });
    }
    closeModal();
    showToast(avatarOnly ? "Avatar updated" : `Welcome, @${preview}`);
    // A full load for the creator page that sent them here: the router may hold its pre-handle redirect.
    if (next) window.location.assign(next);
    else router.refresh();
  };

  const titleStyle = { fontSize: "20px", fontWeight: 600, letterSpacing: "-0.02em" } as const;
  const subStyle = { marginTop: "4px", fontSize: "13.5px", lineHeight: 1.5, color: "var(--ink-4)" } as const;

  return (
    <div style={modalScrimStyle}>
      <div onClick={dismiss} style={{ position: "absolute", inset: 0 }} />
      <div role="dialog" aria-modal="true" aria-labelledby="welcome-title" style={{ ...modalSmStyleFor(light), color: "var(--ink)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          {avatarOnly ? (
            <span />
          ) : (
            <div style={{ display: "flex", gap: "6px" }}>
              {steps.map((l, i) => (
                <button
                  key={l}
                  onClick={() => {
                    if (i <= step) setStep(i);
                  }}
                  style={{ ...stepStyle(step === i, i <= step, i < step), padding: "6px 11px", fontSize: "12.5px" }}
                >
                  <span style={{ fontFamily: mono, fontSize: "10.5px" }}>0{i + 1}</span>
                  <span>{l}</span>
                </button>
              ))}
            </div>
          )}
          <button onClick={dismiss} style={chipBtn}>
            {step === 0 ? "Not now" : "Close"}
          </button>
        </div>

        {step === 0 ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "14px", marginTop: "20px" }}>
              {face(56, avatarSeedOf(profile.avatarUrl) ?? preview)}
              <div style={{ minWidth: 0 }}>
                <div id="welcome-title" style={titleStyle}>
                  Choose a username
                </div>
                <div style={subStyle}>This is how you show up on leaderboards and in comments.</div>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginTop: "18px",
                padding: "0 14px",
                height: "52px",
                borderRadius: "12px",
                background: "var(--chip)",
              }}
            >
              <span style={{ fontFamily: mono, fontSize: "16px", color: "var(--ink-5)" }}>@</span>
              <input
                autoFocus
                className="hb-input"
                aria-label="Username"
                value={handle}
                onChange={(e) => setHandle(normalizeHandle(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void continueToAvatar();
                }}
                placeholder="yourname"
                style={handleInputStyle}
              />
              <span
                style={{
                  fontFamily: mono,
                  fontSize: "11px",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: handleState.ok ? "var(--pos-ink)" : handleState.checking || !handle ? "var(--ink-5)" : "oklch(0.62 0.16 25)",
                  textAlign: "right",
                }}
              >
                {handleState.label}
              </span>
            </div>
            <div style={{ marginTop: "8px", fontSize: "12.5px", color: "var(--ink-5)" }}>
              Lowercase letters, numbers and underscores, starting with a letter.
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "14px", flexWrap: "wrap" }}>
              {suggestionsFor(handle).map((h) => (
                <button
                  key={h}
                  onClick={() => setHandle(h)}
                  style={{ height: "32px", padding: "0 12px", borderRadius: "9px", background: "var(--chip)", color: "var(--ink-3)", fontSize: "12.5px", cursor: "pointer" }}
                >
                  @{h}
                </button>
              ))}
            </div>
            <button
              onClick={() => void continueToAvatar()}
              disabled={!handleState.ok || saving}
              style={{ ...primaryBtn, width: "100%", height: "44px", marginTop: "20px", ...(handleState.ok && !saving ? null : { opacity: 0.45, cursor: "not-allowed" }) }}
            >
              {saving ? "Saving…" : "Continue"}
            </button>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "14px", marginTop: "20px" }}>
              {face(72, avatarSeed)}
              <div style={{ minWidth: 0 }}>
                <div id="welcome-title" style={titleStyle}>
                  Choose your avatar
                </div>
                <div style={subStyle}>
                  <span style={{ fontWeight: 600, color: "var(--ink-2)" }}>@{preview}</span> · pick a face, shuffle for more, or upload a photo.
                </div>
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${mobile ? 4 : 6}, minmax(0, 1fr))`,
                gap: "8px",
                marginTop: "18px",
                opacity: avatarUrl ? 0.45 : 1,
                transition: "opacity 160ms ease",
              }}
            >
              {Array.from({ length: 12 }).map((_, i) => {
                const seed = `${preview}-${i}`;
                const on = !avatarUrl && avatarSeed === seed;
                return (
                  <button
                    key={seed}
                    onClick={() => {
                      if (avatarUrl) {
                        void revertToGenerated().then(() => setAvatarSeed(seed));
                        return;
                      }
                      setAvatarSeed(seed);
                    }}
                    aria-label={`Avatar option ${i + 1}`}
                    aria-pressed={on}
                    className="hb-lift-sm"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "6px",
                      borderRadius: "14px",
                      cursor: "pointer",
                      background: on ? "var(--chip-2)" : "var(--chip)",
                      border: on ? "1px solid var(--ink-5)" : "1px solid transparent",
                    }}
                  >
                    <Avatar seed={seed} size={48} />
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
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
              <button onClick={() => fileRef.current?.click()} disabled={uploading} style={uploading ? { ...chipBtn, opacity: 0.6, cursor: "wait" } : chipBtn}>
                {uploading ? "Working…" : "Upload a photo"}
              </button>
              {avatarUrl ? (
                <button onClick={() => void revertToGenerated()} disabled={uploading} style={chipBtn}>
                  Use generated
                </button>
              ) : (
                <button onClick={() => setAvatarSeed(`hv-${Math.floor(Math.random() * 1e9).toString(36)}`)} style={chipBtn}>
                  Shuffle
                </button>
              )}
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "20px" }}>
              {!avatarOnly ? (
                <button onClick={() => setStep(0)} style={{ ...chipBtn, height: "44px" }}>
                  Back
                </button>
              ) : null}
              <button onClick={() => void finish()} disabled={uploading} style={{ ...primaryBtn, flex: 1, height: "44px", ...(uploading ? { opacity: 0.45 } : null) }}>
                {avatarUrl ? "Use this photo" : "Use this avatar"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
