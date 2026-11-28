import { describe, expect, it } from "vitest";
import { draw } from "./_draw";

/** The tree side's text for an outline. */
const tree = (outline: string) => draw(outline).text;

describe("draw: nothing to draw", () => {
  it.each(["", "   ", "\n\t \r\n  \n"])("leaves the tree side empty for %j", (outline) => {
    expect(tree(outline)).toBe("");
    expect(draw(outline).lines).toEqual([]);
  });
});

describe("draw: the tree command's lines", () => {
  it("draws nesting with ├── , └── and │ , top level flush left with no root line", () => {
    const outline = ["my-app/", "  src/", "    index.js", "    utils/", "      format.js", "  tests/", "    index.test.js", "  README.md"].join("\n");
    expect(tree(outline)).toBe(
      [
        "my-app/",
        "├── src/",
        "│   ├── index.js",
        "│   └── utils/",
        "│       └── format.js",
        "├── tests/",
        "│   └── index.test.js",
        "└── README.md",
      ].join("\n"),
    );
  });
});

/** Joins lines, so a table row reads one line per array item. */
const t = (...lines: string[]) => lines.join("\n");

describe("draw: top-level names", () => {
  it.each([
    ["stacks several top-level names as separate trees", t("a/", "  x", "b/", "  y"), t("a/", "└── x", "b/", "└── y")],
    ["draws a . only when it is typed", t(".", "  a", "  b"), t(".", "├── a", "└── b")],
    ["draws a lone name flush left", "README.md", "README.md"],
  ])("%s", (_, outline, expected) => {
    expect(tree(outline)).toBe(expected);
  });
});

describe("draw: relative depth", () => {
  it.each([
    ["any deeper line is one level down", t("a", "        b"), t("a", "└── b")],
    ["one space deeper is one level down", t("a", " b", "  c"), t("a", "└── b", "    └── c")],
    ["2-space and 4-space steps draw alike", t("a", "    b", "        c", "    d"), t("a", "├── b", "│   └── c", "└── d")],
    ["a dedent to a used indent joins that line's siblings", t("a", "  b", "      c", "  d"), t("a", "├── b", "│   └── c", "└── d")],
    [
      "a dedent to an unused indent joins the nearest shallower line",
      t("root", "  src", "    a", "    b", "   main.scss"),
      t("root", "└── src", "    ├── a", "    ├── b", "    └── main.scss"),
    ],
    ["a phantom dedent under a deep jump", t("src/", "  a", "      b", "    c"), t("src/", "└── a", "    ├── b", "    └── c")],
    ["a line indented before any top-level line is top-level", t("    a", "      b", "c"), t("a", "└── b", "c")],
    ["a lone indented line is top-level", "    a", "a"],
  ])("%s", (_, outline, expected) => {
    expect(tree(outline)).toBe(expected);
  });
});

describe("draw: tabs", () => {
  it.each([
    ["a tab line and a 4-space line are siblings", t("a", "\tb", "    c"), t("a", "├── b", "└── c")],
    ["a tab after 2 spaces advances to column 4", t("a", "  \tb", "    c"), t("a", "├── b", "└── c")],
    ["spaces after a tab count on from column 4", t("a", "\tb", "\t  c", "      d"), t("a", "└── b", "    ├── c", "    └── d")],
    ["two tabs are column 8", t("a", "\tb", "\t\tc", "        d"), t("a", "└── b", "    ├── c", "    └── d")],
  ])("%s", (_, outline, expected) => {
    expect(tree(outline)).toBe(expected);
  });
});

describe("draw: names", () => {
  it.each([
    ["drops blank and whitespace-only lines", t("a", "  b", "", "   ", "\t", "  c"), t("a", "├── b", "└── c")],
    ["a blank line never breaks a branch", t("a", "  b", "    c", "", "  d"), t("a", "├── b", "│   └── c", "└── d")],
    ["trims trailing whitespace", t("a   ", "  b\t "), t("a", "└── b")],
    ["reads Windows line endings", "a\r\n  b\r\n", t("a", "└── b")],
    ["keeps a leading - in the name", t("- a", "  - b"), t("- a", "└── - b")],
    ["keeps typed order", t("z", "a", "m"), t("z", "a", "m")],
    ["keeps repeated names", t("a", "  x", "  x", "a"), t("a", "├── x", "└── x", "a")],
    ["never adds a /", t("src", "  lib", "    x.js"), t("src", "└── lib", "    └── x.js")],
    ["keeps a / that is typed", t("src/", "  lib/"), t("src/", "└── lib/")],
  ])("%s", (_, outline, expected) => {
    expect(tree(outline)).toBe(expected);
  });
});

describe("draw: lines for the page", () => {
  it("gives each line's tree lines apart from its name", () => {
    expect(draw(t("a", "  b", "    c", "  d")).lines).toEqual([
      { prefix: "", name: "a" },
      { prefix: "├── ", name: "b" },
      { prefix: "│   └── ", name: "c" },
      { prefix: "└── ", name: "d" },
    ]);
  });
});
