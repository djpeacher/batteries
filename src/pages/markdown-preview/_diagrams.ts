/**
 * Markdown Preview's diagrams: fills the empty `div.md-diagram[data-mermaid]`
 * placeholders that `renderMarkdown` leaves, after they are on the page.
 *
 * Mermaid arrives by dynamic import the first time a placeholder appears, so
 * documents without diagrams never load it. Drawings are kept by theme and
 * source: the rendered side is rebuilt on every keystroke, and an unchanged
 * diagram is put back from the cache at once instead of being drawn again.
 * A block Mermaid can't draw shows the diagram error in its place.
 */
import type { Theme } from "../../lib/theme";

type Drawing = { svg: string } | { error: string };
type Mermaid = typeof import("mermaid").default;

/** Up to this many lines of the parser's message show in a diagram error. */
const ERROR_LINES = 4;

const drawings = new Map<string, Drawing>();
/** The last drawing shown at each position, kept on screen while its block redraws. */
const shown: Drawing[] = [];
let mermaid: Promise<Mermaid> | undefined;
let configured: Theme | undefined;
// Mermaid draws one diagram at a time; overlapping renders corrupt each other.
let queue: Promise<unknown> = Promise.resolve();
let drawn = 0;

function show(el: HTMLElement, drawing: Drawing) {
  if ("svg" in drawing) {
    el.classList.remove("is-error");
    el.innerHTML = drawing.svg;
    return;
  }
  const panel = document.createElement("div");
  panel.className = "md-diagram-error";
  const head = document.createElement("strong");
  head.textContent = "✗ mermaid: Diagram error";
  const message = document.createElement("pre");
  message.textContent = drawing.error;
  panel.append(head, message);
  el.classList.add("is-error");
  el.replaceChildren(panel);
}

function errorText(err: unknown): string {
  const e = err as { str?: unknown; message?: unknown } | null;
  const text = String((e && (e.str || e.message)) || err);
  return text.split("\n").filter((line) => line.trim()).slice(0, ERROR_LINES).join("\n");
}

async function draw(source: string, theme: Theme): Promise<Drawing> {
  const m = await (mermaid ??= import("mermaid").then((mod) => mod.default));
  if (configured !== theme) {
    m.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      // Failures come back to us as errors; Mermaid draws no bomb of its own.
      suppressErrorRendering: true,
      theme: theme === "dark" ? "dark" : "neutral",
      // Transparent, so the diagram canvas's dots show through.
      themeVariables: { background: "transparent" },
      fontFamily: getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim(),
    });
    configured = theme;
  }
  const id = `md-diagram-${++drawn}`;
  try {
    return { svg: (await m.render(id, source)).svg };
  } catch (err) {
    return { error: errorText(err) };
  } finally {
    // Mermaid leaves its scratch elements behind when a render fails.
    document.getElementById(id)?.remove();
    document.getElementById(`d${id}`)?.remove();
  }
}

/**
 * Fills every diagram placeholder under `root` in `theme`. Cached drawings go
 * in before this returns; the rest are drawn in turn. Resolves once they are
 * all on screen, to whether any drawing went in late (heights changed since
 * the call), or right away to false when nothing needed drawing.
 */
export async function fillDiagrams(root: HTMLElement, theme: Theme): Promise<boolean> {
  const late: [HTMLElement, number, string][] = [];
  root.querySelectorAll<HTMLElement>(".md-diagram[data-mermaid]").forEach((el, i) => {
    const key = `${theme}\n${el.dataset.mermaid}`;
    const drawing = drawings.get(key);
    if (drawing) {
      show(el, drawing);
      shown[i] = drawing;
      return;
    }
    if (shown[i]) show(el, shown[i]);
    late.push([el, i, key]);
  });

  for (const [el, i, key] of late) {
    const source = el.dataset.mermaid!;
    const next = queue.catch(() => {}).then(() => drawings.get(key) ?? draw(source, theme));
    queue = next;
    const drawing = await next;
    drawings.set(key, drawing);
    // A newer render may have replaced this placeholder while it was drawn.
    if (!el.isConnected) continue;
    show(el, drawing);
    shown[i] = drawing;
  }
  return late.length > 0;
}
