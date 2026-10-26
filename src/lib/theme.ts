/**
 * Theme vocabulary shared by the head script (Base.astro), the Theme toggle
 * and any battery that reacts to the theme. No DOM here, so it can be
 * imported at build time.
 */
export type Theme = "light" | "dark";
export type ThemePreference = Theme | "system";

/** localStorage key holding the visitor's ThemePreference. Absent means "system". */
export const THEME_KEY = "batteries:theme";

/**
 * Dispatched on `document` whenever the theme on screen changes (a pick in the
 * Theme toggle, the OS flipping while on System, or another tab's pick).
 * `event.detail` is `{ theme: Theme }`.
 */
export const THEME_EVENT = "batteries:themechange";

export type ThemeChangeEvent = CustomEvent<{ theme: Theme }>;

export function isPreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}
