import type { Game } from "./games";

/** Bento column count for a viewport width — the design's 2 / 6 / 8 / 12 breakpoints. */
export function bentoCols(vw: number) {
  return vw < 560 ? 2 : vw < 900 ? 6 : vw < 1300 ? 8 : 12;
}

/** Each row template lists `[columnSpan, rowSpan]` slots; rows repeat in order. */
function rowTemplates(cols: number): [number, number][][] {
  if (cols === 2) return [[[1, 7], [1, 7]], [[2, 6]]];
  if (cols === 6) return [[[3, 6], [3, 6]], [[2, 7], [2, 7], [2, 7]], [[6, 5]]];
  if (cols === 8) return [[[4, 6], [4, 6]], [[2, 7], [2, 7], [2, 7], [2, 7]], [[8, 5]]];
  return [
    [[4, 6], [4, 6], [4, 6]],
    [[6, 6], [6, 6]],
    [[3, 7], [3, 7], [3, 7], [3, 7]],
    [[8, 6], [4, 6]],
  ];
}

export type PackedTile = { game: Game; c: number; r: number; wide: boolean };

/**
 * Packs games into bento rows. The last slot of a short row stretches so every row
 * fills the grid. `startRow` offsets the template so consecutive sections vary.
 */
export function packTiles(items: Game[], cols: number, startRow = 0) {
  const tpl = rowTemplates(cols);
  const tiles: PackedTile[] = [];
  let i = 0;
  let t = startRow;
  while (i < items.length) {
    const row = tpl[t % tpl.length];
    t++;
    const left = items.length - i;
    const slots = row.length <= left ? row.slice() : row.slice(0, left);
    const used = slots.reduce((a, b) => a + b[0], 0);
    if (used < cols) {
      const last = slots[slots.length - 1];
      slots[slots.length - 1] = [last[0] + (cols - used), last[1]];
    }
    for (const [c, r] of slots) {
      tiles.push({ game: items[i++], c, r, wide: c / cols >= 0.45 });
    }
  }
  return { tiles, next: t };
}

/** Picks a span for one of the four responsive widths `[2, 6, 8, 12]`. */
export function spanFor(cols: number, spans: [number, number, number, number]) {
  if (cols === 2) return spans[0];
  if (cols === 6) return spans[1];
  if (cols === 8) return spans[2];
  return spans[3];
}
