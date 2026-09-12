/**
 * Job runner for the GitHub Actions jobs workflow (.github/workflows/jobs.yml) and local use:
 *   npx tsx src/cli.ts ingest-version <versionId>           ingest with engine converters, then smoke
 *   npx tsx src/cli.ts smoke-version <versionId> [--force]  smoke test + cover/card screenshots
 *   npx tsx src/cli.ts render-thumb <requestId>             render a thumbnail request to cover/card art
 *   npx tsx src/cli.ts prune                                archive old bundles
 */
import { convert } from "./lib/convert";
import { runIngest } from "./lib/ingest";
import { pruneVersions } from "./lib/prune";
import { runSmoke } from "./lib/smoke-run";
import { runThumbJob } from "./lib/thumb-render";

const [task, versionId, ...flags] = process.argv.slice(2);

function needId(): string {
  if (!versionId || !/^[0-9a-f-]{36}$/i.test(versionId)) {
    console.error("usage: cli.ts <ingest-version|smoke-version|render-thumb> <id>");
    process.exit(2);
  }
  return versionId;
}

if (task === "ingest-version") {
  const id = needId();
  const result = await runIngest({ versionId: id }, { convert });
  console.log("ingest", JSON.stringify(result));
  if (result.status === "ready") console.log("smoke", JSON.stringify(await runSmoke(id)));
} else if (task === "smoke-version") {
  console.log("smoke", JSON.stringify(await runSmoke(needId(), flags.includes("--force"))));
} else if (task === "render-thumb") {
  console.log("thumb", JSON.stringify(await runThumbJob(needId())));
} else if (task === "prune") {
  console.log("prune", JSON.stringify(await pruneVersions()));
} else {
  console.error(`unknown task: ${task ?? "(none)"}`);
  process.exit(2);
}
