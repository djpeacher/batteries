import { describe, expect, it } from "vitest";
import { compare } from "./_compare";

describe("compare: one side empty", () => {
  it("shows every new line as added when the old side is empty", () => {
    const c = compare("", "alpha\nbeta\n");
    expect(c.status).toBe("diff");
    expect(c.added).toBe(2);
    expect(c.removed).toBe(0);
    expect(c.split).toEqual([
      { type: "change", old: null, new: { number: 1, text: "alpha", segments: null } },
      { type: "change", old: null, new: { number: 2, text: "beta", segments: null } },
    ]);
    expect(c.combined).toEqual([
      { type: "added", newNo: 1, text: "alpha", segments: null },
      { type: "added", newNo: 2, text: "beta", segments: null },
    ]);
  });
});

describe("compare: one side empty, the other way", () => {
  it("shows every old line as removed when the new side is empty", () => {
    const c = compare("alpha\nbeta", "");
    expect(c.added).toBe(0);
    expect(c.removed).toBe(2);
    expect([c.added, c.removed]).toEqual([0, 2]);
    expect(c.split).toEqual([
      { type: "change", old: { number: 1, text: "alpha", segments: null }, new: null },
      { type: "change", old: { number: 2, text: "beta", segments: null }, new: null },
    ]);
    expect(c.combined).toEqual([
      { type: "removed", oldNo: 1, text: "alpha", segments: null },
      { type: "removed", oldNo: 2, text: "beta", segments: null },
    ]);
  });
});

describe("compare: the change count", () => {
  it("counts a changed line as one added and one removed", () => {
    const c = compare("one\ntwo\nthree\n", "one\n2\nthree\n");
    expect(c.added).toBe(1);
    expect(c.removed).toBe(1);
    expect([c.added, c.removed]).toEqual([1, 1]);
  });

  it("adds changed, added and removed lines up GitHub-style", () => {
    // The sample pair: line 2 changed, line 3 removed, a line added at the end.
    const c = compare("a\nb\nc\nd\n", "a\nB\nd\ne\n");
    expect([c.added, c.removed]).toEqual([2, 2]);
  });

  it("is empty when there are no differences", () => {
    const c = compare("same\ntext\n", "same\ntext\n");
    expect(c.status).toBe("identical");
    expect(c.message).toBe("No differences");
    expect(c.added).toBe(0);
    expect(c.removed).toBe(0);
    expect(c.status).not.toBe("diff");
  });

  it("gives line totals that ignore a trailing newline", () => {
    const c = compare("a\nb\n", "a\nb\nc");
    expect(c.oldLines).toBe(2);
    expect(c.newLines).toBe(3);
  });
});

describe("compare: line endings", () => {
  it("never shows CRLF against LF as a change", () => {
    const c = compare("one\r\ntwo\r\n", "one\ntwo\n");
    expect(c.status).toBe("identical");
    expect(c.status).not.toBe("diff");
  });

  it("treats old Mac CR endings as line breaks too", () => {
    expect(compare("one\rtwo", "one\ntwo").status).toBe("identical");
  });
});

describe("compare: changed words", () => {
  it("pairs a changed line with its replacement and marks the changed words", () => {
    const c = compare("Each battery runs in your browser.", "Each battery runs entirely in your browser.");
    expect(c.split).toEqual([
      {
        type: "change",
        old: { number: 1, text: "Each battery runs in your browser.", segments: [{ text: "Each battery runs in your browser.", changed: false }] },
        new: {
          number: 1,
          text: "Each battery runs entirely in your browser.",
          segments: [
            { text: "Each battery runs ", changed: false },
            { text: "entirely", changed: true },
            { text: " in your browser.", changed: false },
          ],
        },
      },
    ]);
  });

  it("highlights a run of changed words, and the spaces inside it, as one", () => {
    const c = compare("the quick brown fox", "the slow red fox");
    const row = c.split[0];
    expect(row.type).toBe("change");
    if (row.type !== "change") return;
    expect(row.old?.segments).toEqual([
      { text: "the ", changed: false },
      { text: "quick brown", changed: true },
      { text: " fox", changed: false },
    ]);
    expect(row.new?.segments).toEqual([
      { text: "the ", changed: false },
      { text: "slow red", changed: true },
      { text: " fox", changed: false },
    ]);
  });

  it("still marks a space when the space is all that changed", () => {
    const c = compare("a b", "a   b");
    const row = c.split[0];
    if (row.type !== "change") throw new Error("expected a change row");
    expect(row.new?.segments).toEqual([
      { text: "a", changed: false },
      { text: "   ", changed: true },
      { text: "b", changed: false },
    ]);
  });

  it("carries the same segments into the combined rows", () => {
    const c = compare("x = 1", "x = 2");
    expect(c.combined).toEqual([
      { type: "removed", oldNo: 1, text: "x = 1", segments: [{ text: "x = ", changed: false }, { text: "1", changed: true }] },
      { type: "added", newNo: 1, text: "x = 2", segments: [{ text: "x = ", changed: false }, { text: "2", changed: true }] },
    ]);
  });
});

