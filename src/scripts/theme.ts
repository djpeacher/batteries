/**
 * The theme at run time. The head script in Base.astro has already applied
 * the saved preference before first paint; this module keeps it in step.
 *
 * On the root element, `data-theme="light|dark"` forces a theme; no attribute
 * means System, and global.css follows `prefers-color-scheme` on its own.
 *
 * Batteries that care (Markdown Preview's diagrams) use `currentTheme()` and
 * `onThemeChange()`.
 */
import { remove, save } from "./storage";
import { THEME_EVENT, THEME_KEY, isPreference, type Theme, type ThemeChangeEvent, type ThemePreference } from "../lib/theme";

const osDark = window.matchMedia("(prefers-color-scheme: dark)");

export function osTheme(): Theme {
  return osDark.matches ? "dark" : "light";
}

/** Calls `listener` each time the OS theme flips, even while Light or Dark overrides it. Returns an unsubscribe. */
export function onOsThemeChange(listener: () => void): () => void {
  osDark.addEventListener("change", listener);
  return () => osDark.removeEventListener("change", listener);
}

export function preference(): ThemePreference {
  const forced = document.documentElement.dataset.theme;
  return isPreference(forced) ? forced : "system";
}

/** The theme on screen right now. */
export function currentTheme(): Theme {
  const pref = preference();
  return pref === "system" ? osTheme() : pref;
}

/** Calls `listener` with the new theme each time the theme on screen changes. Returns an unsubscribe. */
export function onThemeChange(listener: (theme: Theme) => void): () => void {
  const handler = (e: Event) => listener((e as ThemeChangeEvent).detail.theme);
  document.addEventListener(THEME_EVENT, handler);
  return () => document.removeEventListener(THEME_EVENT, handler);
}

let shown = currentTheme();

function announceIfChanged() {
  const theme = currentTheme();
  if (theme === shown) return;
  shown = theme;
  document.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { theme } }));
}

function apply(pref: ThemePreference) {
  if (pref === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = pref;
  announceIfChanged();
}

/** Saves and applies a preference. */
export function setPreference(pref: ThemePreference) {
  // Storage unavailable (private mode, quota): the choice lasts for this page only.
  if (pref === "system") remove(THEME_KEY);
  else save(THEME_KEY, pref);
  apply(pref);
}

// While on System, the CSS already follows the OS; tell listeners too.
onOsThemeChange(announceIfChanged);

// A pick in another tab applies here as well.
window.addEventListener("storage", (e) => {
  if (e.key !== THEME_KEY && e.key !== null) return;
  apply(isPreference(e.newValue) ? e.newValue : "system");
});
