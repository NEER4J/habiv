"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { toggleFollow } from "@/lib/actions/social";
import { avatarLayers } from "@/lib/habiv/avatar";
import { spanFor } from "@/lib/habiv/bento";
import { art, fmt, poster, type Game } from "@/lib/habiv/games";
import type { ProfileData } from "@/lib/habiv/page-data";
import { bpanel, chipStyle, mono, monoLabel, pill } from "@/lib/habiv/ui";
import { cdnUrl } from "@/lib/site";
import { Avatar } from "./avatar";
import { BentoAutoGrid, BentoGrid, ChipCell, EmptyCell, GameCard, GameCards } from "./game-card";
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

const icons = {
  games: "M5.6 5.6h6.8a3.4 3.4 0 0 1 0 6.8H5.6a3.4 3.4 0 0 1 0-6.8zM7.6 7.6v2.8M6.2 9h2.8M11.7 8.4h.01M12.6 10h.01",
  runs: "M6.2 4.2v9.6L13.8 9z",
  likes: "M9 14.4S3.2 11.1 3.2 7a2.9 2.9 0 0 1 5.8-1.4A2.9 2.9 0 0 1 14.8 7c0 4.1-5.8 7.4-5.8 7.4z",
  remixes: "M3.6 5.4h2.2c3.4 0 3.6 7.2 7 7.2h1.6M12.8 10.6l1.8 2-1.8 2M3.6 12.6h2.2M11 5.4h3.4M12.8 3.4l1.8 2-1.8 2",
  link: "M7.6 10.4a3 3 0 0 0 4.2 0l2.1-2.1a3 3 0 0 0-4.2-4.2l-.9.9M10.4 7.6a3 3 0 0 0-4.2 0l-2.1 2.1a3 3 0 0 0 4.2 4.2l.9-.9",
  share: "M9 11.4V2.8M5.8 6 9 2.8 12.2 6M4 9.6v4.2c0 .8.6 1.4 1.4 1.4h7.2c.8 0 1.4-.6 1.4-1.4V9.6",
  plus: "M9 3.8v10.4M3.8 9h10.4",
  check: "M4 9.4 7.4 12.8 14 5.6",
  pencil: "M11.6 3.6l2.8 2.8-7.8 7.8H3.8v-2.8zM10 5.2l2.8 2.8",
};

function Icon({ d, size = 15 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** The profile picture on a panel-coloured ring, so it can sit over the banner edge. */
function ProfileAvatar({ url, seed, size }: { url: string | null; seed: string; size: number }) {
  const radius = Math.round(size * 0.3);
  return (
    <div style={{ padding: "5px", borderRadius: `${radius + 5}px`, background: "var(--panel)", flex: "0 0 auto" }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatar URLs come from Supabase storage
        <img src={url} alt="" style={{ display: "block", width: `${size}px`, height: `${size}px`, borderRadius: `${radius}px`, objectFit: "cover", background: "var(--chip)" }} />
      ) : (
        <Avatar seed={seed} size={size} />
      )}
    </div>
  );
}

const onBanner: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "9px",
  maxWidth: "min(340px, 70%)",
  padding: "5px 12px 5px 5px",
  borderRadius: "12px",
  background: "rgba(0,0,0,0.42)",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
  color: "#fff",
};

