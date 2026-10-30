import { describe, expect, it } from "vitest";
import { format } from "./_format";
import { lineWindow, rowAtHeight, renderError, renderLines, renderNotice } from "./_render";
import { NO_FOLDS, toggle, visibleRows } from "./_fold";

function html(input: string): string {
  const f = format(input);
  if (f.kind !== "formatted") throw new Error("expected formatted output");
  return renderLines(f.lines);
}
const ENTITIES: Record<string, string> = { "&quot;": '"', "&#39;": "'", "&lt;": "<", "&gt;": ">", "&amp;": "&" };
const strip = (s: string) => s.replace(/<[^>]*>/g, "").replace(/&(?:quot|#39|lt|gt|amp);/g, (e) => ENTITIES[e]);

describe("renderLines", () => {
  it("draws one line per formatted line, reading as the formatted text", () => {
    const out = html(`{"a":[1]}`);
    expect(out.match(/class="pp-line"/g)).toHaveLength(5);
    expect(out.split("</div>").map(strip).filter(Boolean)).toEqual([`{`, `  "a": [`, `    1`, `  ]`, `}`]);
  });

  it("colours each span by its kind", () => {
    expect(html(`{"k":"v"}`)).toContain(`<span class="key">&quot;k&quot;</span><span class="punct">:</span> <span class="str">&quot;v&quot;</span>`);
  });

  it("escapes markup in strings", () => {
    expect(strip(html(`["<b>&amp;"]`))).toContain(`"<b>&amp;"`);
    expect(html(`["<b>"]`)).not.toContain("<b>");
  });
});

describe("renderError", () => {
  function panel(input: string): string {
    const f = format(input);
    if (f.kind !== "error") throw new Error("expected an error");
    return renderError(f, input);
  }
  /** The panel's text, one entry per row: header, excerpt lines, caret line. */
  const rows = (out: string) => out.split(/(?=<(?:div|span) class="pp-err-(?:head|ln))/).slice(1).map(strip);

  it("is an alert naming the problem, the language and the 1-based line and column", () => {
    const out = panel(`{\n  "a": 1,\n  "b" 2\n}`);
    expect(out).toContain(`role="alert"`);
    expect(rows(out)[0]).toBe("Expected ':' after a keyJSON · line 3, column 7");
  });

  it("shows the bad line between its neighbours, numbered as on the text side, with the caret under the column", () => {
    const out = panel(`{\n  "a": 1,\n  "b" 2\n}`);
    expect(rows(out).slice(1)).toEqual([
      ` 2  "a": 1,`,
      ` 3  "b" 2`,
      `        ^ expected ':' after a key`,
      ` 4}`,
    ]);
    expect(out).toMatch(/class="pp-err-ln bad"><span class="n"> 3<\/span>/);
  });

  it("shows only the lines that exist at the first and last line", () => {
    expect(rows(panel(`[1,,]`)).slice(1)).toEqual([` 1[1,,]`, `     ^ expected a value`]);
    expect(rows(panel(`[1,\n2`)).slice(1)).toEqual([` 1[1,`, ` 22`, `   ^ expected ',' or ']'`]);
  });

  it("keeps tabs before the column so the caret lines up", () => {
    expect(rows(panel(`{\n\t"a" 1}`))[3]).toBe(`  \t    ^ expected ':' after a key`);
  });

  it("widens the line numbers past 99 lines", () => {
    const input = "[\n" + "1,\n".repeat(99) + "x]";
    expect(rows(panel(input)).slice(1, 3)).toEqual([`1001,`, `101x]`]);
  });

  it("escapes markup in the excerpt and the message", () => {
    const out = panel(`["<b>", <]`);
    expect(out).not.toContain("<b>");
    expect(strip(out)).toContain(`["<b>", <]`);
  });
});

describe("renderError: language", () => {
  it("names the language of the reader that got further", () => {
    const f = format(`{'name': 'Ada', 'age': }`);
    if (f.kind !== "error") throw new Error("expected an error");
    expect(strip(renderError(f, `{'name': 'Ada', 'age': }`))).toContain("Expected a valuePython · line 1, column 24");
  });
});

describe("renderLines: Python", () => {
  it("colours comments and set()", () => {
    const out = html(`{'a': set(),  # empty\n}`);
    expect(out).toContain(`<span class="comment"># empty</span>`);
    expect(out).toContain(`<span class="call">set</span><span class="punct">()</span>`);
  });
});

describe("rowAtHeight", () => {
  // 20px lines, counted from the top of the first line.
  it("gives the row a height falls in", () => {
    expect(rowAtHeight(0, 20, 100)).toBe(0);
    expect(rowAtHeight(19.9, 20, 100)).toBe(0);
    expect(rowAtHeight(1010, 20, 100)).toBe(50);
  });

  it("gives the first row above the lines and the last below them", () => {
    expect(rowAtHeight(-16, 20, 100)).toBe(0);
    expect(rowAtHeight(5000, 20, 100)).toBe(99);
  });
});

describe("lineWindow", () => {
  // 20px lines, a 100px view: five lines show, OVERSCAN (10) more either side.
  it("covers the lines in view plus the overscan either side", () => {
    expect(lineWindow(1000, 100, 20, 10_000)).toEqual({ start: 40, end: 65 });
  });

  it("counts a line cut off at the view's edge as in view", () => {
    expect(lineWindow(1010, 100, 20, 10_000)).toEqual({ start: 40, end: 66 });
  });

  it("stops at the first and last line", () => {
    expect(lineWindow(0, 100, 20, 10_000)).toEqual({ start: 0, end: 15 });
    expect(lineWindow(-16, 100, 20, 10_000)).toEqual({ start: 0, end: 15 });
    expect(lineWindow(199_900, 100, 20, 10_000)).toEqual({ start: 9985, end: 10_000 });
    expect(lineWindow(0, 100, 20, 3)).toEqual({ start: 0, end: 3 });
  });
});

describe("renderLines: fold gutter", () => {
  function rows(input: string, ...paths: (string | number)[][]) {
    const f = format(input);
    if (f.kind !== "formatted") throw new Error("expected formatted output");
    return visibleRows(f.lines, paths.reduce(toggle, NO_FOLDS));
  }
  /** Each drawn line's text, and its toggle's state if it has one. */
  const drawn = (out: string) =>
    out.split(/(?=<div class="pp-line)/).filter(Boolean).map((l) => {
      const toggle = l.match(/<button type="button" class="pp-fold" aria-expanded="(true|false)" aria-label="(Fold|Unfold)"/);
      return [strip(l), toggle ? `${toggle[2]} ${toggle[1]}` : ""];
    });

  it("puts an open fold toggle beside each line that opens a multi-line item, and none beside the rest", () => {
    expect(drawn(renderLines(rows(`{"a":[1],"b":{},"c":set()}`)))).toEqual([
      [`{`, "Fold true"],
      [`  "a": [`, "Fold true"],
      [`    1`, ""],
      [`  ],`, ""],
      [`  "b": {},`, ""],
      [`  "c": set()`, ""],
      [`}`, ""],
    ]);
  });

  it("draws a folded item as one line with an unfold toggle, the boxed marker and the count", () => {
    const out = renderLines(rows(`{"a":{"x":1},"b":{"x":1,"y":2},"c":[1,2,3]}`, [`"a"`], [`"b"`], [`"c"`]));
    expect(drawn(out)).toEqual([
      [`{`, "Fold true"],
      [`  "a": {…}, 1 key`, "Unfold false"],
      [`  "b": {…}, 2 keys`, "Unfold false"],
      [`  "c": […] 3 items`, "Unfold false"],
      [`}`, ""],
    ]);
    expect(out).toContain(`<span class="marker">{…}</span>`);
    expect(out).toContain(`<span class="count">3 items</span>`);
  });

  it("numbers each line by its row, so a click knows which item it is on", () => {
    const out = renderLines(rows(`[[1],[2]]`), 3);
    expect([...out.matchAll(/data-row="(\d+)"/g)].map((m) => Number(m[1]))).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe("renderNotice", () => {
  const reasons = (html: string) => strip(html.replace(/<button[\s\S]*<\/button>/, "")).trim();

  it("is absent when the text fits", () => {
    expect(renderNotice({ unsaved: false, plain: false })).toBe("");
  });

  it("says text too big to save won't survive a reload", () => {
    expect(reasons(renderNotice({ unsaved: true, plain: false }))).toBe("Not kept after reload");
  });

  it("says text too big to colour shows as plain text", () => {
    expect(reasons(renderNotice({ unsaved: false, plain: true }))).toBe("Plain text, too big to colour");
  });

  it("names both reasons in one notice", () => {
    const html = renderNotice({ unsaved: true, plain: true });
    expect(reasons(html)).toBe("Not kept after reload · Plain text, too big to colour");
    expect(html.match(/role="status"/g)).toHaveLength(1);
  });

  it("ends with a Download button", () => {
    expect(renderNotice({ unsaved: true, plain: false })).toMatch(/<button type="button" data-notice-download>[\s\S]*Download<\/button><\/div>$/);
  });
});
