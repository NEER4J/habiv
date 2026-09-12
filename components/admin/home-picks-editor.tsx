"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { setHomePicks } from "@/lib/actions/admin";
import { ActionText, smallBtn, smallPrimaryBtn, useAdminAction } from "@/components/admin/action-button";
import type { PickableGame } from "@/lib/db/admin";
import { bpanel, fieldStyle, mono, monoLabel } from "@/lib/habiv/ui";

const SLOTS = 4;

const thumb: CSSProperties = { width: "64px", height: "36px", flex: "none", borderRadius: "6px", objectFit: "cover", background: "var(--chip)" };
const row: CSSProperties = { display: "flex", alignItems: "center", gap: "10px", minHeight: "48px", padding: "6px 8px", borderRadius: "10px", border: "1px solid var(--divider)" };
const sub: CSSProperties = { fontFamily: mono, fontSize: "11px", color: "var(--ink-5)" };

function GameLine({ game }: { game: PickableGame }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- cover URLs come from the CDN */}
      {game.coverUrl ? <img src={game.coverUrl} alt="" width={64} height={36} style={thumb} /> : <span style={thumb} />}
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", fontSize: "13.5px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{game.title}</span>
        <span style={sub}>
          @{game.creator} · {game.plays.toLocaleString()} plays{game.durationSec ? ` · ${game.durationSec}s run` : ""}
        </span>
      </span>
    </>
  );
}

function PickPanel({ slot, title, note, games, initial }: { slot: "featured" | "quick"; title: string; note: string; games: PickableGame[]; initial: string[] }) {
  const { pending, msg, run } = useAdminAction();
  const byId = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  // Saved ids whose game is no longer live are dropped here; saving then clears them.
  const [picked, setPicked] = useState<string[]>(() => initial.filter((id) => byId.has(id)).slice(0, SLOTS));
  const [q, setQ] = useState("");
  const dirty = picked.join() !== initial.join();
  const full = picked.length >= SLOTS;

  const term = q.trim().toLowerCase();
  const results = games.filter((g) => !picked.includes(g.id) && (!term || g.title.toLowerCase().includes(term) || g.creator.toLowerCase().includes(term))).slice(0, 8);

  const move = (i: number, d: -1 | 1) =>
    setPicked((p) => {
      const n = [...p];
      [n[i], n[i + d]] = [n[i + d], n[i]];
      return n;
    });

  return (
    <section style={{ ...bpanel, padding: "18px", display: "grid", gap: "12px", alignContent: "start" }}>
      <div>
        <div style={{ fontSize: "15px", fontWeight: 600 }}>{title}</div>
        <p style={{ margin: "4px 0 0", fontSize: "12.5px", color: "var(--ink-5)" }}>{note}</p>
      </div>

      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "6px" }}>
        {Array.from({ length: SLOTS }, (_, i) => {
          const g = picked[i] ? byId.get(picked[i]) : undefined;
          return (
            <li key={i} style={{ ...row, borderStyle: g ? "solid" : "dashed" }}>
              <span style={{ ...sub, width: "14px", textAlign: "center" }}>{i + 1}</span>
              {g ? (
                <>
                  <GameLine game={g} />
                  <button type="button" aria-label="Move up" disabled={pending || i === 0} onClick={() => move(i, -1)} style={{ ...smallBtn, opacity: i === 0 ? 0.35 : 1 }}>↑</button>
                  <button type="button" aria-label="Move down" disabled={pending || i === picked.length - 1} onClick={() => move(i, 1)} style={{ ...smallBtn, opacity: i === picked.length - 1 ? 0.35 : 1 }}>↓</button>
                  <button type="button" aria-label={`Remove ${g.title}`} disabled={pending} onClick={() => setPicked((p) => p.filter((id) => id !== g.id))} style={smallBtn}>✕</button>
                </>
              ) : (
                <span style={{ fontSize: "12.5px", color: "var(--ink-5)" }}>Empty, fills automatically</span>
              )}
            </li>
          );
        })}
      </ol>

      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <button type="button" disabled={pending || !dirty} onClick={() => run(() => setHomePicks(slot, picked), "Saved")} style={{ ...smallPrimaryBtn, opacity: pending || !dirty ? 0.45 : 1 }}>
          {pending ? "…" : "Save"}
        </button>
        {picked.length > 0 && (
          <button type="button" disabled={pending} onClick={() => setPicked([])} style={smallBtn}>Clear all</button>
        )}
        <ActionText msg={msg} />
      </div>

      <div style={{ paddingTop: "12px", borderTop: "1px solid var(--divider)", display: "grid", gap: "6px" }}>
        <label htmlFor={`pick-search-${slot}`} style={monoLabel}>{full ? "All 4 slots are filled — remove one to add another" : "Add a game"}</label>
        <input id={`pick-search-${slot}`} type="search" value={q} disabled={full} placeholder="Search by title or creator…" onChange={(e) => setQ(e.target.value)} style={{ ...fieldStyle, opacity: full ? 0.5 : 1 }} />
        {!full && (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "4px" }}>
            {results.map((g) => (
              <li key={g.id}>
                <button type="button" disabled={pending} onClick={() => { setPicked((p) => [...p, g.id]); setQ(""); }} style={{ ...row, width: "100%", background: "transparent", color: "inherit", cursor: "pointer", textAlign: "left", font: "inherit" }}>
                  <GameLine game={g} />
                  <span style={sub}>+ Add</span>
                </button>
              </li>
            ))}
            {results.length === 0 && <li style={{ fontSize: "12.5px", color: "var(--ink-5)" }}>No matching live games.</li>}
          </ul>
        )}
      </div>
    </section>
  );
}

export function HomePicksEditor({ games, featured, quick }: { games: PickableGame[]; featured: string[]; quick: string[] }) {
  return (
    <div style={{ display: "grid", gap: "14px", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", maxWidth: "1100px" }}>
      <PickPanel slot="featured" title="Hero banner" note="The 4 games in the featured queue. #1 opens in the hero, then it rotates through the rest." games={games} initial={featured} />
      <PickPanel slot="quick" title="Quick play" note="The first 4 cards of the Quick play row on the home page. The rest of the row fills automatically." games={games} initial={quick} />
    </div>
  );
}
