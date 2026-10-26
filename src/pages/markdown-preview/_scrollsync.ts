/**
 * Scroll sync for split mode: scrolling either side keeps the same section in
 * view on the other.
 *
 * Every top-level rendered block carries `data-line`, the source line it starts
 * on. Each tag gives a pair of scroll positions, one per side, where that line
 * sits at the top. A side's scroll position maps to the other side by
 * interpolating between the neighbouring pairs; the ends of both sides are
 * pinned together so the two reach the bottom at once.
 */

/** Where one source line sits at the top of each side, in scroll pixels. */
export interface Pair {
  text: number;
  rendered: number;
}
export type Side = keyof Pair;

/**
 * The pairs to interpolate between: from the top of both sides, through every
 * tagged line (in source order, clamped to each side's scroll range, keeping
 * only those that move forward on both sides), to the bottom of both sides.
 */
export function pairUp(tags: Pair[], max: Pair): Pair[] {
  const pairs: Pair[] = [{ text: 0, rendered: 0 }];
  for (const t of tags) {
    const p = { text: Math.min(t.text, max.text), rendered: Math.min(t.rendered, max.rendered) };
    const last = pairs[pairs.length - 1];
    if (p.text >= last.text && p.rendered >= last.rendered) pairs.push(p);
  }
  pairs.push({ text: max.text, rendered: max.rendered });
  return pairs;
}

/** The other side's scroll position for scroll position `y` on side `from`. */
export function mapScroll(pairs: Pair[], from: Side, y: number): number {
  const to: Side = from === "text" ? "rendered" : "text";
  let i = 0;
  while (i < pairs.length - 2 && pairs[i + 1][from] <= y) i++;
  const a = pairs[i];
  const b = pairs[i + 1] ?? a;
  const span = b[from] - a[from];
  // A zero-length step (tags clamped to the end of a side): past it, take its far end.
  if (span <= 0) return y >= b[from] ? b[to] : a[to];
  const t = Math.min(1, Math.max(0, (y - a[from]) / span));
  return a[to] + t * (b[to] - a[to]);
}

/** The top of each source line in a textarea, measured on a hidden mirror. */
function textTops(box: HTMLTextAreaElement, lines: number[]): Map<number, number> {
  const cs = getComputedStyle(box);
  const mirror = document.createElement("div");
  Object.assign(mirror.style, {
    position: "absolute",
    visibility: "hidden",
    top: "0",
    left: "-9999px",
    boxSizing: "content-box",
    width: `${box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)}px`,
    padding: cs.padding,
    border: "0",
    font: cs.font,
    letterSpacing: cs.letterSpacing,
    tabSize: cs.tabSize,
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    wordBreak: cs.wordBreak,
  });
  // The text up to each wanted line, then an empty marker where that line starts.
  const source = box.value.split("\n");
  const wanted = new Set(lines);
  const markers = new Map<number, HTMLElement>();
  let run: string[] = [];
  source.forEach((line, i) => {
    if (wanted.has(i + 1)) {
      mirror.append(run.join(""));
      run = [];
      const m = document.createElement("span");
      markers.set(i + 1, m);
      mirror.append(m);
    }
    run.push(i < source.length - 1 ? `${line}\n` : line);
  });
  mirror.append(run.join(""));
  document.body.append(mirror);
  const tops = new Map<number, number>();
  for (const [line, m] of markers) tops.set(line, m.offsetTop);
  mirror.remove();
  return tops;
}

/** The scroll position that puts each tagged block at the top of the rendered side. */
function renderedTops(rendered: HTMLElement): Map<number, number> {
  const base = rendered.getBoundingClientRect().top - rendered.scrollTop;
  const tops = new Map<number, number>();
  for (const el of rendered.querySelectorAll<HTMLElement>(":scope > [data-line]")) {
    const line = Number(el.dataset.line);
    if (!tops.has(line)) tops.set(line, el.getBoundingClientRect().top - base);
  }
  return tops;
}

export interface ScrollSync {
  /** Re-measure (after a render or a size change) and bring the rendered side to the text side. */
  refresh(): void;
  /** Turn syncing on or off; turning it on brings the rendered side to the text side. */
  setActive(on: boolean): void;
}

/** Keep `box` and `rendered` scrolled to the same section while active. */
export function wireScrollSync(box: HTMLTextAreaElement, rendered: HTMLElement): ScrollSync {
  let active = false;
  let pairs: Pair[] | null = null;
  // The guard: the position this code last set on each side. A scroll event
  // that lands there is our own echo, not the writer, and is ignored.
  const echo: Record<Side, number | null> = { text: null, rendered: null };
  const el: Record<Side, HTMLElement> = { text: box, rendered };
  let frame = 0;
  let leader: Side = "text";

  function measure(): Pair[] {
    const r = renderedTops(rendered);
    const t = textTops(box, [...r.keys()]);
    const tags = [...r.keys()]
      .sort((a, b) => a - b)
      .map((line) => ({ text: t.get(line) ?? 0, rendered: r.get(line)! }));
    const max = {
      text: Math.max(0, box.scrollHeight - box.clientHeight),
      rendered: Math.max(0, rendered.scrollHeight - rendered.clientHeight),
    };
    return pairUp(tags, max);
  }

  function follow(from: Side) {
    const to: Side = from === "text" ? "rendered" : "text";
    pairs ??= measure();
    const target = Math.round(mapScroll(pairs, from, el[from].scrollTop));
    if (Math.abs(el[to].scrollTop - target) < 1) return;
    el[to].scrollTop = target;
    // Read back: the browser may clamp, and the echo carries the clamped value.
    echo[to] = el[to].scrollTop;
  }

  function onScroll(side: Side) {
    if (!active) return;
    const mark = echo[side];
    if (mark !== null && Math.abs(el[side].scrollTop - mark) < 1) {
      echo[side] = null;
      return;
    }
    echo[side] = null;
    leader = side;
    // One follow per frame, from whichever side the writer moved last.
    if (!frame) frame = requestAnimationFrame(() => {
      frame = 0;
      follow(leader);
    });
  }
  box.addEventListener("scroll", () => onScroll("text"), { passive: true });
  rendered.addEventListener("scroll", () => onScroll("rendered"), { passive: true });

  // A remote image that finishes loading moves every block below it.
  rendered.addEventListener("load", () => sync.refresh(), true);
  // So does resizing either side (the window, or text rewrapping).
  const ro = new ResizeObserver(() => sync.refresh());
  ro.observe(box);
  ro.observe(rendered);

  const sync: ScrollSync = {
    refresh() {
      pairs = null;
      if (active) follow("text");
    },
    setActive(on) {
      active = on;
      pairs = null;
      if (on) follow("text");
    },
  };
  return sync;
}
