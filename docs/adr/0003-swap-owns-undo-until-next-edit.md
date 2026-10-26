# Swap takes over undo and redo until the next edit

Swap replaces both the Old side and the New side, and one Cmd-Z must restore both. A textarea's native undo stack belongs to that box alone, so the browser can't undo two boxes as one step. Instead, `src/scripts/textbox.ts` writes each replacement through `execCommand("insertText")`, so it lands on that box's native stack. While Swap's steps are next on the stacks, the module intercepts Cmd/Ctrl-Z, Cmd-Shift-Z and Ctrl-Y, and listens for the browser's undo and redo events (as from the Edit menu), stepping both boxes together. It counts the edits made after the Swap, so undoing those edits brings the Swap back as one step. Any other new edit ends the pairing. We rejected a custom undo stack because it would lose native undo for ordinary typing, and Drop and Open rely on the native stack too. `execCommand` is deprecated, but it is still the only way to edit a textarea onto its native undo stack. Markdown Preview's Text side shares this module.

## Consequences

- Chromium's own redo can empty a box whose text ends in a newline. That bug is the browser's, not ours, and it also affects redo after Swap.
