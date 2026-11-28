/**
 * Indent edits on File Tree's text side: Tab and Shift-Tab move whole lines
 * one indent step deeper or shallower, and Enter carries the current line's
 * indentation. Pure: the page applies the result as one native edit.
 */

import type { EditKey, KeyEdit, TextEdit } from "../../scripts/textbox";
import { columns, leading, readOutline } from "./_draw";

/** Where the line holding `pos` starts. */
const lineStart = (text: string, pos: number) => text.lastIndexOf("\n", pos - 1) + 1;

/**
 * File Tree's key editor. The indent step holds through a run of Tab and
 * Shift-Tab presses, so Shift-Tab always undoes a Tab exactly: it is measured
 * again only when the text is not what the last press left (after typing,
 * Enter, undo, paste, or any other edit).
 */
export function indenter(): KeyEdit {
  let left: string | null = null;
  let step = "";
  return (text, start, end, key) => {
    if (key === "Enter") return indentEdit(text, start, end, key);
    if (text !== left) step = stepOf(text);
    const change = indentEdit(text, start, end, key, step);
    left = change ? change.text : text;
    return change;
  };
}

/**
 * The text side after pressing `key` with the selection from `start` to
 * `end`, or null when the key changes nothing. `step` is the indent step,
 * measured from `text` when not given.
 */
export function indentEdit(text: string, start: number, end: number, key: EditKey, step = stepOf(text)): TextEdit | null {
  if (key === "Enter") {
    // Only the whitespace before the cursor, so the new line is never deeper.
    const carried = "\n" + leading(text.slice(lineStart(text, start), start));
    const pos = start + carried.length;
    return { text: text.slice(0, start) + carried + text.slice(end), start: pos, end: pos };
  }
  const lines = touched(text, start, end);
  if (key === "Tab") return apply(text, start, end, lines.map((at) => ({ at, removed: 0, added: step })));
  const changes = lines
    .map((at) => ({ at, removed: oneStep(leading(text.slice(at, text.indexOf("\n", at) + 1 || undefined)), columns(step)), added: "" }))
    .filter((c) => c.removed > 0);
  return changes.length ? apply(text, start, end, changes) : null;
}

/**
 * How many characters of the leading whitespace `ws` make up one step of
 * `width` columns, never more than `ws` has: a tab at the front goes whole.
 */
function oneStep(ws: string, width: number): number {
  let n = 0;
  while (n < ws.length && columns(ws.slice(0, n)) < width) n++;
  return n;
}

/**
 * The indent step measured from the outline: the smallest gap between a
 * line's indentation and its parent's, as the whitespace that makes it up.
 * With no line deeper than a parent, the first indented line's whitespace;
 * with no indented line, a tab.
 */
function stepOf(text: string): string {
  const lines = readOutline(text);
  let step = "";
  let gap = Infinity;
  for (const line of lines) {
    if (line.parent < 0) continue;
    const parent = lines[line.parent];
    const g = line.indent - parent.indent;
    if (g >= gap) continue;
    gap = g;
    step = line.lead.startsWith(parent.lead) ? line.lead.slice(parent.lead.length) : " ".repeat(g);
  }
  return step || lines.find((l) => l.lead)?.lead || "\t";
}

/**
 * Where each line the selection touches starts. A line is touched when the
 * selection covers at least one of its characters (its newline counts), so a
 * selection ending at a line's very start leaves that line alone; a cursor
 * touches its own line.
 */
function touched(text: string, start: number, end: number): number[] {
  const last = end > start && lineStart(text, end) === end ? end - 1 : end;
  const starts = [lineStart(text, start)];
  for (let i = text.indexOf("\n", starts[0]); i >= 0 && i < last; i = text.indexOf("\n", i + 1)) starts.push(i + 1);
  return starts;
}

/** One line's change: `removed` characters at `at` give way to `added`. */
type LineChange = { at: number; removed: number; added: string };

/**
 * Applies the line changes, in text order, and moves the selection so it
 * covers the same lines and text: a position at or past a change shifts
 * with it, and one inside removed whitespace goes to where it was.
 */
function apply(text: string, start: number, end: number, changes: LineChange[]): TextEdit {
  const move = (pos: number) => {
    let shift = 0;
    for (const c of changes) {
      if (pos < c.at) break;
      shift += c.added.length - Math.min(c.removed, pos - c.at);
    }
    return pos + shift;
  };
  let out = "";
  let from = 0;
  for (const c of changes) {
    out += text.slice(from, c.at) + c.added;
    from = c.at + c.removed;
  }
  out += text.slice(from);
  return { text: out, start: move(start), end: move(end) };
}
