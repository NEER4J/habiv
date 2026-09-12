"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { HistoryData, HistoryRow } from "@/lib/habiv/page-data";
import { relativeTime } from "@/lib/habiv/games";
import { bpanel, chipBtn, mono, monoLabel, primaryBtn } from "@/lib/habiv/ui";
import { BentoGrid, BentoStack, EmptyCell, PageHead } from "./game-card";
import { useShell } from "./shell-context";

export const HISTORY_SUB = "Games you played in the last 90 days, with your scores and ranks. Only you can see this.";

function playedLabel(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function Stat({ label, value, note }: { label: string; value: string; note?: string | null }) {
  return (
    <div style={{ minWidth: "64px" }}>
      <div style={{ ...monoLabel, fontSize: "10px" }}>{label}</div>
      <div style={{ marginTop: "4px", fontFamily: mono, fontSize: "14px", color: "var(--ink)" }}>
        {value}
        {note ? <span style={{ marginLeft: "6px", fontSize: "11px", color: "var(--ink-5)" }}>{note}</span> : null}
      </div>
    </div>
  );
}

/** Row layout, shared with the loading skeleton so nothing moves when the list swaps in. */
export const historyRowStyle = (first: boolean): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "12px 16px",
  padding: "14px 4px",
  borderTop: first ? "none" : "1px solid var(--divider)",
});

function Row({ row, first, onShare }: { row: HistoryRow; first: boolean; onShare: () => void }) {
  const g = row.game;
  return (
    <div style={historyRowStyle(first)}>
      <Link href={g.url} style={{ display: "flex", alignItems: "center", gap: "16px", flex: "1 1 280px", minWidth: 0, color: "var(--ink)", textDecoration: "none" }}>
        <div
          aria-hidden="true"
          style={{
            width: "112px",
            aspectRatio: "16 / 9",
            flex: "none",
            borderRadius: "8px",
            background: g.coverUrl ? `center / cover no-repeat url(${JSON.stringify(g.coverUrl)})` : `hsl(${g.hue} 45% 32%)`,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "15px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.title}</div>
          <div style={{ marginTop: "4px", fontFamily: mono, fontSize: "11px", color: "var(--ink-5)" }}>
            @{g.creator} · played {relativeTime(row.lastPlayedAt)}
          </div>
        </div>
      </Link>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 22px" }}>
        <Stat label="Best" value={row.bestScore == null ? "—" : row.bestScore.toLocaleString()} note={row.lastScore != null && row.lastScore !== row.bestScore ? `last ${row.lastScore.toLocaleString()}` : null} />
        <Stat label="Rank" value={row.rank == null ? "—" : `#${row.rank}`} note={row.rank != null && row.boardTotal ? `of ${row.boardTotal.toLocaleString()}` : null} />
        <Stat label="Rounds" value={row.rounds.toLocaleString()} />
        <Stat label="Played" value={playedLabel(row.playedMs)} />
        <button type="button" onClick={onShare} aria-label={`Share your ${row.bestScore == null ? "plays" : "score"} in ${g.title}`} style={{ ...chipBtn, cursor: "pointer" }}>
          Share
        </button>
      </div>
    </div>
  );
}

export function HistoryView({ data }: { data: HistoryData }) {
  const { openAuth, openModal, setModalGameId } = useShell();
  const shareRow = (gameId: string) => {
    setModalGameId(gameId);
    openModal("shareScore");
  };
  const { rows, signedIn } = data;
  const rounds = rows.reduce((n, r) => n + r.rounds, 0);
  const playedMs = rows.reduce((n, r) => n + r.playedMs, 0);

  return (
    <BentoStack>
      <BentoGrid>
        <PageHead title="Play history" sub={HISTORY_SUB} />
        {rows.length ? null : (
          <EmptyCell>
            <div style={{ fontSize: "17px", fontWeight: 600 }}>No plays yet</div>
            <div style={{ marginTop: "8px", fontSize: "14px", color: "var(--ink-4)", maxWidth: "44ch" }}>
              Every game you play shows up here with your best score and rank.
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "18px", flexWrap: "wrap", justifyContent: "center" }}>
              <Link href="/explore" style={primaryBtn}>
                Browse games
              </Link>
            </div>
          </EmptyCell>
        )}
      </BentoGrid>
      {rows.length ? (
        <div style={{ ...bpanel, padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <div style={monoLabel}>
              {rows.length} {rows.length === 1 ? "game" : "games"} · {rounds.toLocaleString()} {rounds === 1 ? "round" : "rounds"} · {playedLabel(playedMs)} played
            </div>
            {signedIn ? null : (
              <button type="button" onClick={() => openAuth("signin", "/history")} style={{ ...chipBtn, cursor: "pointer" }}>
                Sign in to keep this history
              </button>
            )}
          </div>
          <div style={{ marginTop: "6px" }}>
            {rows.map((r, i) => (
              <Row key={r.game.id} row={r} first={i === 0} onShare={() => shareRow(r.game.id)} />
            ))}
          </div>
        </div>
      ) : null}
    </BentoStack>
  );
}
