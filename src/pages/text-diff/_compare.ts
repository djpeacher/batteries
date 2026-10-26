/**
 * Text Diff's comparison: a pure function from the old side's text and the
 * new side's text to everything the result and the toolbar render from.
 * No DOM. Every comparison rule lives here.
 *
 * Lines are compared with jsdiff; a changed line paired with one on the
 * other side gets a word diff. Line endings are always normalised, and a
 * trailing newline does not add a line. The ignore options change only
 * which lines and words count as equal; the displayed text is always the
 * original.
 * A time limit, when given, bounds the whole comparison: past it the
 * result is "too-large" and carries no rows.
 */
import { diffArrays } from "diff";

export type Segment = { text: string; changed: boolean };

/** One line of the old side or the new side, as the result shows it: its line number, its text and, when it is paired with a changed line on the other side, `segments` covering its words (else null). */
export type SideLine = { number: number; text: string; segments: Segment[] | null };

export type Fold = { type: "fold"; id: string; count: number; label: string; position: "start" | "middle" | "end" };

export type SplitRow =
  | { type: "same"; old: SideLine; new: SideLine }
  /** A null side is a line that exists on the other side only (grey filler). */
  | { type: "change"; old: SideLine | null; new: SideLine | null }
  | Fold;

export type CombinedRow =
  | { type: "same"; oldNo: number; newNo: number; text: string }
  | { type: "removed"; oldNo: number; text: string; segments: SideLine["segments"] }
  | { type: "added"; newNo: number; text: string; segments: SideLine["segments"] }
  | Fold;

export type Comparison = {
  status: "diff" | "identical" | "too-large";
  /** "No differences" when identical, with "(ignoring whitespace)", "(ignoring case)" or "(ignoring whitespace and case)" when a toggle made the match; else "". */
  message: string;
  /** Lines added and removed; a changed line counts as one of each. */
  added: number;
  removed: number;
  oldLines: number;
  newLines: number;
  /** Side-by-side rows, in order. */
  split: SplitRow[];
  /** Combined rows: removed lines above the added lines that replace them. */
  combined: CombinedRow[];
};

/**
 * Options for a comparison. `expanded` holds the ids of fold rows the
 * reviewer has opened. `ignoreWhitespace` compares lines with leading,
 * trailing and repeated whitespace collapsed (a blank line still counts);
 * `ignoreCase` compares lines case-folded. `timeLimit` is in milliseconds:
 * live runs pass LIVE_TIME_LIMIT, and Compare passes none, for no limit.
 */
export type CompareOptions = {
  expanded?: ReadonlySet<string>;
  ignoreWhitespace?: boolean;
  ignoreCase?: boolean;
  timeLimit?: number;
};

/** The time limit for comparing as the reviewer types, in milliseconds. */
export const LIVE_TIME_LIMIT = 400;

export const TOO_LARGE = "Too large to compare live";

/** Thrown inside compare when the time limit runs out. */
class TooLarge extends Error {}

/** jsdiff's array diff under a deadline (a Date.now() time, or Infinity). */
function diffWithin<T>(a: T[], b: T[], deadline: number, comparator?: (l: T, r: T) => boolean) {
  if (deadline === Infinity) return diffArrays(a, b, { comparator });
  const left = deadline - Date.now();
  const changes = left > 0 ? diffArrays(a, b, { timeout: left, comparator }) : undefined;
  if (!changes) throw new TooLarge();
  return changes;
}

/** Unchanged lines kept on each side of a change; the rest of a run folds. */
export const CONTEXT = 3;

