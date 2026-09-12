"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { art, best, fmt, relativeTime, shortModel, type Game } from "@/lib/habiv/games";
import {
  chipBtn,
  fieldLabelStyle,
  fieldStyle,
  modalScrimStyle,
  modalSmStyleFor,
  mono,
  primaryBtn,
} from "@/lib/habiv/ui";
import { loadBuiltWith, searchGames } from "@/lib/actions/feed";
import { markAllRead, markRead } from "@/lib/actions/notifications";
import { report } from "@/lib/actions/moderation";
import { loadGameForModal, loadNotifications } from "@/lib/actions/shell";
import type { NotificationItem } from "@/lib/db/notifications";
import { siteUrl } from "@/lib/site";
import { Avatar } from "./avatar";
import { railThumbStyle, shimmer } from "./game-card";
import { AuthModal } from "@/components/habiv/auth-modal";
import { createScoreShare, type ScoreShareLink } from "@/lib/actions/share";
import { useShell, type ModalKind } from "./shell-context";

const searchHeadStyle: CSSProperties = {
  fontFamily: mono,
  fontSize: "10px",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--ink-5)",
  margin: "0 0 10px 2px",
};

const searchRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  width: "100%",
  minHeight: "40px",
  marginBottom: "6px",
  padding: "0 12px",
  borderRadius: "10px",
  background: "var(--chip)",
  color: "var(--ink-2)",
  fontSize: "13.5px",
  textAlign: "left",
  cursor: "pointer",
  transition: "background 130ms ease",
};

const searchCol: CSSProperties = { padding: "14px", borderRadius: "14px", background: "var(--chip)", minWidth: 0 };

const RECENT_KEY = "habiv-recent-searches";
const RECENT_MAX = 6;

function readRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function pushRecent(term: string): string[] {
  const t = term.trim();
  if (!t) return readRecent();
  const next = [t, ...readRecent().filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, RECENT_MAX);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Private mode or blocked storage: recents just don't persist.
  }
  return next;
}

