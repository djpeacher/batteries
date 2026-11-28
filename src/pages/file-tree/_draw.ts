/**
 * File Tree's drawer: the one entry point from the text side's outline to
 * what the tree side shows. It returns the tree side's text (what Copy gives)
 * and, per drawn line, the tree lines before the name, so the page can mute
 * them.
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
 */

/** One drawn line of the tree side. */
export type TreeLine = {
  /** The tree lines before the name: `│   `, `    `, then `├── ` or `└── `; empty at top level. */
  prefix: string;
  /** The name exactly as typed, trailing whitespace trimmed. */
  name: string;
};

export type Drawing = {
  /** The tree side's text: every line, no trailing whitespace, no trailing newline. */
  text: string;
  lines: TreeLine[];
};

const TAB = 4;

/** A line of the outline with a name, placed in the tree. */
type Node = { name: string; depth: number; parent: number };

export function draw(outline: string): Drawing {
  const nodes = place(outline);
  // The last child of each line, by index; -1 is the top level.
  const lastChild = new Map<number, number>();
  nodes.forEach((n, i) => lastChild.set(n.parent, i));
  const isLast = (i: number) => lastChild.get(nodes[i].parent) === i;

  const lines = nodes.map((n, i): TreeLine => {
    if (n.depth === 0) return { prefix: "", name: n.name };
    let prefix = isLast(i) ? "└── " : "├── ";
    for (let a = n.parent; nodes[a].depth > 0; a = nodes[a].parent) prefix = (isLast(a) ? "    " : "│   ") + prefix;
    return { prefix, name: n.name };
  });
  return { text: lines.map((l) => l.prefix + l.name).join("\n"), lines };
}

/** Every line with a name, with its depth and parent, by the reading rules above. */
function place(outline: string): Node[] {
  const nodes: Node[] = [];
  // The lines on the path to the current line: each one's indent and index.
  const path: { indent: number; node: number }[] = [];
  for (const raw of outline.split(/\r\n?|\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    const lead = /^[ \t]*/.exec(line)![0];
    const indent = columns(lead);
    while (path.length && path.at(-1)!.indent > indent) path.pop();
    if (path.length && path.at(-1)!.indent === indent) path.pop();
    const depth = path.length;
    nodes.push({ name: line.slice(lead.length), depth, parent: depth ? path.at(-1)!.node : -1 });
    path.push({ indent, node: nodes.length - 1 });
  }
  return nodes;
}

/** The column a run of spaces and tabs ends at. */
function columns(lead: string): number {
  let col = 0;
  for (const c of lead) col = c === "\t" ? (Math.floor(col / TAB) + 1) * TAB : col + 1;
  return col;
}
