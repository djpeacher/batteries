/**
 * Markdown Preview's math: fills the empty `.md-math[data-tex]` placeholders
 * that `renderMarkdown` leaves, after they are on the page.
 *
 * KaTeX and its stylesheet (which brings its fonts, served from the site)
 * arrive by dynamic import the first time a placeholder appears, so documents
 * without math never load them. Renders are kept by source: the rendered side
 * is rebuilt on every keystroke, and an unchanged formula is put back from the
 * cache instead of being typeset again. A formula KaTeX can't parse shows its
 * source in the error colour, with the parser's message as its tooltip.
 */
type Katex = typeof import("katex").default;

const renders = new Map<string, string>();
let katex: Promise<Katex> | undefined;

// The stylesheet comes in as text and goes in by hand: a plain CSS import,
// even a dynamic one, is hoisted into every page's head by the build.
function load(): Promise<Katex> {
  return (katex ??= Promise.all([
    import("katex").then((mod) => mod.default),
    import("katex/dist/katex.min.css?inline").then((mod) => {
      const style = document.createElement("style");
      style.textContent = mod.default;
      document.head.append(style);
    }),
  ]).then(([k]) => k));
}

function fill(k: Katex | undefined, el: HTMLElement): boolean {
  const tex = el.dataset.tex!;
  const display = el.classList.contains("md-math-display");
  const key = `${display ? "display" : "inline"}\n${tex}`;
  let html = renders.get(key);
  if (html === undefined) {
    if (!k) return false;
    html = k.renderToString(tex, { displayMode: display, throwOnError: false, output: "htmlAndMathml" });
    renders.set(key, html);
  }
  el.innerHTML = html;
  return true;
}

let loaded: Katex | undefined;

/**
 * Fills every math placeholder under `root`. Once KaTeX is loaded every
 * formula goes in before this returns, and it resolves to false. The first
 * time math appears it resolves, after KaTeX arrives, to whether anything went
 * in late (heights changed since the call).
 */
export async function fillMath(root: HTMLElement): Promise<boolean> {
  const els = [...root.querySelectorAll<HTMLElement>(".md-math[data-tex]")];
  const late = els.filter((el) => !fill(loaded, el));
  if (!late.length) return false;
  loaded = await load();
  let changed = false;
  for (const el of late) {
    // A newer render may have replaced this placeholder while KaTeX loaded.
    if (el.isConnected) changed = fill(loaded, el) || changed;
  }
  return changed;
}