export function ProfileView({ data }: { data: ProfileData }) {
  const { profile: p, isSelf, totals } = data;
  const tabs: Tab[] = isSelf ? ["Games", "Remixes", "Liked"] : ["Games", "Remixes"];
  const [tab, setTab] = useState<Tab>("Games");
  const [following, setFollowing] = useState(data.following);
  const [followers, setFollowers] = useState(p.followersCount);
  const [pending, setPending] = useState(false);
  const { cols, light, requireAuth, showToast } = useShell();
  const narrow = cols === 2;

  const listFor: Record<Tab, Game[]> = { Games: data.games, Remixes: data.remixes, Liked: data.liked };
  const list = listFor[tab];

  // The banner borrows colour from the creator's most played game, over their avatar palette.
  const top = data.games.reduce<Game | null>((a, g) => (!a || g.plays > a.plays ? g : a), null);
  const bannerBase = avatarLayers(p.handle).wrapStyle.background;
  const avatarSize = narrow ? 84 : 108;

  const stats = [
    { label: "Games", value: String(totals.published), note: "published", hue: 230, icon: icons.games },
    { label: "Runs", value: fmt(totals.runs), note: "lifetime", hue: 150, icon: icons.runs },
    { label: "Likes", value: fmt(totals.likes), note: "across all games", hue: 18, icon: icons.likes },
    { label: "Remixes", value: fmt(totals.remixes), note: "of these games", hue: 290, icon: icons.remixes },
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
  const shownFollowers = data.followers.slice(0, narrow ? 6 : 8);
  const moreFollowers = Math.max(0, followers - shownFollowers.length);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: narrow ? "10px" : "12px" }}>
      <BentoAutoGrid>
        <section style={{ ...bpanel, gridColumn: "1 / -1", overflow: "hidden" }}>
          <div style={{ position: "relative", height: narrow ? "118px" : "176px", background: bannerBase, overflow: "hidden" }}>
            {top ? (
              // eslint-disable-next-line @next/next/no-img-element -- cover art is a blurred background layer
              <img
                src={art(top, 1000)}
                alt=""
                aria-hidden="true"
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "blur(26px) saturate(150%)", transform: "scale(1.25)", opacity: 0.9 }}
              />
            ) : null}
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage: "radial-gradient(rgba(255,255,255,0.28) 1px, transparent 1.5px)",
                backgroundSize: "16px 16px",
                maskImage: "linear-gradient(160deg, #000 0%, transparent 70%)",
                WebkitMaskImage: "linear-gradient(160deg, #000 0%, transparent 70%)",
              }}
            />
            <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,0.32) 100%)" }} />
            {top && !narrow ? (
              <Link href={top.url} className="hb-lift-sm" style={{ ...onBanner, position: "absolute", right: "16px", bottom: "16px" }}>
                <span style={{ width: "34px", height: "34px", flex: "0 0 auto", borderRadius: "8px", backgroundImage: `url("${poster(top, 120)}")`, backgroundSize: "cover", backgroundPosition: "center" }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontFamily: mono, fontSize: "9.5px", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.72)" }}>
                    {top.plays > 0 ? "Most played" : "Latest game"}
                  </span>
                  <span style={{ display: "block", fontSize: "13px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{top.title}</span>
                </span>
              </Link>
            ) : null}
          </div>

          <div style={{ padding: narrow ? "0 16px 18px" : "0 26px 24px" }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "12px", marginTop: `-${avatarSize / 2}px`, position: "relative" }}>
              <ProfileAvatar url={p.avatarUrl} seed={p.handle} size={avatarSize} />
              <div style={{ display: "flex", gap: "8px", paddingBottom: "2px" }}>
                {isSelf ? (
                  <Link href="/settings" style={pill("primary")}>
                    <Icon d={icons.pencil} size={14} />
                    Edit profile
                  </Link>
                ) : (
                  <button onClick={follow} disabled={pending} style={following ? pill() : pill("primary")}>
                    <Icon d={following ? icons.check : icons.plus} size={14} />
                    {following ? "Following" : "Follow"}
                  </button>
                )}
                <button onClick={share} aria-label="Share profile" title="Copy profile link" style={{ ...pill(), padding: narrow ? "0" : "0 15px", width: narrow ? "36px" : undefined }}>
                  <Icon d={icons.share} size={14} />
                  {narrow ? null : "Share"}
                </button>
              </div>
            </div>

            <h1 style={{ margin: "14px 0 0", fontSize: narrow ? "24px" : "30px", fontWeight: 650, letterSpacing: "-0.035em", lineHeight: 1.15, display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span>{p.displayName}</span>
              {p.isVerified ? (
                <span
                  title="Verified creator"
                  aria-label="Verified creator"
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "22px", height: "22px", borderRadius: "50%", background: "var(--pos-bg)", color: "var(--pos-ink)" }}
                >
                  <Icon d={icons.check} size={13} />
                </span>
              ) : null}
              {p.isCreator && totals.published > 0 ? (
                <span style={{ ...monoLabel, fontSize: "9.5px", padding: "4px 8px", borderRadius: "6px", background: "var(--chip)", color: "var(--ink-4)" }}>Creator</span>
              ) : null}
            </h1>
            <div style={{ marginTop: "6px", display: "flex", flexWrap: "wrap", gap: "6px 14px", fontFamily: mono, fontSize: "12px", color: "var(--ink-5)" }}>
              <span style={{ color: "var(--ink-4)" }}>@{p.handle}</span>
              {p.pronouns ? <span>{p.pronouns}</span> : null}
              <span>joined {joinedLabel(p.createdAt)}</span>
            </div>
            {p.bio ? <p style={{ margin: "14px 0 0", fontSize: "14.5px", lineHeight: 1.6, color: "var(--ink-3)", maxWidth: "62ch", whiteSpace: "pre-line" }}>{p.bio}</p> : null}
            {p.links.length ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "14px" }}>
                {p.links.slice(0, 4).map((l) => (
                  <a
                    key={l}
                    href={l}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="hb-lift-sm"
                    style={{ ...pill(), height: "30px", padding: "0 12px", gap: "6px", fontSize: "12.5px", color: "var(--ink-3)" }}
                  >
                    <Icon d={icons.link} size={13} />
                    {hostOf(l)}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        {stats.map((s) => (
          <div key={s.label} style={{ ...bpanel, gridColumn: `span ${spanFor(cols, [1, 3, 2, 2])}`, padding: narrow ? "14px" : "16px 18px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "28px",
                  height: "28px",
                  flex: "0 0 auto",
                  borderRadius: "8px",
                  background: `oklch(0.72 0.15 ${s.hue} / ${light ? 0.14 : 0.2})`,
                  color: light ? `oklch(0.5 0.15 ${s.hue})` : `oklch(0.84 0.12 ${s.hue})`,
                }}
              >
                <Icon d={s.icon} />
              </span>
              <span style={{ ...monoLabel, fontSize: "10px" }}>{s.label}</span>
            </div>
            <div>
              <div style={{ fontSize: narrow ? "24px" : "28px", fontWeight: 650, letterSpacing: "-0.03em", lineHeight: 1 }}>{s.value}</div>
              <div style={{ marginTop: "6px", fontSize: "12px", color: "var(--ink-5)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.note}</div>
            </div>
          </div>
        ))}

        <div style={{ ...bpanel, gridColumn: `span ${spanFor(cols, [2, 6, 8, 4])}`, padding: narrow ? "14px" : "16px 18px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px" }}>
            <span style={{ ...monoLabel, fontSize: "10px" }}>Followers</span>
            <span style={{ fontFamily: mono, fontSize: "11px", color: "var(--ink-5)" }}>{fmt(p.followingCount)} following</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ fontSize: narrow ? "24px" : "28px", fontWeight: 650, letterSpacing: "-0.03em", lineHeight: 1 }}>{fmt(followers)}</div>
            {shownFollowers.length ? (
              <div style={{ display: "flex", alignItems: "center", paddingLeft: "8px" }}>
                {shownFollowers.map((f) => {
                  const url = cdnUrl(f.avatar_path);
                  return (
                    <Link
                      key={f.id}
                      href={`/@${f.handle}`}
                      title={`@${f.handle}`}
                      className="hb-lift-sm"
                      style={{ width: "32px", height: "32px", marginLeft: "-8px", borderRadius: "50%", overflow: "hidden", border: "2px solid var(--panel)", background: "var(--chip)", flex: "0 0 auto" }}
                    >
                      {url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- avatar URLs come from Supabase storage
                        <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <Avatar seed={f.handle} size={28} />
                      )}
                    </Link>
                  );
                })}
                {moreFollowers ? (
                  <span style={{ height: "32px", minWidth: "32px", marginLeft: "-8px", padding: "0 8px", borderRadius: "16px", border: "2px solid var(--panel)", background: "var(--panel-2)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: mono, fontSize: "10.5px", color: "var(--ink-4)" }}>
                    +{fmt(moreFollowers)}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          {!shownFollowers.length ? (
            <div style={{ fontSize: "12px", color: "var(--ink-5)" }}>{isSelf ? "Share your profile to find your first players." : `Be the first to follow @${p.handle}.`}</div>
          ) : null}
        </div>
      </BentoAutoGrid>

      <BentoGrid>
        <ChipCell>
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)} style={chipStyle(tab === t)}>
              {t}
              <span style={{ marginLeft: "7px", fontFamily: mono, fontSize: "11px", opacity: 0.6 }}>{listFor[t].length}</span>
            </button>
          ))}
        </ChipCell>

        {list.length === 0 ? (
          <EmptyCell>
            <div style={{ fontSize: "17px", fontWeight: 600 }}>{empty.title}</div>
            <div style={{ marginTop: "8px", fontSize: "13.5px", color: "var(--ink-5)", maxWidth: "44ch" }}>{empty.sub}</div>
            {isSelf && tab === "Games" ? (
              <Link href="/publish" style={{ ...pill("primary"), marginTop: "18px" }}>
                Publish a game
              </Link>
            ) : null}
            {tab === "Liked" ? (
              <Link href="/explore" style={{ ...pill(), marginTop: "18px" }}>
                Explore games
              </Link>
            ) : null}
          </EmptyCell>
        ) : null}

      </BentoGrid>

      {list.length ? (
        <GameCards>
          {list.map((g) => (
            <GameCard key={g.id} game={g} showModel={false} showCreator={tab === "Liked"} />
          ))}
        </GameCards>
      ) : null}
    </div>
  );
}
