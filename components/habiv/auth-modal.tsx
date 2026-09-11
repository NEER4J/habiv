"use client";

import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useShell, type AuthMode } from "@/components/habiv/shell-context";
import { createClient } from "@/lib/supabase/client";
import { signInWithProvider, type OAuthProvider } from "@/lib/auth/oauth";
import { fieldLabelStyle, fieldStyle, mono, modalScrimStyle, modalSmStyleFor } from "@/lib/habiv/ui";

const bigBtn: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "46px",
  borderRadius: "10px",
  background: "var(--ink)",
  color: "var(--ink-invert)",
  fontSize: "14.5px",
  fontWeight: 600,
  cursor: "pointer",
  border: 0,
  width: "100%",
};
const quietBtn: CSSProperties = { ...bigBtn, height: "40px", background: "var(--chip)", color: "var(--ink-2)", fontWeight: 500 };
const linkBtn: CSSProperties = { background: "none", border: 0, padding: 0, color: "var(--ink-3)", cursor: "pointer", fontSize: "13px", textDecoration: "underline", textUnderlineOffset: "3px" };

const TITLES: Record<AuthMode, string> = {
  signin: "Sign in to habiv",
  signup: "Create your habiv account",
  reset: "Reset your password",
  newpassword: "Choose a new password",
};

/**
 * The one auth surface: sign in, create account, reset password, set a new password.
 * Opened with useShell().openAuth(mode, next) or by visiting any page with ?auth=signin|signup|reset.
 */
