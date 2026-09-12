"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { preconnect } from "react-dom";
import { art, best, controlsFor, fmt, initialsOf, relativeTime, touchHintFor } from "@/lib/habiv/games";
import type { WatchData } from "@/lib/habiv/page-data";
import { gameFrameSrc } from "@/lib/bridge/parent";
import { mountBridgeHost, type BridgeHost, type HostEvent } from "@/lib/player/bridge-host";
import { getCollector } from "@/lib/analytics/collector";
import { toggleFollow, toggleLike } from "@/lib/actions/social";
import { deleteComment, pinComment, postComment, toggleCommentLike } from "@/lib/actions/comments";
import { refreshLeaderboard } from "@/lib/actions/leaderboard";
import { createClient } from "@/lib/supabase/client";
import type { CommentItem } from "@/lib/db/comments";
import { gameOrigin, siteUrl } from "@/lib/site";
import { createPortal } from "react-dom";
import { bpanel, chipBtn, chipStyle, ctrlBtn, modalScrimStyle, modalSmStyleFor, mono, monoLabel, pill } from "@/lib/habiv/ui";
import { Maximize, RectangleHorizontal, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { CreatorAvatar, RailRow } from "./game-card";
import { useShell } from "./shell-context";

type PlayerState = "cover" | "loading" | "playing" | "paused";

const READY_TIMEOUT_MS = 5000;

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

// Player control bar: icon + label buttons.
const ctrlIconBtn: CSSProperties = { ...ctrlBtn, display: "inline-flex", alignItems: "center", gap: "7px" };
const ctrlIcon = { size: 15, strokeWidth: 1.8, "aria-hidden": true } as const;

// Fullscreen controls fade out after this long without the pointer near them.
const FS_CONTROLS_IDLE_MS = 2500;
const MUTED_KEY = "hv:muted";
/** Board rows shown on the page; the rest of the top 50 opens in a modal. */
const BOARD_PREVIEW = 5;

// A guest who closes the "sign in to keep it" prompt isn't asked again this visit.
const GUEST_PROMPT_OFF_KEY = "hv_guest_score_prompt_off";
function guestPromptOff() {
  try {
    return sessionStorage.getItem(GUEST_PROMPT_OFF_KEY) === "1";
  } catch {
    return false;
  }
}
function turnGuestPromptOff() {
  try {
    sessionStorage.setItem(GUEST_PROMPT_OFF_KEY, "1");
  } catch {
    /* ignore */
  }
}

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
  const { game, viewer, runsToday } = data;
  // Today's board and the viewer's place on it; kept live after the first render (refreshBoard below).
  const [leaderboard, setLeaderboard] = useState(data.leaderboard);
  const [myRank, setMyRank] = useState(viewer.rank);
  const [boardOpen, setBoardOpen] = useState(false);
  const { theatre, setTheatre, openModal, setModalGameId, isSaved, toggleSaved, showToast, mobile, light, profile, signedIn, requireAuth, openAuth, modal, searchOpen } =
    useShell();

  // Player
  const [state, setState] = useState<PlayerState>("cover");
  const [frameOn, setFrameOn] = useState(false);
  const [frameKey, setFrameKey] = useState(0);
  // Runs this viewer started since the page loaded, so the count moves on Play without a refresh.
  const [playsBump, setPlaysBump] = useState(0);
  // Distinct players with a fresh open run on this game.
  const [nowPlaying, setNowPlaying] = useState(data.nowPlaying);
  // Corner note after a scored run: a guest is asked to sign in to keep the score; a signed-in
  // player hears only about a new personal best in a board's top 3.
  const [note, setNote] = useState<{ text: string; guest: boolean } | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Read by the bridge callback without remounting the game when the session changes.
  const signedInRef = useRef(signedIn);
  useEffect(() => {
    signedInRef.current = signedIn;
  }, [signedIn]);
  const [fullscreen, setFullscreen] = useState(false);
  const [fsClosing, setFsClosing] = useState(false);
  const [fsControls, setFsControls] = useState(true);
  // Sound on unless this browser turned it off before (the bridge enforces it inside the game).
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(MUTED_KEY) === "1") setMuted(true);
    } catch {
      /* storage blocked */
    }
  }, []);
  const toggleMuted = () =>
    setMuted((m) => {
      try {
        localStorage.setItem(MUTED_KEY, m ? "0" : "1");
      } catch {
        /* storage blocked */
      }
      return !m;
    });

  // Social
  const [liked, setLiked] = useState(viewer.liked);
  const [likes, setLikes] = useState(game.likes);
  const [following, setFollowing] = useState(viewer.following);
  const [followers, setFollowers] = useState(game.followers);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  // Tallest height the game has said its content needs (bridge "size"); the phone player grows to it.
  const [fitHeight, setFitHeight] = useState(0);

  // The ··· menu closes on an outside press or Escape.
  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);
  // Opened when playing an older version, so the version list is right there.
  const [descOpen, setDescOpen] = useState(!!game.playing);
  // Phones show two lines of the description until Read more.
  const [descMore, setDescMore] = useState(false);
  // Narrower pills on phones so the whole action row, ··· included, fits on one line.
  const tight: CSSProperties | undefined = mobile ? { padding: "0 12px" } : undefined;
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
  const playerBoxRef = useRef<HTMLDivElement>(null);
  const fsHideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hostRef = useRef<BridgeHost | null>(null);
  const mutedRef = useRef(muted);
  const loadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seenGame = useRef(game.id);
  const warmedVersion = useRef<string | null>(null);

  const canPlay = !!game.versionId;

  if (gameOrigin) preconnect(gameOrigin);

  // Hovering Play wakes the game origin and fills its edge cache, so the click has less to wait on.
  const warmBuild = () => {
    if (!gameOrigin || !game.versionId || warmedVersion.current === game.versionId) return;
    warmedVersion.current = game.versionId;
    fetch(gameFrameSrc({ versionId: game.versionId }), { mode: "no-cors", credentials: "omit" }).catch(() => {});
  };

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
    setPlaysBump(0);
    setNowPlaying(data.nowPlaying);
    setNote(null);
    setLeaderboard(data.leaderboard);
    setMyRank(viewer.rank);
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
  }, [game.id, game.likes, game.followers, game.comments, viewer.liked, viewer.following, viewer.rank, data.comments.items, data.leaderboard, data.nowPlaying]);

  useEffect(
    () => () => {
      clearTimeout(loadTimer.current);
      clearTimeout(noteTimer.current);
    },
    [],
  );

  // Live board: refetch after the viewer's own saved score and whenever any score lands on today's
  // board. A newer refetch wins over a slower older one.
  const boardSeq = useRef(0);
  const refreshBoard = useCallback(() => {
    const seq = ++boardSeq.current;
    void refreshLeaderboard(game.id).then((res) => {
      if (!res || seq !== boardSeq.current) return;
      setLeaderboard(res.leaderboard);
      setMyRank(res.rank);
    });
  }, [game.id]);

  const presenceSeq = useRef(0);
  const refreshNowPlaying = useCallback(() => {
    const seq = ++presenceSeq.current;
    void fetch(`/api/games/${game.id}/playing`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as { playing?: number };
      })
      .then((res) => {
        if (seq !== presenceSeq.current || typeof res?.playing !== "number") return;
        setNowPlaying(Math.max(0, res.playing));
      })
      .catch(() => {
        /* Keep the last known count when presence is temporarily unavailable. */
      });
  }, [game.id]);

  useEffect(() => {
    refreshNowPlaying();
    const timer = setInterval(refreshNowPlaying, 15_000);
    return () => clearInterval(timer);
  }, [refreshNowPlaying]);

  const boardId = leaderboard?.id ?? null;
  useEffect(() => {
    if (!boardId) return;
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(`lb:${boardId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "leaderboard_entries", filter: `leaderboard_id=eq.${boardId}` }, () => {
        // A burst of scores (or one score's insert + update) becomes one refetch.
        clearTimeout(timer);
        timer = setTimeout(refreshBoard, 600);
      })
      .subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [boardId, refreshBoard]);

  useEffect(() => {
    if (!boardOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBoardOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [boardOpen]);

  const onHostEvent = useCallback(
    (e: HostEvent) => {
      switch (e.type) {
        case "ready":
          clearTimeout(loadTimer.current);
          setState((s) => (s === "loading" ? "playing" : s));
          break;
        case "run_start":
          if (e.counted) setPlaysBump((n) => n + 1);
          setState("playing");
          refreshNowPlaying();
          break;
        case "run_end":
          refreshNowPlaying();
          break;
        // Grow-only, so a frame that grew to fit never bounces back once the content fits.
        case "size":
          setFitHeight((h) => Math.max(h, e.height));
          break;
        // The game draws its own end screen; the page only calls out a new personal best that made a
        // top 3 (naming the longest board it made) and asks guests to sign in to keep their score.
        case "score_result": {
          if (!e.accepted) break;
          refreshBoard();
          const top = ["alltime", "weekly", "daily"]
            .map((p) => e.boards.find((b) => b.period === p && b.personal_best && b.rank <= 3))
            .find((b) => !!b);
          const rank = top ? `#${top.rank} ${top.period === "alltime" ? "all time" : top.period === "weekly" ? "this week" : "today"}` : null;
          clearTimeout(noteTimer.current);
          if (!signedInRef.current && !guestPromptOff()) {
            setNote({ text: rank ? `${rank} · saved as a guest` : "Score saved as a guest", guest: true });
            break;
          }
          if (!rank) break;
          setNote({ text: rank, guest: false });
          noteTimer.current = setTimeout(() => setNote(null), 7000);
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
    [showToast, refreshBoard, refreshNowPlaying],
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
      onEvent: onHostEvent,
      startOnMount: true,
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

  // Fixed for each mounted frame (a new frameKey is a fresh iframe): a src that followed `muted`
  // would reload the game on every toggle, and later toggles go over the bridge instead.
  const [frameSrc, setFrameSrc] = useState<string | undefined>(undefined);
  useEffect(() => {
    setFrameSrc(game.versionId ? gameFrameSrc({ versionId: game.versionId, playerId: viewer.playerId, muted: mutedRef.current }) : undefined);
  }, [game.versionId, viewer.playerId, frameKey]);

  const launch = useCallback(
    (fromPlayButton: boolean) => {
      if (!game.versionId) return;
      clearTimeout(loadTimer.current);
      if (fromPlayButton) getCollector().track({ name: "play_click", game_id: game.id, version_id: game.versionId });
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
    } else if (state === "cover") {
      start();
    }
  };

  const quit = () => {
    clearTimeout(loadTimer.current);
    setFrameOn(false);
    setState("cover");
  };

  // Keys only reach the game while its iframe has focus. Take it when play starts or resumes,
  // and again after a player control (mute, theatre, fullscreen) pulls it back to the page.
  // Nothing sits over the iframe: a click goes straight to the game and focuses it natively
  // (a transparent click layer used to swallow the first click and hand focus back to the page).
  // The play itself is counted by the run minted on Play (startOnMount).
  useEffect(() => {
    if (state === "playing") iframeRef.current?.focus({ preventScroll: true });
  }, [state, muted, theatre, fullscreen]);

  // Real fullscreen (browser chrome hidden) where the Fullscreen API exists; elsewhere (iPhone Safari)
  // the player box stays a fixed full-window layer.
  const enterFullscreen = () => {
    setFullscreen(true);
    const el = playerBoxRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
    if (!el) return;
    if (el.requestFullscreen) el.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
    else el.webkitRequestFullscreen?.();
  };

  const exitFullscreen = () => {
    const doc = document as Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
    // The fullscreenchange listener below drops the fullscreen state once the browser has left it.
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    if (doc.webkitFullscreenElement) {
      doc.webkitExitFullscreen?.();
      return;
    }
    if (fsClosing) return;
    setFsClosing(true);
    setTimeout(() => {
      setFullscreen(false);
      setFsClosing(false);
    }, 190);
  };

  // The browser's own Esc (or a swipe) leaves real fullscreen without a keydown reaching the page.
  useEffect(() => {
    const onChange = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      if (!(document.fullscreenElement ?? doc.webkitFullscreenElement)) setFullscreen(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && fullscreen) exitFullscreen();
      // Space on the cover plays from anywhere on the page: back up to the player, then start.
      // Typing, focused controls (which Space presses natively), search and modals keep the key.
      if (e.code !== "Space" || state !== "cover" || !canPlay || e.repeat || e.metaKey || e.ctrlKey || e.altKey || modal || searchOpen) return;
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName))) return;
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
      start();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Fullscreen controls stay hidden at the top until the pointer reaches the top edge (or taps it),
  // then fade after a pause so they never sit over the game. Pointer moves over the iframe never
  // reach this page, hence the edge strip.
  const pokeFsControls = useCallback(() => {
    setFsControls(true);
    clearTimeout(fsHideTimer.current);
    fsHideTimer.current = setTimeout(() => setFsControls(false), FS_CONTROLS_IDLE_MS);
  }, []);

  const holdFsControls = () => {
    clearTimeout(fsHideTimer.current);
    setFsControls(true);
  };

  useEffect(() => {
    clearTimeout(fsHideTimer.current);
    setFsControls(false);
  }, [fullscreen]);

  useEffect(() => () => clearTimeout(fsHideTimer.current), []);

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
  const openShareScore = () => {
    setNote(null);
    setModalGameId(game.id);
    openModal("shareScore");
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
  const stateLabel = { cover: "READY", loading: "LOADING", playing: "PLAYING", paused: "PAUSED" }[state];

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
  const howToKeys = controlsFor(game);
  const howToTouch = touchHintFor(game);
  const summary = (game.desc || description).split(".")[0];
  // The viewer's row: by account, or by this browser's player id for a guest score not yet linked.
  const isYou = (e: { user: { id: string } | null; playerId: string }) =>
    (!!viewer.userId && e.user?.id === viewer.userId) || (!e.user && !!viewer.playerId && e.playerId === viewer.playerId);
  // The page shows the top few; the full top 50 opens in a modal.
  const boardTop = leaderboard?.entries.slice(0, BOARD_PREVIEW) ?? [];
  const highlightedRow = boardTop.some(isYou);
  // On the viewer's own row, in place of the HUMAN tag.
  const shareMine = (
    <button
      type="button"
      onClick={() => {
        setBoardOpen(false);
        openShareScore();
      }}
      style={{ height: "24px", padding: "0 10px", borderRadius: "999px", border: 0, background: "var(--chip-2)", color: "var(--ink)", fontSize: "11.5px", fontWeight: 600, cursor: "pointer" }}
    >
      Share
    </button>
  );
  const boardRow =(r: NonNullable<typeof leaderboard>["entries"][number]) => {
    const you = isYou(r);
    return (
      <div
        key={`${r.rank}-${r.playerId}`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: mobile ? "7px 8px" : "9px 10px",
          borderRadius: "8px",
          background: you ? "var(--chip)" : "transparent",
          color: you ? "var(--ink)" : "var(--ink-2)",
        }}
      >
        <span style={{ fontFamily: mono, fontSize: "12px", color: "var(--ink-5)", width: "26px" }}>{String(r.rank).padStart(2, "0")}</span>
        <span style={{ flex: 1, fontSize: "13.5px", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {r.user?.handle ?? (r.isBot && r.botLabel ? r.botLabel : "guest")}
          {you ? <span style={{ fontFamily: mono, fontSize: "10.5px", color: "var(--ink-5)", marginLeft: "8px" }}>you</span> : null}
        </span>
        {you ? shareMine : <span style={{ fontFamily: mono, fontSize: "11px", color: "var(--ink-5)" }}>{r.isBot ? "BOT" : "HUMAN"}</span>}
        <span style={{ fontFamily: mono, fontSize: "13px", minWidth: "64px", textAlign: "right" }}>{r.score.toLocaleString()}</span>
      </div>
    );
  };
  const myRankRow = myRank ? (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: mobile ? "7px 8px" : "9px 10px",
        borderRadius: "8px",
        background: "var(--chip)",
        color: "var(--ink)",
        marginTop: "2px",
      }}
    >
      <span style={{ fontFamily: mono, fontSize: "12px", color: "var(--ink-5)", width: "26px" }}>{String(myRank.rank).padStart(2, "0")}</span>
      <span style={{ flex: 1, fontSize: "13.5px", fontWeight: 500 }}>you · #{myRank.rank} of {myRank.total.toLocaleString()}</span>
      {shareMine}
      <span style={{ fontFamily: mono, fontSize: "13px", minWidth: "64px", textAlign: "right" }}>{myRank.score.toLocaleString()}</span>
    </div>
  ) : null;

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

  // Paused and loading keep the fullscreen controls up; only active play hides them.
  const fsControlsShown = fsControls || state !== "playing";

  const controlBar = (
    items: ReactNode,
    top: string,
    bg: string,
    shown = true,
    hover?: { onPointerEnter: () => void; onPointerLeave: () => void },
  ) => (
    <div
      {...hover}
      style={{
        position: "absolute",
        left: "50%",
        top,
        transform: shown ? "translateX(-50%)" : "translate(-50%, -12px)",
        opacity: shown ? 1 : 0,
        pointerEvents: shown ? "auto" : "none",
        transition: "opacity 200ms ease, transform 200ms ease",
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

  // Player width / height. Phones are too narrow for a 16:9 box to hold most games, so only landscape
  // builds keep it there; the rest get a taller frame.
  const frameRatio = !mobile || game.orientation === "landscape" ? 16 / 9 : game.orientation === "portrait" ? 9 / 16 : 4 / 5;

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: theatre ? "0px" : "12px" }}>
        <section style={{ flex: "1 1 600px", minWidth: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
          {game.playing && !theatre ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                flexWrap: "wrap",
                padding: "10px 14px",
                borderRadius: "12px",
                background: "var(--chip)",
                fontSize: "13px",
                lineHeight: 1.45,
              }}
            >
              <span style={{ fontFamily: mono, fontSize: "10.5px", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-4)" }}>
                Older version
              </span>
              <span style={{ flex: "1 1 260px", minWidth: 0, color: "var(--ink-2)" }}>
                You are playing v{game.playing.version} from {relativeTime(game.playing.createdAt)}
                {game.playing.changelog ? `: ${game.playing.changelog}` : ""}. Scores from older versions don&apos;t go on the leaderboard.
              </span>
              <Link href={game.url} style={chipBtn}>
                Play the latest (v{game.versions})
              </Link>
            </div>
          ) : null}
          {/* Player slot keeps the page layout; the box inside goes fixed for fullscreen. */}
          <div
            className={theatre ? undefined : "hb-player-slot"}
            style={{
              position: "relative",
              // Never taller than the screen (--player-max-h in globals.css): past that height the player
              // narrows and centres instead, so it keeps its aspect ratio.
              width: theatre ? "100%" : `min(100%, calc(var(--player-max-h) * ${frameRatio}))`,
              margin: theatre ? undefined : "0 auto",
              height: theatre ? "min(calc(100vh - 170px), 56.25vw)" : "auto",
              aspectRatio: theatre ? "auto" : `${frameRatio}`,
              // The game reported content taller than the frame: grow to it, still within the cap.
              minHeight: mobile && !theatre && fitHeight ? `min(${fitHeight}px, var(--player-max-h))` : undefined,
              transition: "height 340ms cubic-bezier(.22,.8,.3,1), min-height 240ms ease",
              zIndex: theatre ? 50 : 1,
            }}
          >
            <div ref={playerBoxRef} style={playerBox} onPointerMove={fullscreen ? pokeFsControls : undefined}>
              {frameOn && game.versionId ? (
                <iframe
                  key={frameKey}
                  ref={iframeRef}
                  title={game.title}
                  src={frameSrc}
                  sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-forms allow-modals allow-orientation-lock"
                  allow="autoplay; fullscreen *; gamepad; xr-spatial-tracking; cross-origin-isolated; accelerometer; gyroscope"
                  allowFullScreen
                  referrerPolicy="origin"
                  {...{ credentialless: "true" }}
                  style={frameStyle}
                />
              ) : null}

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
                      <button onClick={start} onPointerEnter={warmBuild} onFocus={warmBuild} style={playButtonStyle}>
                        <svg width="20" height="22" viewBox="0 0 22 24" fill="currentColor">
                          <path d="M2 1.6 20 12 2 22.4z" />
                        </svg>
                        Play game
                        {!mobile ? (
                          <kbd
                            style={{
                              marginLeft: "2px",
                              padding: "2px 6px",
                              borderRadius: "5px",
                              border: "1px solid rgba(12,12,14,0.18)",
                              fontFamily: mono,
                              fontSize: "10.5px",
                              fontWeight: 500,
                              letterSpacing: "0.04em",
                              color: "rgba(12,12,14,0.55)",
                            }}
                          >
                            Space
                          </kbd>
                        ) : null}
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
                  <div style={{ width: "220px", height: "3px", background: "#333", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: "30%", background: "#ffffff", animation: "hbSlide 1.1s ease-in-out infinite" }} />
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

              {note && frameOn ? (
                <div
                  role="status"
                  style={{
                    position: "absolute",
                    left: "14px",
                    bottom: "14px",
                    zIndex: 4,
                    maxWidth: "calc(100% - 28px)",
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "10px",
                    pointerEvents: "auto",
                    padding: "7px 7px 7px 12px",
                    borderRadius: "10px",
                    background: "rgba(0,0,0,0.78)",
                    color: "#f5f5f7",
                    fontSize: "13px",
                    fontWeight: 600,
                    animation: "hbFade 180ms ease-out both",
                  }}
                >
                  <span>{note.text}</span>
                  <button onClick={openShareScore} style={{ ...onPlayerPrimary, height: "28px", padding: "0 12px", fontSize: "12.5px" }}>
                    Share score
                  </button>
                  {note.guest ? (
                    <>
                      <button
                        onClick={() => {
                          setNote(null);
                          openAuth("signin");
                        }}
                        style={{ height: "28px", padding: "0 12px", borderRadius: "999px", background: "rgba(255,255,255,0.14)", color: "#f5f5f7", fontSize: "12.5px", fontWeight: 600, cursor: "pointer" }}
                      >
                        Sign in to keep it
                      </button>
                      <button
                        aria-label="Dismiss"
                        onClick={() => {
                          turnGuestPromptOff();
                          setNote(null);
                        }}
                        style={{ background: "transparent", color: "rgba(255,255,255,0.7)", fontSize: "17px", lineHeight: 1, padding: "0 4px", cursor: "pointer" }}
                      >
                        ×
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}

              {fullscreen ? (
                <div
                  aria-hidden
                  onPointerEnter={pokeFsControls}
                  onPointerMove={pokeFsControls}
                  onPointerDown={pokeFsControls}
                  style={{ position: "absolute", left: 0, right: 0, top: 0, height: "28px", zIndex: 4 }}
                />
              ) : null}

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
                      <button onClick={toggleMuted} style={onPlayerChip}>
                        {soundLabel}
                      </button>
                    </>,
                    "16px",
                    "rgba(0,0,0,0.66)",
                    fsControlsShown,
                    { onPointerEnter: holdFsControls, onPointerLeave: pokeFsControls },
                  )
                : null}
            </div>
          </div>

          {/* Controls */}
          <div style={{ ...bpanel, display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px", padding: "7px 10px" }}>
            {/* Phones get one row of icon-only buttons (labels are hb-desk-only) and no theatre mode. */}
            <button onClick={restart} disabled={!canPlay} aria-label="Restart" style={{ ...ctrlIconBtn, opacity: canPlay ? 1 : 0.5 }}>
              <RotateCcw {...ctrlIcon} />
              <span className="hb-desk-only">Restart</span>
            </button>
            <button onClick={toggleMuted} aria-label={soundLabel} style={ctrlIconBtn}>
              {muted ? <VolumeX {...ctrlIcon} /> : <Volume2 {...ctrlIcon} />}
              <span className="hb-desk-only">{soundLabel}</span>
            </button>
            <div style={{ flex: 1, minWidth: "8px" }} />
            <span style={{ fontFamily: mono, fontSize: "11px", color: "var(--ink-5)", marginRight: "6px" }}>{stateLabel}</span>
            <button
              onClick={() => {
                setTheatre(!theatre);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="hb-desk-only"
              style={ctrlIconBtn}
            >
              <RectangleHorizontal {...ctrlIcon} />
              {theatre ? "Exit theatre" : "Theatre"}
            </button>
            <button onClick={enterFullscreen} aria-label="Fullscreen" style={ctrlIconBtn}>
              <Maximize {...ctrlIcon} />
              <span className="hb-desk-only">Fullscreen</span>
            </button>
          </div>

          {/* Title, creator, actions, description */}
          <div style={{ ...bpanel, display: "flex", flexDirection: "column", gap: "12px", padding: "16px 18px" }}>
            <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 600, letterSpacing: "-0.02em" }}>{game.title}</h1>

            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "14px" }}>
              {/* Phones give the creator a row of their own, with Follow at its right end. */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0, width: mobile ? "100%" : undefined }}>
                <Link href={`/@${game.creator}`} style={{ display: "flex", flex: "0 0 auto", color: "inherit" }}>
                  <CreatorAvatar game={game} />
                </Link>
                <div style={{ minWidth: 0, flex: mobile ? 1 : undefined }}>
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
              <div style={{ display: "flex", alignItems: "center", gap: mobile ? "6px" : "8px", flexWrap: mobile ? "nowrap" : "wrap", width: mobile ? "100%" : undefined }}>
                <div style={{ display: "flex", alignItems: "center", background: "var(--chip)", borderRadius: "19px", overflow: "hidden" }}>
                  <button
                    onClick={onLike}
                    aria-pressed={liked}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "7px",
                      height: "36px",
                      padding: mobile ? "0 12px" : "0 15px",
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
                      padding: mobile ? "0 12px" : "0 15px",
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
                {/* Phones have no room for this pill; the count moves into the stats line below. */}
                {!mobile ? (
                  <div
                    role="status"
                    aria-live="polite"
                    title="Players currently playing this game"
                    style={{
                      ...pill(),
                      color: nowPlaying > 0 ? "var(--pos-ink)" : "var(--ink-2)",
                      cursor: "default",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: "7px",
                        height: "7px",
                        borderRadius: "50%",
                        background: nowPlaying > 0 ? "var(--pos)" : "var(--ink-5)",
                        animation: nowPlaying > 0 ? "hbBlink 2s ease-in-out infinite" : "none",
                      }}
                    />
                    {fmt(nowPlaying)} playing now
                  </div>
                ) : null}
                {remixable ? (
                  <button onClick={openRemix} style={{ ...chipBtn, ...tight }}>
                    Remix
                  </button>
                ) : (
                  <button disabled title="The creator turned remixing off" style={{ ...chipBtn, ...tight, opacity: 0.55, cursor: "not-allowed" }}>
                    Remixes off
                  </button>
                )}
                <button onClick={() => toggleSaved(game.id)} style={{ ...pill(), ...tight, ...(saved ? { background: "var(--chip-2)" } : null) }}>
                  {saved ? "Saved" : "Save"}
                </button>
                {/* Pinned to the row's right end so the menu, which opens leftward, stays on screen. */}
                <div ref={moreRef} style={{ position: "relative", marginLeft: mobile ? "auto" : undefined, flex: "0 0 auto" }}>
                  <button
                    onClick={() => setMoreOpen((m) => !m)}
                    aria-label="More actions"
                    aria-haspopup="menu"
                    aria-expanded={moreOpen}
                    style={{ ...chipBtn, ...tight, ...(moreOpen ? { background: "var(--chip-2)" } : null) }}
                  >
                    ···
                  </button>
                  {moreOpen ? (
                    <div
                      role="menu"
                      style={{
                        ...bpanel,
                        position: "absolute",
                        right: 0,
                        top: "calc(100% + 8px)",
                        zIndex: 60,
                        width: "180px",
                        padding: "6px",
                        background: "var(--panel-2)",
                        boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
                        animation: "hbRise 160ms ease-out both",
                      }}
                    >
                      {[
                        { label: copied ? "Copied link" : "Copy link", run: copyLink },
                        { label: "Embed", run: openShare },
                        { label: "Report", run: openReport },
                      ].map((item) => (
                        <button
                          key={item.label}
                          role="menuitem"
                          className="hb-row"
                          onClick={() => {
                            setMoreOpen(false);
                            item.run();
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            width: "100%",
                            height: "38px",
                            padding: "0 12px",
                            borderRadius: "9px",
                            background: "transparent",
                            color: item.label === "Report" ? "var(--ink-3)" : "var(--ink)",
                            fontSize: "13.5px",
                            fontWeight: 500,
                            textAlign: "left",
                            cursor: "pointer",
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div style={{ padding: "14px 16px", borderRadius: "12px", background: "var(--chip)" }}>
              <div style={{ fontFamily: mono, fontSize: "12.5px", letterSpacing: "0.04em", color: "var(--ink-2)" }}>
                {fmt(game.plays + playsBump)} runs{mobile ? ` · ${fmt(nowPlaying)} playing now` : ""} · best {best(game)} · {fmt(game.remixes)} remixes · {game.age}
              </div>
              {description ? (
                <>
                  <div
                    style={{
                      marginTop: "8px",
                      fontSize: "14px",
                      lineHeight: 1.6,
                      color: "var(--ink-2)",
                      maxWidth: "78ch",
                      whiteSpace: "pre-line",
                      ...(mobile && !descMore
                        ? { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }
                        : null),
                    }}
                  >
                    {description}
                  </div>
                  {/* About two phone lines of text; shorter descriptions never get clipped. */}
                  {mobile && (description.length > 90 || description.includes("\n")) ? (
                    <button
                      type="button"
                      onClick={() => setDescMore((m) => !m)}
                      style={{ marginTop: "4px", padding: 0, background: "none", border: 0, color: "var(--ink)", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
                    >
                      {descMore ? "Show less" : "Read more"}
                    </button>
                  ) : null}
                </>
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
                    versionRows.map((v) => {
                      const isLive = v.id === game.liveVersionId;
                      const isPlaying = v.id === game.versionId;
                      return (
                        <div key={v.id} style={{ display: "flex", alignItems: "baseline", gap: "12px", fontSize: "13px", color: "var(--ink-3)" }}>
                          <span style={{ fontFamily: mono, fontSize: "12px", color: "var(--ink)", minWidth: "34px" }}>v{v.version}</span>
                          <span style={{ flex: 1 }}>
                            {v.changelog || "No notes"}
                            {isLive ? <span style={{ marginLeft: "8px", fontFamily: mono, fontSize: "10.5px", color: "var(--pos-ink)" }}>LATEST</span> : null}
                          </span>
                          <span style={{ fontFamily: mono, fontSize: "11.5px", color: "var(--ink-5)" }}>{relativeTime(v.createdAt)}</span>
                          {isPlaying ? (
                            <span style={{ minWidth: "52px", textAlign: "right", fontFamily: mono, fontSize: "11px", color: "var(--ink)" }}>playing</span>
                          ) : (
                            <Link
                              href={isLive ? game.url : `${game.url}?v=${v.version}`}
                              style={{ minWidth: "52px", textAlign: "right", fontSize: "12.5px", fontWeight: 600, color: "var(--link)" }}
                            >
                              Play
                            </Link>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ fontSize: "13px", color: "var(--ink-5)" }}>No versions pushed yet.</div>
                  )}
                </div>
              ) : null}
              <button
                onClick={() => setDescOpen((d) => !d)}
                style={{ marginTop: "10px", padding: 0, background: "transparent", color: "var(--ink)", fontSize: "13.5px", fontWeight: 600, cursor: "pointer" }}
              >
                {descOpen
                  ? "Show less"
                  : `${game.prompt ? "Show prompt and " : "Show "}${versionRows.length > 1 ? `all ${versionRows.length} versions` : "version history"}`}
              </button>
            </div>
          </div>

          {/* How to play: only when the creator gave instructions */}
          {howToKeys.length || howToTouch ? (
          <div style={{ ...bpanel, padding: mobile ? "12px 14px" : "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <div style={monoLabel}>How to play</div>
              <div style={{ fontFamily: mono, fontSize: "10.5px", color: "var(--ink-5)" }}>
                {game.type} · {game.duration}
              </div>
            </div>
            {summary ? <div style={{ marginTop: "10px", fontSize: "14.5px", lineHeight: 1.5, color: "var(--ink)", maxWidth: "70ch" }}>{summary}.</div> : null}
            {howToKeys.length ? (
            <div
              style={{
                marginTop: mobile ? "10px" : "14px",
                display: "grid",
                gridTemplateColumns: mobile ? "repeat(2, minmax(0, 1fr))" : "repeat(auto-fit, minmax(190px, 1fr))",
                gap: mobile ? "6px" : "8px",
              }}
            >
              {howToKeys.map((c) => (
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
            ) : null}
            {howToTouch ? <div style={{ marginTop: "12px", fontFamily: mono, fontSize: "11px", color: "var(--ink-5)" }}>Touch: {howToTouch}</div> : null}
          </div>
          ) : null}

          {/* Today's board: only games with a leaderboard, which the publish flow offers only to builds that send scores. */}
          {leaderboard ? (
          <div style={{ ...bpanel, padding: mobile ? "12px 14px" : "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <div style={monoLabel}>Today&apos;s board · resets at midnight UTC</div>
              <div style={{ fontFamily: mono, fontSize: "11px", color: "var(--ink-5)" }}>{fmt(runsToday)} runs today</div>
            </div>
            <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
              {boardTop.length ? (
                boardTop.map(boardRow)
              ) : (
                <div style={{ padding: "9px 10px", fontSize: "13px", color: "var(--ink-5)" }}>Nobody has scored today. Yours would be first.</div>
              )}
              {!highlightedRow ? myRankRow : null}
            </div>
            {leaderboard.entries.length > BOARD_PREVIEW ? (
              <button
                type="button"
                onClick={() => setBoardOpen(true)}
                style={{ marginTop: mobile ? "8px" : "10px", width: "100%", height: mobile ? "32px" : "36px", borderRadius: "8px", border: 0, background: "var(--chip)", color: "var(--ink-2)", fontSize: "13px", fontWeight: 500, cursor: "pointer" }}
              >
                See top {leaderboard.entries.length}
              </button>
            ) : null}
          </div>
          ) : null}

          {/* Portaled to <body> so no panel's backdrop-filter becomes the fixed scrim's containing block. */}
          {boardOpen && leaderboard
            ? createPortal(
                <div style={modalScrimStyle}>
                  <div onClick={() => setBoardOpen(false)} style={{ position: "absolute", inset: 0 }} />
                  <div role="dialog" aria-modal="true" aria-labelledby="board-title" style={{ ...modalSmStyleFor(light), color: "var(--ink)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                      <div id="board-title" style={{ fontSize: "20px", fontWeight: 600, letterSpacing: "-0.02em" }}>Today&apos;s top {leaderboard.entries.length}</div>
                      <button type="button" aria-label="Close" onClick={() => setBoardOpen(false)} style={{ background: "none", border: 0, padding: "4px", color: "var(--ink-4)", fontSize: "22px", lineHeight: 1, cursor: "pointer" }}>
                        ×
                      </button>
                    </div>
                    <div style={{ marginTop: "4px", fontFamily: mono, fontSize: "11px", color: "var(--ink-5)" }}>
                      {leaderboard.total.toLocaleString()} {leaderboard.total === 1 ? "player" : "players"} today · resets at midnight UTC
                    </div>
                    <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "6px" }}>
                      {leaderboard.entries.map(boardRow)}
                      {!leaderboard.entries.some(isYou) ? myRankRow : null}
                    </div>
                  </div>
                </div>,
                document.body,
              )
            : null}

          {/* Build stats */}
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "repeat(3, minmax(0, 1fr))" : "repeat(auto-fit, minmax(150px, 1fr))", gap: mobile ? "8px" : "10px" }}>
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
              <div key={s.label} style={{ ...bpanel, borderRadius: "12px", padding: mobile ? "9px 10px" : "12px 14px" }}>
                <div style={{ ...statLabel, ...(mobile ? { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } : null) }}>{s.label}</div>
                <div style={{ marginTop: mobile ? "4px" : "6px", fontSize: mobile ? "13px" : "14px", fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.href ? (
                    <Link href={s.href} title={`More games made with ${s.value}`} style={{ color: "inherit", textDecoration: "underline", textDecorationColor: "var(--chip-2)", textUnderlineOffset: "3px" }}>
                      {s.value}
                    </Link>
                  ) : (
                    s.value
                  )}
                </div>
                <div
                  style={{
                    marginTop: "3px",
                    fontSize: mobile ? "11px" : "12px",
                    color: "var(--ink-5)",
                    ...(mobile ? { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } : null),
                  }}
                >
                  {s.note}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Up next rail: beside the player, or a full-width row under it once the row wraps (tablets)
            and in theatre mode, where the queue goes two columns (.hb-queue in globals.css). */}
        <aside
          className="hb-watch-side"
          style={{
            ...bpanel,
            flex: theatre ? "1 1 100%" : "1 1 320px",
            // 932px = section basis 600 + gap 12 + rail basis 320: below it the rail has wrapped, so drop the cap.
            maxWidth: theatre ? "none" : "max(360px, calc((932px - 100%) * 9999))",
            marginTop: theatre ? "12px" : undefined,
            padding: "12px",
            alignSelf: "stretch",
          }}
        >
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
          <div className="hb-queue">
            {queue.length ? (
              queue.map((x, i) => <RailRow key={x.id} game={x} queueNo={String(i + 1).padStart(2, "0")} />)
            ) : (
              <div style={{ gridColumn: "1 / -1", padding: "14px 8px", fontSize: "13px", color: "var(--ink-5)" }}>Nothing else in the queue yet.</div>
            )}
          </div>
        </aside>
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
        {!theatre ? <div className="hb-desk-only" style={{ flex: "1 1 320px", maxWidth: "360px", minWidth: 0, height: "1px" }} /> : null}
      </div>
    </>
  );
}
