import { describe, expect, it } from "vitest";
import { editDelay } from "./delay";

describe("editDelay", () => {
  it("redraws at once up to about 1 MB of text", () => {
    expect(editDelay(0)).toBe(0);
    expect(editDelay(1_000_000)).toBe(0);
  });

  it("waits about 300 ms after the last keystroke above about 1 MB", () => {
    expect(editDelay(1_000_001)).toBe(300);
    expect(editDelay(5_000_000)).toBe(300);
  });
});
