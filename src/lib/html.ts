/**
 * Small HTML-string helpers shared by the pages' build-time markup and the
 * scripts that draw markup at run time. No DOM.
 */

/** Escapes text for use inside HTML text or a quoted attribute. */
export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A stroked 24×24 line icon (Lucide style), hidden from assistive tech. `d` is its inner SVG. */
export const icon = (d: string, size = 14, strokeWidth = 2) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
