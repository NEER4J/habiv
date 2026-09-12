"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { art, best, controlsFor, fmt, initialsOf, relativeTime, touchHintFor } from "@/lib/habiv/games";
import type { WatchData } from "@/lib/habiv/page-data";
import { gameFrameSrc } from "@/lib/bridge/parent";
import { mountBridgeHost, type BridgeHost, type HostEvent } from "@/lib/player/bridge-host";
import { getCollector } from "@/lib/analytics/collector";
import { toggleFollow, toggleLike } from "@/lib/actions/social";
import { deleteComment, pinComment, postComment, toggleCommentLike } from "@/lib/actions/comments";
import type { CommentItem } from "@/lib/db/comments";
import { siteUrl } from "@/lib/site";
import { bpanel, chipBtn, chipStyle, ctrlBtn, mono, monoLabel, pill } from "@/lib/habiv/ui";
import { CreatorAvatar, RailRow } from "./game-card";
import { useShell } from "./shell-context";

type PlayerState = "cover" | "loading" | "playing" | "paused" | "finished";

const READY_TIMEOUT_MS = 12000;

const playButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "10px",
  height: "clamp(46px, 5.5vw, 56px)",
  padding: "0 clamp(22px, 2.4vw, 30px)",
  borderRadius: "28px",
  background: "#ffffff",
  color: "#0c0c0e",
  fontSize: "15.5px",
  fontWeight: 600,
  cursor: "pointer",
  boxShadow: "0 12px 34px rgba(0,0,0,0.45)",
};

/** Buttons that sit on the always-dark player, whatever the page theme. */
const onPlayerChip: CSSProperties = { ...pill(), background: "rgba(255,255,255,0.14)", color: "#f5f5f7" };
const onPlayerPrimary: CSSProperties = { ...pill("primary"), background: "#ffffff", color: "#0c0c0e" };

const overlayBase: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 3,
};

const statLabel: CSSProperties = { ...monoLabel, fontSize: "10px" };

const frameStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  border: 0,
  background: "#0b0b0d",
};

const smallActionBtn: CSSProperties = {
  height: "30px",
  padding: "0 12px",
  borderRadius: "15px",
  background: "transparent",
  color: "var(--ink-4)",
  fontSize: "12.5px",
  fontWeight: 600,
  cursor: "pointer",
};

function durationLabelMs(ms: number | null) {
  if (ms == null) return null;
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function Avatar({ name, url, size }: { name: string; url: string | null; size: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: `${size}px`,
        height: `${size}px`,
        flex: "0 0 auto",
        borderRadius: "50%",
        overflow: "hidden",
        background: "var(--chip-2)",
        color: "var(--ink)",
        fontSize: size > 30 ? "12px" : "10.5px",
        fontWeight: 600,
      }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- tiny avatar from the CDN
        <img src={url} alt="" width={size} height={size} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        initialsOf(name)
      )}
    </div>
  );
}

