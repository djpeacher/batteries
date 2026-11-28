// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { draw } from "./_draw";
import { loadMode, loadText, saveMode, saveText } from "./_storage";

afterEach(() => {
  localStorage.clear();
});

describe("File Tree's saved outline", () => {
  it("shows the sample on a first visit, exactly as the spec writes it", () => {
    expect(loadText()).toBe(
      [
        "my-app/  # edit or clear this sample",
        "  src/",
        "    index.js  # comments line up",
        "    utils/",
        "      format.js",
        "  tests/",
        "    index.test.js",
        "  README.md  # Tab and Shift-Tab",
      ].join("\n"),
    );
  });

  it("brings back the outline saved on the last edit", () => {
    saveText("docs/\n  guide.md");
    expect(loadText()).toBe("docs/\n  guide.md");
  });

  it("keeps a cleared outline cleared, never bringing the sample back", () => {
    saveText("");
    expect(loadText()).toBe("");
  });
});

describe("File Tree's first-visit sample", () => {
  it("draws on the tree side as the spec shows", () => {
    expect(draw(loadText()).text).toBe(
      [
        "my-app/           # edit or clear this sample",
        "├── src/",
        "│   ├── index.js  # comments line up",
        "│   └── utils/",
        "│       └── format.js",
        "├── tests/",
        "│   └── index.test.js",
        "└── README.md     # Tab and Shift-Tab",
      ].join("\n"),
    );
  });
});

describe("File Tree's saved mode", () => {
  it("is split when none is saved", () => {
    expect(loadMode()).toBe("split");
  });

  it.each(["text", "tree", "split"] as const)("brings back %s", (mode) => {
    saveMode(mode);
    expect(loadMode()).toBe(mode);
  });

  it("falls back to split for a value it doesn't know", () => {
    localStorage.setItem("batteries:file-tree:mode", "formatted");
    expect(loadMode()).toBe("split");
  });
});