function SearchOverlay() {
  const { searchOpen, closeSearch, query, setQuery, mobile, light, pinned } = useShell();
  const router = useRouter();
  const [results, setResults] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const seq = useRef(0);

  const q = query.trim();
  const active = q.length >= 2;

  useEffect(() => {
    if (searchOpen) setRecent(readRecent());
  }, [searchOpen]);

  // Most used models and tools, fetched the first time search opens.
  const [builtWith, setBuiltWith] = useState<{ models: [string, number][]; agents: [string, number][] } | null>(null);
  useEffect(() => {
    if (searchOpen && !builtWith) loadBuiltWith().then(setBuiltWith).catch(() => setBuiltWith({ models: [], agents: [] }));
  }, [searchOpen, builtWith]);

  useEffect(() => {
    if (!searchOpen) return;
    const id = ++seq.current;
    if (!active) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      searchGames(q)
        .then((list) => {
          if (seq.current !== id) return;
          setResults(list);
          setLoading(false);
        })
        .catch(() => {
          if (seq.current !== id) return;
          setResults([]);
          setLoading(false);
        });
    }, 250);
    return () => clearTimeout(t);
  }, [q, active, searchOpen]);

  if (!searchOpen) return null;

  const open = (g: Game) => {
    pushRecent(q);
    closeSearch();
    router.push(g.url);
  };

  const glass = "blur(44px) saturate(175%)";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        display: "flex",
        alignItems: mobile ? "stretch" : "flex-start",
        justifyContent: "center",
        padding: mobile ? 0 : "70px 16px 24px",
        background: "var(--scrim)",
      }}
    >
      <div onClick={closeSearch} style={{ position: "absolute", inset: 0 }} />
      <div
        style={{
          position: "relative",
          width: mobile ? "100%" : "min(700px, 94vw)",
          height: mobile ? "100%" : undefined,
          maxHeight: mobile ? "100vh" : "74vh",
          overflowY: "auto",
          overflowX: "hidden",
          borderRadius: mobile ? 0 : "18px",
          background: light ? "rgba(250,250,252,0.96)" : "rgba(20,20,24,0.96)",
          backdropFilter: glass,
          WebkitBackdropFilter: glass,
          boxShadow: mobile ? "none" : "0 20px 60px rgba(0,0,0,0.6)",
          animation: "hbRise 180ms ease-out both",
          color: "var(--ink)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            margin: "12px",
            padding: "0 14px",
            height: "48px",
            borderRadius: "12px",
            background: "var(--chip)",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--ink-5)" strokeWidth="1.6">
            <circle cx="7" cy="7" r="4.5" />
            <line x1="10.5" y1="10.5" x2="14" y2="14" />
          </svg>
          <input
            autoFocus
            className="hb-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search games, creators, models"
            style={{
              flex: 1,
              height: "34px",
              border: "none",
              outline: "none",
              background: "transparent",
              color: "var(--ink)",
              fontSize: "15.5px",
              fontFamily: "inherit",
            }}
          />
          <button onClick={closeSearch} style={chipBtn}>
            Esc
          </button>
        </div>

        {!active ? (
          <div
            style={{
              padding: "0 12px 12px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "12px",
            }}
          >
            <div style={searchCol}>
              <div style={searchHeadStyle}>Recent</div>
              {recent.length ? (
                recent.map((r) => (
                  <button key={r} onClick={() => setQuery(r)} style={searchRow}>
                    {r}
                  </button>
                ))
              ) : (
                <div style={{ fontSize: "13px", color: "var(--ink-5)", padding: "4px 2px" }}>
                  {q ? "Keep typing…" : "Nothing yet"}
                </div>
              )}
            </div>
            {pinned.length ? (
              <div style={searchCol}>
                <div style={searchHeadStyle}>Featured</div>
                {pinned.slice(0, 4).map((x) => (
                  <button key={x.id} onClick={() => open(x)} style={searchRow}>
                    {x.title}
                  </button>
                ))}
              </div>
            ) : null}
            {builtWith && (builtWith.models.length || builtWith.agents.length) ? (
              <div style={searchCol}>
                {[
                  { head: "Browse by model", param: "model", list: builtWith.models },
                  { head: "Browse by tool", param: "tool", list: builtWith.agents },
                ]
                  .filter((s) => s.list.length)
                  .map((s, i) => (
                    <div key={s.param} style={i ? { marginTop: "14px" } : undefined}>
                      <div style={searchHeadStyle}>{s.head}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {s.list.slice(0, 6).map(([name]) => (
                          <button
                            key={name}
                            onClick={() => {
                              closeSearch();
                              router.push(`/explore?${s.param}=${encodeURIComponent(name)}`);
                            }}
                            style={{
                              height: "32px",
                              padding: "0 12px",
                              borderRadius: "9px",
                              background: light ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.1)",
                              color: "var(--ink-2)",
                              fontSize: "12.5px",
                              cursor: "pointer",
                            }}
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            ) : null}
          </div>
        ) : loading && !results.length ? (
          <div style={{ padding: "38px 22px 34px", textAlign: "center", fontFamily: mono, fontSize: "11.5px", color: "var(--ink-5)" }}>
            Searching…
          </div>
        ) : results.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "8px", opacity: loading ? 0.6 : 1, transition: "opacity 120ms ease" }}>
            {results.map((g) => (
              <button
                key={g.id}
                onClick={() => open(g)}
                className="hb-row"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "6px",
                  borderRadius: "8px",
                  background: "transparent",
                  color: "var(--ink)",
                  cursor: "pointer",
                  width: "100%",
                }}
              >
                <div style={{ width: "100px", height: "58px", flex: "0 0 100px", position: "relative" }}>
                  <div style={railThumbStyle(g)} />
                </div>
                <div style={{ minWidth: 0, flex: 1, textAlign: "left" }}>
                  <div style={{ fontSize: "14px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {g.title}
                  </div>
                  <div
                    style={{
                      marginTop: "4px",
                      fontFamily: mono,
                      fontSize: "10.5px",
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      color: "var(--ink-5)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {g.creator} · {g.type} · {shortModel(g.model)}
                  </div>
                </div>
                <div style={{ flex: "0 0 auto", fontFamily: mono, fontSize: "11px", color: "var(--ink-5)" }}>
                  {fmt(g.plays)} runs
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ padding: "38px 22px 34px", textAlign: "center" }}>
            <div style={{ fontSize: "16px", fontWeight: 600 }}>No games match “{query}”</div>
            <div style={{ marginTop: "6px", fontSize: "13.5px", color: "var(--ink-4)" }}>
              Try a model name, a creator, or a category.
            </div>
            {pinned[0] ? (
              <button onClick={() => open(pinned[0])} style={{ ...primaryBtn, marginTop: "16px" }}>
                Play {pinned[0].title} instead
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function Modal({ children }: { children: React.ReactNode }) {
  const { closeModal, light } = useShell();
  return (
    <div style={modalScrimStyle}>
      <div onClick={closeModal} style={{ position: "absolute", inset: 0 }} />
      <div style={{ ...modalSmStyleFor(light), color: "var(--ink)" }}>{children}</div>
    </div>
  );
}

/** Loads the game a modal talks about whenever that modal opens. */
function useModalGame(...kinds: ModalKind[]) {
  const { modal, modalGameId } = useShell();
  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(false);
  const isOpen = kinds.includes(modal);

  useEffect(() => {
    if (!isOpen) return;
    if (!modalGameId) {
      setGame(null);
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    loadGameForModal(modalGameId)
      .then((g) => {
        if (!live) return;
        setGame(g);
        setLoading(false);
      })
      .catch(() => {
        if (!live) return;
        setGame(null);
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [isOpen, modalGameId]);

  return { isOpen, game, loading };
}

function ModalPlaceholder({ loading, label }: { loading: boolean; label: string }) {
  return (
    <div style={{ padding: "26px 0 10px", textAlign: "center", fontFamily: mono, fontSize: "11.5px", color: "var(--ink-5)" }}>
      {loading ? "Loading…" : label}
    </div>
  );
}

const shareTargets = [
  { label: "X", tint: "oklch(0.3 0 0)" },
  { label: "Discord", tint: "oklch(0.55 0.16 275)" },
  { label: "Reddit", tint: "oklch(0.62 0.19 35)" },
  { label: "WhatsApp", tint: "oklch(0.6 0.15 150)" },
] as const;

type ShareTarget = (typeof shareTargets)[number]["label"];

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Saves the card image: the share sheet where the device can share files (phones), else a download. */
async function saveCardImage(path: string, name: string, text: string): Promise<"shared" | "saved" | "cancelled" | "failed"> {
  try {
    const res = await fetch(path);
    if (!res.ok) return "failed";
    const blob = await res.blob();
    const file = new File([blob], `${name}.jpg`, { type: blob.type || "image/jpeg" });
    const coarse = window.matchMedia?.("(pointer: coarse)").matches;
    if (coarse && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text });
        return "shared";
      } catch (e) {
        return e instanceof DOMException && e.name === "AbortError" ? "cancelled" : "failed";
      }
    }
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    return "saved";
  } catch {
    return "failed";
  }
}

function ShareModal() {
  const { closeModal, showToast, modal, modalGameId } = useShell();
  const { isOpen, game: g, loading } = useModalGame("share", "shareScore");
  const [copied, setCopied] = useState(false);
  // The viewer's own result on this game, when they have one; "score" shares that instead of the game.
  const [mode, setMode] = useState<"game" | "score">("game");
  const [result, setResult] = useState<ScoreShareLink | null>(null);
  const [resultLoading, setResultLoading] = useState(false);
  const [cardReady, setCardReady] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setCopied(false);
      return;
    }
    setMode(modal === "shareScore" ? "score" : "game");
    setResult(null);
    setCardReady(false);
    if (!modalGameId) return;
    let live = true;
    setResultLoading(true);
    createScoreShare(modalGameId)
      .then((r) => live && setResult(r))
      .catch(() => live && setResult(null))
      .finally(() => live && setResultLoading(false));
    return () => {
      live = false;
    };
    // Re-run only when the modal opens or switches game; switching tabs must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, modalGameId]);

  if (!isOpen) return null;

  const scoreMode = mode === "score";
  const shareUrl = scoreMode ? (result?.url ?? "") : g ? `${siteUrl}${g.shortUrl}` : "";
  const shareText = scoreMode ? (result?.text ?? "") : g ? `${g.title} by @${g.creator} on habiv` : "";
  const embedSnippet = g
    ? `<iframe src="${siteUrl}${g.url}?embed=1" width="480" height="270" allow="autoplay; fullscreen"></iframe>`
    : "";
  const resultLabel = result && result.score == null ? "My plays" : "My score";

  const saveImage = async () => {
    if (!result || !g || saving) return;
    setSaving(true);
    const out = await saveCardImage(result.imagePath, `${g.slug}-${result.score ?? `${result.rounds}-rounds`}`, `${result.text} ${result.url}`);
    setSaving(false);
    if (out === "saved") showToast("Image saved");
    else if (out === "failed") showToast("Could not save the image");
  };

  const copyLink = async () => {
    if (!shareUrl) return;
    const ok = await copyText(shareUrl);
    setCopied(ok);
    showToast(ok ? "Link copied" : "Could not copy. Select the link instead.");
  };

  const share = async (target: ShareTarget) => {
    if (!g) return;
    const u = encodeURIComponent(shareUrl);
    const t = encodeURIComponent(shareText);
    if (target === "X") window.open(`https://twitter.com/intent/tweet?url=${u}&text=${t}`, "_blank", "noopener,noreferrer");
    else if (target === "Reddit") window.open(`https://www.reddit.com/submit?url=${u}&title=${t}`, "_blank", "noopener,noreferrer");
    else if (target === "WhatsApp") window.open(`https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`, "_blank", "noopener,noreferrer");
    else if (target === "Discord") {
      const ok = await copyText(shareUrl);
      showToast(ok ? "Link copied, paste it in Discord" : "Could not copy the link");
    }
  };

  return (
    <Modal>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px", marginBottom: "16px" }}>
        <div style={{ fontSize: "20px", fontWeight: 600, letterSpacing: "-0.02em" }}>Share</div>
        <button onClick={closeModal} style={chipBtn}>
          Close
        </button>
      </div>

      {!g ? (
        <ModalPlaceholder loading={loading} label="This game isn't available to share." />
      ) : (
        <>
          {result || (scoreMode && resultLoading) ? (
            <div role="tablist" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", padding: "4px", marginBottom: "12px", borderRadius: "12px", background: "var(--chip)" }}>
              {(["game", "score"] as const).map((m) => (
                <button
                  key={m}
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => setMode(m)}
                  style={{
                    height: "32px",
                    borderRadius: "9px",
                    background: mode === m ? "var(--panel)" : "transparent",
                    boxShadow: mode === m ? "0 1px 3px rgba(0,0,0,0.25)" : "none",
                    color: mode === m ? "var(--ink)" : "var(--ink-4)",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {m === "game" ? "Game" : resultLabel}
                </button>
              ))}
            </div>
          ) : null}

          {scoreMode ? (
            result ? (
              <div style={{ position: "relative", borderRadius: "14px", overflow: "hidden", aspectRatio: "1200 / 630", background: "var(--well)" }}>
                {!cardReady ? <div aria-hidden="true" style={{ position: "absolute", inset: 0, ...shimmer }} /> : null}
                {/* eslint-disable-next-line @next/next/no-img-element -- the generated social card, exactly as others will see it */}
                <img
                  src={result.imagePath}
                  alt={result.text}
                  onLoad={() => setCardReady(true)}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: cardReady ? 1 : 0, transition: "opacity 200ms ease" }}
                />
              </div>
            ) : (
              <ModalPlaceholder loading={resultLoading} label="Play a round first. Your best score shows up here to share." />
            )
          ) : (
          <div style={{ position: "relative", borderRadius: "14px", overflow: "hidden", background: "var(--well)" }}>
            <div
              style={{
                position: "relative",
                height: "150px",
                backgroundImage: `url("${art(g, 720)}")`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.9) 100%)",
                }}
              />
              <div style={{ position: "absolute", left: "16px", right: "16px", bottom: "14px" }}>
                <div
                  style={{
                    fontFamily: mono,
                    fontSize: "10px",
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.8)",
                  }}
                >
                  {g.type} · {g.duration} · {shortModel(g.model)}
                </div>
                <div style={{ marginTop: "6px", fontSize: "20px", fontWeight: 600, letterSpacing: "-0.02em", color: "#fff" }}>
                  {g.title}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px" }}>
              {g.creatorAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element -- avatar URLs come from Supabase storage
                <img src={g.creatorAvatar} alt="" width={34} height={34} style={{ width: "34px", height: "34px", borderRadius: "50%", objectFit: "cover", flex: "0 0 auto" }} />
              ) : (
                <Avatar seed={g.creator} size={34} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "13px", fontWeight: 600 }}>@{g.creator}</div>
                <div style={{ fontFamily: mono, fontSize: "10.5px", color: "var(--ink-5)" }}>
                  {fmt(g.plays)} runs · best {best(g)}
                </div>
              </div>
              <div style={{ fontFamily: mono, fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-5)" }}>
                {siteUrl.replace(/^https?:\/\//, "")}
              </div>
            </div>
          </div>
          )}

          {scoreMode && !result ? null : (
          <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: "8px", marginTop: "14px" }}>
            {shareTargets.map((t) => (
              <button
                key={t.label}
                onClick={() => share(t.label)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "7px",
                  padding: "12px 6px",
                  borderRadius: "12px",
                  background: "var(--chip)",
                  color: "var(--ink-2)",
                  fontSize: "11.5px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                <span style={{ width: "28px", height: "28px", borderRadius: "9px", background: t.tint }} />
                {t.label}
              </button>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginTop: "14px",
              padding: "10px 14px",
              borderRadius: "12px",
              background: "var(--chip)",
            }}
          >
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontFamily: mono,
                fontSize: "12.5px",
                color: "var(--ink-2)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                userSelect: "all",
              }}
            >
              {shareUrl.replace(/^https?:\/\//, "")}
            </span>
            <button onClick={copyLink} style={primaryBtn}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          </>
          )}

          {scoreMode ? (
            result ? (
              <button onClick={saveImage} disabled={saving} style={{ ...chipBtn, width: "100%", marginTop: "10px", justifyContent: "center", cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}>
                {saving ? "Preparing image…" : "Save image"}
              </button>
            ) : null
          ) : (
            <>
          <div style={{ marginTop: "16px", fontFamily: mono, fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-5)" }}>
            Embed (beta)
          </div>
          <div
            style={{
              marginTop: "8px",
              padding: "12px 14px",
              borderRadius: "12px",
              background: "var(--chip)",
              fontFamily: mono,
              fontSize: "11.5px",
              lineHeight: 1.6,
              color: "var(--ink-3)",
              overflowX: "auto",
              userSelect: "all",
            }}
          >
            {embedSnippet}
          </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}

function RemixModal() {
  const { closeModal, showToast } = useShell();
  const { isOpen, game: g, loading } = useModalGame("remix");
  if (!isOpen) return null;

  const prompt = g?.prompt?.trim() ?? "";

  const copyPrompt = async () => {
    if (!prompt) return;
    const ok = await copyText(prompt);
    showToast(ok ? "Prompt copied" : "Could not copy the prompt");
  };

  return (
    <Modal>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px" }}>
        <div>
          <div style={{ fontSize: "20px", fontWeight: 600, letterSpacing: "-0.02em" }}>Remix {g ? g.title : ""}</div>
          {g ? (
            <div style={{ marginTop: "6px", fontFamily: mono, fontSize: "11.5px", color: "var(--ink-5)" }}>
              forked from @{g.creator} · v{g.versions}
            </div>
          ) : null}
        </div>
        <button onClick={closeModal} style={chipBtn}>
          Close
        </button>
      </div>
      {!g ? (
        <ModalPlaceholder loading={loading} label="This game isn't available to remix." />
      ) : (
        <>
          <div style={fieldLabelStyle}>Original prompt</div>
          <div
            style={{
              padding: "12px 14px",
              borderRadius: "10px",
              background: "var(--well)",
              fontFamily: mono,
              fontSize: "12px",
              lineHeight: 1.65,
              color: prompt ? "var(--ink-3)" : "var(--ink-5)",
              whiteSpace: "pre-wrap",
              maxHeight: "220px",
              overflowY: "auto",
            }}
          >
            {prompt || "The creator didn't share a prompt"}
          </div>
          <div
            style={{
              marginTop: "14px",
              padding: "12px 14px",
              borderRadius: "10px",
              background: "var(--chip)",
              fontSize: "13.5px",
              lineHeight: 1.55,
              color: "var(--ink-3)",
            }}
          >
            Remixing in the browser is coming soon. Publish your own take from{" "}
            <Link href="/publish" onClick={closeModal} style={{ color: "var(--ink)", fontWeight: 600 }}>
              /publish
            </Link>{" "}
            and credit @{g.creator}.
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "18px", flexWrap: "wrap" }}>
            <button onClick={copyPrompt} disabled={!prompt} style={{ ...primaryBtn, opacity: prompt ? 1 : 0.5, cursor: prompt ? "pointer" : "default" }}>
              Copy prompt
            </button>
            <button onClick={closeModal} style={chipBtn}>
              Cancel
            </button>
          </div>
          <div style={{ marginTop: "14px", fontFamily: mono, fontSize: "10.5px", color: "var(--ink-6)" }}>
            Your remix keeps attribution to the original and appears in its remix list.
          </div>
        </>
      )}
    </Modal>
  );
}

type ReportReason = "sexual" | "abuse" | "violence" | "broken" | "copyright" | "spam" | "other";

const reportReasons: { label: string; value: ReportReason }[] = [
  { label: "Sexual or adult content", value: "sexual" },
  { label: "Hate or harassment", value: "abuse" },
  { label: "Violence or gore", value: "violence" },
  { label: "Broken or misleading", value: "broken" },
  { label: "Stolen work", value: "copyright" },
  { label: "Spam", value: "spam" },
  { label: "Other", value: "other" },
];

function ReportModal() {
  const { modal, closeModal, showToast, modalGameId, requireAuth } = useShell();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (modal !== "report") {
      setReason(null);
      setNote("");
      setBusy(false);
      setError(null);
    }
  }, [modal]);

  if (modal !== "report") return null;

  const submit = async () => {
    if (busy) return;
    if (!requireAuth()) return;
    if (!modalGameId) {
      setError("Pick a game first");
      return;
    }
    if (!reason) {
      setError("Choose a reason");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await report({ gameId: modalGameId, reason, details: note.trim() || undefined });
      if (!res.ok) {
        if (res.code === "auth") requireAuth();
        else setError(res.error);
        setBusy(false);
        return;
      }
      closeModal();
      showToast(res.duplicate ? "You already reported this" : "Report sent to moderation");
    } catch {
      setError("Could not send the report. Try again.");
      setBusy(false);
    }
  };

  return (
    <Modal>
      <div style={{ fontSize: "20px", fontWeight: 600, letterSpacing: "-0.02em" }}>Report this game</div>
      <div style={{ marginTop: "8px", fontSize: "14px", color: "var(--ink-4)" }}>
        Reports go to a moderation queue. Games can be hidden within minutes.
      </div>
      {!modalGameId ? (
        <div style={{ marginTop: "14px", fontFamily: mono, fontSize: "11.5px", color: "var(--ink-5)" }}>Pick a game first</div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "18px" }}>
        {reportReasons.map((r) => (
          <button
            key={r.value}
            onClick={() => {
              setReason(r.value);
              setError(null);
            }}
            style={{
              textAlign: "left",
              padding: "12px 14px",
              borderRadius: "10px",
              fontSize: "13.5px",
              cursor: "pointer",
              background: reason === r.value ? "var(--chip-2)" : "var(--chip)",
              color: "var(--ink)",
            }}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div style={fieldLabelStyle}>Anything to add</div>
      <input className="hb-input" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="Optional" style={fieldStyle} />
      {error ? <div style={{ marginTop: "10px", fontSize: "13px", color: "var(--danger-ink)" }}>{error}</div> : null}
      <div style={{ display: "flex", gap: "8px", marginTop: "18px", flexWrap: "wrap" }}>
        <button onClick={submit} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.7 : 1 }}>
          {busy ? "Sending…" : "Submit report"}
        </button>
        <button onClick={closeModal} style={chipBtn}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

function notificationText(n: NotificationItem): string {
  const actor = n.actor ? `@${n.actor.handle}` : "Someone";
  const game = n.game?.title ?? "Your game";
  switch (n.kind) {
    case "mention":
      return `${actor} mentioned you`;
    case "reply":
      return `${actor} replied`;
    case "follow":
      return `${actor} followed you`;
    case "like_milestone":
      return `${game} hit a like milestone`;
    case "remix":
      return `${game} was remixed`;
    case "version_ready":
      return `${game}: new version is live`;
    case "version_rejected":
      return `${game}: version was rejected`;
    case "report_resolved":
      return "Your report was resolved";
    case "game_hidden":
      return `${game} was hidden`;
    case "comment":
      return `${actor} commented on ${game}`;
    default:
      return n.game ? `${game}: ${n.kind.replace(/_/g, " ")}` : n.kind.replace(/_/g, " ");
  }
}

function NotificationsPanel() {
  const { modal, closeModal, unread, setUnread, signedIn, openModal, showToast } = useShell();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const isOpen = modal === "notif";

  useEffect(() => {
    if (!isOpen || !signedIn) return;
    let live = true;
    setLoading(true);
    loadNotifications()
      .then((list) => {
        if (!live) return;
        setItems(list);
        setLoading(false);
      })
      .catch(() => {
        if (!live) return;
        setItems([]);
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [isOpen, signedIn]);

  if (!isOpen) return null;

  const markAll = async () => {
    if (clearing) return;
    const before = items;
    const beforeUnread = unread;
    setClearing(true);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
    const res = await markAllRead().catch(() => ({ ok: false, updated: 0 }));
    setClearing(false);
    if (res.ok) return;
    setItems(before);
    setUnread(beforeUnread);
    showToast("Couldn't mark notifications read");
  };

  const markOne = (n: NotificationItem) => {
    if (n.read) return;
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    setUnread(Math.max(0, unread - 1));
    void markRead([n.id])
      .catch(() => ({ ok: false, updated: 0 }))
      .then((res) => {
        if (!res.ok) showToast("Couldn't mark notification read");
      });
  };

  const hasUnread = items.some((n) => !n.read);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 88 }}>
      <div onClick={closeModal} style={{ position: "absolute", inset: 0 }} />
      <div
        style={{
          position: "absolute",
          right: "18px",
          top: "64px",
          width: "min(380px, 92vw)",
          maxHeight: "70vh",
          overflow: "auto",
          borderRadius: "14px",
          background: "var(--panel-2)",
          backdropFilter: "blur(44px) saturate(175%)",
          WebkitBackdropFilter: "blur(44px) saturate(175%)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
          animation: "hbRise 180ms ease-out both",
          color: "var(--ink)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", padding: "14px 16px" }}>
          <span style={{ fontSize: "15px", fontWeight: 600 }}>Notifications</span>
          <div style={{ display: "flex", gap: "6px" }}>
            {signedIn && hasUnread ? (
              <button onClick={markAll} disabled={clearing} style={chipBtn}>
                {clearing ? "…" : "Mark all read"}
              </button>
            ) : null}
            <button onClick={closeModal} style={chipBtn}>
              Close
            </button>
          </div>
        </div>
        <div style={{ padding: "6px" }}>
          {!signedIn ? (
            <div style={{ padding: "18px 12px 22px", textAlign: "center" }}>
              <div style={{ fontSize: "13.5px", color: "var(--ink-4)" }}>Sign in to see mentions, replies and version updates.</div>
              <button onClick={() => openModal("signin")} style={{ ...primaryBtn, marginTop: "12px" }}>
                Sign in
              </button>
            </div>
          ) : loading && !items.length ? (
            <div style={{ padding: "22px 12px", textAlign: "center", fontFamily: mono, fontSize: "11.5px", color: "var(--ink-5)" }}>Loading…</div>
          ) : !items.length ? (
            <div style={{ padding: "22px 12px", textAlign: "center", fontSize: "13.5px", color: "var(--ink-4)" }}>Nothing yet</div>
          ) : (
            items.map((n) => {
              const row = (
                <>
                  <span
                    style={{
                      width: "7px",
                      height: "7px",
                      marginTop: "6px",
                      flex: "0 0 auto",
                      borderRadius: "50%",
                      background: n.read ? "var(--chip-2)" : "var(--pos)",
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13.5px", lineHeight: 1.5, color: "var(--ink)" }}>{notificationText(n)}</div>
                    {n.comment?.snippet ? (
                      <div style={{ marginTop: "3px", fontSize: "12.5px", color: "var(--ink-4)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        “{n.comment.snippet}”
                      </div>
                    ) : null}
                    <div style={{ marginTop: "4px", fontFamily: mono, fontSize: "10.5px", color: "var(--ink-5)" }}>{relativeTime(n.createdAt)}</div>
                  </div>
                </>
              );
              const rowStyle: CSSProperties = { display: "flex", alignItems: "flex-start", gap: "12px", padding: "12px", borderRadius: "10px", color: "inherit" };
              return n.game ? (
                <Link
                  key={n.id}
                  href={n.game.url}
                  onClick={() => {
                    markOne(n);
                    closeModal();
                  }}
                  className="hb-row"
                  style={rowStyle}
                >
                  {row}
                </Link>
              ) : (
                <div key={n.id} onClick={() => markOne(n)} className="hb-row" style={{ ...rowStyle, cursor: n.read ? "default" : "pointer" }}>
                  {row}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function Toast() {
  const { toast } = useShell();
  if (!toast) return null;
  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: "26px",
        transform: "translateX(-50%)",
        zIndex: 130,
        padding: "12px 18px",
        borderRadius: "10px",
        background: "var(--ink)",
        color: "var(--ink-invert)",
        fontSize: "13.5px",
        fontWeight: 600,
        boxShadow: "0 18px 50px rgba(0,0,0,0.5)",
        animation: "hbRise 180ms ease-out both",
      }}
    >
      {toast}
    </div>
  );
}

export function Overlays() {
  return (
    <>
      <SearchOverlay />
      <AuthModal />
      <ShareModal />
      <RemixModal />
      <ReportModal />
      <NotificationsPanel />
      <Toast />
    </>
  );
}
