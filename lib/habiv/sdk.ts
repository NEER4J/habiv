import type { SdkFeature, SdkInfo } from "@/lib/contracts/ingest";

/**
 * Habiv SDK features a build can use, as found at ingest (jobs/src/lib/sdk.ts) and stored in the
 * version manifest. The publish and edit pages list them and gate the leaderboard on "scores".
 */
export const SDK_FEATURES: { id: SdkFeature; label: string; unlocks: string }[] = [
  { id: "scores", label: "Scores", unlocks: "daily leaderboards and “beat X% of players”" },
  { id: "runs", label: "Runs", unlocks: "run counts and completion rate" },
  { id: "levels", label: "Levels", unlocks: "level drop-off in your stats" },
  { id: "beat", label: "Beat the game", unlocks: "completions on the game page" },
  { id: "saves", label: "Saves", unlocks: "progress that follows the player" },
  { id: "happytime", label: "Highlights", unlocks: "celebration moments" },
];

export const sdkFeatureLabel = (f: SdkFeature) => SDK_FEATURES.find((x) => x.id === f)?.label ?? f;

/** The SDK scan stored in a version manifest; null for builds processed before detection existed. */
export function readSdk(manifest: unknown): SdkInfo | null {
  const raw = manifest && typeof manifest === "object" ? (manifest as { sdk?: unknown }).sdk : null;
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as SdkInfo).features)) return null;
  const s = raw as SdkInfo;
  return {
    features: s.features.filter((f) => SDK_FEATURES.some((x) => x.id === f)),
    via: Array.isArray(s.via) ? s.via : [],
    ...(Array.isArray(s.seen) ? { seen: s.seen } : {}),
  };
}

export const hasScores = (sdk: SdkInfo | null | undefined) => !!sdk?.features.includes("scores");
