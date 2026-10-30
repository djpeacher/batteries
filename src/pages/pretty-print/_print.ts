/**
 * The printer: turns the reader's tree into the line model, a flat list of
 * output lines, each with its indent and coloured spans. Token text is
 * re-emitted exactly; only whitespace, line breaks and trailing commas
 * change.
 *
 * Layout: one item per line at a 2-space indent, `: ` after a key, a line
 * break after every `,`, empty `{}`, `[]`, `()` and `set()` inline, and a
 * one-item tuple keeps its comma. Own-line comments sit on their own lines
 * before their item at its indent; an end-of-line comment follows its
 * item's comma; one on an opening bracket's line stays there; ones before a
 * closing bracket sit on their own lines at the inner indent.
 *
 * Calls: a short call (nothing inside it at any depth is a non-empty
 * collection or a comment) stays on one line as `Name(a, b=c)`; any other
 * opens like a tuple, its name and `(` on the first line, one argument per
 * line (`name=value` for a named one), and `)` alone.
 *
 * Folds: the first line of every collection that spans more than one line
 * carries a fold, naming its range of lines, the item's path from the root
 * and how many keys or items (a call's arguments) it holds. A dict key
 * spread over lines (a tuple) folds too, apart from its value.
 */
import type { Item, Node, Root } from "./_reader";

/** How a span is coloured; a span without a kind (the space after `:`) is plain. A folded item adds `marker` (its `{…}`) and `count`. */
export type SpanKind = "key" | "arg" | "str" | "num" | "const" | "comment" | "call" | "repr" | "punct" | "marker" | "count";
export type Span = { kind?: SpanKind; text: string };
/**
 * One step from a collection to one of its items: a dict key's text as
 * written (with `#2`, `#3`… on a repeated key's later items), a call's
 * named argument's name, or a list, tuple or set item's (or a call's plain
 * argument's) 0-based position.
 */
export type Step = string | number;
/**
 * The step from an item to its dict key, when the key spreads over lines (a
 * tuple) and folds on its own. No key or argument name is written this way.
 */
export const KEY_STEP = ":key";
/**
 * What folding the item opening on a line hides: lines `first` (this line)
 * to `last` (its closing bracket's line), 0-based in the line model. `path`
 * is the item's steps from the root value (`[]` for the root itself);
 * `count` how many keys (`unit` "key", for a dict) or items it holds;
 * `bracket` where its opening bracket is among this line's spans. `key`
 * marks a dict key's fold, whose closing line goes on with `: ` and the value.
 */
/** What a fold's count counts: a dict's keys, or any other collection's items (a call's arguments). */
export type Unit = "key" | "item";
export type Fold = { first: number; last: number; path: Step[]; count: number; unit: Unit; bracket: number; open: string; close: string; key?: true };
/** One output line: its depth (2 spaces each), its spans left to right, and its fold if an item opens here. */
export type Line = { indent: number; spans: Span[]; fold?: Fold };

const SCALAR_KIND = { string: "str", number: "num", constant: "const", repr: "repr" } as const;
const BRACKETS = { object: "{}", array: "[]", tuple: "()", set: "{}", call: "()" } as const;
const punct = (text: string): Span => ({ kind: "punct", text });
/** An end-of-line comment, two spaces after what it follows. */
const eol = (text: string): Span[] => [{ text: "  " }, { kind: "comment", text }];
const ownLine = (indent: number, text: string): Line => ({ indent, spans: [{ kind: "comment", text }] });

export function print(root: Root): Line[] {
  const lines = [...member(root.item, 0, false, []), ...root.end.map((c) => ownLine(0, c))];
  // Folds are built with ranges counted from their own first line; place them.
  lines.forEach((l, i) => {
    if (l.fold) {
      l.fold.first = i;
      l.fold.last += i;
    }
  });
  return lines;
}

