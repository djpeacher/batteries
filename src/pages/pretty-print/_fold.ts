/**
 * Fold state: which items on the formatted side are folded, as a set of
 * item paths (key or index steps from the root, as the printer gives them).
 * Pure functions over the formatter's line model; folds are never saved.
 */
import type { Formatted } from "./_format";
import { lineText, type Line, type Span, type Step, type Unit } from "./_print";

/** The folded items' paths, each as `pathKey` gives it. */
export type Folds = ReadonlySet<string>;
export const NO_FOLDS: Folds = new Set();

/**
 * A row of the formatted side: a line of the model, or the folded item
 * standing for a folded one's lines, `through` being the last of them.
 */
export type Row = Line & { folded?: true; through?: number };

export const pathKey = (path: Step[]) => JSON.stringify(path);

/** Folds the item at `path` if it is open, unfolds it if folded. */
export function toggle(folds: Folds, path: Step[]): Folds {
  const next = new Set(folds);
  const key = pathKey(path);
  if (!next.delete(key)) next.add(key);
  return next;
}

/** Whether any item in the output can fold (no: blank, error, scalars, one-line output). */
export const foldable = (lines: Line[]) => lines.some((l) => l.fold);

/** Fold all: every item that can fold except the outermost value, so its members show. */
export function foldAll(lines: Line[]): Folds {
  const next = new Set<string>();
  for (const l of lines) if (l.fold && l.fold.path.length) next.add(pathKey(l.fold.path));
  return next;
}

/**
 * The folds that last into a new output: each kept while an item at its
 * path still folds, dropped once there is none. Text that doesn't read
 * keeps them all, to come back once it does; cleared text drops them all.
 */
export function reconcile(folds: Folds, f: Formatted): Folds {
  if (f.kind === "error" || !folds.size) return folds;
  if (f.kind === "blank") return NO_FOLDS;
  const exists = new Set(f.lines.flatMap((l) => (l.fold ? [pathKey(l.fold.path)] : [])));
  const next = new Set([...folds].filter((k) => exists.has(k)));
  return next.size === folds.size ? folds : next;
}

/**
 * What copying rows `from` to `to` of the formatted side gives: the full
 * text of those rows' lines, a folded item's whole contents in place of its
 * marker, in the line model's order whichever row the selection began on.
 */
export function copiedText(lines: Line[], rows: Row[], from: number, to: number): string {
  const [a, b] = from <= to ? [from, to] : [to, from];
  let first = 0;
  let last = 0;
  let at = 0;
  rows.forEach((row, i) => {
    if (i === a) first = at;
    at = row.folded ? row.through! + 1 : at + 1;
    if (i === b) last = at;
  });
  return lines.slice(first, last).map(lineText).join("\n");
}

/** "1 key", "2 keys", "3 items". */
export const countText = (count: number, unit: Unit) => `${count} ${unit}${count === 1 ? "" : "s"}`;

/**
 * The rows the formatted side shows: the line model with each folded
 * item's lines collapsed to its folded item. A fold inside a folded item
 * stays in the set, unseen until the outer item opens.
 */
export function visibleRows(lines: Line[], folds: Folds): Row[] {
  if (!folds.size) return lines;
  const rows: Row[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fold = line.fold;
    if (!fold || !folds.has(pathKey(fold.path))) {
      rows.push(line);
      continue;
    }
    let spans = foldedSpans(line, lines[fold.last]);
    let through = fold.last;
    // A folded key whose value is folded too: one row, the value's marker after the key's.
    const value = fold.key ? lines[fold.last].fold : undefined;
    if (value && folds.has(pathKey(value.path))) {
      spans = [...keySpans(line), ...foldedSpans(lines[fold.last], lines[value.last]).slice(1)];
      through = value.last;
    }
    rows.push({ indent: line.indent, spans, fold, folded: true, through });
    i = through;
  }
  return rows;
}

/** A folded key's spans up to its closing bracket: what comes before it, the marker and the count. */
function keySpans(open: Line): Span[] {
  const fold = open.fold!;
  return [
    ...open.spans.slice(0, fold.bracket),
    { kind: "marker", text: `${fold.open}…${fold.close}` },
    { text: " " },
    { kind: "count", text: countText(fold.count, fold.unit) },
  ];
}

/**
 * A folded item's spans: what comes before the opening bracket (its key),
 * the boxed marker, what follows the closing bracket up to any comment
 * (a group's `)`, the comma), the count, then that comment. A key's
 * count comes straight after its marker, then the rest of its line.
 */
function foldedSpans(open: Line, close: Line): Span[] {
  const fold = open.fold!;
  // The closing line starts with the closing bracket.
  const tail = close.spans.slice(1);
  // A key's count stays beside it, before the `: ` and its value.
  if (fold.key) return [...keySpans(open), ...tail];
  let cut = 0;
  while (cut < tail.length && tail[cut].kind === "punct") cut++;
  return [
    ...open.spans.slice(0, fold.bracket),
    { kind: "marker", text: `${fold.open}…${fold.close}` },
    ...tail.slice(0, cut),
    { text: " " },
    { kind: "count", text: countText(fold.count, fold.unit) },
    ...tail.slice(cut),
  ];
}
