"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties } from "react";
import { setVersionMeta, updateGameMeta, updateLeaderboardConfig } from "@/lib/actions/games";
import { extraDetailsFrom, licences, orientations, toDetailsPatch, type ExtraDetails, type Licence, type Orientation } from "@/lib/habiv/game-details";
import type { CategoryInfo } from "@/lib/habiv/games";
import type { GameEditData } from "@/lib/habiv/page-data";
import { AGENT_OPTIONS, MODEL_OPTIONS, normalizeAgent, normalizeModel } from "@/lib/ai/catalog";
import { bpanel, chipBtn, chipStyle, fieldLabelStyle, fieldStyle, mono, primaryBtn } from "@/lib/habiv/ui";
import { CatalogField } from "./catalog-picker";
import { CategoryChips } from "./category-chips";
import { LeaderboardSettings, SdkFeatureTags, SdkUpgradePrompt } from "./sdk-features";
import { BentoAutoGrid, PageHead } from "./game-card";
import { GameArtFields, type GameArt } from "./game-art-fields";
import { GameExtraFields } from "./game-extra-fields";
import { useShell } from "./shell-context";

const where: { field: string; place: string }[] = [
  { field: "Title and one line description", place: "game cards, search and link previews" },
  { field: "Cover and card", place: "feed tiles, the player and link previews; saved as soon as you pick one" },
  { field: "About and how to play", place: "the game page" },
  { field: "Run length", place: "runs of 45 seconds or less join Quick play" },
  { field: "Categories", place: "the game is listed in each one; the main one shows on cards" },
  { field: "Tags", place: "saved with the game; not shown on the site yet" },
  { field: "Leaderboard", place: "the game page, once the build sends scores" },
  { field: "Model, tool and prompt", place: "the game page, for the live version" },
];

