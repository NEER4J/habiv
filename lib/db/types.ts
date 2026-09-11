/** Shapes returned by lib/db/*. These are the contracts the UI renders from. */

export type GameCategory = "arcade" | "puzzle" | "reaction" | "ambient" | "rhythm" | "racing" | "cozy" | "horror" | "experimental" | "other";
export type Orientation = "portrait" | "landscape" | "any";
export type GameStatus = "draft" | "processing" | "published" | "hidden" | "removed";
export type VersionStatus = "uploaded" | "processing" | "ready" | "rejected";
export type RemixLicence = "open" | "no_remix";
export type FeedSort = "new" | "trending" | "hot" | "plays" | "remixes" | "quick" | "featured";

export type GameCreator = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  followersCount: number;
};

export type GameStatsSummary = {
  plays: number;
  uniquePlayers: number;
  runs: number;
  completions: number;
  likes: number;
  saves: number;
  remixes: number;
  comments: number;
  bestScore: number | null;
};

export type FeedGame = {
  id: string;
  shortId: string;
  slug: string;
  title: string;
  tagline: string | null;
  category: GameCategory;
  orientation: Orientation;
  accentHue: number;
  coverUrl: string | null;
  cardUrl: string | null;
  durationSec: number | null;
  remixLicence: RemixLicence;
  leaderboardEnabled: boolean;
  creator: GameCreator;
  stats: GameStatsSummary;
  currentVersion: { id: string; version: number; engine: string | null; sizeBytes: number | null; model: string | null; agent: string | null; usesNetwork: boolean; needsIsolation: boolean } | null;
  publishedAt: string | null;
  featured: boolean;
  featuredRank: number | null;
  /** canonical page: /@handle/slug */
  url: string;
  /** permanent short link: /g/shortId */
  shortUrl: string;
};

export type GameVersionSummary = {
  id: string;
  version: number;
  status: VersionStatus;
  engine: string | null;
  changelog: string | null;
  model: string | null;
  agent: string | null;
  prompt: string | null;
  sizeBytes: number | null;
  createdAt: string;
};

export type GameDetail = FeedGame & {
  description: string | null;
  controls: Record<string, unknown>;
  remixedFrom: { id: string; shortId: string; slug: string; title: string; handle: string } | null;
  versions: GameVersionSummary[];
};

export type CreatorGame = {
  id: string;
  shortId: string;
  slug: string;
  title: string;
  tagline: string | null;
  category: GameCategory;
  orientation: Orientation;
  accentHue: number;
  coverUrl: string | null;
  cardUrl: string | null;
  status: GameStatus;
  hiddenReason: string | null;
  remixLicence: RemixLicence;
  currentVersionId: string | null;
  latestVersion: { id: string; version: number; status: VersionStatus; rejectReason: string | null; engine: string | null } | null;
  stats: GameStatsSummary | null;
  publishedAt: string | null;
  updatedAt: string;
  url: string;
};
