import Image from "next/image";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Habiv",
  url: "https://habiv.vercel.app/",
  description: "A browser-first marketplace for tiny AI-made games.",
  publisher: { "@type": "Organization", name: "Habiv", url: "https://habiv.vercel.app/" },
};

export default function Home() {
  return (
    <main className="hero" id="top">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="ambient ambient-left" aria-hidden="true" />
      <div className="ambient ambient-right" aria-hidden="true" />

      <div className="hero-grid">
        <div className="hero-copy">
          <div className="brand-lockup">
            <Image src="/assets/brand/logo-white.svg" alt="Habiv mark" width={30} height={30} priority />
            <span>habiv</span>
          </div>
          <p className="eyebrow">
            THE PLAYABLE FEED <span>/</span> 001
          </p>
          <h1>
            A home for
            <br />
            <em>tiny games.</em>
          </h1>
          <p className="hero-lede">
            Discover, play, remix, and share little games made with AI. No download. Just open a link and play.
          </p>
          <div className="hero-actions">
            <span className="button button-primary">
              COMING SOON <span aria-hidden="true">↗</span>
            </span>
            <span className="hero-spec">
              10–45 SEC <i>/</i> BROWSER FIRST
            </span>
          </div>
          <div className="creator-note">
            <span className="creator-icon" aria-hidden="true">+</span>
            <p>
              <strong>For creators</strong>
              <br />
              Upload a finished game or publish directly from Codex, Claude Code, and other MCP-ready agents.
            </p>
          </div>
        </div>

        <div className="feed-stage">
          <div className="stage-label stage-top">FEATURED / 001</div>
          <figure className="feed-window">
            <div className="window-bar">
              <div className="window-controls" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <span className="window-title">habiv / star-hop</span>
              <span className="window-meta">00:27</span>
            </div>
            <div className="window-content">
              <div className="window-topline">
                <span>
                  PLATFORMER <i>/</i> AI-MADE
                </span>
                <span>PLAYABLE NOW</span>
              </div>
              <div className="featured-image">
                <Image
                  src="/assets/tiny-game-hero.png"
                  alt="A tiny astronaut jumping between floating game platforms toward a glowing star"
                  width={1536}
                  height={1024}
                  sizes="(max-width: 1020px) 100vw, 640px"
                  priority
                />
                <span className="play-pill">
                  PLAY NOW <b aria-hidden="true">↗</b>
                </span>
              </div>
              <figcaption className="game-footer">
                <div>
                  <h2>Star Hop</h2>
                  <p>Jump once. Keep going.</p>
                </div>
                <div className="play-count">
                  <strong>8.4K</strong>
                  <span>PLAYS</span>
                </div>
              </figcaption>
            </div>
          </figure>
          <div className="stage-label stage-bottom">
            PUBLISHED VIA MCP <span aria-hidden="true">✦</span>
          </div>
        </div>
      </div>

      <div className="hero-footer">
        <span>
          <span className="footer-dot" /> A playable feed is on the way.
        </span>
        <span>
          UPLOAD <b>→</b> PLAY <b>→</b> REMIX <b>→</b> SHARE
        </span>
      </div>
    </main>
  );
}
