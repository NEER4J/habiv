"use client";

import { useState } from "react";
import { setFeatured, setGameCategory, setGameStatus } from "@/lib/actions/admin";
import { ActionButton, ActionText, useAdminAction } from "@/components/admin/action-button";
import { mono } from "@/lib/habiv/ui";

type Cat = { slug: string; name: string; active: boolean };

const ctrl = { height: "28px", border: "none", borderRadius: "8px", background: "var(--chip)", color: "var(--ink)", fontSize: "12px", fontFamily: "inherit", outline: "none", padding: "0 8px" } as const;

export function CategorySelect({ gameId, value, categories }: { gameId: string; value: string; categories: Cat[] }) {
  const { pending, msg, run } = useAdminAction();
  const known = categories.some((c) => c.slug === value);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
      <select id={`cat-${gameId}`} aria-label="Category" value={value} disabled={pending} style={ctrl} onChange={(e) => run(() => setGameCategory(gameId, e.target.value), "Saved")}>
        {!known && <option value={value}>{value}</option>}
        {categories.map((c) => (
          <option key={c.slug} value={c.slug}>{c.name}{c.active ? "" : " (inactive)"}</option>
        ))}
      </select>
      <ActionText msg={msg} />
    </span>
  );
}

export function FeaturedControl({ gameId, featured, rank }: { gameId: string; featured: boolean; rank: number | null }) {
  const { pending, msg, run } = useAdminAction();
  const [draft, setDraft] = useState(rank === null ? "" : String(rank));
  const save = (next: string) => {
    const n = next.trim() === "" ? null : Number(next);
    if (n !== null && !Number.isInteger(n)) return;
    run(() => setFeatured(gameId, true, n), "Saved");
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
      <button
        id={`feat-${gameId}`}
        type="button"
        title={featured ? "Unfeature" : "Feature"}
        aria-pressed={featured}
        disabled={pending}
        style={{ ...ctrl, cursor: "pointer", color: featured ? "var(--ink)" : "var(--ink-5)", fontSize: "15px", width: "32px", padding: 0 }}
        onClick={() => run(() => setFeatured(gameId, !featured, featured ? null : (draft.trim() === "" ? null : Number(draft))), featured ? "Unfeatured" : "Featured")}
      >
        {featured ? "★" : "☆"}
      </button>
      {featured && (
        <input
          id={`rank-${gameId}`}
          aria-label="Featured rank"
          type="number"
          min={0}
          step={1}
          value={draft}
          placeholder="rank"
          disabled={pending}
          style={{ ...ctrl, width: "62px", fontFamily: mono }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => { if (e.target.value !== (rank === null ? "" : String(rank))) save(e.target.value); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        />
      )}
      <ActionText msg={msg} />
    </span>
  );
}

export function GameActions({ gameId, status }: { gameId: string; status: string }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
      {status !== "hidden" && status !== "removed" && (
        <ActionButton id={`hide-${gameId}`} label="Hide" okText="Hidden" prompt="Reason for hiding (shown to creator):" run={(r) => setGameStatus(gameId, "hidden", r)} />
      )}
      {status !== "removed" && (
        <ActionButton id={`remove-${gameId}`} label="Remove" variant="danger" okText="Removed" prompt="Reason for removal:" run={(r) => setGameStatus(gameId, "removed", r)} />
      )}
      {status !== "published" && (
        <ActionButton id={`restore-${gameId}`} label={status === "draft" ? "Publish" : "Restore"} variant="primary" okText="Published" run={() => setGameStatus(gameId, "published")} />
      )}
      {status !== "draft" && (
        <ActionButton id={`draft-${gameId}`} label="Draft" okText="Drafted" confirm="Move this game back to draft?" run={() => setGameStatus(gameId, "draft")} />
      )}
    </div>
  );
}
