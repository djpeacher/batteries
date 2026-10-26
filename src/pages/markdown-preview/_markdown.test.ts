// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./_markdown";

/** The rendered HTML as a DOM, to query instead of matching strings. */
function dom(markdown: string) {
  const root = document.createElement("div");
  root.innerHTML = renderMarkdown(markdown);
  return root;
}

describe("GitHub-flavored markdown", () => {
  it("renders a table, wrapped so it can scroll sideways", () => {
    const root = dom("| Battery | Saves |\n| --- | --: |\n| Text Diff | yes |\n");
    const table = root.querySelector(".md-table > table")!;
    expect(table).not.toBeNull();
    expect([...table.querySelectorAll("th")].map((th) => th.textContent)).toEqual(["Battery", "Saves"]);
    expect([...table.querySelectorAll("tbody td")].map((td) => td.textContent)).toEqual(["Text Diff", "yes"]);
  });

  it("renders a task list with native, disabled checkboxes", () => {
    const root = dom("- [x] Write some markdown\n- [ ] Draw a diagram\n");
    const list = root.querySelector("ul.contains-task-list")!;
    expect(list).not.toBeNull();
    const boxes = [...list.querySelectorAll<HTMLInputElement>("li.task-list-item > input[type=checkbox]")];
    expect(boxes.map((b) => [b.checked, b.disabled])).toEqual([
      [true, true],
      [false, true],
    ]);
  });

  it("renders strikethrough", () => {
    expect(dom("~~gone~~").querySelector("del")?.textContent).toBe("gone");
  });

  it("autolinks a bare address", () => {
    expect(dom("See https://example.com today.").querySelector("a")?.getAttribute("href")).toBe("https://example.com");
  });
});

describe("fenced code", () => {
  it("highlights a fence that names a known language", () => {
    const code = dom("```js\nconst answer = 42;\n```\n").querySelector("pre > code")!;
    expect(code.classList.contains("hljs")).toBe(true);
    expect(code.querySelector(".hljs-keyword")?.textContent).toBe("const");
    expect(code.querySelector(".hljs-number")?.textContent).toBe("42");
    expect(code.textContent).toBe("const answer = 42;");
  });

  it("leaves a fence without a language plain", () => {
    const code = dom("```\nconst answer = 42;\n```\n").querySelector("pre > code")!;
    expect(code.innerHTML).toBe("const answer = 42;");
    expect(code.classList.contains("hljs")).toBe(false);
  });

  it("leaves a fence naming an unknown language plain", () => {
    const code = dom("```nosuchlanguage\nconst <b>x</b>\n```\n").querySelector("pre > code")!;
    expect(code.children).toHaveLength(0);
    expect(code.textContent).toBe("const <b>x</b>");
  });
});

describe("raw HTML", () => {
  it("keeps safe HTML such as <details> with markdown inside, and <kbd>", () => {
    const root = dom("<details>\n<summary>More</summary>\n\nHidden **text**.\n\n</details>\n\nPress <kbd>Cmd</kbd>.\n");
    const details = root.querySelector("details")!;
    expect(details.querySelector("summary")?.textContent).toBe("More");
    expect(details.querySelector("p strong")?.textContent).toBe("text");
    expect(root.querySelector("kbd")?.textContent).toBe("Cmd");
  });

  it("strips scripts", () => {
    const root = dom("Before\n\n<script>alert(1)</script>\n\nAfter\n");
    expect(root.querySelector("script")).toBeNull();
    expect(root.textContent).not.toContain("alert");
    expect(root.textContent).toContain("After");
  });

  it("strips event handlers", () => {
    const root = dom('<img src="https://example.com/a.png" onerror="alert(1)">\n\n<div onclick="alert(1)">Hi</div>\n');
    expect(root.querySelector("img")?.getAttribute("src")).toBe("https://example.com/a.png");
    expect(root.querySelector("[onerror], [onclick]")).toBeNull();
  });

  it("strips javascript: links, from markdown and from HTML", () => {
    const root = dom('[one](javascript:alert(1)) <a href="javascript:alert(2)">two</a>\n');
    const hrefs = [...root.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs.some((h) => h?.toLowerCase().includes("javascript"))).toBe(false);
  });

  it("keeps remote images", () => {
    expect(dom("![Mark](https://example.com/mark.png)").querySelector("img")?.getAttribute("src")).toBe(
      "https://example.com/mark.png",
    );
  });
});

