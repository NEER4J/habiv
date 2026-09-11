"use client";

import Link from "next/link";
import { packTiles } from "@/lib/habiv/bento";
import type { Game } from "@/lib/habiv/games";
import { chipBtn, primaryBtn } from "@/lib/habiv/ui";
import { BentoGrid, BentoTile, EmptyCell, PageHead } from "./game-card";
import { useShell } from "./shell-context";

export function SavedView({ games, daily }: { games: Game[]; daily: Game | null }) {
  const { savedIds, sessionReady, cols } = useShell();
  // The server list is the viewer's saves; once the session is live, unsaving drops a tile immediately.
  const list = sessionReady ? games.filter((g) => savedIds.includes(g.id)) : games;
  const tiles = packTiles(list, cols, 1).tiles;

  return (
    <BentoGrid>
      <PageHead title="Saved" sub="Games you kept for later. Only you can see this list." />
      {tiles.length ? (
        tiles.map((t) => <BentoTile key={t.game.id} tile={t} cols={cols} showModel={false} showStats={false} />)
      ) : (
        <EmptyCell>
          <div style={{ fontSize: "17px", fontWeight: 600 }}>Nothing saved yet</div>
          <div style={{ marginTop: "8px", fontSize: "14px", color: "var(--ink-4)", maxWidth: "44ch" }}>
            Tap Save on any game and it lands here.{daily ? " Start with today’s challenge." : ""}
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "18px", flexWrap: "wrap", justifyContent: "center" }}>
            {daily ? (
              <Link href={daily.url} style={primaryBtn}>
                Play {daily.title}
              </Link>
            ) : (
              <Link href="/explore" style={primaryBtn}>
                Browse games
              </Link>
            )}
            {daily ? (
              <Link href="/explore" style={chipBtn}>
                Browse games
              </Link>
            ) : null}
          </div>
        </EmptyCell>
      )}
    </BentoGrid>
  );
}
