/**
 * Markdown Preview's one saved document. A present key always wins, even an
 * empty one; no key at all is a first visit, which shows the sample. The
 * text is saved on every edit, so the sample never returns once it has been
 * edited or cleared.
 */
import { load, save } from "../../scripts/storage";

const TEXT_KEY = "batteries:markdown-preview:text";

/** The first-visit sample: headings, a table, a task list, labelled code, a diagram and math. */
export const SAMPLE = `# Welcome to Markdown Preview

Type on the text side and see it **rendered** here, live. This sample shows what the battery can do; edit or clear it and it won't come back.

## Text

Markdown has *emphasis*, **strong**, ~~strikethrough~~, \`inline code\`, and [links](https://github.github.com/gfm/). Raw HTML works too: press <kbd>Cmd</kbd> + <kbd>Z</kbd> to undo.

> A blockquote, for when someone else said it better.

## A table

| Battery          | Runs in       | Saves text |
| ---------------- | :-----------: | ---------: |
| Markdown Preview | your browser  |        yes |
| Text Diff        | your browser  |        yes |

## A task list

- [x] Write some markdown
- [x] See it rendered
- [ ] Make it your own

## Code

\`\`\`js
// Labelled fences are highlighted.
function greet(name) {
  return \`Hello, \${name}!\`;
}
\`\`\`

\`\`\`
An unlabelled fence stays plain.
\`\`\`

## A diagram

\`\`\`mermaid
graph LR
  A[Type markdown] --> B{Valid?}
  B -- yes --> C[Rendered side]
  B -- no --> D[Diagram error]
\`\`\`

## Math

Inline math sits in the line, like Euler's identity $e^{i\\pi} + 1 = 0$. Block math gets a line of its own:

$$
\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}
$$
`;

export function loadText(): string {
  // Nothing saved (or storage unavailable): a first visit, with the sample.
  return load(TEXT_KEY) ?? SAMPLE;
}

export function saveText(text: string) {
  save(TEXT_KEY, text);
}

/** Also read by the page's inline script, which applies the saved mode before first paint. */
export const MODE_KEY = "batteries:markdown-preview:mode";

/** Which sides show: both (the default), the text side only, or the rendered side only. */
export type Mode = "split" | "text" | "rendered";

/** The saved mode; split when none is saved. */
export function loadMode(): Mode {
  const saved = load(MODE_KEY);
  return saved === "text" || saved === "rendered" ? saved : "split";
}

export function saveMode(mode: Mode) {
  save(MODE_KEY, mode);
}
