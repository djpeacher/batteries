/**
 * Indent edits on File Tree's text side: Tab and Shift-Tab move whole lines
 * one step deeper or shallower, and Enter carries the current line's
 * indentation. Pure: the page applies the result as one native edit.
 */

export type Key = "Tab" | "Shift-Tab" | "Enter";

/** The text side's text and selection after an edit. */
export type Edit = { text: string; start: number; end: number };

/** Where the line holding `pos` starts. */
const lineStart = (text: string, pos: number) => text.lastIndexOf("\n", pos - 1) + 1;

/** The leading spaces and tabs of `s`. */
const leading = (s: string) => /^[ \t]*/.exec(s)![0];

/**
 * The text side after pressing `key` with the selection from `start` to
 * `end`, or null when the key changes nothing.
 */
export function indentEdit(text: string, start: number, end: number, key: Key): Edit | null {
  if (key === "Enter") {
    // Only the whitespace before the cursor, so the new line is never deeper.
    const carried = "\n" + leading(text.slice(lineStart(text, start), start));
    const pos = start + carried.length;
    return { text: text.slice(0, start) + carried + text.slice(end), start: pos, end: pos };
  }
  const lines = touched(text, start, end);
  const step = stepOf(text);
  if (key === "Tab") return apply(text, start, end, lines.map((at) => ({ at, removed: 0, added: step })));
  const cuts = lines
    .map((at) => ({ at, removed: oneStep(leading(text.slice(at, text.indexOf("\n", at) + 1 || undefined)), columns(step)), added: "" }))
    .filter((c) => c.removed > 0);
  return cuts.length ? apply(text, start, end, cuts) : null;
}

/** Columns `ws` spans from a line's start, a tab advancing to the next multiple of 4. */
function columns(ws: string): number {
  let col = 0;
  for (const ch of ws) col = ch === "\t" ? col + 4 - (col % 4) : col + 1;
  return col;
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
 * One step: the leading whitespace of the first indented line with a name
 * on it, or a tab when no line is indented yet.
 */
function stepOf(text: string): string {
  for (const line of text.split("\n")) {
    const ws = leading(line);
    if (ws && ws.length < line.length) return ws;
  }
  return "\t";
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
type Cut = { at: number; removed: number; added: string };

/**
 * Applies the line changes, in text order, and moves the selection so it
 * covers the same lines and text: a position at or past a change shifts
 * with it, and one inside removed whitespace goes to where it was.
 */
function apply(text: string, start: number, end: number, cuts: Cut[]): Edit {
  const move = (pos: number) => {
    let shift = 0;
    for (const c of cuts) {
      if (pos < c.at) break;
      shift += c.added.length - Math.min(c.removed, pos - c.at);
    }
    return pos + shift;
  };
  let out = "";
  let from = 0;
  for (const c of cuts) {
    out += text.slice(from, c.at) + c.added;
    from = c.at + c.removed;
  }
  out += text.slice(from);
  return { text: out, start: move(start), end: move(end) };
}
