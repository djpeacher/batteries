/**
 * The formatted side's markup. Output that reads is one `.pp-line` per row:
 * its place in the fold gutter (a fold toggle where an item opens), then its
 * indent as spaces and each coloured span as `<span class="{kind}">`; plain
 * spans (the space after `:`) are bare text. Output that doesn't is the
 * error panel, drawn in its place.
 */
import { escapeHtml, icon } from "../../lib/html";
import type { Formatted } from "./_format";
import type { Row } from "./_fold";

const openIcon = icon(`<path d="m6 9 6 6 6-6"/>`, 12, 2.5);
const foldedIcon = icon(`<path d="m9 18 6-6-6-6"/>`, 12, 2.5);

/**
 * The markup for `rows`, the first of which is row `start` of the formatted
 * side; each line carries its row number as `data-row`.
 */
export function renderLines(rows: Row[], start = 0): string {
  let html = "";
  rows.forEach((row, i) => {
    html += `<div class="pp-line${row.folded ? " is-folded" : ""}" data-row="${start + i}"><span class="pp-gutter">`;
    if (row.fold) {
      html += row.folded
        ? `<button type="button" class="pp-fold" aria-expanded="false" aria-label="Unfold">${foldedIcon}</button>`
        : `<button type="button" class="pp-fold" aria-expanded="true" aria-label="Fold">${openIcon}</button>`;
    }
    html += `</span><span class="pp-row">${"  ".repeat(row.indent)}`;
    for (const s of row.spans) html += s.kind ? `<span class="${s.kind}">${escapeHtml(s.text)}</span>` : escapeHtml(s.text);
    html += "</span></div>";
  });
  return html;
}

/** Lines drawn beyond each edge of the view, so a fast scroll never shows a gap. */
export const OVERSCAN = 10;

/**
 * Which lines the formatted side draws: those in a view `height` tall whose
 * top is `top` below the first line's top, plus OVERSCAN either side, as the
 * half-open range [start, end) of `count` lines `lineHeight` tall.
 */
export function lineWindow(top: number, height: number, lineHeight: number, count: number): { start: number; end: number } {
  const first = Math.floor(Math.max(0, top) / lineHeight);
  const last = Math.ceil(Math.max(0, top + height) / lineHeight);
  return { start: Math.max(0, Math.min(count, first - OVERSCAN)), end: Math.min(count, last + OVERSCAN) };
}

/**
 * The row at height `y`, measured from the top of the first row: the
 * first row above them all, the last below them all.
 */
export function rowAtHeight(y: number, lineHeight: number, count: number): number {
  return Math.max(0, Math.min(count - 1, Math.floor(y / lineHeight)));
}

const alertIcon = icon(`<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>`);

/**
 * The error panel: a header with the message and where it is, then the bad
 * line between its neighbours, numbered as on the text side, with a caret
 * line under the column. `text` is the text side's text the error is in.
 */
export function renderError(f: Extract<Formatted, { kind: "error" }>, text: string): string {
  const { message, line, column } = f.error;
  const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));
  const first = Math.max(1, line - 1);
  const last = Math.min(lines.length, line + 1);
  const width = Math.max(2, String(last).length);
  const num = (n: number | "") => `<span class="n">${String(n).padStart(width)}</span>`;
  const bad = lines[line - 1] ?? "";
  // Tabs before the column stay tabs, so the caret lands under it at any tab size.
  const lead = bad.slice(0, column - 1).replace(/[^\t]/g, " ");

  let src = "";
  for (let n = first; n <= last; n++) {
    src += `<span class="pp-err-ln${n === line ? " bad" : ""}">${num(n)}${escapeHtml(lines[n - 1])}</span>`;
    if (n === line) src += `<span class="pp-err-ln caret">${num("")}${lead}^ ${escapeHtml(message)}</span>`;
  }
  const where = `${f.language} · line ${line}, column ${column}`;
  return (
    `<div class="pp-err" role="alert">` +
    `<div class="pp-err-head">${alertIcon}${escapeHtml(message[0].toUpperCase() + message.slice(1))}<span class="pp-err-where">${escapeHtml(where)}</span></div>` +
    `<pre class="pp-err-src">${src}</pre></div>`
  );
}

const infoIcon = icon(`<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>`);
const downloadIcon = icon(`<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>`, 12);

/**
 * The size notice: one line naming every size limit the text is over, with
 * a Download button at its end; nothing when it is over neither. `unsaved`
 * is text that won't survive a reload (too big to save, or the save was
 * refused); `plain` is output too big to colour or fold.
 */
export function renderNotice({ unsaved, plain }: { unsaved: boolean; plain: boolean }): string {
  const reasons = [unsaved && "Not kept after reload", plain && "Plain text, too big to colour"].filter(Boolean);
  if (!reasons.length) return "";
  return (
    `<div class="pp-notice" role="status">${infoIcon}` +
    `<span class="pp-notice-text">${reasons.join(` <span class="dot">·</span> `)}</span>` +
    `<button type="button" data-notice-download>${downloadIcon}Download</button></div>`
  );
}
