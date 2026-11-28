/**
 * File Tree's saved outline and mode. A present key always wins, even an
 * empty one; no key at all is a first visit, which shows the sample. The
 * outline is saved on every edit, so the sample never returns once it has
 * been edited or cleared.
 */
import { load, save } from "../../scripts/storage";

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

/** Saves the outline, on every edit. */
export function saveText(text: string) {
  save(TEXT_KEY, text);
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
