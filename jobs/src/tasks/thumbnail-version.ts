import { task } from "@trigger.dev/sdk";
import { smokeVersion } from "./smoke-version";

/** Regenerates cover/card art for a version (re-runs the smoke capture with force). */
export const thumbnailVersion = task({
  id: "thumbnail-version",
  run: async (payload: { versionId: string }) => {
    return smokeVersion.triggerAndWait({ versionId: payload.versionId, force: true });
  },
});
