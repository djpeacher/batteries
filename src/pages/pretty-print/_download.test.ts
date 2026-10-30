import { describe, expect, it } from "vitest";
import { downloadName } from "./_download";

describe("the download's name", () => {
  it("is pretty-print.json for pasted text labelled JSON", () => {
    expect(downloadName(null, "JSON")).toBe("pretty-print.json");
  });

  it("is pretty-print.py for pasted text labelled Python", () => {
    expect(downloadName(null, "Python")).toBe("pretty-print.py");
  });

  it("keeps an opened file's exact name, even when its text is labelled the other language", () => {
    expect(downloadName("data.py", "JSON")).toBe("data.py");
  });

  it("keeps an opened name with no extension, or one that names neither language", () => {
    expect(downloadName("Makefile", "Python")).toBe("Makefile");
    expect(downloadName("server.log", "JSON")).toBe("server.log");
  });
});
