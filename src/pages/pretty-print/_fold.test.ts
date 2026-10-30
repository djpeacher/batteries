import { describe, expect, it } from "vitest";
import { format } from "./_format";
import { lineText } from "./_print";
import { copiedText, foldAll, foldable, NO_FOLDS, pathKey, reconcile, toggle, visibleRows, type Folds } from "./_fold";

function lines(input: string) {
  const f = format(input);
  if (f.kind !== "formatted") throw new Error("expected formatted output");
  return f.lines;
}
/** The formatted side's rows as text, with these folds. */
const visible = (input: string, folds: Folds) => visibleRows(lines(input), folds).map(lineText);

const USER = `{"id":1,"user":{"name":"Ada","tags":["a","b"]},"ok":true}`;

describe("fold state", () => {
  it("shows every line when nothing is folded", () => {
    expect(visible(USER, NO_FOLDS)).toEqual(lines(USER).map(lineText));
  });

  it("folds an item to one line: its key, the marker, its comma and its count", () => {
    expect(visible(USER, toggle(NO_FOLDS, [`"user"`]))).toEqual([`{`, `  "id": 1,`, `  "user": {…}, 2 keys`, `  "ok": true`, `}`]);
  });

  it("unfolds it again", () => {
    const folded = toggle(NO_FOLDS, [`"user"`]);
    expect(visible(USER, toggle(folded, [`"user"`]))).toEqual(visible(USER, NO_FOLDS));
  });

  it("keeps an inner fold under a folded outer item, and shows it once the outer opens", () => {
    const inner = toggle(NO_FOLDS, [`"user"`, `"tags"`]);
    expect(visible(USER, inner)).toContain(`    "tags": […] 2 items`);
    const both = toggle(inner, [`"user"`]);
    expect(visible(USER, both)).toHaveLength(5);
    expect(visible(USER, toggle(both, [`"user"`]))).toEqual(visible(USER, inner));
  });

  it("folds an opened call to its name and (…), with its arguments counted as items", () => {
    const input = "{'d': OrderedDict([('a', 1)]), 'p': P(1, x=[2])}";
    const folds = toggle(toggle(NO_FOLDS, [`'d'`]), [`'p'`]);
    expect(visible(input, folds)).toEqual([`{`, `  'd': OrderedDict(…), 1 item`, `  'p': P(…) 2 items`, `}`]);
  });

  it("folds a named argument after its name=", () => {
    expect(visible("P(x=[2])", toggle(NO_FOLDS, ["x"]))).toEqual([`P(`, `  x=[…] 1 item`, `)`]);
  });

  it("folds the outermost value to one line", () => {
    expect(visible(USER, toggle(NO_FOLDS, []))).toEqual([`{…} 3 keys`]);
  });

  it("keeps what follows the closing bracket: parentheses, comma and end-of-line comment", () => {
    const input = `{'a': ({'x': 1}),  # note\n 'b': (1,)}`;
    expect(visible(input, toggle(NO_FOLDS, [`'a'`]))[1]).toBe(`  'a': ({…}), 1 key  # note`);
    expect(visible(input, toggle(NO_FOLDS, [`'b'`]))[4]).toBe(`  'b': (…) 1 item`);
  });

  it("does nothing for a path with no item", () => {
    expect(visible(USER, toggle(NO_FOLDS, [`"nope"`]))).toEqual(visible(USER, NO_FOLDS));
  });
});

/** Folds after formatting `input`, as the page keeps them: reconciled against each new output. */
const after = (folds: Folds, input: string) => reconcile(folds, format(input));

const NESTED = `{"a":{"b":{"c":1}},"list":[[1,2],{"x":[3]}],"n":0}`;

describe("Fold all and Unfold all", () => {
  it("Fold all leaves the outermost value open and folds every item under it", () => {
    expect(visible(NESTED, foldAll(lines(NESTED)))).toEqual([`{`, `  "a": {…}, 1 key`, `  "list": […], 2 items`, `  "n": 0`, `}`]);
  });

  it("Fold all folds the inner items too, so opening one shows its children folded", () => {
    const folds = toggle(foldAll(lines(NESTED)), [`"list"`]);
    expect(visible(NESTED, folds)).toEqual([`{`, `  "a": {…}, 1 key`, `  "list": [`, `    […], 2 items`, `    {…} 1 key`, `  ],`, `  "n": 0`, `}`]);
  });

  it("Fold all on a root in parentheses leaves the value inside them open", () => {
    const input = `({'a': {'b': 1}})`;
    expect(visible(input, foldAll(lines(input)))).toEqual([`({`, `  'a': {…} 1 key`, `})`]);
  });

  it("Unfold all opens every item", () => {
    expect(visible(NESTED, NO_FOLDS)).toEqual(lines(NESTED).map(lineText));
    expect(visible(NESTED, NO_FOLDS)).toHaveLength(lines(NESTED).length);
  });

  it("offers nothing to fold for blank text, a scalar or one-line output", () => {
    expect(foldable([])).toBe(false);
    expect(foldable(lines(`42`))).toBe(false);
    expect(foldable(lines(`{}`))).toBe(false);
    expect(foldable(lines(USER))).toBe(true);
  });
});

