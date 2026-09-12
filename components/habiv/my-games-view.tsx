"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import { publishVersion, unpublishGame } from "@/lib/actions/games";
import { deleteFailedVersion, deleteUnpublishedGame, retryProcessing, stopUpload } from "@/lib/actions/uploads";
import type { CreatorGame } from "@/lib/db/types";
import { spanFor } from "@/lib/habiv/bento";
import { art, categoryName, fmt, relativeTime } from "@/lib/habiv/games";
import type { MyGamesData } from "@/lib/habiv/page-data";
import { localUploadFor, type LocalUpload } from "@/lib/habiv/publish-draft-progress";
import { rejectLabel } from "@/lib/habiv/upload-status";
import { bpanel, chipBtn, chipStyle, dangerBtn, mono, primaryBtn } from "@/lib/habiv/ui";
import { BentoGrid, ChipCell, EmptyCell, PageHead } from "./game-card";
import { useShell } from "./shell-context";

const tabs = ["Published", "Drafts", "In progress", "Failed", "Hidden"] as const;
type Tab = (typeof tabs)[number];

/** Same threshold as the server (lib/actions/uploads.ts): a check this quiet has died. */
const STUCK_AFTER_MS = 10 * 60_000;
/** While something is uploading or being checked the list refreshes itself. */
const POLL_MS = 5000;

/** Where the latest build of a game is, when it is not simply ready. */
type Stage = "uploading" | "processing" | "stuck" | "failed";

function stageOf(g: CreatorGame, now: number): Stage | null {
  const v = g.latestVersion;
  if (!v || g.status === "removed") return null;
  // "uploaded" without an open storage session is an upload that never finished.
  if (v.status === "uploaded") return v.uploadExpiresAt && Date.parse(v.uploadExpiresAt) > now ? "uploading" : "failed";
  if (v.status === "processing") return now - Date.parse(v.updatedAt) > STUCK_AFTER_MS ? "stuck" : "processing";
  if (v.status === "rejected") return "failed";
  return null;
}

const inTab: Record<Tab, (g: CreatorGame, stage: Stage | null) => boolean> = {
  Published: (g) => g.status === "published",
  Drafts: (g, st) => (g.status === "draft" || g.status === "processing") && !st,
  "In progress": (_, st) => st === "uploading" || st === "processing" || st === "stuck",
  Failed: (_, st) => st === "failed",
  Hidden: (g) => g.status === "hidden",
};

const emptyCopy: Record<Tab, { title: string; sub: string }> = {
  Published: { title: "Nothing live yet", sub: "Publish a game and it shows up here with its runs and remixes." },
  Drafts: { title: "No drafts", sub: "Games that passed their checks but are not public yet wait here." },
  "In progress": { title: "Nothing uploading", sub: "Uploads and build checks show their progress here while they run." },
  Failed: { title: "Nothing failed", sub: "If an upload stops or a build fails its checks, the reason lands here." },
  Hidden: { title: "Nothing hidden", sub: "Games you take down stay here so you can bring them back." },
};

/** Hidden by moderation or the auto-report threshold, not by the creator. */
function lockedByModeration(g: CreatorGame) {
  const r = g.hiddenReason ?? "";
  return g.status === "hidden" && (r.startsWith("moderation") || r.startsWith("auto_reports"));
}

function statusOf(g: CreatorGame): { label: string; live: boolean; locked: boolean } {
  if (g.status === "published") return { label: "Live", live: true, locked: false };
  if (g.status === "hidden") return lockedByModeration(g) ? { label: "Hidden by moderation", live: false, locked: true } : { label: "Hidden", live: false, locked: false };
  if (g.status === "removed") return { label: "Removed", live: false, locked: true };
  return { label: "Draft", live: false, locked: false };
}

function stageLabel(g: CreatorGame, stage: Stage): string {
  const v = g.latestVersion!;
  if (stage === "uploading") return "Uploading";
  if (stage === "processing") return "Checking build";
  if (stage === "stuck") return "Stuck";
  if (v.status === "uploaded") return "Upload not finished";
  return v.rejectReason === "aborted" ? "Stopped" : "Failed";
}

/** One sentence under the title saying what happened and what to do. */
function stageNote(g: CreatorGame, stage: Stage, local: LocalUpload | undefined, now: number): string {
  const v = g.latestVersion!;
  if (stage === "uploading") {
    return local ? `${Math.round(local.progress * 100)}% uploaded from this browser. Continue to send the rest.` : "Uploading from another tab or device.";
  }
  if (stage === "processing") return `Checking the build · started ${relativeTime(v.updatedAt, now)}. This usually takes under a minute.`;
  if (stage === "stuck") return `No progress since ${relativeTime(v.updatedAt, now)}. Retry the check or stop it.`;
  if (v.status === "uploaded") return "The upload stopped before the whole file arrived. Upload the game again.";
  if (v.rejectReason === "aborted") return "You stopped this upload.";
  return v.rejectMessage ?? `${rejectLabel(v.rejectReason)}.`;
}

