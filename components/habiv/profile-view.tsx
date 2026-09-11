"use client";

import Link from "next/link";
import { useState } from "react";
import { toggleFollow } from "@/lib/actions/social";
import { packTiles } from "@/lib/habiv/bento";
import { fmt, type Game } from "@/lib/habiv/games";
import type { ProfileData } from "@/lib/habiv/page-data";
import { bpanel, chipBtn, chipStyle, mono, pill } from "@/lib/habiv/ui";
import { Avatar } from "./avatar";
import { BentoGrid, BentoTile, ChipCell, EmptyCell } from "./game-card";
import { useShell } from "./shell-context";

type Tab = "Games" | "Remixes" | "Liked";

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "March 2026" from an ISO date, without locale differences between server and client. */
function joinedLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const emptyCopy: Record<Tab, (self: boolean, handle: string) => { title: string; sub: string }> = {
  Games: (self, h) => (self ? { title: "No games yet", sub: "Publish your first game and it shows up here." } : { title: "No games yet", sub: `@${h} has not published anything yet.` }),
  Remixes: (self, h) => (self ? { title: "No remixes yet", sub: "Remix any open game and it lands here." } : { title: "No remixes yet", sub: `@${h} has not remixed anything yet.` }),
  Liked: () => ({ title: "Nothing liked yet", sub: "Games you like are collected here for you." }),
};

export function ProfileView({ data }: { data: ProfileData }) {
  const { profile: p, isSelf, totals } = data;
  const tabs: Tab[] = isSelf ? ["Games", "Remixes", "Liked"] : ["Games", "Remixes"];
  const [tab, setTab] = useState<Tab>("Games");
  const [following, setFollowing] = useState(data.following);
  const [followers, setFollowers] = useState(p.followersCount);
  const [pending, setPending] = useState(false);
  const { cols, requireAuth, showToast } = useShell();

  const listFor: Record<Tab, Game[]> = { Games: data.games, Remixes: data.remixes, Liked: data.liked };
  const list = listFor[tab];
  const tiles = packTiles(list, cols, 2).tiles;

  const stats = [
    { label: "games", value: String(totals.published) },
    { label: "runs", value: fmt(totals.runs) },
    { label: "remixes", value: fmt(totals.remixes) },
    { label: "followers", value: fmt(followers) },
  ];

  const follow = () => {
    if (!requireAuth() || pending) return;
    const next = !following;
    setFollowing(next);
    setFollowers((n) => Math.max(0, n + (next ? 1 : -1)));
    setPending(true);
    void toggleFollow(p.id).then((res) => {
      setPending(false);
      if (!res.ok) {
        setFollowing(!next);
        setFollowers((n) => Math.max(0, n + (next ? -1 : 1)));
        showToast(res.error);
        return;
      }
      setFollowing(res.active);
      setFollowers(res.count);
      showToast(res.active ? `Following @${p.handle}` : `Unfollowed @${p.handle}`);
    });
  };

  const share = () => {
    const url = `${window.location.origin}/@${p.handle}`;
    void navigator.clipboard
      .writeText(url)
      .then(() => showToast("Profile link copied"))
      .catch(() => showToast(url));
  };

  const empty = emptyCopy[tab](isSelf, p.handle);

  return (
    <BentoGrid>
      <div
        style={{
          ...bpanel,
          gridColumn: "1 / -1",
          gridRow: `span ${cols === 2 ? 8 : 5}`,
          display: "flex",
          alignItems: "center",
          padding: "22px",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: "20px", flexWrap: "wrap", width: "100%" }}>
          {p.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- avatar URLs come from Supabase storage
            <img src={p.avatarUrl} alt="" style={{ width: "84px", height: "84px", borderRadius: "25px", objectFit: "cover", background: "var(--chip)", flex: "0 0 auto" }} />
          ) : (
            <Avatar seed={p.handle} size={84} />
          )}
          <div style={{ flex: "1 1 300px", minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 600, letterSpacing: "-0.03em", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span>{p.displayName}</span>
              {p.isVerified ? (
                <span
                  title="Verified creator"
                  aria-label="Verified creator"
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "18px", height: "18px", borderRadius: "50%", background: "var(--pos-bg)", color: "var(--pos-ink)" }}
                >
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 6.2 4.8 9 10 3.4" />
                  </svg>
                </span>
              ) : null}
            </h1>
            <div style={{ marginTop: "5px", fontFamily: mono, fontSize: "11.5px", color: "var(--ink-5)" }}>
              @{p.handle}
              {p.pronouns ? ` · ${p.pronouns}` : ""} · joined {joinedLabel(p.createdAt)}
            </div>
            {p.bio ? (
              <p style={{ margin: "10px 0 0", fontSize: "14px", lineHeight: 1.6, color: "var(--ink-3)", maxWidth: "56ch" }}>{p.bio}</p>
            ) : null}
            {p.links.length ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "10px" }}>
                {p.links.slice(0, 3).map((l) => (
                  <a key={l} href={l} target="_blank" rel="noopener noreferrer nofollow" style={{ fontFamily: mono, fontSize: "11.5px", color: "var(--ink-4)", textDecoration: "underline", textUnderlineOffset: "3px" }}>
                    {hostOf(l)}
                  </a>
                ))}
              </div>
            ) : null}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "22px", marginTop: "14px" }}>
              {stats.map((s) => (
                <div key={s.label}>
                  <div style={{ fontSize: "16px", fontWeight: 600, letterSpacing: "-0.01em" }}>{s.value}</div>
                  <div
                    style={{
                      fontFamily: mono,
                      fontSize: "10px",
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "var(--ink-5)",
                      marginTop: "3px",
                    }}
                  >
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: "0 0 auto" }}>
            {isSelf ? (
              <Link href="/settings" style={{ ...pill("primary"), height: "36px" }}>
                Edit profile
              </Link>
            ) : (
              <button onClick={follow} disabled={pending} style={{ ...(following ? pill() : pill("primary")), height: "36px" }}>
                {following ? "Following" : "Follow"}
              </button>
            )}
            <button onClick={share} style={chipBtn}>
              Share
            </button>
          </div>
        </div>
      </div>

      <ChipCell>
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={chipStyle(tab === t)}>
            {t}
          </button>
        ))}
      </ChipCell>

      {tiles.length === 0 ? (
        <EmptyCell>
          <div style={{ fontSize: "17px", fontWeight: 600 }}>{empty.title}</div>
          <div style={{ marginTop: "8px", fontSize: "13.5px", color: "var(--ink-5)", maxWidth: "44ch" }}>{empty.sub}</div>
          {isSelf && tab === "Games" ? (
            <Link href="/publish" style={{ ...pill("primary"), marginTop: "18px" }}>
              Publish a game
            </Link>
          ) : null}
          {tab === "Liked" ? (
            <Link href="/explore" style={{ ...chipBtn, marginTop: "18px" }}>
              Explore games
            </Link>
          ) : null}
        </EmptyCell>
      ) : null}

      {tiles.map((t) => (
        <BentoTile key={t.game.id} tile={t} cols={cols} showModel={false} showCreator={tab === "Liked"} />
      ))}
    </BentoGrid>
  );
}
