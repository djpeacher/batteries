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
  it("gives each line's tree lines, name, padding and comment apart", () => {
    expect(draw(t("a", "  b # note", "    c", "  d")).lines).toEqual([
      { prefix: "", name: "a", pad: "", comment: "" },
      { prefix: "├── ", name: "b", pad: "  ", comment: "# note" },
      { prefix: "│   └── ", name: "c", pad: "", comment: "" },
      { prefix: "└── ", name: "d", pad: "", comment: "" },
    ]);
  });
});

describe("draw: comments", () => {
  it("lines up every comment's # 2 spaces past the longest commented line, across names, wide characters and #s in names", () => {
    const outline = t(
      "src",
      "  # helpers",
      "  app.js    # entry",
      "  文档.md\t#",
      "  a-really-long-generated.map",
      "  util.js # see #12 #todo",
      "issue #42.md",
    );
    expect(tree(outline)).toBe(
      t(
        "src",
        "├── # helpers",
        "├── app.js   # entry",
        "├── 文档.md  #",
        "├── a-really-long-generated.map",
        "└── util.js  # see #12 #todo",
        "issue        #42.md",
      ),
    );
  });
});

describe("draw: a tab inside a name", () => {
  it.each([
    // "a<TAB>b" ends at column 9: the tab reaches column 8, as the tree side shows it.
    ["at the top level", t("a\tb  # c", "longer-name-x  # d"), t("a\tb      # c", "longer-name-x  # d")],
    // "├── a<TAB>b" ends at column 9 too: the tab counts from the line's start, tree lines included.
    ["under tree lines", t("r", "  a\tb  # c", "  longer-name-x  # d"), t("r", "├── a\tb          # c", "└── longer-name-x  # d")],
  ])("reaches the next multiple of 8 columns, keeping the comment column, %s", (_, outline, drawn) => {
    expect(tree(outline)).toBe(drawn);
  });
});

describe("draw: what starts a comment", () => {
  it.each([
    ["a space then # starts a comment", "a.js # entry", "a.js  # entry"],
    ["a tab then # starts a comment", "a.js\t# entry", "a.js  # entry"],
    ["later #s and spaces stay comment text as typed", "a.js # see #12   #todo", "a.js  # see #12   #todo"],
    ["trims trailing whitespace from a comment", "a.js #  note \t ", "a.js  #  note"],
    ["keeps a lone # and lines it up", t("a.js #", "bb.js # b"), t("a.js   #", "bb.js  # b")],
    ["a # with no space before it is part of the name", "c#-notes", "c#-notes"],
    ["a # with no space before it stays in the name when a comment follows", "c#-notes # docs", "c#-notes  # docs"],
    ["only indentation before # draws a name", t("src", "  # helpers"), t("src", "└── # helpers")],
    ["only indentation before # at top level draws a name", "# notes", "# notes"],
    ["a name starting with # can still have a comment", t("src", "  # helpers # tools"), t("src", "└── # helpers  # tools")],
    ["a space then # inside a name starts a comment", "issue #42.md", "issue  #42.md"],
  ])("%s", (_, outline, expected) => {
    expect(tree(outline)).toBe(expected);
  });
});

describe("draw: the comment column", () => {
  it.each([
    [
      "one column for the whole tree, across levels and top-level trees",
      t("a # one", "  bbbbbb # two", "c", "  d # three"),
      t("a           # one", "└── bbbbbb  # two", "c", "└── d       # three"),
    ],
    ["the column replaces any typed gap", t("a        # one", "bb # two"), t("a   # one", "bb  # two")],
    [
      "a line without a comment never pushes the column",
      t("a # one", "a-very-long-uncommented-name", "bb # two"),
      t("a   # one", "a-very-long-uncommented-name", "bb  # two"),
    ],
    [
      "a long commented name pushes the column with no limit",
      t("a # one", "x".repeat(200) + " # far"),
      t("a" + " ".repeat(201) + "# one", "x".repeat(200) + "  # far"),
    ],
  ])("%s", (_, outline, expected) => {
    expect(tree(outline)).toBe(expected);
  });

  it("lines without a comment end at the name, so the tree side has no trailing spaces", () => {
    const text = tree(t("root # top", "  a-long-name-without-a-comment", "  b # note", "  c"));
    for (const line of text.split("\n")) expect(line).toBe(line.trimEnd());
    expect(text).toBe(t("root   # top", "├── a-long-name-without-a-comment", "├── b  # note", "└── c"));
  });
});

describe("draw: wide characters", () => {
  it.each([
    ["CJK counts as 2 columns", t("文档.md # docs", "abcdefg # x"), t("文档.md  # docs", "abcdefg  # x")],
    ["an emoji counts as 2 columns", t("🚀.md # go", "abcd # x"), t("🚀.md  # go", "abcd   # x")],
    ["an emoji with VS16 counts as 2 columns", t("❤️ # x", "ab # y"), t("❤️  # x", "ab  # y")],
    ["a joined emoji counts as 2 columns", t("👩‍💻 # x", "ab # y"), t("👩‍💻  # x", "ab  # y")],
    ["a combining accent takes no column", t("cafe\u0301 # x", "abcd # y"), t("cafe\u0301  # x", "abcd  # y")],
    ["fullwidth letters count as 2 columns", t("ＡＢ # x", "abcd # y"), t("ＡＢ  # x", "abcd  # y")],
  ])("%s", (_, outline, expected) => {
    expect(tree(outline)).toBe(expected);
  });
});

describe("draw: the first-visit sample", () => {
  it("draws the sample with its comments lined up", () => {
    const outline = t(
      "my-app/  # edit or clear this sample",
      "  src/",
      "    index.js  # comments line up",
      "    utils/",
      "      format.js",
      "  tests/",
      "    index.test.js",
      "  README.md  # Tab and Shift-Tab",
    );
    expect(tree(outline)).toBe(
      t(
        "my-app/           # edit or clear this sample",
        "├── src/",
        "│   ├── index.js  # comments line up",
        "│   └── utils/",
        "│       └── format.js",
        "├── tests/",
        "│   └── index.test.js",
        "└── README.md     # Tab and Shift-Tab",
      ),
    );
  });
});