/** Never public, so it can go entirely; published games are hidden instead. */
const deletable = (g: CreatorGame) => !g.publishedAt && (g.status === "draft" || g.status === "processing");

function artOf(g: CreatorGame) {
  return art({ coverUrl: g.coverUrl, cardUrl: g.cardUrl, hue: g.accentHue, title: g.title }, 320);
}

function initialTab(games: CreatorGame[], now: number): Tab {
  const count = (t: Tab) => games.filter((g) => inTab[t](g, stageOf(g, now))).length;
  if (count("In progress")) return "In progress";
  if (count("Published")) return "Published";
  if (count("Failed")) return "Failed";
  return count("Drafts") ? "Drafts" : "Published";
}

type ActionResult = { ok: true } | { ok: false; error: string };

export function MyGamesView({ data }: { data: MyGamesData }) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [games, setGames] = useState<CreatorGame[]>(data.games);
  const [tab, setTab] = useState<Tab>(() => initialTab(data.games, Date.now()));
  const [busy, setBusy] = useState<string | null>(null);
  const [local, setLocal] = useState<Record<string, LocalUpload>>({});
  const { cols, showToast } = useShell();

  // router.refresh() hands down fresh rows; they replace any optimistic edits.
  useEffect(() => setGames(data.games), [data.games]);

  const stages = new Map(games.map((g) => [g.id, stageOf(g, now)]));
  const active = games.some((g) => stages.get(g.id) === "uploading" || stages.get(g.id) === "processing");

  // Upload progress lives in this browser's storage (written by the publish wizard).
  useEffect(() => {
    const next: Record<string, LocalUpload> = {};
    for (const g of games) {
      const v = g.latestVersion;
      if (v?.status !== "uploaded") continue;
      const found = localUploadFor(v.id);
      if (found) next[v.id] = found;
    }
    setLocal(next);
  }, [games, now]);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setNow(Date.now());
      router.refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [active, router]);

  const rows = games.filter((g) => inTab[tab](g, stages.get(g.id) ?? null));
  const gameCount = games.filter((g) => g.status !== "removed").length;
  const tabCount = (t: Tab) => games.filter((g) => inTab[t](g, stages.get(g.id) ?? null)).length;

  const stats = [
    { label: "Published", value: String(data.totals.published), note: gameCount === 1 ? "1 game in total" : `${gameCount} games in total` },
    { label: "Runs", value: fmt(data.totals.runs), note: "lifetime" },
    { label: "Remixes", value: fmt(data.totals.remixes), note: `across ${data.totals.published} ${data.totals.published === 1 ? "game" : "games"}` },
    { label: "Followers", value: fmt(data.followers), note: `@${data.handle}` },
  ];

  /** Runs one row action with the row dimmed; `patch` updates the row at once (null drops it). */
  const act = async (g: CreatorGame, done: string, fn: () => Promise<ActionResult>, patch?: (g: CreatorGame) => CreatorGame | null) => {
    setBusy(g.id);
    const res = await fn();
    setBusy(null);
    if (!res.ok) {
      showToast(res.error);
      return;
    }
    if (patch) setGames((list) => list.flatMap((x) => (x.id === g.id ? [patch(x)].filter((y): y is CreatorGame => !!y) : [x])));
    showToast(done);
    router.refresh();
  };

  const withVersion = (g: CreatorGame, v: Partial<NonNullable<CreatorGame["latestVersion"]>>): CreatorGame =>
    g.latestVersion ? { ...g, latestVersion: { ...g.latestVersion, ...v } } : g;

  const hide = (g: CreatorGame) => act(g, "Game hidden", () => unpublishGame(g.id), (x) => ({ ...x, status: "hidden", hiddenReason: "creator" }));

  const publish = (g: CreatorGame) => {
    const versionId = g.currentVersionId ?? g.latestVersion?.id;
    if (!versionId) return;
    let url = g.url;
    return act(
      g,
      "Game is live",
      async () => {
        const res = await publishVersion({ gameId: g.id, versionId });
        if (res.ok) url = res.url;
        return res;
      },
      (x) => ({ ...x, status: "published", hiddenReason: null, publishedAt: x.publishedAt ?? new Date().toISOString(), url }),
    );
  };

  const stop = (g: CreatorGame) => {
    if (!window.confirm(`Stop "${g.title}"? The upload is cancelled and you can upload the game again later.`)) return;
    return act(g, "Stopped", () => stopUpload(g.latestVersion!.id), (x) => withVersion(x, { status: "rejected", rejectReason: "aborted", rejectMessage: null }));
  };

  const retry = (g: CreatorGame) =>
    act(g, "Checking again", () => retryProcessing(g.latestVersion!.id), (x) => withVersion(x, { status: "processing", rejectReason: null, updatedAt: new Date().toISOString() }));

  const remove = (g: CreatorGame) => {
    if (!window.confirm(`Delete "${g.title}"? Its uploads and files are removed for good.`)) return;
    return act(g, "Game deleted", () => deleteUnpublishedGame(g.id), () => null);
  };

  const removeVersion = (g: CreatorGame) => {
    const v = g.latestVersion!;
    if (!window.confirm(`Remove v${v.version} of "${g.title}"? The game keeps its other versions.`)) return;
    return act(g, `v${v.version} removed`, () => deleteFailedVersion(v.id), (x) => ({ ...x, latestVersion: null }));
  };

  const pillBase: CSSProperties = {
    padding: "3px 9px",
    borderRadius: "6px",
    fontFamily: mono,
    fontSize: "10px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "100%",
  };

  return (
    <BentoGrid>
      <PageHead title="My games" sub="Everything you have published, in draft, uploading or hidden.">
        <Link href="/publish" style={primaryBtn}>
          Publish a game
        </Link>
      </PageHead>

      {stats.map((s) => (
        <div
          key={s.label}
          style={{
            ...bpanel,
            gridColumn: `span ${spanFor(cols, [1, 3, 2, 3])}`,
            gridRow: "span 2",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 16px",
          }}
        >
          <div style={{ fontFamily: mono, fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-5)" }}>
            {s.label}
          </div>
          <div style={{ marginTop: "6px", fontSize: "22px", fontWeight: 600, letterSpacing: "-0.02em" }}>{s.value}</div>
          <div style={{ marginTop: "3px", fontSize: "12px", color: "var(--ink-5)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.note}</div>
        </div>
      ))}

      <ChipCell>
        {tabs.map((t) => {
          const n = t === "In progress" || t === "Failed" ? tabCount(t) : 0;
          return (
            <button key={t} onClick={() => setTab(t)} style={chipStyle(tab === t)}>
              {t}
              {n ? ` · ${n}` : ""}
            </button>
          );
        })}
      </ChipCell>

      {rows.length === 0 ? (
        <EmptyCell>
          <div style={{ fontSize: "17px", fontWeight: 600 }}>{emptyCopy[tab].title}</div>
          <div style={{ marginTop: "8px", fontSize: "13.5px", color: "var(--ink-5)", maxWidth: "44ch" }}>{emptyCopy[tab].sub}</div>
          {tab === "Published" || tab === "Drafts" ? (
            <Link href="/publish" style={{ ...primaryBtn, marginTop: "18px" }}>
              Publish a game
            </Link>
          ) : null}
        </EmptyCell>
      ) : null}

      {rows.map((g) => {
        const st = statusOf(g);
        const stage = stages.get(g.id) ?? null;
        const v = g.latestVersion;
        const s = g.stats;
        const ready = v?.status === "ready";
        const canPublish = !st.live && !st.locked && ready && g.status !== "removed";
        const working = busy === g.id;
        const loc = v ? local[v.id] : undefined;
        const bad = stage === "failed" || stage === "stuck";
        const running = stage === "uploading" || stage === "processing";
        // Uploads without a known percentage and build checks show a pulsing bar.
        const pct = stage === "uploading" && loc ? loc.progress : null;
        return (
          <div
            key={g.id}
            style={{
              ...bpanel,
              gridColumn: "1 / -1",
              gridRow: cols === 2 ? (stage ? "span 5" : "span 4") : stage ? "span 3" : "span 2",
              display: "flex",
              alignItems: "center",
              gap: "14px",
              padding: "10px 14px",
              flexWrap: "wrap",
              overflow: "hidden",
              opacity: working ? 0.6 : 1,
              transition: "opacity 120ms ease",
            }}
          >
            <div
              style={{
                width: "88px",
                height: "50px",
                flex: "0 0 auto",
                borderRadius: "8px",
                backgroundImage: `url("${artOf(g)}")`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundColor: "var(--chip)",
              }}
            />
            <div style={{ flex: "1 1 240px", minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "15px", fontWeight: 600 }}>{g.title}</span>
                {st.live || g.status === "hidden" || g.status === "removed" || !stage ? (
                  <span
                    title={st.label}
                    style={{
                      ...pillBase,
                      background: st.live ? "var(--pos-bg)" : st.locked ? "var(--danger-bg)" : "var(--chip)",
                      color: st.live ? "var(--pos-ink)" : st.locked ? "var(--danger-ink)" : "var(--ink-4)",
                    }}
                  >
                    {st.locked ? "🔒 " : ""}
                    {st.label}
                  </span>
                ) : null}
                {stage ? (
                  <span
                    style={{
                      ...pillBase,
                      background: bad ? "var(--danger-bg)" : "var(--chip)",
                      color: bad ? "var(--danger-ink)" : "var(--ink-4)",
                    }}
                  >
                    {st.live || g.status === "hidden" ? `v${v!.version} · ` : ""}
                    {stageLabel(g, stage)}
                  </span>
                ) : null}
              </div>
              <div style={{ marginTop: "5px", fontFamily: mono, fontSize: "10.5px", color: "var(--ink-5)" }}>
                {v ? `v${v.version}` : "no build"} · {categoryName(g.category)} · updated {relativeTime(g.updatedAt, now)}
              </div>
              {stage ? (
                <>
                  <div style={{ marginTop: "6px", fontSize: "12.5px", lineHeight: 1.45, color: bad ? "var(--danger-ink)" : "var(--ink-4)" }}>{stageNote(g, stage, loc, now)}</div>
                  {running ? (
                    <div style={{ marginTop: "7px", maxWidth: "320px", height: "4px", borderRadius: "2px", background: "var(--chip)", overflow: "hidden" }}>
                      <div
                        style={{
                          height: "100%",
                          width: pct != null ? `${Math.max(4, Math.round(pct * 100))}%` : "35%",
                          background: "var(--ink)",
                          transition: "width 300ms ease",
                          animation: pct == null ? "hbBlink 1s ease-in-out infinite" : "none",
                        }}
                      />
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
            {!stage || st.live ? (
              <div style={{ display: "flex", gap: "16px", fontFamily: mono, fontSize: "11.5px", color: "var(--ink-3)" }}>
                <div>
                  <span style={{ color: "var(--ink-5)" }}>runs </span>
                  {fmt(s?.plays ?? 0)}
                </div>
                <div>
                  <span style={{ color: "var(--ink-5)" }}>likes </span>
                  {fmt(s?.likes ?? 0)}
                </div>
                <div>
                  <span style={{ color: "var(--ink-5)" }}>rmx </span>
                  {fmt(s?.remixes ?? 0)}
                </div>
              </div>
            ) : null}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {/* The build pipeline first: continue, retry, stop. */}
              {stage === "uploading" && loc ? (
                <Link href={loc.href} style={primaryBtn}>
                  Continue upload
                </Link>
              ) : null}
              {stage === "stuck" || (stage === "failed" && v?.rejectReason === "internal_error") ? (
                <button onClick={() => void retry(g)} disabled={working} style={primaryBtn}>
                  Retry check
                </button>
              ) : null}
              {stage === "failed" && v?.rejectReason !== "internal_error" ? (
                <Link href={`/publish?game=${g.id}`} style={primaryBtn}>
                  Upload again
                </Link>
              ) : null}
              {stage === "uploading" || stage === "processing" || stage === "stuck" ? (
                <button onClick={() => void stop(g)} disabled={working} style={chipBtn}>
                  Stop
                </button>
              ) : null}

              {st.live ? (
                <Link href={g.url} style={chipBtn}>
                  Open
                </Link>
              ) : null}
              <Link href={`/my-games/${g.id}/edit`} style={chipBtn}>
                Edit details
              </Link>
              {!stage ? (
                <Link href={`/publish?game=${g.id}`} style={chipBtn}>
                  New version
                </Link>
              ) : null}
              {st.live ? (
                <button onClick={() => void hide(g)} disabled={working} style={chipBtn}>
                  Hide
                </button>
              ) : null}
              {canPublish ? (
                <button onClick={() => void publish(g)} disabled={working} style={primaryBtn}>
                  Publish
                </button>
              ) : null}

              {deletable(g) ? (
                <button onClick={() => void remove(g)} disabled={working} style={dangerBtn}>
                  Delete
                </button>
              ) : stage === "failed" && v && v.id !== g.currentVersionId ? (
                <button onClick={() => void removeVersion(g)} disabled={working} style={dangerBtn}>
                  Remove v{v.version}
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </BentoGrid>
  );
}
