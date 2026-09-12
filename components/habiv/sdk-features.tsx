"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { SdkFeature, SdkInfo } from "@/lib/contracts/ingest";
import { SDK_FEATURES, hasScores } from "@/lib/habiv/sdk";
import { detailsRule } from "@/lib/habiv/details-file";
import { chipBtn, chipStyle, fieldLabelStyle, mono, primaryBtn } from "@/lib/habiv/ui";
import { siteUrl } from "@/lib/site";

/**
 * What a build does with the Habiv SDK, and the leaderboard switch that depends on it. Shared by the
 * publish wizard and the edit page; the scan comes from the version manifest (lib/habiv/sdk.ts).
 */

const note: CSSProperties = { marginTop: "8px", fontFamily: mono, fontSize: "10.5px", lineHeight: 1.6, color: "var(--ink-6)" };
const link: CSSProperties = { color: "var(--ink-4)", textDecoration: "underline", textUnderlineOffset: "3px" };
const tag = (on: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: "5px",
  height: "26px",
  padding: "0 10px",
  borderRadius: "99px",
  fontSize: "12px",
  fontWeight: 500,
  background: on ? "var(--pos-bg)" : "var(--chip)",
  color: on ? "var(--pos-ink)" : "var(--ink-5)",
});

/** Each SDK feature as a small tag: green when the build uses it, dimmed when it doesn't. */
export function SdkFeatureTags({ sdk, checking }: { sdk: SdkInfo | null; checking?: boolean }) {
  if (checking) return <div style={note}>Checking the build for Habiv SDK calls…</div>;
  if (!sdk) return <div style={note}>Not checked. Builds uploaded from now on are scanned for Habiv SDK calls.</div>;
  const found = SDK_FEATURES.filter((f) => sdk.features.includes(f.id));
  const via = sdk.via.filter((v) => v !== "habiv");
  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {SDK_FEATURES.map((f) => {
          const on = sdk.features.includes(f.id);
          return (
            <span key={f.id} title={on ? `Unlocks ${f.unlocks}` : "Not found in this build"} style={tag(on)}>
              <span aria-hidden>{on ? "✓" : "–"}</span>
              {f.label}
            </span>
          );
        })}
      </div>
      <div style={note}>
        {found.length
          ? `Found ${found.map((f) => f.label.toLowerCase()).join(", ")}${via.length ? ` (through the ${via.join(" and ")} SDK)` : ""}. Unlocks ${found.map((f) => f.unlocks).join("; ")}.`
          : "No Habiv SDK calls found. The game still works; add the SDK for scores, levels and saves."}{" "}
        <Link href="/docs/sdk" style={link}>
          SDK docs
        </Link>
      </div>
    </>
  );
}

/**
 * Leaderboard on/off and sort. A build that was scanned and sends no scores gets an explanation
 * instead of the switch (a board would stay empty), with a way to turn it on anyway for engines
 * whose calls the scan can't see.
 */
