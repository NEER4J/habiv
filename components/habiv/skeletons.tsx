"use client";

import type { CSSProperties } from "react";
import { spanFor } from "@/lib/habiv/bento";
import { bpanel } from "@/lib/habiv/ui";
import { BentoAutoGrid, BentoGrid, BentoStack, GameCards, PageHead, SkeletonCard, shimmer } from "./game-card";
import { historyRowStyle } from "./history-view";
import { useShell } from "./shell-context";

/**
 * Route loading states. Pages pass these as their <Suspense> fallback, so they ship in the
 * prefetched static shell and paint the instant a link is clicked, before any data arrives.
 * Each one keeps the footprint of the real view so nothing jumps when it swaps in.
 */

const cell: CSSProperties = { ...bpanel, animation: "hbFade 200ms ease-out both" };

function Bone({ w = "100%", h, r = 6, style }: { w?: string | number; h: string | number; r?: number; style?: CSSProperties }) {
  return <div aria-hidden="true" style={{ width: w, height: h, borderRadius: r, flex: "0 0 auto", maxWidth: "100%", ...shimmer, ...style }} />;
}

/** Card placeholders; renders its own list, so it sits beside a BentoGrid, not inside one. */
function Tiles({ n }: { n: number }) {
  return (
    <GameCards>
      {Array.from({ length: n }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </GameCards>
  );
}

/** A page header whose title is not known until the data loads. */
function HeadBones({ auto }: { auto?: boolean }) {
  return (
    <div style={{ ...cell, gridColumn: "1 / -1", gridRow: auto ? undefined : "span 2", display: "flex", alignItems: "center", gap: "14px", padding: auto ? "20px 18px" : "0 18px" }}>
      <Bone w={150} h={22} />
      <Bone w="34%" h={12} />
    </div>
  );
}

const CHIP_WIDTHS = [78, 96, 70, 104, 84, 66];

function ChipBones({ n, inGrid = true }: { n: number; inGrid?: boolean }) {
  return (
    <div style={{ gridColumn: "1 / -1", gridRow: inGrid ? "span 1" : undefined, display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
      {Array.from({ length: n }, (_, i) => (
        <Bone key={i} w={CHIP_WIDTHS[i % CHIP_WIDTHS.length]} h={32} r={9} />
      ))}
    </div>
  );
}

export function HomeSkeleton() {
  const { cols } = useShell();
  return (
    <BentoStack>
      <BentoGrid>
        <div
          style={{
            ...cell,
            gridColumn: "1 / -1",
            gridRow: `span ${cols === 2 ? 7 : 9}`,
            borderRadius: "18px",
            padding: "clamp(18px, 4vw, 40px)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            gap: "12px",
          }}
        >
          <Bone w={90} h={10} />
          <Bone w="min(420px, 70%)" h={34} r={8} />
          <Bone w="min(300px, 50%)" h={13} />
          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            <Bone w={110} h={42} r={21} />
            <Bone w={90} h={42} r={21} />
          </div>
        </div>
        <ChipBones n={6} />
      </BentoGrid>
      <Tiles n={10} />
    </BentoStack>
  );
}

export function ExploreSkeleton() {
  return (
    <BentoStack>
      <BentoGrid>
        <HeadBones />
        <ChipBones n={4} />
      </BentoGrid>
      <Tiles n={12} />
    </BentoStack>
  );
}

/** A titled list of game cards (Saved and similar lists). */
export function GridPageSkeleton({ title, sub, n = 8 }: { title: string; sub?: string; n?: number }) {
  return (
    <BentoStack>
      <BentoGrid>
        <PageHead title={title} sub={sub} />
      </BentoGrid>
      <Tiles n={n} />
    </BentoStack>
  );
}

/** Play history: the same panel of rows as the real list (thumb, title, four stats, Share). */
export function HistorySkeleton({ sub, n = 5 }: { sub?: string; n?: number }) {
  return (
    <BentoStack>
      <BentoGrid>
        <PageHead title="Play history" sub={sub} />
      </BentoGrid>
      <div style={{ ...cell, padding: "16px 18px" }}>
        <Bone w="min(260px, 60%)" h={10} style={{ margin: "4px 0 6px" }} />
        {Array.from({ length: n }, (_, i) => (
          <div key={i} style={{ ...historyRowStyle(i === 0), opacity: 1 - i * 0.14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px", flex: "1 1 280px", minWidth: 0 }}>
              <Bone w={112} h={63} r={8} />
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                <Bone w={`${[62, 48, 70, 55, 44][i % 5]}%`} h={15} />
                <Bone w={`${[40, 34, 46, 38, 30][i % 5]}%`} h={10} />
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 22px" }}>
              {[48, 40, 30, 38].map((w, j) => (
                <div key={j} style={{ minWidth: "64px", display: "flex", flexDirection: "column", gap: "7px" }}>
                  <Bone w={34} h={8} />
                  <Bone w={w} h={14} />
                </div>
              ))}
              <Bone w={64} h={34} r={17} />
            </div>
          </div>
        ))}
      </div>
    </BentoStack>
  );
}

export function ProfileSkeleton() {
  const { cols } = useShell();
  const narrow = cols === 2;
  const avatar = narrow ? 84 : 108;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: narrow ? "10px" : "12px" }}>
      <BentoAutoGrid>
        <div style={{ ...cell, gridColumn: "1 / -1", overflow: "hidden" }}>
          <Bone w="100%" h={narrow ? 118 : 176} r={0} />
          <div style={{ padding: narrow ? "0 16px 18px" : "0 26px 24px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ marginTop: `-${avatar / 2}px`, padding: "5px", width: "fit-content", borderRadius: `${Math.round(avatar * 0.3) + 5}px`, background: "var(--panel)" }}>
              <Bone w={avatar} h={avatar} r={Math.round(avatar * 0.3)} />
            </div>
            <Bone w="min(240px, 60%)" h={26} style={{ marginTop: "6px" }} />
            <Bone w="min(180px, 45%)" h={12} />
            <Bone w="min(420px, 85%)" h={12} style={{ marginTop: "6px" }} />
          </div>
        </div>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} style={{ ...cell, gridColumn: `span ${spanFor(cols, [1, 3, 2, 2])}`, height: "112px", padding: "16px 18px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <Bone w={80} h={28} r={8} />
            <Bone w={56} h={24} />
          </div>
        ))}
        <div style={{ ...cell, gridColumn: `span ${spanFor(cols, [2, 6, 8, 4])}`, height: "112px", padding: "16px 18px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <Bone w={90} h={12} />
          <Bone w={64} h={24} />
        </div>
      </BentoAutoGrid>
      <BentoGrid>
        <ChipBones n={3} />
      </BentoGrid>
      <Tiles n={8} />
    </div>
  );
}

export function MyGamesSkeleton() {
  const { cols } = useShell();
  return (
    <BentoGrid>
      <PageHead title="My games" sub="Everything you have published, in draft, or hidden." />
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          style={{ ...cell, gridColumn: `span ${spanFor(cols, [1, 3, 2, 3])}`, gridRow: "span 2", padding: "0 16px", display: "flex", flexDirection: "column", justifyContent: "center", gap: "10px" }}
        >
          <Bone w="50%" h={10} />
          <Bone w="40%" h={22} />
        </div>
      ))}
      <ChipBones n={4} />
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} style={{ ...cell, gridColumn: "1 / -1", gridRow: "span 1", display: "flex", alignItems: "center", gap: "12px", padding: "0 10px" }}>
          <Bone w={64} h={38} r={8} />
          <Bone w="30%" h={12} />
          <div style={{ flex: 1 }} />
          <Bone w={70} h={12} />
        </div>
      ))}
    </BentoGrid>
  );
}

