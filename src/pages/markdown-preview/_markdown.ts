/**
 * Markdown Preview's rendering: markdown text in, sanitized HTML for the
 * rendered side out. marked (GitHub-flavored) parses it and DOMPurify strips
 * anything unsafe from the result, raw HTML included. Angle brackets that name
 * no HTML element show as typed.
 *
 * Needs a DOM (the browser, or jsdom in tests) for DOMPurify.
 */
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import { Marked } from "marked";
import { escapeHtml } from "../../lib/html";
import { escapeTextBrackets, opensHtmlBlock } from "./_brackets";

/*
 * Diagrams and math leave the pipeline as empty placeholders that carry their
 * source; the page fills them after insertion. The sources ride outside the
 * HTML, because DOMPurify drops attribute values containing "-->" (common in
 * mermaid), and are put back after sanitizing. Each render keys them afresh,
 * so raw HTML imitating a placeholder never matches one.
 */
let sources = new Map<string, string>();
let renderKey = "";
function keep(source: string) {
  const key = `${renderKey}-${sources.size}`;
  sources.set(key, source);
  return key;
}
const diagram = (source: string) => `<div class="md-diagram" data-mermaid="${keep(source)}"></div>\n`;
const math = (tex: string, display: boolean) =>
  display
    ? `<div class="md-math md-math-display" data-tex="${keep(tex)}"></div>\n`
    : `<span class="md-math md-math-inline" data-tex="${keep(tex)}"></span>`;

const marked = new Marked(
  { gfm: true },
  {
    extensions: [
      // $$…$$ on its own lines: display math.
      {
        name: "mathBlock",
        level: "block",
        start: (src) => src.match(/^ {0,3}\$\$/m)?.index,
        tokenizer(src) {
          const m = /^ {0,3}\$\$([\s\S]+?)\$\$[^\S\n]*(?:\n|$)/.exec(src);
          if (m) return { type: "mathBlock", raw: m[0], text: m[1].trim() };
        },
        renderer: (t) => math(t.text, true),
      },
      // $…$ within a line (no space just inside either $, no digit after the
      // closing one, so "$5 and $10" stays text); $$…$$ within a line is display.
      {
        name: "mathInline",
        level: "inline",
        start: (src) => src.indexOf("$") >= 0 ? src.indexOf("$") : undefined,
        tokenizer(src) {
          const m = /^\$\$((?:\\\$|[^$])+?)\$\$/.exec(src) ?? /^\$(?![\s$])((?:\\\$|[^$\n])+?)(?<!\s)\$(?!\d)/.exec(src);
          if (m) return { type: "mathInline", raw: m[0], text: m[1], display: m[0].startsWith("$$") };
        },
        renderer: (t) => (t.display ? math(t.text, true).trim() : math(t.text, false)),
      },
    ],
    tokenizer: {
      // false hands over to marked's own tokenizer; undefined means no HTML block here.
      html: (src) => (/^ {0,3}</.test(src) && !opensHtmlBlock(src) ? undefined : false),
    },
    renderer: {
      // A fence is highlighted only when it names a language highlight.js
      // knows (its common set); anything else stays plain, never guessed.
      code({ text, lang }) {
        const name = (lang ?? "").trim().split(/\s+/)[0];
        if (name === "mermaid") return diagram(text);
        if (name === "math") return math(text, true);
        if (name && hljs.getLanguage(name)) {
          const html = hljs.highlight(text, { language: name, ignoreIllegals: true }).value;
          return `<pre><code class="hljs language-${escapeHtml(name)}">${html}</code></pre>\n`;
        }
        return `<pre><code>${escapeHtml(text)}</code></pre>\n`;
      },
    },
  },
);

/**
 * The document's HTML, each top-level block's first element tagged with
 * `data-line`: the 1-based source line the block starts on (for scroll sync).
 * A block that opens with no element of its own (a closing tag, a comment, a
 * link definition) goes untagged.
 */
function tagLines(markdown: string): string {
  const tokens = marked.lexer(markdown);
  // Brackets are judged over the whole document (an <svg> can span blocks), and
  // before tagging, so a tag that turns out to be text never gets a data-line.
  const seam = `seam${renderKey}seam`;
  const blocks = escapeTextBrackets(tokens.map((token) => marked.parser([token])).join(seam)).split(seam);
  let line = 1;
  return tokens
    .map((token, i) => {
      const html = blocks[i].replace(/^(\s*<[a-zA-Z][\w-]*)/, `$1 data-line="${line}"`);
      line += token.raw.split("\n").length - 1;
      return html;
    })
    .join("");
}

/**
 * Markdown to the rendered side's sanitized HTML. Mermaid fences become
 * `div.md-diagram[data-mermaid]` and math `.md-math[data-tex]` placeholders
 * (inline spans, display divs), empty and holding their source.
 */
export function renderMarkdown(markdown: string): string {
  sources = new Map();
  renderKey = Math.random().toString(36).slice(2);
  const html = tagLines(markdown);
  const doc = DOMPurify.sanitize(html, { RETURN_DOM_FRAGMENT: true });

  for (const name of ["mermaid", "tex"]) {
    for (const el of doc.querySelectorAll<HTMLElement>(`[data-${name}]`)) {
      const source = sources.get(el.dataset[name]!);
      if (source === undefined) delete el.dataset[name];
      else el.dataset[name] = source;
    }
  }

  // Links open in a new tab, so following one never loses the document.
  for (const a of doc.querySelectorAll("a[href]")) {
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
  }
  // Tables scroll sideways inside a wrapper rather than widening the page.
  for (const table of doc.querySelectorAll("table")) {
    const wrap = document.createElement("div");
    wrap.className = "md-table";
    const line = table.getAttribute("data-line");
    if (line) {
      wrap.setAttribute("data-line", line);
      table.removeAttribute("data-line");
    }
    table.replaceWith(wrap);
    wrap.append(table);
  }
  // Task lists, as GitHub marks them, so the bullets can go.
  for (const box of doc.querySelectorAll("li > input[type=checkbox], li > p:first-child > input[type=checkbox]")) {
    const item = box.closest("li")!;
    item.classList.add("task-list-item");
    item.parentElement?.classList.add("contains-task-list");
  }

  const out = document.createElement("div");
  out.append(doc);
  return out.innerHTML;
}
