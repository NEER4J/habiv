"use client";

import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useShell, type AuthMode } from "@/components/habiv/shell-context";
import { createClient } from "@/lib/supabase/client";
import { openOAuthPopup, signInWithProvider, type OAuthProvider } from "@/lib/auth/oauth";
import { OAUTH_POPUP_CHANNEL, type OAuthPopupResult } from "@/lib/auth/popup";
import { chipBtn, fieldLabelStyle, fieldStyle, mono, modalScrimStyle, modalSmStyleFor } from "@/lib/habiv/ui";

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
const oauthBtn: CSSProperties = { ...bigBtn, gap: "10px", minWidth: 0 };

/** Google's four-colour "G". */
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" style={{ flex: "none" }}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** GitHub's mark, in the button's text colour so it reads in both themes. */
function GitHubLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" style={{ flex: "none" }}>
      <path d="M12 .3a12 12 0 0 0-3.8 23.38c.6.12.83-.26.83-.57L9 21.07c-3.34.72-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.08-.74.09-.73.09-.73 1.2.09 1.83 1.24 1.83 1.24 1.07 1.83 2.81 1.3 3.49 1 .1-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.14-.3-.54-1.52.1-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.64 1.66.24 2.88.12 3.18a4.65 4.65 0 0 1 1.23 3.22c0 4.61-2.8 5.63-5.48 5.92.42.36.81 1.1.81 2.22l-.01 3.29c0 .31.2.69.82.57A12 12 0 0 0 12 .3" />
    </svg>
  );
}

const quietBtn: CSSProperties ={ ...bigBtn, height: "40px", background: "var(--chip)", color: "var(--ink-2)", fontWeight: 500 };
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
  const { modal, closeModal, light, authIntent, openAuth } = useShell();
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState<OAuthProvider | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<"confirm" | "reset" | null>(null);

  // The Google / GitHub popup in flight, if any (lib/auth/popup.ts).
  const [popup, setPopup] = useState<{ id: string; provider: OAuthProvider } | null>(null);

  const mode = authIntent.mode;
  const next = authIntent.next || pathname || "/";
  // Signing in on the page you are on refreshes its server data in place: no reload, no redirect
  // hop. router.refresh() also drops pages the router cached while you were signed out. The box
  // stays on "One moment…" until the shell sees the session; auth-sync.tsx then closes it, or swaps
  // it for profile setup when there is no handle yet. Headed to another page (or after a new
  // password) it is a full load, which adds the handle step there.
  const inPlace = (mode === "signin" || mode === "signup") && (!authIntent.next || authIntent.next === pathname);

  useEffect(() => {
    if (modal !== "signin") {
      setBusy(null);
      setError(null);
      setSent(null);
      setPopup(null);
      setPassword("");
      setPassword2("");
    } else if (authIntent.error) {
      setError(authIntent.error);
    }
  }, [modal, authIntent.error]);

  // The popup reports back once /auth/callback has set the session cookies.
  useEffect(() => {
    if (!popup) return;
    const ch = new BroadcastChannel(OAUTH_POPUP_CHANNEL);
    ch.onmessage = (e: MessageEvent<OAuthPopupResult>) => {
      const d = e.data;
      if (d?.id !== popup.id) return;
      setPopup(null);
      const to = d.to && d.to.startsWith("/") && !d.to.startsWith("//") && !d.to.startsWith("/\\") ? d.to : null;
      if (d.error || !to) {
        setError(d.error || "Sign-in failed. Try again.");
        return;
      }
      setBusy(popup.provider);
      if (inPlace) router.refresh();
      else window.location.assign(to);
    };
    return () => ch.close();
  }, [popup, inPlace, router]);

  if (modal !== "signin") return null;

  const oauth = async (provider: OAuthProvider) => {
    if (busy) return;
    setError(null);
    // Opened before any await so the browser counts it as part of the click. Null means redirect.
    const win = openOAuthPopup();
    const id = win ? crypto.randomUUID() : null;
    setBusy(provider);
    try {
      await signInWithProvider(provider, next, win && id ? { window: win, id } : undefined);
      if (win && id) {
        setPopup({ id, provider });
        setBusy(null);
      }
    } catch (e) {
      win?.close();
      setError(e instanceof Error ? e.message : "Sign-in failed. Try again.");
      setBusy(null);
    }
  };

  const finishSignIn = () => {
    if (inPlace) router.refresh();
    else window.location.assign(`/auth/post-login?next=${encodeURIComponent(next)}`);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const supabase = createClient();
    setBusy("email");
    // Stays busy after a sign-in: the box closes (or the page leaves) once it lands.
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        finishSignIn();
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
          finishSignIn();
        } else {
          setSent("confirm");
          setBusy(null);
        }
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}` });
        if (error) throw error;
        setSent("reset");
        setBusy(null);
      } else {
        if (password.length < 8) throw new Error("Use at least 8 characters.");
        if (password !== password2) throw new Error("Passwords do not match.");
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        finishSignIn();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
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
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px" }}>
          <div id="auth-title" style={{ fontSize: "20px", fontWeight: 600, letterSpacing: "-0.02em" }}>{TITLES[mode]}</div>
          <button type="button" onClick={closeModal} style={{ ...chipBtn, flex: "none" }}>
            Close
          </button>
        </div>
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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <button
                    type="button"
                    aria-label="Continue with Google"
                    onClick={() => oauth("google")}
                    disabled={!!busy}
                    style={{ ...oauthBtn, opacity: busy && busy !== "google" ? 0.6 : 1 }}
                  >
                    <GoogleLogo />
                    {busy === "google" ? "One moment…" : "Google"}
                  </button>
                  <button
                    type="button"
                    aria-label="Continue with GitHub"
                    onClick={() => oauth("github")}
                    disabled={!!busy}
                    style={{ ...oauthBtn, opacity: busy && busy !== "github" ? 0.6 : 1 }}
                  >
                    <GitHubLogo />
                    {busy === "github" ? "One moment…" : "GitHub"}
                  </button>
                </div>
                {popup && !busy ? (
                  <div role="status" style={{ fontSize: "12.5px", lineHeight: 1.5, color: "var(--ink-4)", textAlign: "center" }}>
                    Finish signing in with {popup.provider === "google" ? "Google" : "GitHub"} in the popup. Closed it? Press the button again.
                  </div>
                ) : null}
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
          By continuing you agree to the{" "}
          <a href="/terms" target="_blank" rel="noopener" style={{ color: "var(--ink-4)", textDecoration: "underline" }}>Terms</a>,{" "}
          <a href="/guidelines" target="_blank" rel="noopener" style={{ color: "var(--ink-4)", textDecoration: "underline" }}>Community Guidelines</a> and{" "}
          <a href="/privacy" target="_blank" rel="noopener" style={{ color: "var(--ink-4)", textDecoration: "underline" }}>Privacy Policy</a>. Games are reviewed automatically before they go public.
        </div>
      </div>
    </div>
  );
}