/** Form-style pages: settings, publish, edit details, onboarding. */
export function FormSkeleton({ title, sub, chips = 0, fields = 4 }: { title?: string; sub?: string; chips?: number; fields?: number }) {
  return (
    <BentoAutoGrid>
      {title ? <PageHead title={title} sub={sub} auto /> : <HeadBones auto />}
      {chips ? <ChipBones n={chips} inGrid={false} /> : null}
      <div style={{ ...cell, gridColumn: "1 / -1", padding: "22px", display: "flex", flexDirection: "column", gap: "22px" }}>
        {Array.from({ length: fields }, (_, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <Bone w={90} h={10} />
            <Bone h={40} r={9} />
          </div>
        ))}
        <Bone w={120} h={36} r={18} />
      </div>
    </BentoAutoGrid>
  );
}

export function WatchSkeleton() {
  return (
    <div className="hb-watch-row" style={{ display: "flex", alignItems: "flex-start", gap: "12px", flexWrap: "nowrap" }}>
      <div style={{ flex: "1 1 640px", minWidth: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ ...cell, aspectRatio: "16 / 9", borderRadius: "18px", overflow: "hidden" }}>
          <div style={{ width: "100%", height: "100%", ...shimmer }} />
        </div>
        <div style={{ ...cell, padding: "18px", display: "flex", alignItems: "center", gap: "12px" }}>
          <Bone w={40} h={40} r={20} />
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
            <Bone w="min(280px, 60%)" h={18} />
            <Bone w="min(160px, 40%)" h={11} />
          </div>
          <Bone w={96} h={36} r={18} />
        </div>
      </div>
      <aside className="hb-watch-side" style={{ ...cell, flex: "1 1 320px", maxWidth: "360px", padding: "12px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Bone w={96} h={56} r={10} />
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
              <Bone w="70%" h={12} />
              <Bone w="45%" h={10} />
            </div>
          </div>
        ))}
      </aside>
    </div>
  );
}
