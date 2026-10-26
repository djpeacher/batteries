/**
 * Markup for Text Diff's result and change count, drawn from a Comparison.
 * Styles live in the page (index.astro). Every changed line carries a −/+
 * sign, so a change never relies on colour alone.
 */
import type { CombinedRow, Comparison, Fold, SideLine, SplitRow } from "./_compare";
import type { View } from "./_storage";
import { escapeHtml, icon } from "../../lib/html";

/** A fold row's arrow points to where its hidden lines are: up at the start, down at the end, both ways between changes. */
const ARROW: Record<Fold["position"], string> = {
  start: icon(`<path d="M12 19V5M5 12l7-7 7 7"/>`),
  end: icon(`<path d="M12 5v14M19 12l-7 7-7-7"/>`),
  middle: icon(`<path d="m7 15 5 5 5-5M7 9l5-5 5 5"/>`),
};

const CHECK = icon(`<path d="M20 6 9 17l-5-5"/>`);
const INFO = icon(`<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>`);
/** A quarter arc over a faint ring; the page's CSS spins it. */
const SPINNER = `<svg class="td-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" opacity="0.25"/><path d="M21 12a9 9 0 0 0-9-9"/></svg>`;
const COMPARING = "Comparing…";

/** The icon beside the message of a comparison with no rows to show. */
const STATUS_ICON: Record<Exclude<Comparison["status"], "diff">, string> = { identical: CHECK, "too-large": INFO };

/**
 * The toolbar's count slot: "+N −M lines", with +N green, −M red and
 * "lines" muted; when identical, "✓ No differences" and its ignoring note;
 * when too large, "ⓘ Too large to compare live".
 */
export function renderCount(c: Comparison): string {
  if (c.status !== "diff") return `${STATUS_ICON[c.status]}<span class="msg">${escapeHtml(c.message)}</span>`;
  return `<span class="add">+${c.added}</span> <span class="del">−${c.removed}</span> lines`;
}

function lineHtml(line: { text: string; segments: SideLine["segments"] }): string {
  if (!line.segments) return escapeHtml(line.text);
  return line.segments.map((g) => (g.changed ? `<span class="td-w">${escapeHtml(g.text)}</span>` : escapeHtml(g.text))).join("");
}

/** A full-width button standing in for the run of unchanged lines it hides. `data-expand` carries its id. */
function foldHtml(f: Fold, cols: number): string {
  return `<tr class="td-fold"><td colspan="${cols}"><button type="button" class="td-expand" data-expand="${escapeHtml(f.id)}"><span class="td-fold-ic">${ARROW[f.position]}</span><span>${escapeHtml(f.label)}</span></button></td></tr>`;
}

/** One side's three cells: number, sign, text. `kind` is "td-del" / "td-add" on a changed row, "" on a same row. */
function cells(side: SideLine | null, kind: "" | "td-del" | "td-add", first: string): string {
  if (!side) return `<td class="td-num td-blank ${first}"></td><td class="td-sign td-blank"></td><td class="td-code td-blank"></td>`;
  const sign = kind === "td-del" ? "−" : kind === "td-add" ? "+" : "";
  return `<td class="td-num ${kind} ${first}">${side.number}</td><td class="td-sign ${kind}">${sign}</td><td class="td-code ${kind}">${lineHtml(side)}</td>`;
}

function splitRowHtml(r: SplitRow): string {
  if (r.type === "fold") return foldHtml(r, 6);
  if (r.type === "same") return `<tr>${cells(r.old, "", "")}${cells(r.new, "", "td-new-start")}</tr>`;
  return `<tr>${cells(r.old, "td-del", "")}${cells(r.new, "td-add", "td-new-start")}</tr>`;
}

/** Combined: old number, new number, sign, text. */
function combinedRowHtml(r: CombinedRow): string {
  if (r.type === "fold") return foldHtml(r, 4);
  if (r.type === "same") {
    return `<tr><td class="td-num">${r.oldNo}</td><td class="td-num">${r.newNo}</td><td class="td-sign"></td><td class="td-code">${escapeHtml(r.text)}</td></tr>`;
  }
  const [k, sign, oldNo, newNo] = r.type === "removed" ? ["td-del", "−", r.oldNo, ""] : ["td-add", "+", "", r.newNo];
  return `<tr><td class="td-num ${k}">${oldNo}</td><td class="td-num ${k}">${newNo}</td><td class="td-sign ${k}">${sign}</td><td class="td-code ${k}">${lineHtml(r)}</td></tr>`;
}

/** The result body, side-by-side or combined. */
export function renderResult(c: Comparison, view: View): string {
  if (c.status !== "diff") {
    // Too large offers Compare, which reruns with no time limit.
    const compare = c.status === "too-large" ? `<button type="button" class="td-btn" data-compare>Compare</button>` : "";
    return `<div class="td-msg">${STATUS_ICON[c.status]}${escapeHtml(c.message)}${compare}</div>`;
  }
  if (view === "combined") {
    return `<table class="td-table td-combined"><colgroup><col class="td-c-num"><col class="td-c-num"><col class="td-c-sign"><col></colgroup><tbody>${c.combined.map(combinedRowHtml).join("")}</tbody></table>`;
  }
  const cols = `<col class="td-c-num"><col class="td-c-sign"><col>`;
  return `<table class="td-table td-split"><colgroup>${cols}${cols}</colgroup><tbody>${c.split.map(splitRowHtml).join("")}</tbody></table>`;
}

/** The count slot while Compare runs: a spinner and "Comparing…". */
export function renderCountComparing(): string {
  return `${SPINNER}<span class="msg">${COMPARING}</span>`;
}

/** The result body while Compare runs. */
export function renderResultComparing(): string {
  return `<div class="td-msg" role="status">${SPINNER}${COMPARING}</div>`;
}