export function WatchView({ data }: { data: WatchData }) {
  const { game, viewer, leaderboard, runsToday } = data;
  const { theatre, setTheatre, openModal, setModalGameId, isSaved, toggleSaved, showToast, mobile, light, profile, signedIn, requireAuth } =
    useShell();

  // Player
  const [state, setState] = useState<PlayerState>("cover");
  const [frameOn, setFrameOn] = useState(false);
  const [frameKey, setFrameKey] = useState(0);
  const [interacted, setInteracted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [beatPct, setBeatPct] = useState<number | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [rankResult, setRankResult] = useState<{ rank: number; personalBest: boolean } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [fsClosing, setFsClosing] = useState(false);
  const [muted, setMuted] = useState(true);
  const [autoplay, setAutoplay] = useState(false);

  // Social
  const [liked, setLiked] = useState(viewer.liked);
  const [likes, setLikes] = useState(game.likes);
  const [following, setFollowing] = useState(viewer.following);
  const [followers, setFollowers] = useState(game.followers);
  const [moreOpen, setMoreOpen] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Rail
  const [railFilter, setRailFilter] = useState("All");
  const [queueSeed, setQueueSeed] = useState(0);

  // Comments
  const [comments, setComments] = useState<CommentItem[]>(data.comments.items);
  const [commentCount, setCommentCount] = useState(game.comments);
  const [commentSort, setCommentSort] = useState<"Top" | "Newest">("Top");
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [repliesOpen, setRepliesOpen] = useState<string | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<BridgeHost | null>(null);
  const mutedRef = useRef(muted);
  const loadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seenGame = useRef(game.id);

  const canPlay = !!game.versionId;

  // Page view, once per game.
  useEffect(() => {
    getCollector().track({ name: "view", game_id: game.id, version_id: game.versionId ?? undefined });
  }, [game.id, game.versionId]);

  // Navigating to another game while this instance is reused resets everything.
  useEffect(() => {
    if (seenGame.current === game.id) return;
    seenGame.current = game.id;
    clearTimeout(loadTimer.current);
    setState("cover");
    setFrameOn(false);
    setInteracted(false);
    setScore(null);
    setBeatPct(null);
    setDurationMs(null);
    setRankResult(null);
    setMoreOpen(false);
    setDescOpen(false);
    setCopied(false);
    setLiked(viewer.liked);
    setLikes(game.likes);
    setFollowing(viewer.following);
    setFollowers(game.followers);
    setRailFilter("All");
    setQueueSeed(0);
    setComments(data.comments.items);
    setCommentCount(game.comments);
    setCommentSort("Top");
    setDraft("");
    setReplyTo(null);
    setReplyDraft("");
    setRepliesOpen(null);
  }, [game.id, game.likes, game.followers, game.comments, viewer.liked, viewer.following, data.comments.items]);

  useEffect(() => () => clearTimeout(loadTimer.current), []);

  const onHostEvent = useCallback(
    (e: HostEvent) => {
      switch (e.type) {
        case "ready":
          clearTimeout(loadTimer.current);
          setState((s) => (s === "loading" ? "playing" : s));
          break;
        case "run_start":
          setScore(null);
          setBeatPct(null);
          setDurationMs(null);
          setRankResult(null);
          setState("playing");
          break;
        case "run_end":
          setScore((s) => e.score ?? s);
          setBeatPct(e.beatPct);
          setDurationMs(e.durationMs);
          // A quit (tab hidden, page left) is not a result worth an overlay.
          if (e.outcome !== "quit") setState("finished");
          break;
        case "score_result": {
          const daily = e.boards.find((b) => b.period === "daily") ?? e.boards[0];
          if (daily) setRankResult({ rank: daily.rank, personalBest: daily.personal_best });
          break;
        }
        case "happytime":
          showToast("Nice!");
          break;
        case "error":
          console.error("[habiv] game error:", e.message);
          break;
        default:
          break;
      }
    },
    [showToast],
  );

  // One bridge host per mounted iframe; a new frameKey is a fresh iframe.
  useEffect(() => {
    if (!frameOn || !game.versionId) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    const host = mountBridgeHost({
      iframe,
      gameId: game.id,
      versionId: game.versionId,
      playerId: viewer.playerId,
      handle: viewer.handle,
      muted: mutedRef.current,
      overlay: overlayRef.current,
      onEvent: onHostEvent,
    });
    hostRef.current = host;
    return () => {
      host.destroy();
      if (hostRef.current === host) hostRef.current = null;
    };
  }, [frameOn, frameKey, game.id, game.versionId, viewer.playerId, viewer.handle, onHostEvent]);

  useEffect(() => {
    mutedRef.current = muted;
    hostRef.current?.mute(muted);
  }, [muted]);

  const launch = useCallback(
    (fromPlayButton: boolean) => {
      if (!game.versionId) return;
      clearTimeout(loadTimer.current);
      if (fromPlayButton) getCollector().track({ name: "play_click", game_id: game.id, version_id: game.versionId });
      setScore(null);
      setBeatPct(null);
      setDurationMs(null);
      setRankResult(null);
      setInteracted(false);
      setFrameKey((k) => k + 1);
      setFrameOn(true);
      setState("loading");
      loadTimer.current = setTimeout(() => setState((s) => (s === "loading" ? "playing" : s)), READY_TIMEOUT_MS);
    },
    [game.id, game.versionId],
  );

  const start = () => launch(true);
  const restart = () => launch(false);

  const togglePause = () => {
    if (state === "playing") {
      hostRef.current?.pause();
      setState("paused");
    } else if (state === "paused") {
      hostRef.current?.resume();
      setState("playing");
    } else if (state === "finished") {
      restart();
    } else if (state === "cover") {
      start();
    }
  };

  const quit = () => {
    clearTimeout(loadTimer.current);
    setFrameOn(false);
    setState("cover");
    setScore(null);
    setBeatPct(null);
    setDurationMs(null);
    setRankResult(null);
  };

  // Keys only reach the game while its iframe has focus. Take it when play starts or resumes,
  // and again after a player control (mute, theatre, fullscreen) pulls it back to the page.
  useEffect(() => {
    if (state === "playing") iframeRef.current?.focus({ preventScroll: true });
  }, [state, muted, theatre, fullscreen]);

  const onOverlayPointerDown = () => {
    setInteracted(true);
    iframeRef.current?.focus({ preventScroll: true });
  };

  const nextGame = data.queue[0] ?? null;

  const exitFullscreen = () => {
    if (fsClosing) return;
    setFsClosing(true);
    setTimeout(() => {
      setFullscreen(false);
      setFsClosing(false);
    }, 190);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && fullscreen) exitFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Actions
  const copyLink = () => {
    const url = `${siteUrl}${game.shortUrl}`;
    const done = () => {
      setCopied(true);
      showToast("Link copied");
    };
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(url).then(done, () => showToast("Could not copy the link"));
    } else {
      showToast("Could not copy the link");
    }
  };
  const openShare = () => {
    setModalGameId(game.id);
    openModal("share");
  };
  const openRemix = () => {
    if (game.remixLicence === "no_remix") return;
    setModalGameId(game.id);
    openModal("remix");
  };
  const openReport = () => {
    setModalGameId(game.id);
    openModal("report");
  };

  const onLike = () => {
    if (!requireAuth()) return;
    const next = !liked;
    setLiked(next);
    setLikes((n) => Math.max(0, n + (next ? 1 : -1)));
    void toggleLike(game.id).then((res) => {
      if (!res.ok) {
        setLiked(!next);
        setLikes((n) => Math.max(0, n + (next ? -1 : 1)));
        showToast(res.error);
        if (res.code === "auth") requireAuth();
        return;
      }
      setLiked(res.active);
      setLikes(res.count);
    });
  };

  const onFollow = () => {
    if (!requireAuth()) return;
    const next = !following;
    setFollowing(next);
    setFollowers((n) => Math.max(0, n + (next ? 1 : -1)));
    void toggleFollow(game.creatorId).then((res) => {
      if (!res.ok) {
        setFollowing(!next);
        setFollowers((n) => Math.max(0, n + (next ? -1 : 1)));
        showToast(res.error);
        if (res.code === "auth") requireAuth();
        return;
      }
      setFollowing(res.active);
      setFollowers(res.count);
      showToast(res.active ? `Following @${game.creator}` : `Unfollowed @${game.creator}`);
    });
  };

  const saved = isSaved(game.id);
  const remixable = game.remixLicence !== "no_remix";
  const pauseLabel = state === "playing" ? "Pause" : state === "paused" ? "Resume" : "Play";
  const soundLabel = muted ? "Sound off" : "Sound on";
  const stateLabel = { cover: "READY", loading: "LOADING", playing: "PLAYING", paused: "PAUSED", finished: "COMPLETE" }[state];

  // Up-next queue, filtered client-side.
  let recPool = data.queue;
  if (railFilter === "Same model") recPool = data.queue.filter((x) => x.model === game.model);
  else if (railFilter === `@${game.creator}`) recPool = data.queue.filter((x) => x.creator === game.creator);
  else if (railFilter === game.type) recPool = data.queue.filter((x) => x.type === game.type);
  if (!recPool.length) recPool = data.queue;
  const queue =
    queueSeed && recPool.length
      ? recPool.slice(queueSeed % recPool.length).concat(recPool.slice(0, queueSeed % recPool.length))
      : recPool;

  // Comments
  const sortedComments = comments.slice().sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (commentSort === "Top" && b.likesCount !== a.likesCount) return b.likesCount - a.likesCount;
    return b.createdAt.localeCompare(a.createdAt);
  });

  const patchComment = useCallback((id: string, fn: (c: CommentItem) => CommentItem) => {
    setComments((cs) => cs.map((c) => (c.id === id ? fn(c) : c.replies.some((r) => r.id === id) ? { ...c, replies: c.replies.map((r) => (r.id === id ? fn(r) : r)) } : c)));
  }, []);

  const localComment = (id: string, body: string, createdAt: string): CommentItem => ({
    id,
    body,
    likesCount: 0,
    replyCount: 0,
    pinned: false,
    createdAt,
    editedAt: null,
    deleted: false,
    author: {
      id: profile.id ?? "",
      handle: profile.handle,
      displayName: profile.name,
      avatarUrl: profile.avatarUrl,
      isVerified: false,
      isGameCreator: viewer.isCreator,
    },
    liked: false,
    mine: true,
    replies: [],
  });

  const submitComment = async () => {
    const text = draft.trim();
    if (!text || posting) return;
    if (!requireAuth()) return;
    setPosting(true);
    const res = await postComment(game.id, text);
    setPosting(false);
    if (!res.ok) {
      showToast(res.error);
      if (res.code === "auth") requireAuth();
      return;
    }
    setComments((cs) => [localComment(res.id, text, res.createdAt), ...cs]);
    setCommentCount((n) => n + 1);
    setDraft("");
    setCommentSort("Newest");
  };

  const submitReply = async (parentId: string) => {
    const text = replyDraft.trim();
    if (!text || posting) return;
    if (!requireAuth()) return;
    setPosting(true);
    const res = await postComment(game.id, text, parentId);
    setPosting(false);
    if (!res.ok) {
      showToast(res.error);
      if (res.code === "auth") requireAuth();
      return;
    }
    const reply = localComment(res.id, text, res.createdAt);
    setComments((cs) => cs.map((c) => (c.id === parentId ? { ...c, replyCount: c.replyCount + 1, replies: [...c.replies, reply] } : c)));
    setCommentCount((n) => n + 1);
    setReplyDraft("");
    setReplyTo(null);
    setRepliesOpen(parentId);
  };

  const likeComment = (c: CommentItem) => {
    if (!requireAuth()) return;
    const next = !c.liked;
    patchComment(c.id, (y) => ({ ...y, liked: next, likesCount: Math.max(0, y.likesCount + (next ? 1 : -1)) }));
    void toggleCommentLike(c.id).then((res) => {
      if (!res.ok) {
        patchComment(c.id, (y) => ({ ...y, liked: !next, likesCount: Math.max(0, y.likesCount + (next ? -1 : 1)) }));
        showToast(res.error);
        return;
      }
      patchComment(c.id, (y) => ({ ...y, liked: res.active, likesCount: res.count }));
    });
  };

  const removeComment = (c: CommentItem, parentId?: string) => {
    if (!requireAuth()) return;
    void deleteComment(c.id).then((res) => {
      if (!res.ok) {
        showToast(res.error);
        return;
      }
      setComments((cs) =>
        parentId
          ? cs.map((p) => (p.id === parentId ? { ...p, replyCount: Math.max(0, p.replyCount - 1), replies: p.replies.filter((r) => r.id !== c.id) } : p))
          : cs.filter((x) => x.id !== c.id),
      );
      setCommentCount((n) => Math.max(0, n - (parentId ? 1 : 1 + c.replies.length)));
      showToast("Comment removed");
    });
  };

  const togglePin = (c: CommentItem) => {
    if (!requireAuth()) return;
    const next = !c.pinned;
    patchComment(c.id, (y) => ({ ...y, pinned: next }));
    void pinComment(c.id, next).then((res) => {
      if (!res.ok) {
        patchComment(c.id, (y) => ({ ...y, pinned: !next }));
        showToast(res.error);
      }
    });
  };

  const canModerate = (c: CommentItem) => c.mine || viewer.isCreator || viewer.isAdmin;

  const inputUnderline = light ? "1px solid rgba(17,17,20,0.18)" : "1px solid rgba(255,255,255,0.18)";
  const creatorTag: CSSProperties = {
    padding: "2px 8px",
    borderRadius: "12px",
    background: "var(--chip-2)",
    fontSize: "10.5px",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  };

  const versionRows = game.versionList.slice().sort((a, b) => b.version - a.version);
  const description = game.description || game.desc;
  const summary = (game.desc || description).split(".")[0];
  const highlightedRow = !!viewer.userId && !!leaderboard?.entries.some((e) => e.user?.id === viewer.userId);

  const resultBits: string[] = [];
  if (beatPct != null) resultBits.push(`Beat ${Math.round(beatPct)}% of players today`);
  if (rankResult) resultBits.push(`#${rankResult.rank} on today's board${rankResult.personalBest ? " · personal best" : ""}`);
  else if (viewer.rank) resultBits.push(`Personal best ${viewer.rank.score.toLocaleString()}`);
  const runTime = durationLabelMs(durationMs);

  const playerBox: CSSProperties = fullscreen
    ? {
        position: "fixed",
        inset: 0,
        zIndex: 80,
        overflow: "hidden",
        background: "#000",
        color: "#f5f5f7",
        animation: fsClosing ? "hbZoomOut 190ms ease-in forwards" : "hbZoomIn 260ms cubic-bezier(.2,.8,.3,1) both",
      }
    : {
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: "#0b0b0d",
        color: "#f5f5f7",
        borderRadius: theatre ? "0px" : "12px",
        boxShadow: theatre ? "0 40px 120px rgba(0,0,0,0.8)" : "none",
        transition: "border-radius 300ms ease, box-shadow 340ms ease",
      };

  const controlBar = (items: ReactNode, bottom: string, bg: string) => (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom,
        transform: "translateX(-50%)",
        display: "flex",
        gap: "6px",
        padding: "6px",
        borderRadius: "22px",
        background: bg,
        zIndex: 5,
      }}
    >
      {items}
    </div>
  );

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: theatre ? "0px" : "12px" }}>
        <section style={{ flex: "1 1 600px", minWidth: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* Player slot keeps the page layout; the box inside goes fixed for fullscreen. */}
          <div
            style={{
              position: "relative",
              width: "100%",
              height: theatre ? "min(calc(100vh - 170px), 56.25vw)" : "auto",
              aspectRatio: theatre ? "auto" : "16 / 9",
              transition: "height 340ms cubic-bezier(.22,.8,.3,1)",
              zIndex: theatre ? 50 : 1,
            }}
          >
            <div style={playerBox}>
              {frameOn && game.versionId ? (
                <iframe
                  key={frameKey}
                  ref={iframeRef}
                  title={game.title}
                  src={gameFrameSrc({ versionId: game.versionId, playerId: viewer.playerId })}
                  sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-forms allow-modals allow-orientation-lock"
                  allow="autoplay; fullscreen *; gamepad; xr-spatial-tracking; cross-origin-isolated; accelerometer; gyroscope"
                  allowFullScreen
                  referrerPolicy="origin"
                  {...{ credentialless: "true" }}
                  style={frameStyle}
                />
              ) : null}

              {/* First-interaction layer for the bridge's auto-instrumentation. */}
              <div
                ref={overlayRef}
                onPointerDown={onOverlayPointerDown}
                style={{ position: "absolute", inset: 0, zIndex: 2, background: "transparent", pointerEvents: frameOn && !interacted ? "auto" : "none" }}
              />

              <div
                style={{
                  position: "absolute",
                  right: "14px",
                  top: "14px",
                  zIndex: 6,
                  display: "flex",
                  alignItems: "center",
                  gap: "7px",
                  padding: "5px 10px",
                  borderRadius: "6px",
                  background: "rgba(0,0,0,0.72)",
                  fontFamily: mono,
                  fontSize: "10.5px",
                  letterSpacing: "0.06em",
                  color: "#e6e6e6",
                }}
              >
                <span
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: state === "playing" ? "#7ed08a" : "rgba(255,255,255,0.4)",
                    animation: state === "playing" ? "hbBlink 2s ease-in-out infinite" : "none",
                  }}
                />
                {fmt(game.plays)} runs
              </div>

              {state === "cover" || state === "loading" ? (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    zIndex: 3,
                    backgroundImage: `url("${art(game, 1280)}")`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    backgroundColor: "#1c1d22",
                  }}
                />
              ) : null}

              {state === "cover" ? (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    zIndex: 3,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    padding: "clamp(16px, 3%, 28px)",
                    background: "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.45) 50%, rgba(0,0,0,0.85) 100%)",
                    animation: "hbFade 260ms ease-out both",
                  }}
                >
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0 }}>
                    {canPlay ? (
                      <button onClick={start} style={playButtonStyle}>
                        <svg width="20" height="22" viewBox="0 0 22 24" fill="currentColor">
                          <path d="M2 1.6 20 12 2 22.4z" />
                        </svg>
                        Play game
                      </button>
                    ) : (
                      <div style={{ ...onPlayerChip, height: "auto", padding: "10px 16px", cursor: "default", flexDirection: "column", gap: "4px" }}>
                        <span style={{ fontWeight: 600 }}>No playable version</span>
                        <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)" }}>The creator has not pushed a live build yet.</span>
                      </div>
                    )}
                  </div>
                  {!theatre && !fullscreen ? (
                    <div style={{ maxWidth: "min(64%, 560px)" }}>
                      <div style={{ fontFamily: mono, fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.82)" }}>
                        {game.type} · {game.duration}
                        {game.model ? ` · built with ${game.model}` : ""}
                      </div>
                      <div style={{ marginTop: "7px", fontSize: "clamp(20px, 2.2vw, 30px)", fontWeight: 600, letterSpacing: "-0.02em" }}>{game.title}</div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {state === "loading" ? (
                <div style={{ ...overlayBase, gap: "16px", background: "rgba(0,0,0,0.82)", animation: "hbFade 220ms ease-out both" }}>
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      border: "2px solid #333",
                      borderTopColor: "#ffffff",
                      animation: "hbSpin 800ms linear infinite",
                    }}
                  />
                  <div style={{ fontFamily: mono, fontSize: "12px", color: "rgba(255,255,255,0.8)" }}>Fetching build · {game.size}</div>
                  <div style={{ width: "220px", height: "3px", background: "#333" }}>
                    <div style={{ height: "100%", width: "10%", background: "#ffffff", animation: "hbBar 900ms ease-out forwards" }} />
                  </div>
                </div>
              ) : null}

              {state === "paused" ? (
                <div style={{ ...overlayBase, gap: "14px", background: "rgba(0,0,0,0.66)", animation: "hbFade 180ms ease-out both" }}>
                  <div style={{ fontSize: "20px", fontWeight: 600 }}>Paused</div>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button onClick={togglePause} style={onPlayerPrimary}>
                      Resume
                    </button>
                    <button onClick={restart} style={onPlayerChip}>
                      Restart
                    </button>
                    <button onClick={quit} style={onPlayerChip}>
                      Quit
                    </button>
                  </div>
                </div>
              ) : null}

              {state === "finished" ? (
                <div style={{ ...overlayBase, gap: "20px", background: "rgba(0,0,0,0.86)", animation: "hbRise 300ms ease-out both" }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: mono, fontSize: "11.5px", letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.66)" }}>
                      Run complete{runTime ? ` · ${runTime}` : ""}
                    </div>
                    {score != null ? (
                      <div style={{ fontFamily: mono, fontSize: "54px", fontWeight: 500, letterSpacing: "-0.03em", margin: "6px 0 2px" }}>{score.toLocaleString()}</div>
                    ) : (
                      <div style={{ fontSize: "22px", fontWeight: 600, margin: "10px 0 4px" }}>{game.title}</div>
                    )}
                    {resultBits.length ? <div style={{ fontSize: "13.5px", color: "rgba(255,255,255,0.76)" }}>{resultBits.join(" · ")}</div> : null}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "9px" }}>
                    <button onClick={restart} style={onPlayerPrimary}>
                      Play again
                    </button>
                    {remixable ? (
                      <button onClick={openRemix} style={onPlayerChip}>
                        Remix
                      </button>
                    ) : null}
                    {nextGame ? (
                      <Link href={nextGame.url} style={onPlayerChip}>
                        Next game
                      </Link>
                    ) : null}
                    <button onClick={() => setState("playing")} style={{ ...onPlayerChip, background: "transparent", color: "rgba(255,255,255,0.7)" }}>
                      Back to game
                    </button>
                  </div>
                </div>
              ) : null}

              {theatre && !fullscreen
                ? controlBar(
                    <>
                      <button onClick={() => setTheatre(false)} style={onPlayerChip}>
                        Exit theatre
                      </button>
                      <button onClick={restart} style={onPlayerChip}>
                        Restart
                      </button>
                      <button onClick={() => setMuted((m) => !m)} style={onPlayerChip}>
                        {soundLabel}
                      </button>
                      <button onClick={() => setFullscreen(true)} style={onPlayerChip}>
                        Fullscreen
                      </button>
                    </>,
                    "16px",
                    "rgba(0,0,0,0.72)",
                  )
                : null}

              {fullscreen
                ? controlBar(
                    <>
                      <button onClick={exitFullscreen} style={onPlayerChip}>
                        Exit · Esc
                      </button>
                      <button onClick={restart} style={onPlayerChip}>
                        Restart
                      </button>
                      <button onClick={togglePause} style={onPlayerChip}>
                        {pauseLabel}
                      </button>
                      <button onClick={() => setMuted((m) => !m)} style={onPlayerChip}>
                        {soundLabel}
                      </button>
                    </>,
                    "22px",
                    "rgba(0,0,0,0.66)",
                  )
                : null}
            </div>
          </div>

          {/* Controls */}
          <div style={{ ...bpanel, display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px", padding: "7px 10px" }}>
            <button onClick={restart} disabled={!canPlay} style={{ ...ctrlBtn, opacity: canPlay ? 1 : 0.5 }}>
              Restart
            </button>
            <button onClick={togglePause} disabled={!canPlay} style={{ ...ctrlBtn, opacity: canPlay ? 1 : 0.5 }}>
              {pauseLabel}
            </button>
            <button onClick={() => setMuted((m) => !m)} style={ctrlBtn}>
              {soundLabel}
            </button>
            <div style={{ flex: 1, minWidth: "8px" }} />
            <span style={{ fontFamily: mono, fontSize: "11px", color: "var(--ink-5)", marginRight: "6px" }}>{stateLabel}</span>
            <button
              onClick={() => setAutoplay((a) => !a)}
              style={{
                height: "28px",
                padding: "0 11px",
                borderRadius: "6px",
                fontFamily: mono,
                fontSize: "10.5px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
                background: autoplay ? "var(--ink)" : "var(--chip)",
                color: autoplay ? "var(--ink-invert)" : "var(--ink-4)",
              }}
            >
              {autoplay ? "Autoplay on" : "Autoplay off"}
            </button>
            <button
              onClick={() => {
                setTheatre(!theatre);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              style={ctrlBtn}
            >
              Theatre
            </button>
            <button onClick={() => setFullscreen(true)} style={ctrlBtn}>
              Fullscreen
            </button>
          </div>

          {/* Title, creator, actions, description */}
          <div style={{ ...bpanel, display: "flex", flexDirection: "column", gap: "12px", padding: "16px 18px" }}>
            <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 600, letterSpacing: "-0.02em" }}>{game.title}</h1>

            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                <Link href={`/@${game.creator}`} style={{ display: "flex", flex: "0 0 auto", color: "inherit" }}>
                  <CreatorAvatar game={game} />
                </Link>
                <div style={{ minWidth: 0 }}>
                  <Link href={`/@${game.creator}`} style={{ display: "block", fontSize: "15px", fontWeight: 600, color: "var(--ink)" }}>
                    {game.creatorName}
                  </Link>
                  <div style={{ fontSize: "12.5px", color: "var(--ink-4)", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    <Link href={`/@${game.creator}`} style={{ color: "inherit" }}>
                      @{game.creator}
                    </Link>{" "}
                    · {fmt(followers)} followers
                  </div>
                </div>
                {!viewer.isCreator ? (
                  <button onClick={onFollow} style={{ ...(following ? pill() : pill("primary")), height: "36px" }}>
                    {following ? "Following" : "Follow"}
                  </button>
                ) : null}
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", background: "var(--chip)", borderRadius: "19px", overflow: "hidden" }}>
                  <button
                    onClick={onLike}
                    aria-pressed={liked}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "7px",
                      height: "36px",
                      padding: "0 15px",
                      background: "transparent",
                      color: liked ? "var(--like)" : "var(--ink)",
                      fontSize: "13.5px",
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    ♥ {fmt(likes)}
                  </button>
                  <div style={{ width: "1px", height: "22px", background: "var(--divider)" }} />
                  <button
                    onClick={openShare}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      height: "36px",
                      padding: "0 15px",
                      background: "transparent",
                      color: "var(--ink)",
                      fontSize: "13.5px",
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    Share
                  </button>
                </div>
                {remixable ? (
                  <button onClick={openRemix} style={chipBtn}>
                    Remix
                  </button>
                ) : (
                  <button disabled title="The creator turned remixing off" style={{ ...chipBtn, opacity: 0.55, cursor: "not-allowed" }}>
                    Remixes off
                  </button>
                )}
                <button onClick={() => toggleSaved(game.id)} style={saved ? { ...pill(), background: "var(--chip-2)" } : pill()}>
                  {saved ? "Saved" : "Save"}
                </button>
                <button onClick={() => setMoreOpen((m) => !m)} aria-label="More actions" style={chipBtn}>
                  ···
                </button>
              </div>
            </div>

            {moreOpen ? (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button onClick={copyLink} style={chipBtn}>
                  {copied ? "Copied" : "Copy"} link
                </button>
                <button onClick={openShare} style={chipBtn}>
                  Embed
                </button>
                <button onClick={openReport} style={chipBtn}>
                  Report
                </button>
              </div>
            ) : null}

            <div style={{ padding: "14px 16px", borderRadius: "12px", background: "var(--chip)" }}>
              <div style={{ fontFamily: mono, fontSize: "12.5px", letterSpacing: "0.04em", color: "var(--ink-2)" }}>
                {fmt(game.plays)} runs · best {best(game)} · {fmt(game.remixes)} remixes · {game.age}
              </div>
              {description ? (
                <div style={{ marginTop: "8px", fontSize: "14px", lineHeight: 1.6, color: "var(--ink-2)", maxWidth: "78ch", whiteSpace: "pre-line" }}>{description}</div>
              ) : null}
              {game.remixedFrom ? (
                <div style={{ marginTop: "8px", fontSize: "12.5px", color: "var(--ink-4)" }}>
                  Remixed from{" "}
                  <Link href={`/@${game.remixedFrom.handle}/${game.remixedFrom.slug}`} style={{ color: "var(--link)", fontWeight: 600 }}>
                    {game.remixedFrom.title}
                  </Link>{" "}
                  by @{game.remixedFrom.handle}
                </div>
              ) : null}
              {descOpen ? (
                <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  {game.prompt ? (
                    <>
                      <div style={{ ...monoLabel, fontSize: "11px", letterSpacing: "0.1em" }}>Prompt behind the current build</div>
                      <div
                        style={{
                          padding: "12px 14px",
                          borderRadius: "10px",
                          background: "var(--panel)",
                          fontFamily: mono,
                          fontSize: "12.5px",
                          lineHeight: 1.65,
                          color: "var(--ink-3)",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {game.prompt}
                      </div>
                    </>
                  ) : null}
                  <div style={{ ...monoLabel, fontSize: "11px", letterSpacing: "0.1em", marginTop: game.prompt ? "6px" : 0 }}>Version history</div>
                  {versionRows.length ? (
                    versionRows.map((v) => (
                      <div key={v.id} style={{ display: "flex", alignItems: "baseline", gap: "12px", fontSize: "13px", color: "var(--ink-3)" }}>
                        <span style={{ fontFamily: mono, fontSize: "12px", color: "var(--ink)", minWidth: "34px" }}>v{v.version}</span>
                        <span style={{ flex: 1 }}>{v.changelog || "No notes"}</span>
                        <span style={{ fontFamily: mono, fontSize: "11.5px", color: "var(--ink-5)" }}>{relativeTime(v.createdAt)}</span>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: "13px", color: "var(--ink-5)" }}>No versions pushed yet.</div>
                  )}
                </div>
              ) : null}
              <button
                onClick={() => setDescOpen((d) => !d)}
                style={{ marginTop: "10px", padding: 0, background: "transparent", color: "var(--ink)", fontSize: "13.5px", fontWeight: 600, cursor: "pointer" }}
              >
                {descOpen ? "Show less" : game.prompt ? "Show prompt and version history" : "Show version history"}
              </button>
            </div>
          </div>

          {/* How to play */}
          <div style={{ ...bpanel, padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <div style={monoLabel}>How to play</div>
              <div style={{ fontFamily: mono, fontSize: "10.5px", color: "var(--ink-5)" }}>
                {game.type} · {game.duration}
              </div>
            </div>
            {summary ? <div style={{ marginTop: "10px", fontSize: "14.5px", lineHeight: 1.5, color: "var(--ink)", maxWidth: "70ch" }}>{summary}.</div> : null}
            <div style={{ marginTop: "14px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "8px" }}>
              {controlsFor(game).map((c) => (
                <div key={c.key} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: "44px",
                      height: "26px",
                      padding: "0 9px",
                      borderRadius: "6px",
                      background: "var(--chip)",
                      fontFamily: mono,
                      fontSize: "11px",
                      color: "var(--ink)",
                    }}
                  >
                    {c.key}
                  </span>
                  <span style={{ fontSize: "13px", color: "var(--ink-3)" }}>{c.action}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: "12px", fontFamily: mono, fontSize: "11px", color: "var(--ink-5)" }}>Touch: {touchHintFor(game)}</div>
          </div>

          {/* Today's board */}
          <div style={{ ...bpanel, padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <div style={monoLabel}>Today&apos;s board · resets at midnight UTC</div>
              <div style={{ fontFamily: mono, fontSize: "11px", color: "var(--ink-5)" }}>{fmt(runsToday)} runs today</div>
            </div>
            <div style={{ marginTop: "12px", display: "flex", flexDirection: "column" }}>
              {leaderboard ? (
                <>
                  {leaderboard.entries.length ? (
                    leaderboard.entries.map((r) => {
                      const you = !!viewer.userId && r.user?.id === viewer.userId;
                      return (
                        <div
                          key={`${r.rank}-${r.playerId}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            padding: "9px 10px",
                            borderRadius: "8px",
                            background: you ? "var(--chip)" : "transparent",
                            color: you ? "var(--ink)" : "var(--ink-2)",
                          }}
                        >
                          <span style={{ fontFamily: mono, fontSize: "12px", color: "var(--ink-5)", width: "26px" }}>{String(r.rank).padStart(2, "0")}</span>
                          <span style={{ flex: 1, fontSize: "13.5px", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {r.user?.handle ?? (r.isBot && r.botLabel ? r.botLabel : "anonymous")}
                            {you ? <span style={{ fontFamily: mono, fontSize: "10.5px", color: "var(--ink-5)", marginLeft: "8px" }}>you</span> : null}
                          </span>
                          <span style={{ fontFamily: mono, fontSize: "11px", color: "var(--ink-5)" }}>{r.isBot ? "BOT" : "HUMAN"}</span>
                          <span style={{ fontFamily: mono, fontSize: "13px", minWidth: "64px", textAlign: "right" }}>{r.score.toLocaleString()}</span>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ padding: "9px 10px", fontSize: "13px", color: "var(--ink-5)" }}>Nobody has scored today. Yours would be first.</div>
                  )}
                  {viewer.rank && !highlightedRow ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "9px 10px",
                        borderRadius: "8px",
                        background: "var(--chip)",
                        color: "var(--ink)",
                        marginTop: "8px",
                      }}
                    >
                      <span style={{ fontFamily: mono, fontSize: "12px", color: "var(--ink-5)", width: "26px" }}>{String(viewer.rank.rank).padStart(2, "0")}</span>
                      <span style={{ flex: 1, fontSize: "13.5px", fontWeight: 500 }}>you · #{viewer.rank.rank} of {viewer.rank.total.toLocaleString()}</span>
                      <span style={{ fontFamily: mono, fontSize: "11px", color: "var(--ink-5)" }}>HUMAN</span>
                      <span style={{ fontFamily: mono, fontSize: "13px", minWidth: "64px", textAlign: "right" }}>{viewer.rank.score.toLocaleString()}</span>
                    </div>
                  ) : null}
                </>
              ) : (
                <div style={{ padding: "12px 10px", borderRadius: "8px", background: "var(--chip)", fontSize: "13px", color: "var(--ink-4)" }}>
                  No leaderboard for this game
                </div>
              )}
            </div>
          </div>

          {/* Build stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px" }}>
            {[
              {
                label: "Model",
                value: game.model || "—",
                note: game.model ? "generated the current build" : "model not recorded",
                href: game.model ? `/explore?model=${encodeURIComponent(game.model)}` : undefined,
              },
              {
                label: "Published with",
                value: game.tool || "—",
                note: game.versions ? `v${game.versions} is live` : "no live build",
                href: game.tool ? `/explore?tool=${encodeURIComponent(game.tool)}` : undefined,
              },
              { label: "Runtime", value: game.engine || "html", note: game.usesNetwork ? "talks to the network" : "no external requests" },
              { label: "Bundle", value: game.size, note: game.needsIsolation ? "runs cross-origin isolated" : "sandboxed iframe" },
              { label: "Versions", value: game.versions ? `v${game.versions}` : "—", note: `last push ${game.age}` },
              { label: "Remix licence", value: remixable ? "Open" : "No remixes", note: `${fmt(game.remixes)} forks` },
            ].map((s) => (
              <div key={s.label} style={{ ...bpanel, borderRadius: "12px", padding: "12px 14px" }}>
                <div style={statLabel}>{s.label}</div>
                <div style={{ marginTop: "6px", fontSize: "14px", fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.href ? (
                    <Link href={s.href} title={`More games made with ${s.value}`} style={{ color: "inherit", textDecoration: "underline", textDecorationColor: "var(--chip-2)", textUnderlineOffset: "3px" }}>
                      {s.value}
                    </Link>
                  ) : (
                    s.value
                  )}
                </div>
                <div style={{ marginTop: "3px", fontSize: "12px", color: "var(--ink-5)" }}>{s.note}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Up next rail */}
        {!theatre ? (
          <aside style={{ ...bpanel, flex: "1 1 320px", maxWidth: mobile ? "none" : "360px", padding: "12px", alignSelf: "stretch" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "10px",
                paddingBottom: "10px",
                borderBottom: "1px solid var(--divider)",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: "9px" }}>
                <span style={{ fontSize: "15px", fontWeight: 600 }}>Up next</span>
                <span style={{ fontFamily: mono, fontSize: "10.5px", color: "var(--ink-6)" }}>{recPool.length} in queue</span>
              </div>
              <button
                onClick={() => setQueueSeed((q) => q + 1)}
                style={{
                  height: "28px",
                  padding: "0 12px",
                  borderRadius: "6px",
                  fontFamily: mono,
                  fontSize: "10.5px",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  background: "var(--chip)",
                  color: "var(--ink-4)",
                  cursor: "pointer",
                }}
              >
                Shuffle
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px", padding: "10px 0 8px" }}>
              {["All", "Same model", `@${game.creator}`, game.type].map((l) => (
                <button
                  key={l}
                  onClick={() => setRailFilter(l)}
                  style={{
                    flex: "0 0 auto",
                    height: "28px",
                    padding: "0 11px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 500,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    background: railFilter === l ? "var(--ink)" : "var(--chip)",
                    color: railFilter === l ? "var(--ink-invert)" : "var(--ink-4)",
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {queue.length ? (
                queue.map((x, i) => <RailRow key={x.id} game={x} queueNo={String(i + 1).padStart(2, "0")} />)
              ) : (
                <div style={{ padding: "14px 8px", fontSize: "13px", color: "var(--ink-5)" }}>Nothing else in the queue yet.</div>
              )}
            </div>
          </aside>
        ) : null}
      </div>

      {/* Comments */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "12px", marginTop: "12px" }}>
        <div style={{ ...bpanel, flex: "1 1 600px", padding: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "18px", flexWrap: "wrap" }}>
            <div style={{ fontSize: "17px", fontWeight: 600 }}>
              {fmt(commentCount)} {commentCount === 1 ? "comment" : "comments"}
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              {(["Top", "Newest"] as const).map((l) => (
                <button key={l} onClick={() => setCommentSort(l)} style={chipStyle(commentSort === l)}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginTop: "18px" }}>
            <Avatar name={signedIn ? profile.name : "?"} url={signedIn ? profile.avatarUrl : null} size={36} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <input
                className="hb-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onFocus={() => {
                  if (!signedIn) requireAuth();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitComment();
                }}
                maxLength={500}
                placeholder={signedIn ? "Add a comment. Post a score, a strategy, a bug." : "Sign in to comment."}
                style={{
                  width: "100%",
                  height: "38px",
                  padding: "0 4px",
                  border: "none",
                  borderBottom: inputUnderline,
                  background: "transparent",
                  color: "var(--ink)",
                  fontSize: "14px",
                  fontFamily: "inherit",
                  outline: "none",
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "10px" }}>
                <button onClick={() => setDraft("")} style={chipBtn}>
                  Cancel
                </button>
                <button
                  onClick={() => void submitComment()}
                  disabled={posting}
                  style={{
                    ...pill(),
                    background: draft.trim() ? "var(--ink)" : "var(--chip)",
                    color: draft.trim() ? "var(--ink-invert)" : "var(--ink-5)",
                    fontWeight: 600,
                    opacity: posting ? 0.6 : 1,
                  }}
                >
                  Comment
                </button>
              </div>
            </div>
          </div>

          <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "20px" }}>
            {sortedComments.length === 0 ? (
              <div style={{ padding: "18px 0", fontSize: "13.5px", color: "var(--ink-5)" }}>No comments yet. Say something about the game.</div>
            ) : null}
            {sortedComments.map((c) => (
              <div key={c.id} style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                <Avatar name={c.author.displayName || c.author.handle} url={c.author.avatarUrl} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    {c.pinned ? <span style={{ ...monoLabel, fontSize: "10px", letterSpacing: "0.1em" }}>Pinned</span> : null}
                    <Link href={`/@${c.author.handle}`} style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink)" }}>
                      @{c.author.handle}
                    </Link>
                    {c.author.isGameCreator ? <span style={creatorTag}>Creator</span> : null}
                    <span style={{ fontSize: "12px", color: "var(--ink-5)" }}>
                      {relativeTime(c.createdAt)}
                      {c.editedAt ? " · edited" : ""}
                    </span>
                  </div>
                  <div style={{ marginTop: "5px", fontSize: "14px", lineHeight: 1.55, color: "var(--ink)", maxWidth: "78ch", whiteSpace: "pre-line" }}>{c.body}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
                    <button
                      onClick={() => likeComment(c)}
                      aria-pressed={c.liked}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        height: "30px",
                        padding: "0 12px",
                        borderRadius: "15px",
                        background: "transparent",
                        color: c.liked ? "var(--like)" : "var(--ink-4)",
                        fontSize: "12.5px",
                        cursor: "pointer",
                      }}
                    >
                      ♥ {fmt(c.likesCount)}
                    </button>
                    <button
                      onClick={() => {
                        if (!requireAuth()) return;
                        setReplyTo(replyTo === c.id ? null : c.id);
                        setReplyDraft("");
                      }}
                      style={smallActionBtn}
                    >
                      Reply
                    </button>
                    {viewer.isCreator ? (
                      <button onClick={() => togglePin(c)} style={smallActionBtn}>
                        {c.pinned ? "Unpin" : "Pin"}
                      </button>
                    ) : null}
                    {canModerate(c) ? (
                      <button onClick={() => removeComment(c)} style={{ ...smallActionBtn, color: "var(--ink-5)" }}>
                        Delete
                      </button>
                    ) : null}
                    {c.replies.length ? (
                      <button
                        onClick={() => setRepliesOpen(repliesOpen === c.id ? null : c.id)}
                        style={{
                          height: "28px",
                          padding: "0 11px",
                          borderRadius: "14px",
                          background: "transparent",
                          color: "var(--link)",
                          fontSize: "12.5px",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {repliesOpen === c.id ? "Hide " : ""}
                        {c.replyCount || c.replies.length} {(c.replyCount || c.replies.length) === 1 ? "reply" : "replies"}
                      </button>
                    ) : null}
                  </div>

                  {replyTo === c.id ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "10px" }}>
                      <input
                        className="hb-input"
                        value={replyDraft}
                        autoFocus
                        onChange={(e) => setReplyDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void submitReply(c.id);
                        }}
                        maxLength={500}
                        placeholder={`Reply to @${c.author.handle}`}
                        style={{
                          flex: 1,
                          height: "36px",
                          padding: "0 4px",
                          border: "none",
                          borderBottom: inputUnderline,
                          background: "transparent",
                          color: "var(--ink)",
                          fontSize: "13.5px",
                          fontFamily: "inherit",
                          outline: "none",
                        }}
                      />
                      <button
                        onClick={() => void submitReply(c.id)}
                        disabled={posting}
                        style={{
                          ...pill(),
                          background: replyDraft.trim() ? "var(--ink)" : "var(--chip)",
                          color: replyDraft.trim() ? "var(--ink-invert)" : "var(--ink-5)",
                          fontWeight: 600,
                          opacity: posting ? 0.6 : 1,
                        }}
                      >
                        Reply
                      </button>
                    </div>
                  ) : null}

                  {repliesOpen === c.id ? (
                    <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "14px" }}>
                      {c.replies.map((r) => (
                        <div key={r.id} style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                          <Avatar name={r.author.displayName || r.author.handle} url={r.author.avatarUrl} size={28} />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                              <Link href={`/@${r.author.handle}`} style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--ink)" }}>
                                @{r.author.handle}
                              </Link>
                              {r.author.isGameCreator ? <span style={{ ...creatorTag, padding: "2px 7px", fontSize: "10px" }}>Creator</span> : null}
                              <span style={{ fontSize: "11.5px", color: "var(--ink-5)" }}>{relativeTime(r.createdAt)}</span>
                            </div>
                            <div style={{ marginTop: "4px", fontSize: "13.5px", lineHeight: 1.55, color: "var(--ink-2)", whiteSpace: "pre-line" }}>{r.body}</div>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "4px" }}>
                              <button
                                onClick={() => likeComment(r)}
                                aria-pressed={r.liked}
                                style={{ ...smallActionBtn, height: "26px", padding: "0 9px", fontWeight: 500, color: r.liked ? "var(--like)" : "var(--ink-4)" }}
                              >
                                ♥ {fmt(r.likesCount)}
                              </button>
                              {canModerate(r) ? (
                                <button onClick={() => removeComment(r, c.id)} style={{ ...smallActionBtn, height: "26px", padding: "0 9px", color: "var(--ink-5)" }}>
                                  Delete
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                      {c.replyCount > c.replies.length ? (
                        <div style={{ fontSize: "12px", color: "var(--ink-5)" }}>
                          {c.replyCount - c.replies.length} more {c.replyCount - c.replies.length === 1 ? "reply" : "replies"} not shown
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
        {!theatre && !mobile ? <div style={{ flex: "1 1 320px", maxWidth: "360px", minWidth: 0, height: "1px" }} /> : null}
      </div>
    </>
  );
}
