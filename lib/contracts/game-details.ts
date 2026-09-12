import { z } from "zod";
import { CONTROL_ACTION_MAX, CONTROL_KEY_MAX, MAX_CONTROL_ROWS, TOUCH_HINT_MAX } from "@/lib/habiv/game-details";

/** How-to-play controls as stored in games.controls and read back by parseControls on the game page. */
export const controlsSchema = z.object({
  keys: z
    .array(z.object({ key: z.string().trim().min(1).max(CONTROL_KEY_MAX), action: z.string().trim().min(1).max(CONTROL_ACTION_MAX) }))
    .max(MAX_CONTROL_ROWS)
    .default([]),
  touch: z.string().trim().max(TOUCH_HINT_MAX).nullable().optional(),
});

export type ControlsInput = z.infer<typeof controlsSchema>;

export const toStoredControls = (c: ControlsInput) => ({ keys: c.keys, touch: c.touch || null });
