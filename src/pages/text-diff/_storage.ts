/**
 * Text Diff's saved texts. A present key always wins, even an empty one; no
 * key at all is a first visit, which shows the sample pair. Both sides are
 * saved together on every edit, so the sample never returns once either
 * side has been edited.
 */
import { load, save } from "../../scripts/storage";

const OLD_KEY = "batteries:text-diff:old";
const NEW_KEY = "batteries:text-diff:new";

/** The first-visit sample: line 2 changed, line 3 removed, a line added at the end. */
export const SAMPLE = {
  old: [
    "Batteries are small tools that live on one shelf.",
    "Each battery runs in your browser.",
    "Nothing you paste is uploaded anywhere.",
    "Text Diff compares two texts line by line.",
    "Changed words stand out inside changed lines.",
    "",
  ].join("\n"),
  new: [
    "Batteries are small tools that live on one shelf.",
    "Each battery runs entirely in your browser.",
    "Text Diff compares two texts line by line.",
    "Changed words stand out inside changed lines.",
    "Edit either side and the result updates as you type.",
    "",
  ].join("\n"),
};

export type Texts = { old: string; new: string };

export function loadTexts(): Texts {
  const savedOld = load(OLD_KEY);
  const savedNew = load(NEW_KEY);
  // Nothing saved (or storage unavailable): a first visit, with the sample.
  if (savedOld === null && savedNew === null) return SAMPLE;
  return { old: savedOld ?? "", new: savedNew ?? "" };
}

export function saveTexts(texts: Texts) {
  save(OLD_KEY, texts.old);
  save(NEW_KEY, texts.new);
}

const VIEW_KEY = "batteries:text-diff:view";

/** How the result is shown: side-by-side (the default) or combined. */
export type View = "split" | "combined";

export function loadView(): View {
  return load(VIEW_KEY) === "combined" ? "combined" : "split";
}

export function saveView(view: View) {
  save(VIEW_KEY, view);
}

const IGNORE_KEYS = {
  whitespace: "batteries:text-diff:ignore-whitespace",
  case: "batteries:text-diff:ignore-case",
} as const;

/** The two ignore toggles. Both are off unless saved on. */
export type Ignore = keyof typeof IGNORE_KEYS;

export function loadIgnore(which: Ignore): boolean {
  return load(IGNORE_KEYS[which]) === "on";
}

export function saveIgnore(which: Ignore, on: boolean) {
  save(IGNORE_KEYS[which], on ? "on" : "off");
}
