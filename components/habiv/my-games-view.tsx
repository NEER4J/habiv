"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties } from "react";
import { publishVersion, unpublishGame } from "@/lib/actions/games";
import type { CreatorGame } from "@/lib/db/types";
import { spanFor } from "@/lib/habiv/bento";
import { art, categoryName, fmt, relativeTime } from "@/lib/habiv/games";
import type { MyGamesData } from "@/lib/habiv/page-data";
import { bpanel, chipBtn, chipStyle, mono, primaryBtn } from "@/lib/habiv/ui";
import { BentoGrid, ChipCell, EmptyCell, PageHead } from "./game-card";
import { useShell } from "./shell-context";

const tabs = ["Published", "Drafts", "Hidden", "Rejected"] as const;
type Tab = (typeof tabs)[number];

const filters: Record<Tab, (g: CreatorGame) => boolean> = {
  Published: (g) => g.status === "published",
  Drafts: (g) => g.status === "draft" || g.status === "processing",
  Hidden: (g) => g.status === "hidden",
  Rejected: (g) => g.latestVersion?.status === "rejected",
};

const emptyCopy: Record<Tab, { title: string; sub: string }> = {
  Published: { title: "Nothing live yet", sub: "Publish a game and it shows up here with its runs and remixes." },
  Drafts: { title: "No drafts", sub: "Start a publish and come back to finish it any time." },
  Hidden: { title: "Nothing hidden", sub: "Games you take down stay here so you can bring them back." },
  Rejected: { title: "No rejected versions", sub: "If a build fails checks, the reason lands here." },
};

/** Hidden by moderation or the auto-report threshold, not by the creator. */
function lockedByModeration(g: CreatorGame) {
  const r = g.hiddenReason ?? "";
  return g.status === "hidden" && (r.startsWith("moderation") || r.startsWith("auto_reports"));
}

function statusOf(g: CreatorGame): { label: string; live: boolean; locked: boolean } {
  if (g.latestVersion?.status === "rejected" && g.status !== "published") {
    return { label: `Rejected${g.latestVersion.rejectReason ? `: ${g.latestVersion.rejectReason}` : ""}`, live: false, locked: false };
  }
  if (g.status === "published") return { label: "Live", live: true, locked: false };
  if (g.status === "hidden") return lockedByModeration(g) ? { label: "Hidden by moderation", live: false, locked: true } : { label: "Hidden", live: false, locked: false };
  if (g.status === "processing" || g.latestVersion?.status === "processing" || g.latestVersion?.status === "uploaded") {
    return { label: "Processing", live: false, locked: false };
  }
  if (g.status === "removed") return { label: "Removed", live: false, locked: true };
  return { label: "Draft", live: false, locked: false };
}

function artOf(g: CreatorGame) {
  return art({ coverUrl: g.coverUrl, cardUrl: g.cardUrl, hue: g.accentHue, title: g.title }, 320);
}

export function MyGamesView({ data }: { data: MyGamesData }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("Published");
  const [games, setGames] = useState<CreatorGame[]>(data.games);
  const [busy, setBusy] = useState<string | null>(null);
  const { cols, showToast } = useShell();

  const rows = games.filter(filters[tab]);
  const gameCount = games.filter((g) => g.status !== "removed").length;

  const stats = [
    { label: "Published", value: String(data.totals.published), note: gameCount === 1 ? "1 game in total" : `${gameCount} games in total` },
    { label: "Runs", value: fmt(data.totals.runs), note: "lifetime" },
    { label: "Remixes", value: fmt(data.totals.remixes), note: `across ${data.totals.published} ${data.totals.published === 1 ? "game" : "games"}` },
    { label: "Followers", value: fmt(data.followers), note: `@${data.handle}` },
  ];

  const hide = async (g: CreatorGame) => {
    setBusy(g.id);
    const res = await unpublishGame(g.id);
    setBusy(null);
    if (!res.ok) {
      showToast(res.error);
      return;
    }
    setGames((list) => list.map((x) => (x.id === g.id ? { ...x, status: "hidden", hiddenReason: "creator" } : x)));
    showToast("Game hidden");
    router.refresh();
  };

  const publish = async (g: CreatorGame) => {
    const versionId = g.currentVersionId ?? g.latestVersion?.id;
    if (!versionId) return;
    setBusy(g.id);
    const res = await publishVersion({ gameId: g.id, versionId });
    setBusy(null);
    if (!res.ok) {
      showToast(res.error);
      return;
    }
    setGames((list) => list.map((x) => (x.id === g.id ? { ...x, status: "published", hiddenReason: null, publishedAt: x.publishedAt ?? new Date().toISOString(), url: res.url } : x)));
    showToast("Game is live");
    router.refresh();
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
      <PageHead title="My games" sub="Everything you have published, in draft, or hidden.">
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
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={chipStyle(tab === t)}>
            {t}
          </button>
        ))}
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
        const s = g.stats;
        const ready = g.latestVersion?.status === "ready";
        const canPublish = !st.live && !st.locked && ready && g.status !== "removed";
        const working = busy === g.id;
        return (
          <div
            key={g.id}
            style={{
              ...bpanel,
              gridColumn: "1 / -1",
              gridRow: cols === 2 ? "span 4" : "span 2",
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
            <div style={{ flex: "1 1 200px", minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "15px", fontWeight: 600 }}>{g.title}</span>
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
              </div>
              <div style={{ marginTop: "5px", fontFamily: mono, fontSize: "10.5px", color: "var(--ink-5)" }}>
                {g.latestVersion ? `v${g.latestVersion.version}` : "no build"} · {categoryName(g.category)} · updated {relativeTime(g.updatedAt)}
              </div>
            </div>
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
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {st.live ? (
                <Link href={g.url} style={chipBtn}>
                  Open
                </Link>
              ) : null}
              <Link href={`/publish?game=${g.id}`} style={chipBtn}>
                New version
              </Link>
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
            </div>
          </div>
        );
      })}
    </BentoGrid>
  );
}
