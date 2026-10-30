// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadMode, loadText, SAVE_LIMIT, saveMode, saveText, SAMPLE } from "./_storage";
import { format } from "./_format";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("Pretty Print's saved text", () => {
  it("shows the sample on a first visit", () => {
    expect(loadText()).toBe(SAMPLE);
  });

  it("brings back the text saved on the last edit", () => {
    saveText(`{"a": 1}`);
    expect(loadText()).toBe(`{"a": 1}`);
  });

  it("keeps a cleared text side cleared, never bringing the sample back", () => {
    saveText("");
    expect(loadText()).toBe("");
  });

  it("has a sample that formats as Python", () => {
    expect(format(SAMPLE)).toMatchObject({ kind: "formatted", language: "Python" });
  });
});

describe("Pretty Print's save limit", () => {
  const big = "x".repeat(SAVE_LIMIT + 1);

  it("keeps text up to the limit after a reload", () => {
    const text = "x".repeat(SAVE_LIMIT);
    expect(saveText(text)).toBe(true);
    expect(loadText()).toBe(text);
  });

  it("doesn't keep text over the limit, and a reload is blank rather than the older text", () => {
    saveText(`{"a": 1}`);
    expect(saveText(big)).toBe(false);
    expect(loadText()).toBe("");
  });

  it("treats a save the browser refuses (storage full) the same way", () => {
    saveText(`{"a": 1}`);
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k: string, v: string) {
      if (v.length > 10) throw new DOMException("full", "QuotaExceededError");
      setItem.call(this, k, v);
    });
    expect(saveText(`{"a": 1, "b": 2}`)).toBe(false);
    expect(loadText()).toBe("");
  });

  it("leaves nothing behind when storage refuses every write", () => {
    saveText(`{"a": 1}`);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("unavailable", "SecurityError");
    });
    expect(saveText(`{"a": 2}`)).toBe(false);
    expect(loadText()).not.toBe(`{"a": 1}`);
  });

  it("saves again once the text fits", () => {
    saveText(big);
    expect(saveText(`{"a": 1}`)).toBe(true);
    expect(loadText()).toBe(`{"a": 1}`);
  });
});

describe("Pretty Print's saved mode", () => {
  it("is split when none is saved", () => {
    expect(loadMode()).toBe("split");
  });

  it.each(["text", "formatted", "split"] as const)("brings back %s", (mode) => {
    saveMode(mode);
    expect(loadMode()).toBe(mode);
  });

  it("falls back to split for a value it doesn't know", () => {
    localStorage.setItem("batteries:pretty-print:mode", "rendered");
    expect(loadMode()).toBe("split");
  });
});