/** Edits a game's details in place: no upload, and a published game updates right away. */
export function GameEditView({ data, categories }: { data: GameEditData; categories: CategoryInfo[] }) {
  const [sdkPromptOpen, setSdkPromptOpen] = useState(false);
  const { game, version } = data;
  const router = useRouter();
  const { cols, showToast, profile } = useShell();

  const [title, setTitle] = useState(game.title);
  const [tagline, setTagline] = useState(game.tagline);
  const [cats, setCats] = useState<string[]>(game.categories);
  const [lbEnabled, setLbEnabled] = useState(data.leaderboard.enabled);
  const [lbSort, setLbSort] = useState<"desc" | "asc">(data.leaderboard.sort);
  const [orient, setOrient] = useState<Orientation>(game.orientation);
  const [licence, setLicence] = useState<Licence>(game.remixLicence);
  const [extra, setExtra] = useState<ExtraDetails>(() => extraDetailsFrom(game));
  const [model, setModel] = useState(version?.model ?? "");
  const [agent, setAgent] = useState(version?.agent ?? "");
  const [prompt, setPrompt] = useState(version?.prompt ?? "");
  const [art, setArt] = useState<GameArt>({ coverUrl: game.coverUrl, cardUrl: game.cardUrl });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const main: CSSProperties = { ...bpanel, gridColumn: cols <= 6 ? "1 / -1" : `span ${cols === 8 ? 5 : 7}`, padding: "22px" };
  const side: CSSProperties = {
    ...bpanel,
    gridColumn: cols <= 6 ? "1 / -1" : `span ${cols === 8 ? 3 : 5}`,
    padding: "22px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    alignSelf: "start",
  };
  const titleOk = title.trim().length > 0;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const meta = await updateGameMeta(game.id, {
        title: title.trim(),
        tagline: tagline.trim() || null,
        category: cats[0] as Parameters<typeof updateGameMeta>[1]["category"],
        categories: cats,
        orientation: orient,
        remixLicence: licence,
        ...toDetailsPatch(extra),
      });
      if (!meta.ok) throw new Error(meta.error);
      if (version) {
        const vmeta = await setVersionMeta(version.id, { model: model.trim() || null, agent: agent.trim() || null, prompt: prompt.trim() || null });
        if (!vmeta.ok) throw new Error(vmeta.error);
      }
      if (lbEnabled !== data.leaderboard.enabled || (lbEnabled && lbSort !== data.leaderboard.sort)) {
        const lb = await updateLeaderboardConfig(game.id, { enabled: lbEnabled, sort: lbSort, minDurationMs: 1000 });
        if (!lb.ok) throw new Error(lb.error);
      }
      showToast("Details saved");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the details.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <BentoAutoGrid>
      <PageHead
        title={`Edit details · ${game.title}`}
        sub={game.url ? "Changes show on the live game page as soon as you save. No new upload needed." : "Saved to your draft. Publish it from My games when it is ready."}
        auto
      />

      <div style={main}>
        <div style={{ fontSize: "17px", fontWeight: 600 }}>Game details</div>
        <div style={fieldLabelStyle}>Title</div>
        <input className="hb-input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Name your game" style={fieldStyle} />
        <div style={fieldLabelStyle}>One line description · shown on cards</div>
        <input className="hb-input" value={tagline} maxLength={140} onChange={(e) => setTagline(e.target.value)} placeholder="What does the player do?" style={fieldStyle} />
        <div style={fieldLabelStyle}>Categories</div>
        <CategoryChips categories={categories} value={cats} onChange={setCats} />
        <div style={fieldLabelStyle}>Orientation</div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {orientations.map((o) => (
            <button key={o.value} type="button" onClick={() => setOrient(o.value)} style={chipStyle(orient === o.value)}>
              {o.label}
            </button>
          ))}
        </div>
        <div style={fieldLabelStyle}>Remix licence</div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {licences.map((l) => (
            <button key={l.value} type="button" onClick={() => setLicence(l.value)} style={chipStyle(licence === l.value)}>
              {l.label}
            </button>
          ))}
        </div>

        <GameExtraFields value={extra} onChange={(patch) => setExtra((e) => ({ ...e, ...patch }))} />

        <div style={{ ...fieldLabelStyle, marginTop: "26px" }}>Store art · saves as soon as you pick an image or design</div>
        <GameArtFields
          gameId={game.id}
          value={art}
          meta={{
            title,
            tagline,
            category: categories.find((c) => c.slug === cats[0])?.name ?? cats[0] ?? null,
            creator: profile.handle || null,
            hue: game.accentHue,
          }}
          onChange={(patch) => {
            setArt((a) => ({ ...a, ...patch }));
            showToast("Art updated");
          }}
        />

        {version ? (
          <>
            <div style={{ ...fieldLabelStyle, marginTop: "26px" }}>Built with · v{version.version}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0 12px" }}>
              <CatalogField options={MODEL_OPTIONS} value={model} onChange={setModel} normalize={normalizeModel} placeholder="Model, e.g. Sonnet" ariaLabel="Model" />
              <CatalogField options={AGENT_OPTIONS} value={agent} onChange={setAgent} normalize={normalizeAgent} placeholder="Tool, e.g. Claude Code" ariaLabel="Tool or agent" />
            </div>
            <div style={fieldLabelStyle}>Prompt · shown on the game page</div>
            <textarea
              className="hb-input"
              value={prompt}
              maxLength={8000}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="The prompt or brief that produced this build."
              style={{ ...fieldStyle, height: 120, padding: "10px 14px", resize: "vertical", lineHeight: 1.5 }}
            />
          </>
        ) : (
          <div style={{ marginTop: "22px", fontFamily: mono, fontSize: "10.5px", color: "var(--ink-6)" }}>
            Model, tool and prompt belong to a version. Upload a build to add them.
          </div>
        )}

        <div style={{ ...fieldLabelStyle, marginTop: "26px" }}>Game features{version ? ` · found in v${version.version}` : ""}</div>
        {version ? (
          <>
            <SdkFeatureTags sdk={data.sdk} />
            <SdkUpgradePrompt
              sdk={data.sdk}
              title={data.game.title}
              sort={lbSort}
              open={sdkPromptOpen}
              onOpenChange={setSdkPromptOpen}
              reuploadHref={`/publish?game=${data.game.id}`}
            />
          </>
        ) : (
          <div style={{ fontFamily: mono, fontSize: "10.5px", color: "var(--ink-6)" }}>Upload a build to see which Habiv SDK features it uses.</div>
        )}
        <LeaderboardSettings
          sdk={data.sdk}
          enabled={lbEnabled}
          sort={lbSort}
          onEnabled={setLbEnabled}
          onSort={setLbSort}
          onAddScores={version ? () => setSdkPromptOpen(true) : undefined}
        />

        <div style={{ display: "flex", gap: "8px", marginTop: "22px", flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!titleOk || saving}
            style={{ ...primaryBtn, opacity: titleOk && !saving ? 1 : 0.45, cursor: titleOk && !saving ? "pointer" : "default" }}
          >
            {saving ? "Saving…" : "Save details"}
          </button>
          <Link href="/my-games" style={chipBtn}>
            Back to My games
          </Link>
        </div>
        {error ? (
          <div role="alert" style={{ marginTop: "12px", fontSize: "13px", color: "var(--danger-ink)" }}>
            {error}
          </div>
        ) : null}
      </div>

      <div style={side}>
        <div style={{ fontSize: "15px", fontWeight: 600 }}>Where these show</div>
        {where.map((w) => (
          <div key={w.field}>
            <div style={{ fontSize: "13px" }}>{w.field}</div>
            <div style={{ marginTop: "2px", fontFamily: mono, fontSize: "10.5px", color: "var(--ink-5)" }}>{w.place}</div>
          </div>
        ))}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px" }}>
          {game.url ? (
            <Link href={game.url} style={chipBtn}>
              Open the game page
            </Link>
          ) : null}
          <Link href={`/publish?game=${game.id}`} style={chipBtn}>
            Upload a new version
          </Link>
        </div>
      </div>
    </BentoAutoGrid>
  );
}
