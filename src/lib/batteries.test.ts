import { describe, expect, it } from "vitest";
import { batteries, collectBatteries } from "./batteries";

describe("collectBatteries", () => {
  it("lists batteries alphabetically by name, whatever the folder order", () => {
    const list = collectBatteries(
      {
        "../pages/zip/_meta.ts": { name: "Zip", blurb: "Z." },
        "../pages/beta/_meta.ts": { name: "beta tool", blurb: "B." },
        "../pages/alpha/_meta.ts": { name: "Alpha", blurb: "A." },
      },
      "/batteries/",
    );
    expect(list.map((b) => b.name)).toEqual(["Alpha", "beta tool", "Zip"]);
  });

  it("takes each battery's address from its folder name", () => {
    const [b] = collectBatteries(
      { "../pages/text-diff/_meta.ts": { name: "Text Diff", blurb: "Diffs." } },
      "/batteries/",
    );
    expect(b).toEqual({ slug: "text-diff", href: "/batteries/text-diff/", name: "Text Diff", blurb: "Diffs." });
  });
});

describe("batteries", () => {
  it("holds every battery folder in the project, in alphabetical order", () => {
    expect(batteries.map((b) => b.name)).toEqual(["Markdown Preview", "Text Diff"]);
  });
});
