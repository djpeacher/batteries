import { describe, expect, it } from "vitest";
import { compare } from "./_compare";
import { renderCount } from "./_render";

/** The change count as it reads on screen, markup removed. */
const countText = (old: string, neu: string) => renderCount(compare(old, neu)).replace(/<[^>]*>/g, "");

describe("renderCount: the change count", () => {
  it('reads "+N −M lines", a changed line counting as one of each', () => {
    expect(countText("a\nb\n", "a\nc\n")).toBe("+1 −1 lines");
  });

  it("reads +0 when lines were only removed", () => {
    expect(countText("alpha\nbeta", "")).toBe("+0 −2 lines");
  });

  it("colours +N green and −M red", () => {
    const html = renderCount(compare("a\n", "b\nc\n"));
    expect(html).toContain('<span class="add">+2</span>');
    expect(html).toContain('<span class="del">−1</span>');
  });

  it("gives no figure when there are no differences, only the message", () => {
    expect(countText("a\n", "a\n")).toBe("No differences");
  });
});
