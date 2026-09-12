"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { checkHandle, setHandle as setHandleAction } from "@/lib/actions/handles";
import { handleReasonMessage, normalizeHandle, validateHandle, HANDLE_MAX } from "@/lib/handles";
import { bpanel, chipBtn, handleInputStyle, mono, primaryBtn, stepStyle } from "@/lib/habiv/ui";
import { avatarSeedOf, isAvatarPhoto } from "@/lib/site";
import { Avatar } from "./avatar";
import { BentoAutoGrid, EmptyCell, PageHead } from "./game-card";
import { useShell } from "./shell-context";

const steps = ["Username", "Avatar", "Ready"];

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

export function OnboardingView({ initialStep, next, suggested }: { initialStep?: string; next: string; suggested: string }) {
  const router = useRouter();
  const { cols, mobile, profile, setProfile, avatarSeed, setAvatarSeed, showToast } = useShell();

  // "Change avatar" links deep-link straight to the avatar step for a user who already has a handle.
  const avatarOnly = initialStep === "avatar";
  const [step, setStep] = useState(avatarOnly ? 1 : 0);
  const [handle, setHandle] = useState(() => (avatarOnly ? profile.handle : normalizeHandle(suggested)));
  const [handleState, setHandleState] = useState<HandleState>({ ok: false, label: "Pick a handle" });
  const [saving, setSaving] = useState(false);
  // Only an uploaded photo lives here; a picked generated face is avatarSeed.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(isAvatarPhoto(profile.avatarUrl) ? profile.avatarUrl : null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // The shell session can land after first render; pick up the real handle and avatar then.
  useEffect(() => {
    if (avatarOnly && !handle && profile.handle) setHandle(profile.handle);
    if (isAvatarPhoto(profile.avatarUrl) && !avatarUrl) setAvatarUrl(profile.avatarUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only sync when the session profile changes
  }, [profile.handle, profile.avatarUrl]);

  const isCurrent = !!profile.handle && handle === profile.handle && profile.handleSet;

  // Local rules first, then a debounced availability check.
  useEffect(() => {
    if (isCurrent) {
      setHandleState({ ok: true, label: "Your handle" });
      return;
    }
    if (!handle) {
      setHandleState({ ok: false, label: "Pick a handle" });
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

  const preview = handle || "player";

  const main: CSSProperties = { ...bpanel, gridColumn: cols <= 6 ? "1 / -1" : `span ${cols === 8 ? 5 : 7}`, padding: "22px" };
  const side: CSSProperties = {
    ...bpanel,
    gridColumn: cols <= 6 ? "1 / -1" : `span ${cols === 8 ? 3 : 5}`,
    padding: "22px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "14px",
  };

  const bigSize = mobile ? 120 : 160;

  const bigAvatar = avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- avatar URLs come from Supabase storage
    <img src={avatarUrl} alt="" style={{ width: `${bigSize}px`, height: `${bigSize}px`, borderRadius: `${Math.round(bigSize * 0.3)}px`, objectFit: "cover", background: "var(--chip)" }} />
  ) : (
    <Avatar seed={avatarSeed} size={bigSize} />
  );

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
    setStep(2);
    showToast(avatarOnly ? "Avatar updated" : "Profile created");
    router.refresh();
  };

  return (
    <BentoAutoGrid>
      <PageHead title="Create your player profile" sub="Takes about twenty seconds. Playing never needs an account." auto>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {steps.map((l, i) => (
            <button
              key={l}
              onClick={() => {
                if (i === 0 || i <= step) setStep(i);
              }}
              style={{ ...stepStyle(step === i, i <= step, i < step), padding: "8px 14px" }}
            >
              <span style={{ fontFamily: mono, fontSize: "11px" }}>0{i + 1}</span>
              <span>{l}</span>
            </button>
          ))}
        </div>
      </PageHead>

      {step === 0 ? (
        <>
          <div style={main}>
            <div style={{ fontSize: "17px", fontWeight: 600 }}>Pick a handle</div>
            <div style={{ marginTop: "6px", fontSize: "13.5px", color: "var(--ink-4)" }}>
              This is how you appear on leaderboards and in comments. Lowercase letters, numbers and underscores, starting with a letter.
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
            <div style={{ marginTop: "16px", fontFamily: mono, fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-5)" }}>
              Suggestions
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
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
            <div style={{ display: "flex", gap: "8px", marginTop: "22px", flexWrap: "wrap" }}>
              <button
                onClick={() => void continueToAvatar()}
                disabled={!handleState.ok || saving}
                style={handleState.ok && !saving ? primaryBtn : { ...primaryBtn, opacity: 0.45, cursor: "not-allowed" }}
              >
                {saving ? "Saving…" : "Continue to avatar"}
              </button>
              <Link href={next} style={chipBtn}>
                Not now
              </Link>
            </div>
          </div>
          <div style={side}>
            {bigAvatar}
            <div style={{ fontSize: "15px", fontWeight: 600 }}>@{preview}</div>
            <div style={{ fontFamily: mono, fontSize: "10.5px", color: "var(--ink-5)" }}>
              {avatarUrl ? "Your uploaded photo" : "Avatar generated from your handle"}
            </div>
          </div>
        </>
      ) : null}

      {step === 1 ? (
        <>
          <div style={main}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: "17px", fontWeight: 600 }}>Choose your avatar</div>
                <div style={{ marginTop: "6px", fontSize: "13.5px", color: "var(--ink-4)" }}>
                  Every avatar is generated from a seed. Pick one, shuffle for a fresh set, or upload a photo.
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
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
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(72px, 1fr))", gap: "8px", width: "100%", marginTop: "18px", opacity: avatarUrl ? 0.45 : 1, transition: "opacity 160ms ease" }}>
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
                    className="hb-lift-sm"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "8px",
                      borderRadius: "14px",
                      cursor: "pointer",
                      background: on ? "var(--chip-2)" : "var(--chip)",
                      border: on ? "1px solid var(--ink-5)" : "1px solid transparent",
                    }}
                  >
                    <Avatar seed={seed} size={56} />
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "22px", flexWrap: "wrap" }}>
              <button onClick={() => void finish()} disabled={uploading} style={uploading ? { ...primaryBtn, opacity: 0.45 } : primaryBtn}>
                {avatarUrl ? "Use this photo" : "Use this avatar"}
              </button>
              {!avatarOnly ? (
                <button onClick={() => setStep(0)} style={chipBtn}>
                  Back to username
                </button>
              ) : (
                <Link href="/settings" style={chipBtn}>
                  Back to settings
                </Link>
              )}
            </div>
          </div>
          <div style={side}>
            {bigAvatar}
            <div style={{ fontSize: "15px", fontWeight: 600 }}>@{preview}</div>
            <div
              style={{
                fontFamily: mono,
                fontSize: "10px",
                letterSpacing: "0.08em",
                color: "var(--ink-5)",
                wordBreak: "break-all",
                textAlign: "center",
              }}
            >
              {avatarUrl ? "UPLOADED PHOTO" : `SEED ${avatarSeed}`}
            </div>
          </div>
        </>
      ) : null}

      {step === 2 ? (
        <EmptyCell auto>
          {bigAvatar}
          <div style={{ marginTop: "18px", fontSize: "19px", fontWeight: 600 }}>You are @{preview}</div>
          <div style={{ marginTop: "8px", fontSize: "14px", color: "var(--ink-4)", maxWidth: "44ch" }}>
            Your scores now count on daily boards, and you can publish games from your profile.
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "20px", flexWrap: "wrap", justifyContent: "center" }}>
            <button onClick={() => router.push(next)} style={primaryBtn}>
              Let&apos;s go
            </button>
            <Link href="/explore" style={chipBtn}>
              Explore games
            </Link>
          </div>
        </EmptyCell>
      ) : null}
    </BentoAutoGrid>
  );
}
