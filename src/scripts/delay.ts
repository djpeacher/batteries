/**
 * How long a battery waits after an edit before it redraws its output side
 * (Pretty Print's formatting, File Tree's drawing).
 */

/**
 * Text longer than this many characters (about 1 MB) waits for a pause in
 * typing before it is redrawn, so each keystroke stays quick.
 */
export const DEBOUNCE_LIMIT = 1_000_000;
/** How long the pause is, in milliseconds. */
export const DEBOUNCE_MS = 300;

/** How long to wait after an edit before redrawing text `length` characters long. */
export function editDelay(length: number): number {
  return length > DEBOUNCE_LIMIT ? DEBOUNCE_MS : 0;
}
