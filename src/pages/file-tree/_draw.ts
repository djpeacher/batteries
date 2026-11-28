/**
 * File Tree's drawer: the one entry point from the text side's outline to
 * what the tree side shows. It returns the tree side's text (what Copy gives)
 * and, per drawn line, the tree lines, the name, the padding and the comment
 * apart, so the page can mute the tree lines and grey the comment.
 *
 * Reading the outline:
 * - Blank and whitespace-only lines are dropped; trailing whitespace is trimmed.
 * - A line's indent is the column its name starts at: a space is one column,
 *   a tab advances to the next multiple of 4.
 * - Depth is relative. A line indented deeper than the line above is its
 *   child, one level down however much deeper. A line at a sibling's indent
 *   is that sibling's sibling. A line dedented to an indent no line above it
 *   on its path used becomes a child of the nearest shallower line, and a line
 *   no shallower line comes before is top-level.
 * - Names are drawn exactly as typed: no `/` added, a leading `- ` kept,
 *   typed order and repeated names kept, no root line added.
 *
 * Comments:
 * - A run of spaces or tabs after the name, then the first `#`, starts a
 *   comment; everything from that `#` on is comment text as typed. A `#`
 *   with no space before it, or with only indentation before it, is part of
 *   the name.
 * - Every comment's `#` sits in one column for the whole tree, 2 columns past
 *   the longest line that has a comment; wide characters (CJK, emoji) count
 *   as 2, and a tab inside a name reaches the next multiple of 8 columns from
 *   the line's start, as the tree side and a terminal show it. Lines without
 *   a comment end at the name, with no padding.
 */

/** One drawn line of the tree side. */
export type TreeLine = {
  /** The tree lines before the name: `│   `, `    `, then `├── ` or `└── `; empty at top level. */
  prefix: string;
  /** The name exactly as typed, trailing whitespace trimmed. */
  name: string;
  /** The spaces from the end of the name to the comment column; empty without a comment. */
  pad: string;
  /** The comment from its `#`, trailing whitespace trimmed; empty without one. */
  comment: string;
};

export type Drawing = {
  /** The tree side's text: every line, no trailing whitespace, no trailing newline. */
  text: string;
  lines: TreeLine[];
};

/** Columns a tab advances to the next multiple of, in indentation. */
const TAB = 4;
/** Columns a tab inside a name advances to the next multiple of, as the tree side shows it. */
const NAME_TAB = 8;

/** A line of the outline with a name, placed in the tree. */
type Node = { name: string; comment: string; depth: number; parent: number };

/** Spaces or tabs, then a `#`: where a comment starts. */
const COMMENT = /[ \t]+#/;
/** The gap between the longest commented line and the comment column. */
const GAP = 2;

export function draw(outline: string): Drawing {
  const nodes = place(outline);
  // The last child of each line, by index; -1 is the top level.
  const lastChild = new Map<number, number>();
  nodes.forEach((n, i) => lastChild.set(n.parent, i));
  const isLast = (i: number) => lastChild.get(nodes[i].parent) === i;

  const prefixes = nodes.map((n, i) => {
    if (n.depth === 0) return "";
    let prefix = isLast(i) ? "└── " : "├── ";
    for (let a = n.parent; nodes[a].depth > 0; a = nodes[a].parent) prefix = (isLast(a) ? "    " : "│   ") + prefix;
    return prefix;
  });
  let column = 0;
  nodes.forEach((n, i) => {
    if (n.comment) column = Math.max(column, width(prefixes[i] + n.name) + GAP);
  });
  const lines = nodes.map((n, i): TreeLine => ({
    prefix: prefixes[i],
    name: n.name,
    pad: n.comment ? " ".repeat(column - width(prefixes[i] + n.name)) : "",
    comment: n.comment,
  }));
  return { text: lines.map((l) => l.prefix + l.name + l.pad + l.comment).join("\n"), lines };
}

/** A line of the outline with a name: its indentation, the rest, and where it sits. */
export type OutlineLine = {
  /** The leading spaces and tabs. */
  lead: string;
  /** The column the name starts at. */
  indent: number;
  /** The name and any comment, trailing whitespace trimmed. */
  content: string;
  /** How many lines up the path it is from the top level; 0 at top level. */
  depth: number;
  /** The index of its parent line, or -1 at top level. */
  parent: number;
};

/** Every line with a name, with its depth and parent, by the reading rules above. */
export function readOutline(outline: string): OutlineLine[] {
  const lines: OutlineLine[] = [];
  // The lines on the path to the current line, by index.
  const path: number[] = [];
  for (const raw of outline.split(/\r\n?|\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    const lead = leading(line);
    const indent = columns(lead);
    while (path.length && lines[path.at(-1)!].indent > indent) path.pop();
    if (path.length && lines[path.at(-1)!].indent === indent) path.pop();
    lines.push({ lead, indent, content: line.slice(lead.length), depth: path.length, parent: path.length ? path.at(-1)! : -1 });
    path.push(lines.length - 1);
  }
  return lines;
}

/** Every line with a name, its comment split off. */
function place(outline: string): Node[] {
  return readOutline(outline).map(({ content, depth, parent }) => {
    const m = COMMENT.exec(content);
    return {
      name: m ? content.slice(0, m.index) : content,
      comment: m ? content.slice(m.index + m[0].length - 1) : "",
      depth,
      parent,
    };
  });
}

/** The leading spaces and tabs of `s`. */
export const leading = (s: string) => /^[ \t]*/.exec(s)![0];

/** The column a run of leading spaces and tabs ends at: a tab advances to the next multiple of 4. */
export function columns(lead: string): number {
  let col = 0;
  for (const c of lead) col = c === "\t" ? (Math.floor(col / TAB) + 1) * TAB : col + 1;
  return col;
}

/** Wide on screen: East Asian wide and fullwidth blocks (CJK, Hangul, kana, fullwidth forms). */
const WIDE = /[\u1100-\u115f\u2e80-\u303e\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\ua000-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6\u{20000}-\u{3fffd}]/u;
/** Drawn as an emoji: emoji presentation by default, or asked for with VS16. */
const EMOJI = /\p{Emoji_Presentation}|\ufe0f/u;
/** Takes no column of its own: combining marks, zero-width and format characters. */
const ZERO_WIDTH = /^[\p{Mn}\p{Me}\p{Cf}]+$/u;
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Columns one grapheme other than a tab takes: 2 for wide characters and emoji. */
const cellWidth = (g: string) => (EMOJI.test(g) || WIDE.test(g) ? 2 : ZERO_WIDTH.test(g) ? 0 : 1);

/**
 * How many columns a line's text takes in a monospace font, from the line's
 * start: wide characters and emoji count as 2, and a tab reaches the next
 * multiple of 8.
 */
export function width(s: string): number {
  let w = 0;
  for (const { segment } of graphemes.segment(s)) w = segment === "\t" ? (Math.floor(w / NAME_TAB) + 1) * NAME_TAB : w + cellWidth(segment);
  return w;
}

/** A string split into graphemes, each marked when it takes 2 columns. */
export function segments(s: string): { text: string; wide: boolean }[] {
  return Array.from(graphemes.segment(s), ({ segment }) => ({ text: segment, wide: cellWidth(segment) === 2 }));
}
