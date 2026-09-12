import type { GameMeta } from "@/lib/contracts/ingest";

/**
 * Game details a build declares about itself (habiv.json, an application/habiv+json block, or its
 * <title>/<meta>), found at ingest by jobs/src/lib/game-meta.ts and stored in the version manifest.
 * Ingest copies them into fields the game doesn't have yet; the publish form offers the rest.
 */

/** The details stored in a version manifest; null when the build describes nothing. */
export function readBuildDetails(manifest: unknown): GameMeta | null {
  const raw = manifest && typeof manifest === "object" ? (manifest as { meta?: unknown }).meta : null;
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as GameMeta).sources)) return null;
  return raw as GameMeta;
}

/** "habiv.json", "your page's title and description", … for "Filled in from …". */
export function buildDetailsSourceLabel(meta: GameMeta): string {
  const names = meta.sources.map((s) => (s === "habiv.json" ? "habiv.json" : s === "inline" ? "the habiv+json block" : "the page title and description"));
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
}

/** The build details as get_publish_status reports them, in the snake_case the MCP tools use. */
export function buildDetailsForTools(meta: GameMeta | null) {
  if (!meta) return null;
  return {
    found_in: meta.sources,
    title: meta.title,
    tagline: meta.tagline,
    description: meta.description,
    categories: meta.categories,
    tags: meta.tags,
    orientation: meta.orientation,
    duration_sec: meta.durationSec,
    controls: meta.controls,
    model: meta.model,
    agent: meta.agent,
    prompt: meta.prompt ? `${meta.prompt.slice(0, 200)}${meta.prompt.length > 200 ? "…" : ""}` : undefined,
    changelog: meta.changelog,
  };
}
