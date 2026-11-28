/**
 * File Tree's saved outline and mode. A present key always wins, even an
 * empty one; no key at all is a first visit, which shows the sample. The
 * outline is saved on every edit, so the sample never returns once it has
 * been edited or cleared.
 *
 * An outline over SAVE_LIMIT is not saved, nor is one the browser refuses to
 * save (storage full or unavailable). Then the older saved outline is
 * overwritten with empty text, so a reload is blank rather than an outline
 * already replaced (ADR-0006).
 */
import { load, remove, save, trySave } from "../../scripts/storage";

const TEXT_KEY = "batteries:file-tree:text";

/** The first-visit sample: a small `my-app/` outline, 2-space steps, whose comments explain File Tree. */
export const SAMPLE = `my-app/  # edit or clear this sample
  src/
    index.js  # comments line up
    utils/
      format.js
  tests/
    index.test.js
  README.md  # Tab and Shift-Tab`;

export function loadText(): string {
  // Nothing saved (or storage unavailable): a first visit, with the sample.
  return load(TEXT_KEY) ?? SAMPLE;
}

/**
 * File Tree's save limit, in characters (about 1 MB), as Pretty Print's, so a
 * huge paste never fills the storage the other batteries save to.
 */
export const SAVE_LIMIT = 1_000_000;

/** Saves the outline, on every edit, and reports whether it will survive a reload. */
export function saveText(text: string): boolean {
  if (text.length <= SAVE_LIMIT && trySave(TEXT_KEY, text)) return true;
  // An empty saved outline reloads blank; if even that won't save, no key at all.
  if (!trySave(TEXT_KEY, "")) remove(TEXT_KEY);
  return false;
}

/** Also read by the page's inline script, which applies the saved mode before first paint. */
export const MODE_KEY = "batteries:file-tree:mode";

/** Which sides show: both (the default), the text side only, or the tree side only. */
export type Mode = "split" | "text" | "tree";

/** The saved mode; split when none is saved. */
export function loadMode(): Mode {
  const saved = load(MODE_KEY);
  return saved === "text" || saved === "tree" ? saved : "split";
}

export function saveMode(mode: Mode) {
  save(MODE_KEY, mode);
}
