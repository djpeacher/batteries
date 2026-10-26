/**
 * Text-box behaviour shared by both batteries' native textareas (Text Diff's
 * old side and new side, Markdown Preview's text side).
 *
 * - Tab inserts a tab character (the box shows it at tab size 4 by CSS).
 *   Escape arms the next Tab to move focus out normally; any other key
 *   disarms it, so nobody is trapped in a box.
 * - Replacing a box's whole text (Drop, Open, Swap) goes through the
 *   browser's own editing, so native Cmd-Z restores the previous text and
 *   the box fires `input` like any edit. `execCommand` is deprecated but is
 *   still the only way to edit a textarea onto its native undo stack.
 */

/** Wire Tab and Escape-then-Tab on a text box. */
export function wireTextBox(box: HTMLTextAreaElement) {
  let escaped = false;
  box.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      escaped = true;
      return;
    }
    if (e.key === "Tab" && !escaped && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      document.execCommand("insertText", false, "\t");
    }
    escaped = false;
  });
  box.addEventListener("blur", () => (escaped = false));
}

// Boxes replaced together by one replaceTogether call, in edit order, while
// their steps can still be reached by undo (or, once undone, by redo).
// `later` counts, per box, the edits made since that sit above the group's
// step on the box's undo stack: undoing them brings the group's step back
// next, so Swap, type, undo the typing, undo still restores both sides.
type Group = { boxes: HTMLTextAreaElement[]; undone: boolean; later: Map<HTMLTextAreaElement, number> };
let group: Group | null = null;
// Set while this module drives undo or redo itself, so it doesn't echo.
let replaying = false;
const wired = new WeakSet<HTMLTextAreaElement>();

/** Swap the whole text of a box by native editing: one undo step. */
function edit(box: HTMLTextAreaElement, text: string) {
  if (box.value === text) return;
  box.focus();
  box.select();
  if (text) document.execCommand("insertText", false, text);
  else document.execCommand("delete");
  box.setSelectionRange(0, 0);
  box.scrollTop = 0;
  box.scrollLeft = 0;
}

/**
 * Remembers where focus is, and whether its ring shows, so focus can go back
 * there after the edits move it through the boxes. A text box always shows
 * the ring, and Chromium carries it to the next scripted focus, so a clicked
 * Swap would come back ringed without `focusVisible`.
 */
function focusBack(): () => void {
  const active = document.activeElement as HTMLElement | null;
  const ring = active?.matches(":focus-visible") ?? false;
  return () => active?.focus({ focusVisible: ring });
}

/** Replace a box's whole text, undoable with Cmd-Z. Focus stays in the box. */
export function replaceText(box: HTMLTextAreaElement, text: string) {
  watch(box);
  group = null;
  edit(box, text);
}

/**
 * Replace several boxes' texts as one change: one Cmd-Z (or redo), wherever
 * focus is, undoes (or redoes) all of them. Focus returns where it was.
 */
export function replaceTogether(changes: [HTMLTextAreaElement, string][]) {
  const back = focusBack();
  const boxes = changes.filter(([box, text]) => box.value !== text).map(([box]) => box);
  for (const box of boxes) watch(box);
  for (const [box, text] of changes) edit(box, text);
  group = boxes.length > 1 ? { boxes, undone: false, later: new Map(boxes.map((b) => [b, 0])) } : null;
  back();
}

/**
 * Step the group's boxes through undo or redo, each with focus inside it:
 * Chromium misapplies a redo that lands in a box other than the last one it
 * touched, so the module walks the boxes itself rather than leaving the
 * second step to the browser. `skip` is a box the browser already stepped.
 */
function step(g: Group, kind: "undo" | "redo", skip?: HTMLTextAreaElement) {
  const order = kind === "undo" ? [...g.boxes].reverse() : g.boxes;
  const back = focusBack();
  g.undone = kind === "undo";
  replaying = true;
  try {
    for (const box of order) {
      if (box === skip) continue;
      box.focus();
      document.execCommand(kind);
    }
  } finally {
    replaying = false;
  }
  back();
}

/** Whether the group's own step is the next undo (or redo) for the box with focus. */
function groupIsNext(g: Group, kind: "undo" | "redo"): boolean {
  if ((kind === "undo") === g.undone) return false;
  const active = document.activeElement as HTMLTextAreaElement | null;
  // Focus outside the group's boxes: only when no box has later edits.
  const later = active && g.later.has(active) ? g.later.get(active)! : Math.max(...g.later.values());
  return later === 0;
}

// Cmd-Z / Ctrl-Z and their redos, while a group's steps are next: handled
// here so every box steps with focus inside it.
let keysWired = false;
function wireKeys() {
  if (keysWired) return;
  keysWired = true;
  document.addEventListener(
    "keydown",
    (e) => {
      if (!group || e.altKey || !(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      const kind = key === "z" ? (e.shiftKey ? "redo" : "undo") : key === "y" && e.ctrlKey ? "redo" : null;
      if (!kind || !groupIsNext(group, kind)) return;
      e.preventDefault();
      step(group, kind);
    },
    true,
  );
}

function watch(box: HTMLTextAreaElement) {
  wireKeys();
  if (wired.has(box)) return;
  wired.add(box);
  // Undo or redo from the Edit menu skips the keys above: carry the rest of
  // the group along after the browser steps this box.
  box.addEventListener("input", (e) => {
    if (replaying || !group || !group.later.has(box)) return;
    const type = (e as InputEvent).inputType;
    const kind = type === "historyUndo" ? "undo" : type === "historyRedo" ? "redo" : null;
    const later = group.later.get(box)!;
    if (!kind) {
      // A new edit after the group was undone clears its redo: the group is
      // out of reach. Otherwise it sits above the group's step.
      if (group.undone) group = null;
      else group.later.set(box, later + 1);
      return;
    }
    if (kind === "undo" && later > 0) group.later.set(box, later - 1);
    else if (kind === "redo" && !group.undone) group.later.set(box, later + 1);
    else if ((kind === "undo") === group.undone) group = null; // past the group's step, into older history
    else step(group, kind, box); // the group's own step, from the Edit menu: carry the other boxes along
  });
}
