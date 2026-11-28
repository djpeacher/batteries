import { describe, expect, it } from "vitest";
import { indentEdit, type Key } from "./_indent";

/**
 * A text side written with its selection marked: `[` and `]` around a
 * selection, or a lone `|` for the cursor. Returns the plain text and the
 * selection's start and end.
 */
function parse(marked: string): { text: string; start: number; end: number } {
  const cursor = marked.indexOf("|");
  if (cursor >= 0) return { text: marked.replace("|", ""), start: cursor, end: cursor };
  const start = marked.indexOf("[");
  const end = marked.indexOf("]") - 1;
  return { text: marked.replace("[", "").replace("]", ""), start, end };
}

/** Presses a key on a marked text side and gives the result marked the same way, or null. */
function press(marked: string, key: Key): string | null {
  const { text, start, end } = parse(marked);
  const edit = indentEdit(text, start, end, key);
  if (!edit) return null;
  if (edit.start === edit.end) return edit.text.slice(0, edit.start) + "|" + edit.text.slice(edit.start);
  return edit.text.slice(0, edit.start) + "[" + edit.text.slice(edit.start, edit.end) + "]" + edit.text.slice(edit.end);
}

/** Joins lines, so a table row reads one line per array item. */
const t = (...lines: string[]) => lines.join("\n");

describe("indentEdit: Enter carries the current line's leading whitespace", () => {
  it.each([
    ["carries 2 spaces", t("a/", "  b|"), t("a/", "  b", "  |")],
    ["carries a tab", t("a/", "\tb|"), t("a/", "\tb", "\t|")],
    ["carries nothing on a flush-left line", t("a|"), t("a", "|")],
    ["never goes deeper after a trailing /", t("a/", "  src/|"), t("a/", "  src/", "  |")],
    ["carries a whitespace-only line's whitespace", t("a/", "    |"), t("a/", "    ", "    |")],
    ["splits a line mid-name, carrying the indentation", t("  ab|cd"), t("  ab", "  |cd")],
    ["carries only the whitespace before the cursor", t("  | b"), t("  ", "  | b")],
    ["replaces a selection", t("  a[bc]d"), t("  a", "  |d")],
  ])("%s", (_, before, after) => {
    expect(press(before, "Enter")).toBe(after);
  });
});

describe("indentEdit: one step is the outline's own", () => {
  it.each([
    ["takes 2 spaces from the first indented line", t("a/", "  b", "c|"), t("a/", "  b", "  c|")],
    ["takes 4 spaces from the first indented line", t("a/", "    b", "c|"), t("a/", "    b", "    c|")],
    ["takes a tab from the first indented line", t("a/", "\tb", "c|"), t("a/", "\tb", "\tc|")],
    ["takes the first indented line, not a deeper later one", t("a/", "  b/", "      c", "d|"), t("a/", "  b/", "      c", "  d|")],
    ["skips whitespace-only lines", t("a/", "      ", "  b", "c|"), t("a/", "      ", "  b", "  c|")],
    ["is a tab when no line is indented yet", t("a/", "b|"), t("a/", "\tb|")],
  ])("%s", (_, before, after) => {
    expect(press(before, "Tab")).toBe(after);
  });
});

describe("indentEdit: Tab", () => {
  it.each([
    ["moves the cursor's line from its start", t("a/", "  b", "|c"), t("a/", "  b", "  |c")],
    ["moves the cursor's line from its middle", t("a/", "  b", "c|d"), t("a/", "  b", "  c|d")],
    ["moves a line already indented one step deeper", t("a/", "  b|"), t("a/", "    b|")],
    ["adds a step even where the tree side won't change", t("a/", "  b", "  c|"), t("a/", "  b", "    c|")],
    ["moves an empty line", t("a/", "  b", "|"), t("a/", "  b", "  |")],
    ["moves every line a selection touches", t("a/", "  b", "[c", "  d]"), t("a/", "  b", "  [c", "    d]")],
    ["moves lines a selection touches partway", t("a/", "  b", "c[c", "d]d"), t("a/", "  b", "  c[c", "  d]d")],
    ["moves a mixed selection's lines alike", t("a/", "  [b", "c", "    d]"), t("a/", "    [b", "  c", "      d]")],
    ["leaves a line the selection ends at the start of", t("a/", "  b", "[c", "]d"), t("a/", "  b", "  [c", "]d")],
    ["covers a selection's indentation when it starts at a line's start", t("a/", "[  b]"), t("a/", "  [  b]")],
  ])("%s", (_, before, after) => {
    expect(press(before, "Tab")).toBe(after);
  });
});

describe("indentEdit: Shift-Tab", () => {
  it.each([
    ["removes one step from the cursor's line", t("a/", "  b", "    c|"), t("a/", "  b", "  c|")],
    ["removes a tab step", t("a/", "\tb", "\t\tc|"), t("a/", "\tb", "\tc|")],
    ["removes no more than the line has", t("a/", "    b", "  c|"), t("a/", "    b", "c|")],
    ["sends a single stray space flush left", t("a/", "  b", " c|"), t("a/", "  b", "c|")],
    ["removes 4 spaces for a tab step", t("a/", "\tb", "    c|"), t("a/", "\tb", "c|")],
    ["leaves flush-left lines while moving the others", t("a/", "  [b", "c", "    d]"), t("a/", "[b", "c", "  d]")],
    ["leaves a line the selection ends at the start of", t("a/", "  [b", "]  c"), t("a/", "[b", "]  c")],
    ["moves a cursor inside the removed whitespace to the line's start", t("a/", "  b", " | c"), t("a/", "  b", "|c")],
  ])("%s", (_, before, after) => {
    expect(press(before, "Shift-Tab")).toBe(after);
  });

  it.each([
    ["a flush-left line", t("a/", "  b", "c|")],
    ["a selection of flush-left lines", t("[a/", "b]", "  c")],
    ["an empty text side", "|"],
  ])("changes nothing on %s", (_, before) => {
    expect(press(before, "Shift-Tab")).toBeNull();
  });

  it.each([
    ["one line", t("a/", "  b", "  c|")],
    ["a mixed selection", t("a/", "  b", "  [c", "d", "    e]")],
    ["a tab outline", t("a/", "\tb", "\t[c", "\t\td]")],
  ])("undoes Tab exactly, below the first indented line, on %s", (_, before) => {
    expect(press(press(before, "Tab")!, "Shift-Tab")).toBe(before);
  });
});