export function AuthModal() {
  const { modal, closeModal, light, authIntent, openAuth, showToast } = useShell();
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState<OAuthProvider | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<"confirm" | "reset" | null>(null);

  const mode = authIntent.mode;
  const next = authIntent.next || pathname || "/";

  useEffect(() => {
    if (modal !== "signin") {
      setBusy(null);
      setError(null);
      setSent(null);
      setPassword("");
      setPassword2("");
    } else if (authIntent.error) {
      setError(authIntent.error);
    }
  }, [modal, authIntent.error]);

  if (modal !== "signin") return null;

  const oauth = async (provider: OAuthProvider) => {
    if (busy) return;
    setBusy(provider);
    setError(null);
    try {
      await signInWithProvider(provider, next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed. Try again.");
      setBusy(null);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const supabase = createClient();
    setBusy("email");
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        closeModal();
        showToast("Signed in");
        router.push(`/auth/post-login?next=${encodeURIComponent(next)}`);
        router.refresh();
      } else if (mode === "signup") {
        if (password.length < 8) throw new Error("Use at least 8 characters.");
        if (password !== password2) throw new Error("Passwords do not match.");
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}` },
        });
        if (error) throw error;
        if (data.session) {
          closeModal();
          router.push(`/auth/post-login?next=${encodeURIComponent(next)}`);
          router.refresh();
        } else {
          setSent("confirm");
        }
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}` });
        if (error) throw error;
        setSent("reset");
      } else {
        if (password.length < 8) throw new Error("Use at least 8 characters.");
        if (password !== password2) throw new Error("Passwords do not match.");
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        closeModal();
        showToast("Password updated");
        router.push(`/auth/post-login?next=${encodeURIComponent(next)}`);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  const switchTo = (m: AuthMode) => {
    setError(null);
    setSent(null);
    openAuth(m, next);
  };

  return (
    <div style={modalScrimStyle}>
      <div onClick={closeModal} style={{ position: "absolute", inset: 0 }} />
      <div role="dialog" aria-modal="true" aria-labelledby="auth-title" style={{ ...modalSmStyleFor(light), color: "var(--ink)" }}>
        <div id="auth-title" style={{ fontSize: "20px", fontWeight: 600, letterSpacing: "-0.02em" }}>{TITLES[mode]}</div>
        <div style={{ marginTop: "8px", fontSize: "14px", lineHeight: 1.6, color: "var(--ink-4)" }}>
          {mode === "signin" && "Playing never needs an account. Sign in to publish, save, like or comment."}
          {mode === "signup" && "Publish tiny games, save the ones you love, and climb the boards."}
          {mode === "reset" && "We'll email you a link that signs you in so you can pick a new password."}
          {mode === "newpassword" && "You're signed in from the reset link. Set a password you'll remember."}
        </div>

        {sent ? (
          <div style={{ marginTop: "20px", padding: "14px 16px", borderRadius: "12px", background: "var(--chip)", fontSize: "14px", lineHeight: 1.6 }}>
            {sent === "confirm" ? (
              <>Check <strong>{email}</strong> for a confirmation link. It signs you in and brings you back here.</>
            ) : (
              <>If <strong>{email}</strong> has an account, a reset link is on its way.</>
            )}
            <div style={{ marginTop: "12px" }}>
              <button type="button" onClick={() => switchTo("signin")} style={linkBtn}>Back to sign in</button>
            </div>
          </div>
        ) : (
          <>
            {(mode === "signin" || mode === "signup") && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "20px" }}>
                <button type="button" onClick={() => oauth("google")} disabled={!!busy} style={{ ...bigBtn, opacity: busy && busy !== "google" ? 0.6 : 1 }}>
                  {busy === "google" ? "Opening Google…" : "Continue with Google"}
                </button>
                <button type="button" onClick={() => oauth("github")} disabled={!!busy} style={{ ...bigBtn, opacity: busy && busy !== "github" ? 0.6 : 1 }}>
                  {busy === "github" ? "Opening GitHub…" : "Continue with GitHub"}
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "6px 0 2px", color: "var(--ink-6)", fontFamily: mono, fontSize: "10.5px", letterSpacing: "0.08em" }}>
                  <span style={{ flex: 1, height: 1, background: "var(--divider)" }} />
                  OR WITH EMAIL
                  <span style={{ flex: 1, height: 1, background: "var(--divider)" }} />
                </div>
              </div>
            )}

            <form onSubmit={submit} style={{ display: "flex", flexDirection: "column" }}>
              {mode !== "newpassword" && (
                <>
                  <label htmlFor="auth-email" style={fieldLabelStyle}>Email</label>
                  <input id="auth-email" className="hb-input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={fieldStyle} placeholder="you@example.com" />
                </>
              )}
              {mode !== "reset" && (
                <>
                  <label htmlFor="auth-password" style={fieldLabelStyle}>{mode === "newpassword" ? "New password" : "Password"}</label>
                  <input id="auth-password" className="hb-input" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} required minLength={mode === "signin" ? 1 : 8} value={password} onChange={(e) => setPassword(e.target.value)} style={fieldStyle} placeholder={mode === "signin" ? "Your password" : "At least 8 characters"} />
                </>
              )}
              {(mode === "signup" || mode === "newpassword") && (
                <>
                  <label htmlFor="auth-password2" style={fieldLabelStyle}>Repeat password</label>
                  <input id="auth-password2" className="hb-input" type="password" autoComplete="new-password" required minLength={8} value={password2} onChange={(e) => setPassword2(e.target.value)} style={fieldStyle} />
                </>
              )}
              {error ? <div style={{ marginTop: "12px", fontSize: "13px", color: "var(--danger-ink)" }}>{error}</div> : null}
              <button type="submit" disabled={!!busy} style={{ ...quietBtn, marginTop: "16px", background: mode === "reset" || mode === "newpassword" ? "var(--ink)" : "var(--chip)", color: mode === "reset" || mode === "newpassword" ? "var(--ink-invert)" : "var(--ink-2)", opacity: busy ? 0.6 : 1 }}>
                {busy === "email"
                  ? "One moment…"
                  : mode === "signin" ? "Sign in with email" : mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : "Save password"}
              </button>
            </form>

            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginTop: "14px", flexWrap: "wrap" }}>
              {mode === "signin" && (
                <>
                  <button type="button" onClick={() => switchTo("signup")} style={linkBtn}>New here? Create an account</button>
                  <button type="button" onClick={() => switchTo("reset")} style={linkBtn}>Forgot password?</button>
                </>
              )}
              {mode === "signup" && <button type="button" onClick={() => switchTo("signin")} style={linkBtn}>Already have an account? Sign in</button>}
              {mode === "reset" && <button type="button" onClick={() => switchTo("signin")} style={linkBtn}>Back to sign in</button>}
            </div>
          </>
        )}

        <div style={{ marginTop: "16px", fontFamily: mono, fontSize: "10.5px", lineHeight: 1.7, color: "var(--ink-6)" }}>
          By continuing you agree to the content rules. Games are reviewed automatically before they go public.
        </div>
      </div>
    </div>
  );
}
