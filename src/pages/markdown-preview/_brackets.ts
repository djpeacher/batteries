/**
 * Tells the angle brackets that are HTML from the ones that are text. A browser
 * drops a tag it doesn't know, so placeholders (<name>, <what it is>) and
 * generics (List<T>) would vanish from the rendered side; here they show as
 * typed. SVG and MathML names count only inside an <svg> or <math> that is
 * closed, so <path> in prose is text too.
 *
 * This decides what shows, not what is safe: sanitizing comes after. Needs a DOM.
 */

/** Elements whose content a browser reads as text, up to their closing tag. */
const RAW_TEXT = new Set(["script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes", "plaintext"]);

const isForeignRoot = (name: string) => name === "svg" || name === "math";

/** The lowercase name of the tag opening at `at`, or undefined if none does. */
function tagName(html: string, at: number): string | undefined {
  const opening = /<\/?([a-zA-Z][^\s<>]*)/y;
  opening.lastIndex = at;
  return opening.exec(html)?.[1].replace(/\/$/, "").toLowerCase();
}

/** Whether HTML itself has this element; a custom element's hyphenated name is taken as text. */
function isHtmlElement(name: string): boolean {
  return /^[a-z][a-z0-9]*$/.test(name) && !(document.createElement(name) instanceof HTMLUnknownElement);
}

/** The index of the `>` ending the tag at `at`, skipping quoted attribute values; -1 if it never ends. */
function tagEnd(html: string, at: number): number {
  let quote = "";
  let afterEquals = false;
  for (let i = at; i < html.length; i++) {
    const c = html[i];
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === ">") return i;
    else if (afterEquals && (c === '"' || c === "'")) {
      quote = c;
      afterEquals = false;
    } else if (c === "=") afterEquals = true;
    else if (c.trim()) afterEquals = false;
  }
  return -1;
}

/**
 * Whether the markdown `src`, which opens with a tag, starts an HTML block. One
 * that opens with text in brackets starts a paragraph, whose markdown renders.
 */
export function opensHtmlBlock(src: string): boolean {
  const name = tagName(src, src.search(/\S/));
  if (name === undefined || isHtmlElement(name)) return true;
  if (isForeignRoot(name)) return src.toLowerCase().includes(`</${name}`);
  // An SVG or MathML name: inside one if the next <svg> or <math> tag closes it.
  return /<(\/?)(?:svg|math)\b/i.exec(src)?.[1] === "/";
}

/** The HTML with the `<` of every bracket that is text escaped. Takes a whole document, in linear time. */
export function escapeTextBrackets(html: string): string {
  const lower = html.toLowerCase();
  const unclosed = new Set<string>();
  /** `lower.indexOf`, searching at most once for what isn't there. */
  const find = (what: string, from: number) => {
    if (unclosed.has(what)) return -1;
    const at = lower.indexOf(what, from);
    if (at < 0) unclosed.add(what);
    return at;
  };

  const text: number[] = [];
  // SVG and MathML tags wait to learn whether the root around them is closed.
  const roots: { name: string; at: number; pending: number[] }[] = [];
  const asText = (at: number) => (roots.at(-1)?.pending ?? text).push(at);

  for (let at = html.indexOf("<"); at >= 0; ) {
    let next = at + 1;
    const name = tagName(html, at);
    if (html.startsWith("<!--", at)) {
      const end = find("-->", at + 2);
      if (end < 0) text.push(at);
      else next = end + 3;
    } else if (name !== undefined) {
      const closing = html[at + 1] === "/";
      const root = isForeignRoot(name);
      if (!root && !isHtmlElement(name)) asText(at);
      else if (!closing && RAW_TEXT.has(name) && find(`</${name}`, next) < 0) text.push(at);
      else {
        const end = tagEnd(html, at);
        if (end < 0) break; // an unfinished tag: the rest of the document is inside it
        next = end + 1;
        if (root && closing) {
          const open = roots.findLastIndex((r) => r.name === name);
          if (open < 0) text.push(at);
          else {
            // Roots opened inside this one and never closed are text.
            for (const r of roots.splice(open).slice(1)) text.push(r.at);
          }
        } else if (root && html[end - 1] !== "/") roots.push({ name, at, pending: [] });
        else if (!closing && RAW_TEXT.has(name)) next = find(`</${name}`, next);
      }
    }
    at = html.indexOf("<", next);
  }
  for (const r of roots) {
    text.push(r.at);
    for (const at of r.pending) text.push(at);
  }

  let out = "";
  let from = 0;
  for (const at of text.sort((a, b) => a - b)) {
    out += html.slice(from, at) + "&lt;";
    from = at + 1;
  }
  return out + html.slice(from);
}