describe("links", () => {
  it("open in a new tab without handing over the page", () => {
    const root = dom('[GFM](https://github.github.com/gfm/) and <a href="https://example.com" target="_self">raw</a>\n');
    const links = [...root.querySelectorAll("a")];
    expect(links).toHaveLength(2);
    for (const a of links) {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });
});

describe("placeholders for diagrams and math", () => {
  it("turns a mermaid fence into an empty diagram placeholder carrying its source", () => {
    const source = "graph LR\n  A[Type] --> B{Valid?}\n  B -- no --> C[\"<b>error</b>\"]";
    const root = dom("```mermaid\n" + source + "\n```\n");
    const diagram = root.querySelector<HTMLElement>("div.md-diagram")!;
    expect(diagram.dataset.mermaid).toBe(source);
    expect(diagram.childNodes).toHaveLength(0);
    expect(root.querySelector("pre")).toBeNull();
  });

  it("turns $…$ into inline math carrying its source", () => {
    const root = dom("Euler: $e^{i\\pi} + 1 = 0$ holds.");
    const math = root.querySelector<HTMLElement>("p > span.md-math.md-math-inline")!;
    expect(math.dataset.tex).toBe("e^{i\\pi} + 1 = 0");
    expect(math.childNodes).toHaveLength(0);
    expect(root.querySelector("p")!.textContent).toBe("Euler:  holds.");
  });

  it("turns $$…$$ into display math carrying its source", () => {
    const root = dom("Before\n\n$$\n\\int_0^1 x\\,dx = \\frac{1}{2}\n$$\n\nAfter\n");
    const math = root.querySelector<HTMLElement>("div.md-math.md-math-display")!;
    expect(math.dataset.tex).toBe("\\int_0^1 x\\,dx = \\frac{1}{2}");
    expect(math.childNodes).toHaveLength(0);
  });

  it("turns a math fence into display math", () => {
    const math = dom("```math\na^2 + b^2 = c^2\n```\n").querySelector<HTMLElement>("div.md-math-display")!;
    expect(math.dataset.tex).toBe("a^2 + b^2 = c^2");
  });

  it("leaves prices alone", () => {
    const root = dom("It costs $5 and $10 today.");
    expect(root.querySelector(".md-math")).toBeNull();
    expect(root.querySelector("p")!.textContent).toBe("It costs $5 and $10 today.");
  });

  it("leaves math inside code alone", () => {
    const root = dom("`$x$` and\n\n```\n$$y$$\n```\n");
    expect(root.querySelector(".md-math")).toBeNull();
  });

  it("gives raw HTML posing as a placeholder no source", () => {
    const root = dom('<div class="md-diagram" data-mermaid="0">x</div>\n\n```mermaid\ngraph LR\n```\n');
    const sources = [...root.querySelectorAll<HTMLElement>("[data-mermaid]")].map((d) => d.dataset.mermaid);
    expect(sources).toEqual(["graph LR"]);
  });
});

describe("source-line tags", () => {
  /** Each top-level block's tag and the source line it says it starts on. */
  const lines = (markdown: string) =>
    [...dom(markdown).children].map((el) => [el.tagName.toLowerCase(), el.getAttribute("data-line")]);

  it("tag every top-level block with the line it starts on", () => {
    const markdown = [
      "# Title", //               1
      "", //                      2
      "A paragraph", //           3
      "over two lines.", //       4
      "", //                      5
      "| a | b |", //             6
      "| - | - |", //             7
      "| 1 | 2 |", //             8
      "", //                      9
      "```js", //                10
      "let x;", //               11
      "```", //                  12
      "- one", //                13
      "- two", //                14
      "", //                     15
      "", //                     16
      "> quoted", //             17
      "", //                     18
      "---", //                  19
      "```mermaid", //           20
      "graph LR", //             21
      "```", //                  22
      "$$", //                   23
      "x", //                    24
      "$$", //                   25
      "<details><summary>More</summary>", // 26
      "", //                     27
      "Inside.", //              28
      "", //                     29
      "</details>", //           30
    ].join("\n");
    expect(lines(markdown)).toEqual([
      ["h1", "1"],
      ["p", "3"],
      ["div", "6"],
      ["pre", "10"],
      ["ul", "13"],
      ["blockquote", "17"],
      ["hr", "19"],
      ["div", "20"],
      ["div", "23"],
      ["details", "26"],
    ]);
  });

  it("count Windows line endings as one line each", () => {
    expect(lines("# One\r\n\r\nTwo\r\n")).toEqual([
      ["h1", "1"],
      ["p", "3"],
    ]);
  });

  it("skip link definitions, which render nothing", () => {
    expect(lines("[a]: https://example.com\n\nSee [a].\n")).toEqual([["p", "3"]]);
  });
});
