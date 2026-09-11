export type Theme = "dark" | "light";

export const THEME_KEY = "habiv-theme";

/** Class on <html> that switches the `.hb-theme` tokens in globals.css to the light palette. */
export const LIGHT_CLASS = "hb-light";

/**
 * Runs before first paint (inlined in app/layout.tsx) so a stored light theme never
 * flashes dark on reload. Kept tiny and dependency-free on purpose.
 */
export const themeInitScript = `try{if(localStorage.getItem("${THEME_KEY}")==="light")document.documentElement.classList.add("${LIGHT_CLASS}")}catch(e){}`;

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle(LIGHT_CLASS, theme === "light");
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage can be unavailable (private mode); the theme still applies for this visit.
  }
}
