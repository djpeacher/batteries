import { describe, expect, it } from "vitest";
import type { EditKey, KeyEdit } from "../../scripts/textbox";
import { indentEdit, indenter } from "./_indent";

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

/**
 * Presses a key on a marked text side and gives the result marked the same
 * way, or null. `keys` is the key editor, a fresh measure by default.
 */
function press(marked: string, key: EditKey, keys: KeyEdit = indentEdit): string | null {
  const { text, start, end } = parse(marked);
  const edit = keys(text, start, end, key);
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

describe("indentEdit: the indent step is the outline's own", () => {
  it.each([
    ["takes 2 spaces from a line 2 deeper than its parent", t("a/", "  b", "c|"), t("a/", "  b", "  c|")],
    ["takes 4 spaces from a line 4 deeper than its parent", t("a/", "    b", "c|"), t("a/", "    b", "    c|")],
    ["takes a tab from a line a tab deeper than its parent", t("a/", "\tb", "c|"), t("a/", "\tb", "\tc|")],
    ["takes a tab from tab lines nested two deep", t("a/", "\tb/", "\t\tc", "d|"), t("a/", "\tb/", "\t\tc", "\td|")],
    ["takes the smallest gap between a line and its parent", t("a/", "    b/", "      c", "d|"), t("a/", "    b/", "      c", "  d|")],
    ["takes the smallest gap, not a deeper later line's", t("a/", "  b/", "      c", "d|"), t("a/", "  b/", "      c", "  d|")],
    ["skips whitespace-only lines", t("a/", "      ", "  b", "c|"), t("a/", "      ", "  b", "  c|")],
    ["takes an indented top-level line's whitespace when no line has a parent", t("  a/", "b|"), t("  a/", "  b|")],
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

describe("indenter: the indent step holds through a run of Tab and Shift-Tab", () => {
  const sample = t("my-app/", "  src|/", "    index.ts", "  README.md");

  it("undoes a Tab on the first indented line exactly", () => {
    const keys = indenter();
    expect(press(press(sample, "Tab", keys)!, "Shift-Tab", keys)).toBe(sample);
  });

  it("adds the same step on each of repeated Tabs on the first indented line", () => {
    const keys = indenter();
    let text = sample;
    for (let i = 0; i < 3; i++) text = press(text, "Tab", keys)!;
    expect(text).toBe(t("my-app/", "        src|/", "    index.ts", "  README.md"));
  });

  it("undoes Tab exactly on an outline with only one indented line", () => {
    const keys = indenter();
    const before = t("a/", "  b|");
    const tabbed = press(before, "Tab", keys)!;
    expect(tabbed).toBe(t("a/", "    b|"));
    expect(press(tabbed, "Shift-Tab", keys)).toBe(before);
  });

  it("measures the step again after a typed edit", () => {
    const keys = indenter();
    expect(press(t("a/", "  b|"), "Tab", keys)).toBe(t("a/", "    b|"));
    // Typing "x" ends the run: the only gap is now 4 spaces.
    expect(press(t("a/", "    bx|"), "Tab", keys)).toBe(t("a/", "        bx|"));
  });
});
