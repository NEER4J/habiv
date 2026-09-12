import "server-only";
import type { ReactElement } from "react";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { createAnonClient } from "@/lib/supabase/anon";
import { asFeedRow, toFeedGame } from "@/lib/db/games";
import { fromFeedGame, type Game } from "@/lib/habiv/games";
import { playedLabel, type ScoreShare } from "@/lib/share/score";

/**
 * Social cards for game links (/og/game/{id}) and shared scores (/og/score/{token}). Set as the
 * page's og:image in generateMetadata rather than an opengraph-image file, because a file-based
 * image would always win over the score card.
 */

export const OG_SIZE = { width: 1200, height: 630 };

// Crawlers time out on a 3-6 s render, so let the CDN keep it. A day is fine for a card.
const CACHE_CONTROL = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

/** A published game by id, or null. */
export async function loadCardGame(id: string): Promise<Game | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data: row } = await createAnonClient().from("game_feed_v").select("*").eq("id", id).maybeSingle();
  return row ? fromFeedGame(toFeedGame(asFeedRow(row))) : null;
}

/**
 * JPEG, not the PNG ImageResponse makes: over a cover the PNG is ~1.6 MB and WhatsApp and others
 * drop previews that big. The JPEG is a small fraction of that.
 */
async function jpeg(el: ReactElement): Promise<Response> {
  const png = new ImageResponse(el, OG_SIZE);
  const out = await sharp(Buffer.from(await png.arrayBuffer())).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  return new Response(new Uint8Array(out), { headers: { "Content-Type": "image/jpeg", "Cache-Control": CACHE_CONTROL } });
}

const fallbackBg = (hue: number) => `linear-gradient(135deg, hsl(${hue} 60% 18%), hsl(${(hue + 40) % 360} 70% 45%))`;

/** The game link card: the cover with a title bar, or a hue gradient fallback. */
export function gameCard(g: Game | null): Promise<Response> {
  const hue = g?.hue ?? 140;
  const cover = g?.coverUrl ?? null;
  const meta = g ? [`@${g.creator}`, g.engine || null, `${g.plays.toLocaleString()} plays`].filter(Boolean).join("  ·  ") : "tiny games, made with AI";
  return jpeg(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        background: cover ? "#0f0f0f" : fallbackBg(hue),
        color: "#f1f1f1",
        fontFamily: "sans-serif",
        position: "relative",
      }}
    >
      {cover ? <img src={cover} alt="" width={1200} height={630} style={{ position: "absolute", inset: 0, objectFit: "cover", opacity: 0.85 }} /> : null}
      <div style={{ display: "flex", flexDirection: "column", padding: "40px 56px", background: "linear-gradient(transparent, rgba(0,0,0,0.85))" }}>
        <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.05 }}>{g?.title ?? "Habiv"}</div>
        <div style={{ display: "flex", marginTop: 16, fontSize: 28, color: "#c9c9c9" }}>{meta}</div>
      </div>
      <div style={{ position: "absolute", top: 40, left: 56, fontSize: 30, fontWeight: 700, letterSpacing: 2 }}>HABIV</div>
    </div>,
  );
}

/** A player's result: the big number on the left, the game's cover fading in from the right. */
export function scoreCard(g: Game | null, s: ScoreShare): Promise<Response> {
  const hue = g?.hue ?? 140;
  const cover = g?.coverUrl ?? null;
  const accent = `hsl(${hue} 85% 62%)`;
  const hasScore = s.score != null;
  const big = hasScore ? s.score!.toLocaleString("en-US") : s.rounds.toLocaleString("en-US");
  const bigSize = big.length <= 5 ? 168 : big.length <= 7 ? 136 : big.length <= 9 ? 108 : 84;
  const who = s.name ? `@${s.name}` : "A player";
  const lead = hasScore ? `${who} scored` : `${who} played`;
  const unit = hasScore ? null : s.rounds === 1 ? "round" : "rounds";
  // A specific run (not the best) is dated instead of called a high score, unless it made the board.
  const runDate = s.runAt ? new Date(s.runAt * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).toUpperCase() : null;
  const chip = !hasScore ? "PLAY STATS" : runDate && s.rank == null ? `RUN · ${runDate}` : "HIGH SCORE";
  const badge =
    hasScore && s.rank != null
      ? `#${s.rank.toLocaleString("en-US")}${s.total ? ` of ${s.total.toLocaleString("en-US")}` : ""} all time`
      : !hasScore && s.playedMs > 0
        ? `${playedLabel(s.playedMs)} played`
        : null;

  return jpeg(
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#09090b", color: "#f5f5f7", fontFamily: "sans-serif" }}>
      {cover ? (
        <img src={cover} alt="" width={760} height={630} style={{ position: "absolute", top: 0, right: 0, width: 760, height: 630, objectFit: "cover" }} />
      ) : (
        <div style={{ position: "absolute", top: 0, right: 0, width: 760, height: 630, background: fallbackBg(hue) }} />
      )}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, #09090b 40%, rgba(9,9,11,0.88) 56%, rgba(9,9,11,0.25) 100%)" }} />
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 12% 88%, hsla(${hue}, 85%, 55%, 0.32), transparent 52%)` }} />

      <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", width: 820, height: "100%", padding: "48px 56px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 3 }}>HABIV</div>
          <div style={{ display: "flex", padding: "6px 14px", borderRadius: 999, border: `2px solid ${accent}`, color: accent, fontSize: 20, fontWeight: 700, letterSpacing: 2 }}>
            {chip}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 34, color: "#c9c9cf" }}>{lead}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
            <div style={{ fontSize: bigSize, fontWeight: 800, letterSpacing: -4, lineHeight: 1.02, color: "#ffffff" }}>{big}</div>
            {unit ? <div style={{ fontSize: 44, fontWeight: 700, color: "#c9c9cf" }}>{unit}</div> : null}
          </div>
          {badge ? (
            <div style={{ display: "flex", marginTop: 14 }}>
              <div style={{ display: "flex", padding: "10px 22px", borderRadius: 999, background: accent, color: "#0b0b0f", fontSize: 30, fontWeight: 800 }}>{badge}</div>
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 46, fontWeight: 700, lineHeight: 1.05, maxWidth: 700 }}>{g?.title ?? "a Habiv game"}</div>
          <div style={{ display: "flex", marginTop: 10, fontSize: 26, color: "#a1a1aa" }}>{g ? `by @${g.creator}  ·  Can you beat it?` : "Can you beat it?"}</div>
        </div>
      </div>
    </div>,
  );
}
