#!/usr/bin/env node

// PWA install icons. Writes the Habiv mark as PNGs to public/icons/ for app/manifest.ts:
// 192 and 512 "any" icons, plus a 512 maskable one with the mark inside the 80% safe zone.
//
//   node scripts/make-pwa-icons.mjs

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const OUT = join(process.cwd(), "public", "icons");
const BG = "#050505";
const INK = "#f1f1f1";
const MARK = "M0.769531 600L266.27 0.5H589.77L447.27 326H771.77L578.27 763H253.77L447.27 326H286.27L166.77 600H0.769531Z";

/** The mark centred on the app's near-black, taking `scale` of the icon's width. */
function svg(size, scale) {
  const w = size * scale;
  const h = w * (764 / 773);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="100%" height="100%" fill="${BG}"/>
  <svg x="${(size - w) / 2}" y="${(size - h) / 2}" width="${w}" height="${h}" viewBox="0 0 773 764"><path fill="${INK}" d="${MARK}"/></svg>
</svg>`;
}

mkdirSync(OUT, { recursive: true });
const icons = [
  ["icon-192.png", 192, 0.62],
  ["icon-512.png", 512, 0.62],
  ["maskable-512.png", 512, 0.5],
];
for (const [name, size, scale] of icons) {
  await sharp(Buffer.from(svg(size, scale))).png().toFile(join(OUT, name));
  console.log(`wrote public/icons/${name}`);
}