describe("compare: unpaired lines", () => {
  it("leaves the other side empty (grey filler) for a line with no partner", () => {
    const c = compare("keep\nold one\nkeep too\n", "keep\nnew one\nnew two\nkeep too\n");
    expect(c.split).toEqual([
      { type: "same", old: { number: 1, text: "keep", segments: null }, new: { number: 1, text: "keep", segments: null } },
      {
        type: "change",
        old: { number: 2, text: "old one", segments: [{ text: "old", changed: true }, { text: " one", changed: false }] },
        new: { number: 2, text: "new one", segments: [{ text: "new", changed: true }, { text: " one", changed: false }] },
      },
      { type: "change", old: null, new: { number: 3, text: "new two", segments: null } },
      { type: "same", old: { number: 3, text: "keep too", segments: null }, new: { number: 4, text: "keep too", segments: null } },
    ]);
  });
});

/** Lines "L1".."Ln", one per line. */
const numbered = (n: number, from = 1) => Array.from({ length: n }, (_, i) => `L${from + i}`);
const text = (lines: string[]) => lines.join("\n") + "\n";
const kinds = (rows: { type: string }[]) => rows.map((r) => r.type).join(" ");

describe("compare: folding", () => {
  it("keeps 3 lines of context on each side of a change and folds the run between", () => {
    // Changes at line 1 and line 12; lines 2–11 unchanged (10 lines).
    const old = text(["a", ...numbered(10, 2), "b"]);
    const neu = text(["A", ...numbered(10, 2), "B"]);
    const c = compare(old, neu);
    expect(kinds(c.split)).toBe("change same same same fold same same same change");
    const fold = c.split[4];
    expect(fold).toEqual({ type: "fold", id: expect.any(String), count: 4, label: "Show 4 unchanged lines", position: "middle" });
    const after = c.split[5];
    if (after.type !== "same") throw new Error("expected a same row");
    expect(after.old.number).toBe(9);
  });
});

describe("compare: fold positions and labels", () => {
  // One change at line 8 of 15: 7 unchanged lines above it, 7 below.
  const old = text([...numbered(7), "x", ...numbered(7, 9)]);
  const neu = text([...numbered(7), "X", ...numbered(7, 9)]);

  it("folds the start and the end, keeping 3 lines next to the change only", () => {
    const c = compare(old, neu);
    expect(kinds(c.split)).toBe("fold same same same change same same same fold");
    expect(c.split[0]).toMatchObject({ type: "fold", count: 4, label: "Show 4 unchanged lines", position: "start" });
    expect(c.split[8]).toMatchObject({ type: "fold", count: 4, label: "Show 4 unchanged lines", position: "end" });
    expect(c.split[1]).toMatchObject({ old: { number: 5 }, new: { number: 5 } });
  });

  it("puts the same fold rows in the combined rows", () => {
    const c = compare(old, neu);
    expect(kinds(c.combined)).toBe("fold same same same removed added same same same fold");
    expect(c.combined[0]).toEqual(c.split[0]);
    expect(c.combined[9]).toEqual(c.split[8]);
  });

  it('says "line" for a single hidden line', () => {
    // 4 unchanged lines before the change: 3 kept, 1 folded.
    const c = compare(text([...numbered(4), "x"]), text([...numbered(4), "X"]));
    expect(c.split[0]).toMatchObject({ type: "fold", count: 1, label: "Show 1 unchanged line", position: "start" });
  });

  it("doesn't fold a run no longer than its context", () => {
    // 6 unchanged lines between two changes: 3 + 3 kept, nothing hidden.
    const c = compare(text(["a", ...numbered(6), "b"]), text(["A", ...numbered(6), "B"]));
    expect(c.split.some((r) => r.type === "fold")).toBe(false);
    expect(c.split).toHaveLength(8);
  });

  it("gives every fold a different id", () => {
    const c = compare(old, neu);
    const ids = c.split.flatMap((r) => (r.type === "fold" ? [r.id] : []));
    expect(new Set(ids).size).toBe(2);
  });
});

