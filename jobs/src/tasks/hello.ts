import { task, logger } from "@trigger.dev/sdk";

/** Smoke task to prove `trigger.dev dev` and `deploy` work. */
export const hello = task({
  id: "hello",
  run: async (payload: { name?: string }) => {
    logger.info("hello", { name: payload.name ?? "habiv" });
    return { ok: true, at: new Date().toISOString() };
  },
});
