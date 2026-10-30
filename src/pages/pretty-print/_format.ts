/**
 * Pretty Print's formatter: the one entry point from the text side's text to
 * what the formatted side shows. Blank text shows nothing; text that reads
 * comes back as its language, the line model and the full formatted text
 * (what Copy and Download give); text that doesn't comes back as an error at
 * a 1-based line and column of the text side. Text over PLAIN_LIMIT comes
 * back plain: indented lines with no colours and no fold ranges.
 */
import { ReadError, readJson, readPython, type Root } from "./_reader";
import { lineText, print, type Line } from "./_print";

/** The language the text was read as, which the language label shows. */
export type Language = "JSON" | "Python";

export type Formatted =
  | { kind: "blank" }
  | { kind: "formatted"; language: Language; lines: Line[]; text: string; plain: boolean }
  | { kind: "error"; language: Language; error: { message: string; line: number; column: number } };

/**
 * Detection: text that reads as JSON is JSON (so `{"a": 1}` is JSON though
 * Python reads it too); else text that reads as Python is Python. Text that
 * reads as neither gets the error from the reader that got further into it,
 * a tie going to JSON.
 */
export function format(input: string, plainLimit = PLAIN_LIMIT): Formatted {
  if (!input.trim()) return { kind: "blank" };
  const json = attempt(readJson, input);
  if (json instanceof ReadError) {
    const python = attempt(readPython, input);
    if (!(python instanceof ReadError)) return formatted("Python", python, input.length > plainLimit);
    const [language, e] = python.offset > json.offset ? (["Python", python] as const) : (["JSON", json] as const);
    return { kind: "error", language, error: { message: e.message, ...position(input, e.offset) } };
  }
  return formatted("JSON", json, input.length > plainLimit);
}

function attempt(read: (text: string) => Root, text: string): Root | ReadError {
  try {
    return read(text);
  } catch (e) {
    if (e instanceof ReadError) return e;
    throw e;
  }
}

function formatted(language: Language, root: Root, plain: boolean): Formatted {
  let lines = print(root);
  // Plain: each line's text as one uncoloured span, and nothing to fold.
  if (plain) lines = lines.map((l) => ({ indent: l.indent, spans: [{ text: lineText({ indent: 0, spans: l.spans }) }] }));
  return { kind: "formatted", language, lines, text: lines.map(lineText).join("\n"), plain };
}

/**
 * Text longer than this many characters (about 20 MB) shows as plain
 * indented text, with no colours and no fold toggles, so the formatted side
 * stays usable.
 */
export const PLAIN_LIMIT = 20_000_000;

/** The 1-based line and column of an offset, counting the text side's lines. */
function position(text: string, offset: number) {
  const before = text.slice(0, offset);
  const lineStart = before.lastIndexOf("\n") + 1;
  return { line: before.split("\n").length, column: offset - lineStart + 1 };
}

/**
 * Text longer than this many characters (about 1 MB) waits for a pause in
 * typing before it is formatted, so each keystroke stays quick.
 */
export const DEBOUNCE_LIMIT = 1_000_000;
/** How long the pause is, in milliseconds. */
export const DEBOUNCE_MS = 300;

/** How long to wait after an edit before formatting text `length` characters long. */
export function formatDelay(length: number): number {
  return length > DEBOUNCE_LIMIT ? DEBOUNCE_MS : 0;
}