describe("compare: expanding a fold", () => {
  const old = text([...numbered(7), "x", ...numbered(7, 9)]);
  const neu = text([...numbered(7), "X", ...numbered(7, 9)]);

  it("shows the hidden lines of the fold whose id is expanded, and keeps the others folded", () => {
    const folded = compare(old, neu);
    const start = folded.split[0];
    if (start.type !== "fold") throw new Error("expected a fold row");
    const c = compare(old, neu, { expanded: new Set([start.id]) });
    expect(kinds(c.split)).toBe("same same same same same same same change same same same fold");
    expect(c.split.slice(0, 7).map((r) => (r.type === "same" ? r.old.number : 0))).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(kinds(c.combined)).toBe("same same same same same same same removed added same same same fold");
  });

  it("ignores an expanded id that names no fold", () => {
    const c = compare(old, neu, { expanded: new Set(["nothing"]) });
    expect(kinds(c.split)).toBe("fold same same same change same same same fold");
  });
});

describe("compare: combined order", () => {
  it("puts every removed line of a change above the added lines that replace it", () => {
    const c = compare("keep\nold 1\nold 2\nkeep\n", "keep\nnew 1\nnew 2\nnew 3\nkeep\n");
    expect(c.combined.map((r) => (r.type === "fold" ? "fold" : `${r.type} ${r.text}`))).toEqual([
      "same keep",
      "removed old 1",
      "removed old 2",
      "added new 1",
      "added new 2",
      "added new 3",
      "same keep",
    ]);
  });
});

describe("compare: ignore whitespace", () => {
  const ws = { ignoreWhitespace: true };

  it("ignores indentation, runs of spaces and trailing spaces", () => {
    const c = compare("if (a) {\n  return  b;\n}\n", "if (a) {\n\treturn b;   \n}\n", ws);
    expect(c.status).toBe("identical");
    expect(c.status).not.toBe("diff");
  });

  it("still counts an added or removed blank line", () => {
    const added = compare("one\ntwo\n", "one\n\ntwo\n", ws);
    expect(added.status).toBe("diff");
    expect([added.added, added.removed]).toEqual([1, 0]);
    const removed = compare("one\n\ntwo\n", "one\ntwo\n", ws);
    expect([removed.added, removed.removed]).toEqual([0, 1]);
  });

  it("treats a line of spaces as a blank line", () => {
    expect(compare("one\n   \ntwo", "one\n\ntwo", ws).status).toBe("identical");
  });

  it("shows the original text of lines it matched", () => {
    const c = compare("  keep\nold\n", "keep  \nnew\n", ws);
    expect(c.split[0]).toEqual({
      type: "same",
      old: { number: 1, text: "  keep", segments: null },
      new: { number: 1, text: "keep  ", segments: null },
    });
    expect(c.combined[0]).toEqual({ type: "same", oldNo: 1, newNo: 1, text: "keep  " });
  });

  it("still shows a change in the words", () => {
    const c = compare("a  b\n", "a c\n", ws);
    expect([c.added, c.removed]).toEqual([1, 1]);
    expect(c.split[0]).toMatchObject({ type: "change", old: { text: "a  b" }, new: { text: "a c" } });
  });

  it("is off by default", () => {
    expect(compare("a\n", " a\n").status).toBe("diff");
  });
});

describe("compare: ignore case", () => {
  it("compares lines case-folded and shows the original text", () => {
    const c = compare("Hello World\nx\n", "hello world\ny\n", { ignoreCase: true });
    expect([c.added, c.removed]).toEqual([1, 1]);
    expect(c.split[0]).toEqual({
      type: "same",
      old: { number: 1, text: "Hello World", segments: null },
      new: { number: 1, text: "hello world", segments: null },
    });
  });

  it("is off by default", () => {
    expect(compare("A\n", "a\n").status).toBe("diff");
  });

  it("does not ignore whitespace", () => {
    expect(compare("A\n", " a\n", { ignoreCase: true }).status).toBe("diff");
  });
});

describe("compare: both toggles together", () => {
  it("ignores spacing and case at once", () => {
    const c = compare("  Hello   World\n", "hello world\n", { ignoreWhitespace: true, ignoreCase: true });
    expect(c.status).toBe("identical");
  });

  it("still counts blank lines", () => {
    const c = compare("A\n", "a\n\n", { ignoreWhitespace: true, ignoreCase: true });
    expect([c.added, c.removed]).toEqual([1, 0]);
  });
});

