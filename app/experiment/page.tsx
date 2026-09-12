import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/db/admin";
import { getFeed } from "@/lib/db/games";
import { categoryName } from "@/lib/habiv/games";
import { ThumbLab, type LabGame } from "@/components/admin/thumb-lab";

export const metadata = { title: "Thumbnail lab — Habiv", robots: { index: false, follow: false } };

/** Stand-ins so the lab still shows something (the generative fallback) on an empty catalogue. */
const SAMPLES: LabGame[] = [
  { id: "sample-1", title: "Neon Drift", tagline: "Slide through a synthwave highway.", category: "Racing", engine: "canvas", creator: "habiv", hue: 320 },
  { id: "sample-2", title: "Moss", tagline: "A tiny garden that grows while you sleep.", category: "Idle", engine: "three.js", creator: "habiv", hue: 140 },
  { id: "sample-3", title: "Tiny Tower Defense Deluxe Edition", tagline: "Hold the line for sixty waves.", category: "Strategy", engine: "phaser", creator: "habiv", hue: 30 },
];

export default function ExperimentPage() {
  return (
    <div className="hb-theme" style={{ minHeight: "100svh", background: "var(--bg)", color: "var(--ink)", paddingInline: "clamp(16px, 3vw, 32px)", paddingBlock: "24px 64px", boxSizing: "border-box" }}>
      <Suspense fallback={null}>
        <Lab />
      </Suspense>
    </div>
  );
}

async function Lab() {
  if (!(await getAdminContext())) redirect("/");
  const { items } = await getFeed({ limit: 24, sort: "plays" });
  const games: LabGame[] = items.map((g) => ({
    id: g.id,
    title: g.title,
    tagline: g.tagline,
    category: categoryName(g.category),
    engine: g.currentVersion?.engine ?? null,
    creator: g.creator.handle,
    hue: g.accentHue,
  }));
  return <ThumbLab games={games.length ? games : SAMPLES} />;
}
