import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const run = promisify(execFile);
const require = createRequire(import.meta.url);

/**
 * Converts a .love archive to a web build with love.js (`-c` compat build: no SharedArrayBuffer,
 * so no COOP/COEP needed). Returns the output file list relative to the bundle root.
 */
export async function buildLove(loveArchive: Buffer, title: string): Promise<{ path: string; body: Buffer }[]> {
  const work = await mkdtemp(join(tmpdir(), "habiv-love-"));
  try {
    const src = join(work, "game.love");
    const out = join(work, "out");
    await writeFile(src, loveArchive);
    let cli: string;
    try {
      const pkg = require("love.js/package.json") as { bin?: string | Record<string, string>; main?: string };
      const bin = typeof pkg.bin === "string" ? pkg.bin : Object.values(pkg.bin ?? {})[0] ?? pkg.main ?? "index.js";
      cli = require.resolve(`love.js/${bin}`);
    } catch {
      throw new Error("love.js is not installed in jobs/");
    }
    await run(process.execPath, [cli, "-c", "-t", title.replace(/[^\w -]/g, ""), src, out], { timeout: 5 * 60 * 1000, maxBuffer: 16 * 1024 * 1024 });
    const files: { path: string; body: Buffer }[] = [];
    const walk = async (dir: string) => {
      for (const name of await readdir(dir)) {
        const full = join(dir, name);
        const s = await stat(full);
        if (s.isDirectory()) await walk(full);
        else files.push({ path: relative(out, full).replace(/\\/g, "/"), body: await readFile(full) });
      }
    };
    await walk(out);
    if (!files.some((f) => f.path === "index.html")) throw new Error("love.js produced no index.html");
    return files;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