describe("compare: changed words under the ignore toggles", () => {
  const words = (c: ReturnType<typeof compare>) => {
    const row = c.split[0];
    if (row.type !== "change") throw new Error(`expected a change row, got ${row.type}`);
    return [row.old?.segments, row.new?.segments];
  };

  it("marks a word whose case alone changed when ignore case is off", () => {
    expect(words(compare("Hello there x\n", "hello there y\n"))).toEqual([
      [{ text: "Hello", changed: true }, { text: " there ", changed: false }, { text: "x", changed: true }],
      [{ text: "hello", changed: true }, { text: " there ", changed: false }, { text: "y", changed: true }],
    ]);
  });

  it("doesn't mark a word whose case alone changed when ignore case is on", () => {
    expect(words(compare("Hello World foo\n", "hello world bar\n", { ignoreCase: true }))).toEqual([
      [{ text: "Hello World ", changed: false }, { text: "foo", changed: true }],
      [{ text: "hello world ", changed: false }, { text: "bar", changed: true }],
    ]);
  });

  it("doesn't mark a run of spaces that only changed length when ignore whitespace is on", () => {
    expect(words(compare("a   b  c\n", "a b d\n", { ignoreWhitespace: true }))).toEqual([
      [{ text: "a   b  ", changed: false }, { text: "c", changed: true }],
      [{ text: "a b ", changed: false }, { text: "d", changed: true }],
    ]);
  });

  it("doesn't mark indentation or trailing spaces when ignore whitespace is on", () => {
    expect(words(compare("  x y  \n", "x z\n", { ignoreWhitespace: true }))).toEqual([
      [{ text: "  x ", changed: false }, { text: "y", changed: true }, { text: "  ", changed: false }],
      [{ text: "x ", changed: false }, { text: "z", changed: true }],
    ]);
  });

  it("still marks a space added between two words when ignore whitespace is on", () => {
    expect(words(compare("a(b\n", "a (b\n", { ignoreWhitespace: true }))).toEqual([
      [{ text: "a(b", changed: false }],
      [{ text: "a", changed: false }, { text: " ", changed: true }, { text: "(b", changed: false }],
    ]);
  });
});

describe("compare: the no-differences message", () => {
  const both = { ignoreWhitespace: true, ignoreCase: true };

  it("has no note when the texts match as written, toggles on or not", () => {
    expect(compare("a\n", "a\n", both).message).toBe("No differences");
    expect(compare("a\r\n", "a\n", both).message).toBe("No differences");
  });

  it("notes whitespace when ignoring it made the match", () => {
    expect(compare("a\n", " a\n", { ignoreWhitespace: true }).message).toBe("No differences (ignoring whitespace)");
  });

  it("notes case when ignoring it made the match", () => {
    expect(compare("A\n", "a\n", { ignoreCase: true }).message).toBe("No differences (ignoring case)");
  });

  it("notes both when both were needed", () => {
    expect(compare(" A\n", "a\n", both).message).toBe("No differences (ignoring whitespace and case)");
  });

  it("notes only the toggle that made the match when both are on", () => {
    expect(compare("A\n", "a\n", both).message).toBe("No differences (ignoring case)");
    expect(compare("a\n", "a \n", both).message).toBe("No differences (ignoring whitespace)");
  });

  it("is empty when there are differences", () => {
    expect(compare("a\n", "b\n", both).message).toBe("");
  });
});

describe("compare: the time limit", () => {
  // Two long texts with no line in common: thousands of edits to find.
  const big = (tag: string) => Array.from({ length: 4000 }, (_, i) => `${tag} line ${i} ${(i * 7919) % 4001}`).join("\n");
  const oldText = big("old");
  const newText = big("new");

  it("gives up past a tiny limit and says it's too large to compare live", () => {
    const c = compare(oldText, newText, { timeLimit: 1 });
    expect(c.status).toBe("too-large");
    expect(c.message).toBe("Too large to compare live");
    expect(c.status).not.toBe("diff");
    expect(c.split).toEqual([]);
    expect(c.combined).toEqual([]);
    expect(c.oldLines).toBe(4000);
    expect(c.newLines).toBe(4000);
  });

  it("compares in full with no limit", () => {
    const c = compare(oldText, newText);
    expect(c.status).toBe("diff");
    expect(c.added).toBe(4000);
    expect(c.removed).toBe(4000);
    expect([c.added, c.removed]).toEqual([4000, 4000]);
    expect(c.split).toHaveLength(4000);
    expect(c.combined).toHaveLength(8000);
  });

  it("compares in full when the input fits in the limit", () => {
    const c = compare("one\ntwo\n", "one\n2\n", { timeLimit: 400 });
    expect(c.status).toBe("diff");
    expect([c.added, c.removed]).toEqual([1, 1]);
  });
});
