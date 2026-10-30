# Pretty Print owns copy on the formatted side

The formatted side draws only the lines in view, and a folded item hides its lines behind one row, so the browser's own copy holds only what is drawn: a long selection loses every undrawn line and a fold copies as `{…}`. `src/pages/pretty-print/index.astro` therefore intercepts ⌘C and ⌘A on the formatted side and copies the full text of whole selected lines, folded contents included. It finds the selected lines from where the pointer pressed and released, measured against the line height, not from the browser's selection, because the selection's ends may be lines that are no longer drawn. We rejected drawing every line (too slow for multi-MB pastes) and copying the browser's selection as is (it loses lines).

## Consequences

- A selection inside one line copies the whole line.
- A selection made with Shift and the arrow keys is not tracked and falls back to the browser's own copy, so it can still lose undrawn lines.