/** A value's lines, its first line starting at `indent`. */
function value(node: Node, indent: number, path: Step[]): Line[] {
  if (node.type === "scalar") return [{ indent, spans: [{ kind: SCALAR_KIND[node.kind], text: node.text }] }];
  if (node.type === "emptySet") return [{ indent, spans: [{ kind: "call", text: "set" }, punct("()")] }];
  if (node.type === "group") {
    const lines = value(node.inner, indent, path);
    lines[0].spans.unshift(punct("("));
    if (lines[0].fold) lines[0].fold.bracket++;
    lines[lines.length - 1].spans.push(punct(")"));
    return lines;
  }
  const [open, close] = BRACKETS[node.shape];
  const { items } = node;
  const name: Span[] = node.name !== undefined ? [{ kind: "call", text: node.name }] : [];
  if (node.shape === "call" && short(node)) {
    const args = items.flatMap((it, i) => [...(i ? [punct(","), { text: " " }] : []), ...argument(it), ...value(it.value, 0, [])[0].spans]);
    return [{ indent, spans: [...name, punct(open), ...args, punct(close)] }];
  }
  if (!items.length && node.open === undefined && !node.end.length) return [{ indent, spans: [punct(open + close)] }];
  const unit: Unit = node.shape === "object" ? "key" : "item";
  const fold: Fold = { first: 0, last: 0, path, count: items.length, unit, bracket: name.length, open, close };
  const lines: Line[] = [{ indent, spans: [...name, punct(open), ...(node.open !== undefined ? eol(node.open) : [])], fold }];
  const oneTuple = node.shape === "tuple" && items.length === 1;
  const seen = new Map<string, number>();
  items.forEach((it, i) => {
    let step: Step = it.name ?? i;
    if (it.key) {
      const text = value(it.key, 0, []).map(lineText).join("");
      const n = (seen.get(text) ?? 0) + 1;
      seen.set(text, n);
      step = n > 1 ? `${text}#${n}` : text;
    }
    lines.push(...member(it, indent + 1, i < items.length - 1 || oneTuple, [...path, step]));
  });
  lines.push(...node.end.map((c) => ownLine(indent + 1, c)));
  lines.push({ indent, spans: [punct(close)] });
  fold.last = lines.length - 1;
  return lines;
}

/** Whether a call stays on one line: nothing inside it is a non-empty collection or a comment. */
function short(node: Node): boolean {
  if (node.type === "scalar" || node.type === "emptySet") return true;
  if (node.type === "group") return short(node.inner);
  if (node.open !== undefined || node.end.length) return false;
  if (node.shape !== "call") return !node.items.length;
  return node.items.every((it) => !it.before.length && it.after === undefined && short(it.value));
}

/** A call argument's `name=`, coloured like a key, if it has one. */
const argument = (it: Item): Span[] => (it.name !== undefined ? [{ kind: "arg", text: `${it.name}=` }] : []);

/** An item's lines: its comments before it, its key and value, then its comma and end-of-line comment. */
function member(it: Item, indent: number, comma: boolean, path: Step[]): Line[] {
  const lines = it.before.map((c) => ownLine(indent, c));
  const body = value(it.value, indent, path);
  if (it.key) {
    // A key spread over lines (a tuple) folds on its own, a step below its item.
    const key: Line[] =
      it.key.type === "scalar"
        ? [{ indent, spans: [{ kind: it.key.kind === "repr" ? "repr" : "key", text: it.key.text }] }]
        : value(it.key, indent, [...path, KEY_STEP]);
    if (key[0].fold) key[0].fold.key = true;
    const keyEnd = key[key.length - 1];
    keyEnd.spans.push(punct(":"), { text: " " });
    if (body[0].fold) body[0].fold.bracket += keyEnd.spans.length;
    keyEnd.spans.push(...body[0].spans);
    if (body[0].fold) keyEnd.fold = body[0].fold;
    body.splice(0, 1, ...key);
  }
  if (it.name !== undefined) {
    body[0].spans.unshift(...argument(it));
    if (body[0].fold) body[0].fold.bracket++;
  }
  const last = body[body.length - 1];
  if (comma) last.spans.push(punct(","));
  if (it.after !== undefined) last.spans.push(...eol(it.after));
  return [...lines, ...body];
}

/** A line as text: its indent, then its spans. */
export const lineText = (line: Line) => "  ".repeat(line.indent) + line.spans.map((s) => s.text).join("");
