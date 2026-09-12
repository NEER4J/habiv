/** Bento column count for a viewport width — the design's 2 / 6 / 8 / 12 breakpoints. */
export function bentoCols(vw: number) {
  return vw < 560 ? 2 : vw < 900 ? 6 : vw < 1300 ? 8 : 12;
}

/** Picks a span for one of the four responsive widths `[2, 6, 8, 12]`. */
export function spanFor(cols: number, spans: [number, number, number, number]) {
  if (cols === 2) return spans[0];
  if (cols === 6) return spans[1];
  if (cols === 8) return spans[2];
  return spans[3];
}
