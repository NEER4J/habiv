import { z } from "zod";

export const EVENT_NAMES = [
  "view", "play_click", "share", "like", "save", "ready", "run_start", "run_end", "level_start", "level_complete",
  "level_fail", "beat_game", "score_submit", "gameplay_start", "gameplay_stop", "happytime", "design", "error",
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

const uuid = z.string().uuid();
const propValue = z.union([z.string().max(200), z.number(), z.boolean()]);

export const ingestEventSchema = z.object({
  name: z.enum(EVENT_NAMES),
  game_id: uuid,
  version_id: uuid.optional(),
  session_id: uuid,
  run_id: uuid.optional(),
  level: z.string().max(64).optional(),
  outcome: z.enum(["complete", "fail", "quit"]).optional(),
  score: z.number().int().safe().optional(),
  value: z.number().finite().optional(),
  props: z.record(z.string().max(64), propValue).optional(),
  client_ts: z.string().datetime({ offset: true }),
});

export const ingestBodySchema = z.object({
  ctx: z
    .object({
      referrer_host: z.string().max(253).optional(),
      utm_source: z.string().max(100).optional(),
      utm_medium: z.string().max(100).optional(),
      utm_campaign: z.string().max(100).optional(),
    })
    .optional(),
  events: z.array(ingestEventSchema).min(1).max(50),
});

export type IngestEvent = z.infer<typeof ingestEventSchema>;
export type IngestBody = z.infer<typeof ingestBodySchema>;

export const MAX_INGEST_BODY_BYTES = 64 * 1024;
export const MAX_PROPS_BYTES = 2048;
export const MAX_PROPS_KEYS = 20;
