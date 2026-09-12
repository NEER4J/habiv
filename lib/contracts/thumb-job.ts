/**
 * A thumbnail render request, stored as JSON in the uploads bucket at thumbJobKey(id). The app
 * writes it (MCP make_thumbnail) and fires the jobs workflow; the job renders each HTML document in
 * Chromium, saves the images as the game's art and writes the outcome back to the same object.
 * Copied into jobs/src/contracts by `npm run sync-contracts`.
 */

export type ThumbKind = "cover" | "card";

export const THUMB_SIZES: Record<ThumbKind, { w: number; h: number }> = { cover: { w: 1280, h: 720 }, card: { w: 600, h: 800 } };

export const thumbJobKey = (id: string) => `thumb-jobs/${id}.json`;

export type ThumbJob = {
  id: string;
  gameId: string;
  userId: string;
  /** A full HTML document per slot, laid out at THUMB_SIZES. */
  docs: Partial<Record<ThumbKind, string>>;
  status: "queued" | "done" | "failed";
  createdAt: string;
  finishedAt?: string;
  error?: string;
  /** Storage paths of the new art, and of the art it replaced. */
  paths?: Partial<Record<ThumbKind, string>>;
  replaced?: string[];
  /** The app has expired its caches and deleted `replaced` (the job can do neither). */
  settled?: boolean;
};