describe("folds that last", () => {
  const FOLD_USER = toggle(NO_FOLDS, [`"user"`]);

  it("keeps a fold on key user while a value elsewhere is edited", () => {
    const edited = `{"id":2,"extra":[1,2],"user":{"name":"Ada","tags":["a","b"]},"ok":false}`;
    expect(visible(edited, after(FOLD_USER, edited))).toContain(`  "user": {…}, 2 keys`);
  });

  it("drops the fold once user is deleted, so a user added back shows open", () => {
    const without = `{"id":1,"ok":true}`;
    const folds = after(FOLD_USER, without);
    expect(folds.size).toBe(0);
    expect(visible(USER, after(folds, USER))).toEqual(lines(USER).map(lineText));
  });

  it("drops a fold whose item now prints on one line", () => {
    expect(after(FOLD_USER, `{"user":{}}`).size).toBe(0);
  });

  it("keeps folds while the text is broken and brings them back once it reads", () => {
    const broken = `{"id":1,"user":{"name":"Ada","tags":["a","b"]},"ok":tru}`;
    const kept = after(FOLD_USER, broken);
    expect(visible(USER, after(kept, USER))).toContain(`  "user": {…}, 2 keys`);
  });

  it("drops, once the text reads again, the folds whose item went while it was broken", () => {
    const folds = after(after(toggle(FOLD_USER, [`"id"`]), `{"id":1,"user":`), `{"user":{"a":1,"b":2}}`);
    expect([...folds]).toEqual([pathKey([`"user"`])]);
  });

  it("drops every fold when the text is cleared", () => {
    expect(after(FOLD_USER, ``).size).toBe(0);
  });
});

describe("copying a selection", () => {
  it("copies a folded item's full contents, never the marker", () => {
    const rows = visibleRows(lines(USER), toggle(NO_FOLDS, [`"user"`]));
    expect(copiedText(lines(USER), rows, 1, 2)).toBe(
      [`  "id": 1,`, `  "user": {`, `    "name": "Ada",`, `    "tags": [`, `      "a",`, `      "b"`, `    ]`, `  },`].join("\n"),
    );
  });

  it("copies from the first selected row to the last, whichever way the selection ran", () => {
    const rows = visibleRows(lines(NESTED), foldAll(lines(NESTED)));
    expect(copiedText(lines(NESTED), rows, 3, 2)).toBe(lines(NESTED).slice(6, -1).map(lineText).join("\n"));
  });
});

describe("a dict key spread over lines", () => {
  const KEY = `{(1, 2): 3, 'b': 4}`;
  const BOTH = `{(1, 2): [3, 4]}`;
  /** The fold of the key opening on `line` of `input`'s formatted lines. */
  const keyFold = (input: string, line: number) => lines(input)[line].fold!;

  it("has a fold toggle of its own, on the line it opens", () => {
    expect(lines(KEY)[1].fold).toMatchObject({ first: 1, last: 4, count: 2, unit: "item" });
  });

  it("folds to its marker and count, then its colon and value", () => {
    expect(visible(KEY, toggle(NO_FOLDS, keyFold(KEY, 1).path))).toEqual([`{`, `  (…) 2 items: 3,`, `  'b': 4`, `}`]);
  });

  it("folds on its own while its value stays open", () => {
    expect(visible(BOTH, toggle(NO_FOLDS, keyFold(BOTH, 1).path))).toEqual([`{`, `  (…) 2 items: [`, `    3,`, `    4`, `  ]`, `}`]);
  });

  it("folds with its value to one row under Fold all", () => {
    expect(visible(BOTH, foldAll(lines(BOTH)))).toEqual([`{`, `  (…) 2 items: […] 2 items`, `}`]);
  });

  it("copies the key's and the value's full lines from that one row", () => {
    const rows = visibleRows(lines(BOTH), foldAll(lines(BOTH)));
    expect(copiedText(lines(BOTH), rows, 1, 1)).toBe(lines(BOTH).slice(1, -1).map(lineText).join("\n"));
  });

  it("keeps its fold apart from its value's folds", () => {
    const value = lines(BOTH)[4].fold!.path;
    expect(pathKey(keyFold(BOTH, 1).path)).not.toBe(pathKey(value));
    expect(visible(BOTH, toggle(NO_FOLDS, value))).toEqual([`{`, `  (`, `    1,`, `    2`, `  ): […] 2 items`, `}`]);
  });
});
