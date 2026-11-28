// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { draw } from "./_draw";
import { loadMode, loadText, SAVE_LIMIT, saveMode, saveText } from "./_storage";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("File Tree's saved outline", () => {
  it("shows the sample on a first visit", () => {
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

describe("File Tree's save limit", () => {
  it("is 1,000,000 characters, as Pretty Print's", () => {
    expect(SAVE_LIMIT).toBe(1_000_000);
  });

  it("keeps an outline of exactly 1,000,000 characters after a reload", () => {
    const text = "x".repeat(1_000_000);
    expect(saveText(text)).toBe(true);
    expect(loadText()).toBe(text);
  });

  it("doesn't keep one character more, and a reload shows a blank text side, not the older outline or the sample", () => {
    saveText("docs/\n  guide.md");
    expect(saveText("x".repeat(1_000_001))).toBe(false);
    expect(loadText()).toBe("");
  });

  it("treats a save the browser refuses (storage full) the same way, reloading blank", () => {
    saveText("docs/\n  guide.md");
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k: string, v: string) {
      if (v.length > 10) throw new DOMException("full", "QuotaExceededError");
      setItem.call(this, k, v);
    });
    expect(saveText("docs/\n  guide.md\n  api.md")).toBe(false);
    expect(loadText()).toBe("");
  });

  it("removes the saved outline only when even the empty write is refused", () => {
    saveText("docs/\n  guide.md");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("unavailable", "SecurityError");
    });
    expect(saveText("docs/")).toBe(false);
    expect(localStorage.getItem("batteries:file-tree:text")).toBeNull();
  });

  it("is kept again once a save succeeds", () => {
    saveText("x".repeat(1_000_001));
    expect(saveText("docs/")).toBe(true);
    expect(loadText()).toBe("docs/");
  });
});

describe("File Tree's first-visit sample", () => {
  it("draws on the tree side with every comment in one column", () => {
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
