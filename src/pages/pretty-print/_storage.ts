/**
 * Pretty Print's saved text and mode. A present key always wins, even an
 * empty one; no key at all is a first visit, which shows the sample. The
 * text is saved on every edit, so the sample never returns once it has been
 * edited or cleared.
 *
 * Text over SAVE_LIMIT is not saved, nor is text the browser refuses to
 * save (storage full or unavailable). Then the older saved text is dropped,
 * so a reload is blank rather than a text already replaced.
 */
import { load, remove, save, trySave } from "../../scripts/storage";

const TEXT_KEY = "batteries:pretty-print:text";

/** The first-visit sample: a small Python dict with keys, a string, numbers, True/None, a comment, a tuple, a call and an empty value. */
export const SAMPLE = `{'id': 1042, 'name': 'Ada Lovelace', 'active': True, 'manager': None,
 # limits are per day
 'score': 98.6, 'tags': ('admin', 'beta'), 'limits': {'daily': 500, 'ratio': 0.25},
 'joined': datetime.date(2015, 12, 10), 'notes': []}
`;

export function loadText(): string {
  // Nothing saved (or storage unavailable): a first visit, with the sample.
  return load(TEXT_KEY) ?? SAMPLE;
}

/**
 * Pretty Print's own save limit, in characters (about 1 MB), so a huge
 * paste never fills the storage Markdown Preview and Text Diff save to.
 */
export const SAVE_LIMIT = 1_000_000;

/** Saves the text and reports whether it will survive a reload. */
export function saveText(text: string): boolean {
  if (text.length <= SAVE_LIMIT && trySave(TEXT_KEY, text)) return true;
  // An empty saved text reloads blank; if even that won't save, no key at all.
  if (!trySave(TEXT_KEY, "")) remove(TEXT_KEY);
  return false;
}

/** Also read by the page's inline script, which applies the saved mode before first paint. */
export const MODE_KEY = "batteries:pretty-print:mode";

/** Which sides show: both (the default), the text side only, or the formatted side only. */
export type Mode = "split" | "text" | "formatted";

/** The saved mode; split when none is saved. */
export function loadMode(): Mode {
  const saved = load(MODE_KEY);
  return saved === "text" || saved === "formatted" ? saved : "split";
}

export function saveMode(mode: Mode) {
  save(MODE_KEY, mode);
}
