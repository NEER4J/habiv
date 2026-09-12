/**
 * Games sit in up to three categories. The first is the main one: it is games.category, shown on
 * cards and the game page; the game appears under every category in games.categories. The database
 * trigger games_sync_categories keeps both columns in step.
 */
export const MAX_CATEGORIES = 3;

/** A click on a category chip: remove it (always keeping one), or add it while there is room. */
export function toggleCategory(current: string[], slug: string): string[] {
  if (current.includes(slug)) return current.length > 1 ? current.filter((c) => c !== slug) : current;
  return current.length < MAX_CATEGORIES ? [...current, slug] : current;
}

/** Moves a picked category to the front, making it the main one. */
export function makeMainCategory(current: string[], slug: string): string[] {
  return [slug, ...current.filter((c) => c !== slug)];
}