/** Splits text into lines: CRLF and CR count as LF, and a final newline doesn't add a line. */
export function toLines(text: string): string[] {
  const s = text.replace(/\r\n?/g, "\n");
  if (!s) return [];
  const lines = s.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

// Word-diff tokens: words, whitespace runs and single punctuation marks.
const TOKEN = /\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu;
const isSpace = (t: string) => /^\s/.test(t);

/**
 * The span of a line's tokens that is compared: all of them, or under ignore
 * whitespace all but the leading and trailing whitespace, which never counts.
 */
function comparedSpan(tokens: string[], ignore: Ignore): [number, number] {
  let start = 0;
  let end = tokens.length;
  if (ignore.whitespace) {
    while (start < end && isSpace(tokens[start])) start++;
    while (end > start && isSpace(tokens[end - 1])) end--;
  }
  return [start, end];
}

/**
 * Word diff of a changed line pair: segments covering each whole line. The
 * ignore toggles apply here too, so a word that differs only in case, or a
 * space run that differs only in length, is never marked.
 */
function wordDiff(a: string, b: string, ignore: Ignore, deadline: number): [Segment[], Segment[]] {
  const ta = a.match(TOKEN) ?? [];
  const tb = b.match(TOKEN) ?? [];
  const ca = ta.map(() => false);
  const cb = tb.map(() => false);
  const [sa, ea] = comparedSpan(ta, ignore);
  const [sb, eb] = comparedSpan(tb, ignore);
  const tokenKey = (t: string) => (ignore.whitespace && isSpace(t) ? " " : ignore.case ? t.toLowerCase() : t);
  let x = sa;
  let y = sb;
  for (const c of diffWithin(ta.slice(sa, ea), tb.slice(sb, eb), deadline, (l, r) => tokenKey(l) === tokenKey(r))) {
    if (c.added) for (let j = 0; j < c.count; j++) cb[y++] = true;
    else if (c.removed) for (let j = 0; j < c.count; j++) ca[x++] = true;
    else {
      x += c.count;
      y += c.count;
    }
  }
  return [joinRuns(ta, ca), joinRuns(tb, cb)];
}

/**
 * Joins tokens into runs. A space between two changed words is changed too,
 * so a phrase highlights as one; a changed space at the edge of a changed
 * word is not, so the highlight stops at the word. A space changed on its
 * own stays changed.
 */
function joinRuns(tokens: string[], changed: boolean[]): Segment[] {
  const marked = [...changed];
  for (let i = 0; i < tokens.length; i++) {
    if (!isSpace(tokens[i])) continue;
    const before = i > 0 && marked[i - 1];
    const after = i < tokens.length - 1 && marked[i + 1];
    if (before && after) changed[i] = true;
    else if (marked[i] && (before || after)) changed[i] = false;
  }
  const out: Segment[] = [];
  tokens.forEach((text, i) => {
    const last = out[out.length - 1];
    if (last && last.changed === changed[i]) last.text += text;
    else out.push({ text, changed: changed[i] });
  });
  return out;
}

/** Which ignore toggles are on: the kinds of difference that don't count. */
type Ignore = { whitespace: boolean; case: boolean };

const AS_WRITTEN: Ignore = { whitespace: false, case: false };

/** The form a line is compared in under the ignore toggles. */
function lineKey(line: string, ignore: Ignore): string {
  let k = line;
  if (ignore.whitespace) k = k.replace(/\s+/g, " ").trim();
  if (ignore.case) k = k.toLowerCase();
  return k;
}

function sameLines(o: string[], n: string[], ignore: Ignore): boolean {
  return o.length === n.length && o.every((l, i) => lineKey(l, ignore) === lineKey(n[i], ignore));
}

/**
 * "No differences", noting the ignore toggles the match needed: none when
 * the texts are equal as written, else whichever toggle alone would not do.
 */
function identicalMessage(o: string[], n: string[], ignore: Ignore): string {
  if (sameLines(o, n, AS_WRITTEN)) return "No differences";
  const needWhitespace = ignore.whitespace && !(ignore.case && sameLines(o, n, { whitespace: false, case: true }));
  const needCase = ignore.case && !(ignore.whitespace && sameLines(o, n, { whitespace: true, case: false }));
  const note = [needWhitespace && "whitespace", needCase && "case"].filter(Boolean).join(" and ");
  return `No differences (ignoring ${note})`;
}

type Block =
  | { type: "same"; oldStart: number; newStart: number; count: number }
  | { type: "change"; oldStart: number; newStart: number; removed: number; added: number };

/** Compares the old text with the new text. */
export function compare(oldText: string, newText: string, options: CompareOptions = {}): Comparison {
  const deadline = options.timeLimit === undefined ? Infinity : Date.now() + options.timeLimit;
  try {
    return compareWithin(oldText, newText, options, deadline);
  } catch (e) {
    if (!(e instanceof TooLarge)) throw e;
    const base = { added: 0, removed: 0, split: [], combined: [] };
    return { ...base, status: "too-large", message: TOO_LARGE, oldLines: toLines(oldText).length, newLines: toLines(newText).length };
  }
}

function compareWithin(oldText: string, newText: string, options: CompareOptions, deadline: number): Comparison {
  const expanded = options.expanded ?? new Set<string>();
  const o = toLines(oldText);
  const n = toLines(newText);
  const ignore: Ignore = { whitespace: options.ignoreWhitespace ?? false, case: options.ignoreCase ?? false };
  const base = { oldLines: o.length, newLines: n.length, added: 0, removed: 0, split: [], combined: [] };

  // Runs of same lines, and change blocks (removed lines, then added lines).
  const blocks: Block[] = [];
  let oi = 0;
  let ni = 0;
  // Diff the compared forms; rows below index back into the original lines.
  const keys = (lines: string[]) => lines.map((l) => lineKey(l, ignore));
  for (const c of diffWithin(keys(o), keys(n), deadline)) {
    if (!c.added && !c.removed) {
      blocks.push({ type: "same", oldStart: oi, newStart: ni, count: c.count });
      oi += c.count;
      ni += c.count;
      continue;
    }
    let b = blocks[blocks.length - 1];
    if (!b || b.type !== "change") blocks.push((b = { type: "change", oldStart: oi, newStart: ni, removed: 0, added: 0 }));
    if (c.removed) {
      b.removed += c.count;
      oi += c.count;
    } else {
      b.added += c.count;
      ni += c.count;
    }
  }

  let added = 0;
  let removed = 0;
  for (const b of blocks) {
    if (b.type === "change") {
      added += b.added;
      removed += b.removed;
    }
  }
  if (!added && !removed) return { ...base, status: "identical", message: identicalMessage(o, n, ignore) };

  const split: SplitRow[] = [];
  const combined: CombinedRow[] = [];
  const sameRow = (oIdx: number, nIdx: number) => {
    split.push({
      type: "same",
      old: { number: oIdx + 1, text: o[oIdx], segments: null },
      new: { number: nIdx + 1, text: n[nIdx], segments: null },
    });
    combined.push({ type: "same", oldNo: oIdx + 1, newNo: nIdx + 1, text: n[nIdx] });
  };
  blocks.forEach((b, bi) => {
    if (b.type === "same") {
      // A run keeps CONTEXT lines next to each change; the first run has no
      // change above it and the last none below, so they keep nothing there.
      const first = bi === 0;
      const last = bi === blocks.length - 1;
      const head = first ? 0 : CONTEXT;
      const tail = last ? 0 : CONTEXT;
      const hidden = b.count - head - tail;
      // Named by where the hidden lines start, so it survives edits elsewhere.
      const id = `o${b.oldStart + head + 1}n${b.newStart + head + 1}`;
      if (hidden > 0 && !expanded.has(id)) {
        for (let k = 0; k < head; k++) sameRow(b.oldStart + k, b.newStart + k);
        const fold: Fold = {
          type: "fold",
          id,
          count: hidden,
          label: `Show ${hidden} unchanged line${hidden === 1 ? "" : "s"}`,
          position: first ? "start" : last ? "end" : "middle",
        };
        split.push(fold);
        combined.push(fold);
        for (let k = b.count - tail; k < b.count; k++) sameRow(b.oldStart + k, b.newStart + k);
      } else {
        for (let k = 0; k < b.count; k++) sameRow(b.oldStart + k, b.newStart + k);
      }
      return;
    }
    // Pair removed and added lines in order; the rest have no partner.
    const pairs = Math.min(b.removed, b.added);
    const removedRows: CombinedRow[] = [];
    const addedRows: CombinedRow[] = [];
    for (let k = 0; k < Math.max(b.removed, b.added); k++) {
      const oIdx = b.oldStart + k;
      const nIdx = b.newStart + k;
      let oldSide: SideLine | null = null;
      let newSide: SideLine | null = null;
      if (k < pairs) {
        const [os, ns] = wordDiff(o[oIdx], n[nIdx], ignore, deadline);
        oldSide = { number: oIdx + 1, text: o[oIdx], segments: os };
        newSide = { number: nIdx + 1, text: n[nIdx], segments: ns };
      } else if (k < b.removed) {
        oldSide = { number: oIdx + 1, text: o[oIdx], segments: null };
      } else {
        newSide = { number: nIdx + 1, text: n[nIdx], segments: null };
      }
      split.push({ type: "change", old: oldSide, new: newSide });
      if (oldSide) removedRows.push({ type: "removed", oldNo: oldSide.number, text: oldSide.text, segments: oldSide.segments });
      if (newSide) addedRows.push({ type: "added", newNo: newSide.number, text: newSide.text, segments: newSide.segments });
    }
    combined.push(...removedRows, ...addedRows);
  });

  return { ...base, status: "diff", message: "", added, removed, split, combined };
}
