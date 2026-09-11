import { defineConfig } from "@trigger.dev/sdk";
import { playwright } from "@trigger.dev/build/extensions/playwright";

export default defineConfig({
  // Set TRIGGER_PROJECT_REF in the environment, or paste the proj_... ref here.
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_REPLACE_ME",
  dirs: ["./src/tasks"],
  maxDuration: 900,
  machine: "small-1x",
  retries: {
    enabledInDev: false,
    default: { maxAttempts: 2, minTimeoutInMs: 2000, maxTimeoutInMs: 30000, factor: 2, randomize: true },
  },
  build: {
    // Chromium for the smoke test / thumbnails. sharp ships prebuilt binaries and needs no extension.
    extensions: [playwright({ browsers: ["chromium"] })],
    external: ["sharp", "@turbowarp/packager", "@ruffle-rs/ruffle", "love.js"],
  },
});
