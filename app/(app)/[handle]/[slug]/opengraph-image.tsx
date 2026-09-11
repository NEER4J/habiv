import { ImageResponse } from "next/og";
import { handleFromRouteParam } from "@/lib/handles";
import { getGameByHandleSlug } from "@/lib/db/games";

export const alt = "Habiv game";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Params = Promise<{ handle: string; slug: string }>;

/** Social card: the cover from the public storage bucket with a title bar, or a hue gradient fallback. */
export default async function OpenGraphImage({ params }: { params: Params }) {
  const { handle: raw, slug } = await params;
  const handle = handleFromRouteParam(raw);
  const game = handle ? await getGameByHandleSlug(handle, slug) : null;
  const title = game?.title ?? "Habiv";
  const by = game ? `@${game.creator.handle}` : "tiny games, made with AI";
  const hue = game?.accentHue ?? 140;
  const cover = game?.coverUrl ?? null;
  const engine = game?.currentVersion?.engine ?? null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          background: cover ? "#0f0f0f" : `linear-gradient(135deg, hsl(${hue} 60% 18%), hsl(${(hue + 40) % 360} 70% 45%))`,
          color: "#f1f1f1",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {cover ? <img src={cover} alt="" width={1200} height={630} style={{ position: "absolute", inset: 0, objectFit: "cover", opacity: 0.85 }} /> : null}
        <div style={{ display: "flex", flexDirection: "column", padding: "40px 56px", background: "linear-gradient(transparent, rgba(0,0,0,0.85))" }}>
          <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.05 }}>{title}</div>
          <div style={{ display: "flex", gap: 24, marginTop: 16, fontSize: 28, color: "#c9c9c9" }}>
            <span>{by}</span>
            {engine ? <span>· {engine}</span> : null}
            {game ? <span>· {game.stats.plays.toLocaleString()} plays</span> : null}
          </div>
        </div>
        <div style={{ position: "absolute", top: 40, left: 56, fontSize: 30, fontWeight: 700, letterSpacing: 2 }}>HABIV</div>
      </div>
    ),
    { ...size },
  );
}
