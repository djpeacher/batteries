// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { load, trySave } from "./storage";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("trySave", () => {
  it("saves the value and reports success", () => {
    expect(trySave("k", "hello")).toBe(true);
    expect(load("k")).toBe("hello");
  });

  it("reports failure when storage is full or unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(trySave("k", "hello")).toBe(false);
  });
});