export function LeaderboardSettings({
  sdk,
  checking,
  enabled,
  sort,
  onEnabled,
  onSort,
  onAddScores,
}: {
  sdk: SdkInfo | null;
  checking?: boolean;
  enabled: boolean;
  sort: "desc" | "asc";
  onEnabled: (on: boolean) => void;
  onSort: (sort: "desc" | "asc") => void;
  /** Opens the AI prompt that adds score calls (SdkUpgradePrompt). */
  onAddScores?: () => void;
}) {
  const [force, setForce] = useState(false);
  const scores = hasScores(sdk);
  const locked = !checking && !!sdk && !scores && !enabled && !force;

  return (
    <>
      <div style={fieldLabelStyle}>Leaderboard</div>
      {locked ? (
        <div style={{ padding: "12px 14px", borderRadius: "10px", background: "var(--chip)" }}>
          <div style={{ fontSize: "13.5px", fontWeight: 500, color: "var(--ink-2)" }}>Needs score calls</div>
          <div style={{ ...note, marginTop: "4px" }}>
            This build never calls <code>Habiv.scoreSubmit</code>, so a board would stay empty.{" "}
            <Link href="/docs/sdk#scores" style={link}>
              How to send scores
            </Link>
            {" · "}
            <button type="button" onClick={() => setForce(true)} style={{ ...link, background: "none", padding: 0, font: "inherit", cursor: "pointer" }}>
              Turn on anyway
            </button>
          </div>
          {onAddScores ? (
            <button type="button" onClick={onAddScores} style={{ ...primaryBtn, marginTop: "10px" }}>
              Add scores with your AI
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" onClick={() => onEnabled(false)} style={chipStyle(!enabled)}>
              Off
            </button>
            <button type="button" onClick={() => onEnabled(true)} style={chipStyle(enabled)}>
              On
            </button>
            {enabled ? (
              <>
                <span style={{ fontFamily: mono, fontSize: "10.5px", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-5)", margin: "0 4px" }}>sort</span>
                <button type="button" onClick={() => onSort("desc")} style={chipStyle(sort === "desc")}>
                  Highest wins
                </button>
                <button type="button" onClick={() => onSort("asc")} style={chipStyle(sort === "asc")}>
                  Lowest wins
                </button>
              </>
            ) : null}
          </div>
          <div style={note}>
            {scores
              ? "Scores found in this build. Players get a daily board and see how many players they beat."
              : checking
                ? "Checking the build for score calls…"
                : sdk
                  ? "No score calls found in this build; the board stays empty until the game sends scores."
                  : "Turn this on only if your game reports a score through the Habiv SDK."}{" "}
            <Link href="/docs/sdk#scores" style={link}>
              How to send scores
            </Link>
          </div>
        </>
      )}
    </>
  );
}

/* ---------- "have your AI add it" ---------- */

/** Scanned features, pause and sound (which the scan does not report on), and the habiv.json details file. */
type PromptPart = SdkFeature | "controls" | "details";

const PROMPT_PARTS: { id: PromptPart; label: string; unlocks: string }[] = [
  ...SDK_FEATURES,
  { id: "controls", label: "Pause & sound", unlocks: "the player page's pause and sound buttons" },
  { id: "details", label: "Game details", unlocks: "a details form that fills itself in (habiv.json)" },
];

/** The instructions a creator pastes into the AI that made the game. Mirrors /docs/sdk. */
export function buildSdkPrompt(parts: Set<PromptPart>, title: string, sort: "desc" | "asc"): string {
  const name = title.trim() ? `my game "${title.trim()}"` : "my game";
  const lines = [
    `Update ${name} so it reports to Habiv, the site it is published on. Keep the gameplay, look and files exactly as they are; only add what is listed below.`,
    "",
    "Habiv injects `window.Habiv` when the game runs on habiv.com. Everywhere else it is missing, so always use optional chaining, e.g. `window.Habiv?.ready()`, and never let a missing SDK throw or change behaviour. Do not add a <script> tag for it.",
    "",
    "Add:",
    "- `window.Habiv?.ready()` once everything has loaded and the game can be played (after any loading screen).",
  ];
  // A score needs a run that is still going, so scores bring run calls with them.
  if (parts.has("runs") || parts.has("scores")) {
    lines.push('- Runs: `window.Habiv?.runStart()` each time a round or attempt begins, and `window.Habiv?.runEnd({ outcome, score })` when it ends. outcome is "complete" (won or finished), "fail" (lost) or "quit" (gave up).');
  }
  if (parts.has("scores")) {
    lines.push(
      sort === "asc"
        ? "- Scores: the game is ranked by time, lowest wins. When a run ends, before runEnd, send the time once in whole milliseconds: `window.Habiv?.scoreSubmit({ value: Math.round(ms) })`."
        : "- Scores: when a run ends, before runEnd, send the final score once as a whole number: `window.Habiv?.scoreSubmit({ value: Math.round(score) })`. Higher is better.",
    );
  }
  if (parts.has("levels")) {
    lines.push('- Levels: `window.Habiv?.levelStart({ level: "3" })` when a level begins, then `levelComplete({ level: "3", score })` or `levelFail({ level: "3", score })`. The level is text, up to 64 characters.');
  }
  if (parts.has("beat")) lines.push("- Beat the game: `window.Habiv?.beatGame()` once, when the player finishes the whole game (final level or ending).");
  if (parts.has("saves")) {
    lines.push('- Saves: store progress with `window.Habiv?.save({ key: "progress", value })` (any JSON value) and read it on start with `const saved = (await window.Habiv?.load({ key: "progress" })) ?? defaults`. load gives null when nothing is saved. Keep any existing localStorage saving as the fallback for when window.Habiv is missing.');
  }
  if (parts.has("happytime")) lines.push("- Highlights: `window.Habiv?.happytime()` at great moments, like a new best or a big combo. A few times per run at most.");
  if (parts.has("controls")) {
    lines.push('- Pause and sound: `window.Habiv?.on("pause", pauseGame)`, `window.Habiv?.on("resume", resumeGame)` and `window.Habiv?.on("mute", (msg) => setMuted(msg.on))`. The game starts muted.');
  }
  if (parts.has("details")) lines.push(detailsRule, "  Read the game's code to get the controls right, and write the description for players, not developers.");
  lines.push("", `Reply with the complete updated files, packaged the same way as before (one index.html, or the whole folder: Habiv's upload page takes folders). Full reference: ${siteUrl}/docs/sdk`);
  return lines.join("\n");
}

function StepHead({ n, children }: { n: number; children: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: 600 }}>
      <span
        style={{
          width: "20px",
          height: "20px",
          flex: "0 0 auto",
          display: "grid",
          placeItems: "center",
          borderRadius: "50%",
          background: "var(--ink)",
          color: "var(--bg, #fff)",
          fontFamily: mono,
          fontSize: "10.5px",
        }}
      >
        {n}
      </span>
      {children}
    </div>
  );
}

/**
 * For a build without (all) SDK calls: pick features, copy a ready-made prompt for the creator's AI,
 * upload what it returns as a new version. Hidden when the scan found every feature, or never ran.
 */
export function SdkUpgradePrompt({
  sdk,
  title,
  sort = "desc",
  open: openProp,
  onOpenChange,
  onReupload,
  reuploadHref,
  hasDetails,
}: {
  sdk: SdkInfo | null;
  title: string;
  /** Whether the build carries a habiv.json (or habiv+json block). False offers it by default; left out, it is only an option. */
  hasDetails?: boolean;
  sort?: "desc" | "asc";
  /** Controlled open state, so the leaderboard's "Add scores with your AI" can open it. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Publish wizard: back to the upload step with the file picker open. */
  onReupload?: () => void;
  /** Elsewhere: a link that starts a new version. */
  reuploadHref?: string;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (v: boolean) => {
    onOpenChange?.(v);
    if (openProp === undefined) setOpenState(v);
  };
  const has = (id: PromptPart) => (id === "details" ? !!hasDetails : id !== "controls" && !!sdk?.features.includes(id as SdkFeature));
  // Scores and runs first: they are what most games are missing and what the game page shows.
  const [picked, setPicked] = useState<Set<PromptPart>>(() => {
    const core = (["scores", "runs"] as PromptPart[]).filter((id) => !has(id));
    const start: PromptPart[] = core.length ? core : SDK_FEATURES.map((f) => f.id).filter((id) => !has(id));
    return new Set(hasDetails === false ? [...start, "details"] : start);
  });
  const [copied, setCopied] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (open) boxRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [open]);

  if (!sdk || (SDK_FEATURES.every((f) => sdk.features.includes(f.id)) && hasDetails !== false)) return null;

  const text = buildSdkPrompt(picked, title, sort);
  const toggle = (id: PromptPart) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: select the text so it can be copied by hand.
      const el = preRef.current;
      const sel = window.getSelection();
      if (el && sel) {
        const range = document.createRange();
        range.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  };

  const chosen = PROMPT_PARTS.filter((p) => picked.has(p.id));

  return (
    <div ref={boxRef} style={{ marginTop: "14px", padding: "14px 16px", borderRadius: "12px", background: "var(--chip)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <div style={{ fontSize: "14px", fontWeight: 600 }}>{hasScores(sdk) ? "Add levels, saves and more" : "Add scores and a leaderboard"}</div>
          <div style={{ marginTop: "4px", fontSize: "12.5px", lineHeight: 1.5, color: "var(--ink-4)" }}>
            Your game works as it is. Ask the AI that built it to add Habiv calls, then upload the new build. It takes about a minute.
          </div>
        </div>
        <button type="button" onClick={() => setOpen(!open)} style={open ? chipBtn : primaryBtn}>
          {open ? "Close" : "Get the prompt"}
        </button>
      </div>

      {open ? (
        <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <StepHead n={1}>Pick what your game should report</StepHead>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "10px" }}>
              {PROMPT_PARTS.map((p) =>
                has(p.id) ? (
                  <span key={p.id} title="Already in your game" style={tag(true)}>
                    ✓ {p.label}
                  </span>
                ) : (
                  <button key={p.id} type="button" onClick={() => toggle(p.id)} aria-pressed={picked.has(p.id)} style={chipStyle(picked.has(p.id))}>
                    {picked.has(p.id) ? "✓ " : "+ "}
                    {p.label}
                  </button>
                ),
              )}
            </div>
            <div style={note}>{chosen.length ? `Unlocks ${chosen.map((p) => p.unlocks).join("; ")}.` : "Pick at least one."}</div>
          </div>

          <div>
            <StepHead n={2}>Copy this into your AI</StepHead>
            <pre
              ref={preRef}
              style={{
                margin: "10px 0 0",
                maxHeight: "200px",
                overflow: "auto",
                padding: "12px",
                borderRadius: "10px",
                background: "var(--panel-2)",
                fontFamily: mono,
                fontSize: "11px",
                lineHeight: 1.55,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                color: "var(--ink-3)",
              }}
            >
              {text}
            </pre>
            <button type="button" onClick={() => void copy()} disabled={!chosen.length} style={{ ...primaryBtn, marginTop: "10px", opacity: chosen.length ? 1 : 0.45 }}>
              {copied ? "Copied ✓" : "Copy prompt"}
            </button>
          </div>

          <div>
            <StepHead n={3}>Upload what it gives back</StepHead>
            <div style={{ ...note, marginTop: "8px" }}>
              Paste the prompt into Claude, ChatGPT, Cursor or whichever AI made the game. Upload the file it returns: it becomes a new version and your
              details stay as they are.
            </div>
            {onReupload ? (
              <button type="button" onClick={onReupload} style={{ ...chipBtn, marginTop: "10px" }}>
                Upload the new build
              </button>
            ) : reuploadHref ? (
              <Link href={reuploadHref} style={{ ...chipBtn, marginTop: "10px" }}>
                Upload the new build
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
