/**
 * Pretty Print's reader: one tokenizer and a recursive-descent parser over
 * the pasted text, in two modes. Every value keeps its original text, so the
 * printer can re-emit numbers and strings exactly as written. `JSON.parse`
 * is not used: it loses `1.0` and big integers, and its errors differ per
 * engine.
 *
 * JSON mode is strict JSON plus `NaN`, `Infinity` and `-Infinity`.
 *
 * Python mode is what `ast.literal_eval` accepts: strings in all four quote
 * forms with r/u/b/br/rb prefixes (f- and t-strings rejected), adjacent
 * strings, `True`/`False`/`None`/`...`, dicts with any literal key, lists,
 * tuples, sets, `set()`, trailing commas, `#` comments, implicit line
 * joining, and every int/float/imaginary form with underscores, unary signs
 * and `1+2j`. It is widened for values copied from logs and REPLs: calls on
 * a name or dotted name with plain and `name=value` arguments, lowercase
 * `nan`/`inf`, and `<…>` reprs. Only True/False/None/nan/inf are bare names;
 * dotted names come only before `(`. Comments are kept on the item they sit
 * beside.
 */

/**
 * How a single value is coloured: strings, numbers (with NaN/Infinity and
 * nan/inf), true/false/null/True/False/None/`...`, and `<…>` reprs.
 */
export type ScalarKind = "string" | "number" | "constant" | "repr";

/** Which brackets a collection has: `{}` dict/object, `[]` list/array, `()` tuple, `{}` set, `Name()` call. */
export type Shape = "object" | "array" | "tuple" | "set" | "call";

/**
 * One member of a collection (or the whole text's value): its key in a
 * dict, its value, the own-line comments before it, and the end-of-line
 * comment after it. A comment inside an item but not beside it (after a
 * key, between adjacent strings) joins the comments before it.
 */
export type Item = {
  key?: Node;
  /** A call's named argument: the name before its `=`. */
  name?: string;
  value: Node;
  before: string[];
  after?: string;
};

/** The tree the reader builds. Keys are kept in order, duplicates included. */
export type Node =
  | { type: "scalar"; kind: ScalarKind; text: string }
  /** `set()`, the empty set. */
  | { type: "emptySet" }
  /** A value in parentheses that aren't a tuple, as in `('a' 'b')`. */
  | { type: "group"; inner: Node }
  /**
   * `open` is the comment on the opening bracket's line; `end` the own-line
   * comments before the closing bracket. A call's `name` is the (dotted)
   * name before its `(`; its items are its arguments.
   */
  | { type: "collection"; shape: Shape; name?: string; items: Item[]; open?: string; end: string[] };

/** The whole text: its one value, and the own-line comments after it. */
export type Root = { item: Item; end: string[] };

/**
 * A failed read: what went wrong and the offset into the text where it did.
 * The offset is also how far the read got, which detection compares between
 * readers.
 */
export class ReadError extends Error {
  constructor(
    message: string,
    readonly offset: number,
  ) {
    super(message);
  }
}

/**
 * How deep brackets may nest (parentheses after a sign included). Deeper
 * text is an error at the bracket that goes past it, rather than a reader
 * or printer recursing until the browser's stack runs out.
 */
export const MAX_DEPTH = 500;

type Mode = "json" | "python";

/** A comment, and whether it starts its own line (rather than ending one after a token). */
type Comment = { text: string; ownLine: boolean };

type Punct = "{" | "}" | "[" | "]" | "(" | ")" | ":" | "," | "+" | "-" | "=";
type Token = { start: number; comments: Comment[] } & (
  | { type: "punct"; text: Punct }
  /** `bytes` marks a b-prefixed string, which can't join a plain one. */
  | { type: "scalar"; kind: ScalarKind; text: string; bytes?: boolean }
  | { type: "name"; text: string }
  | { type: "end"; text: "" }
);

const JSON_SPACE = /[ \t\n\r]*/y;
const JSON_ESCAPE = /\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4})/y;
const JSON_NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const JSON_WORD = /-?Infinity|NaN|true|false|null/y;

/** Python trivia: whitespace, backslash line continuations and `#` comments. */
const PY_SPACE = /(?:[ \t\f]|\\\r?\n)*/y;
const PY_NEWLINE = /\r?\n|\r/y;
const PY_COMMENT = /#[^\r\n]*/y;
const DIGITS = String.raw`\d(?:_?\d)*`;
const PY_NUMBER = new RegExp(
  String.raw`0[xX](?:_?[0-9a-fA-F])+|0[oO](?:_?[0-7])+|0[bB](?:_?[01])+|` +
    String.raw`(?:${DIGITS}(?:\.(?:${DIGITS})?)?|\.${DIGITS})(?:[eE][+-]?${DIGITS})?[jJ]?`,
  "y",
);
/** A name, or a dotted name like `datetime.datetime`. */
const PY_NAME = /[\p{ID_Start}_][\p{ID_Continue}]*(?:\.[\p{ID_Start}_][\p{ID_Continue}]*)*/uy;
const STRING_PREFIX = /^(?:[rRuUbB]|[bB][rR]|[rR][bB])$/;
const TEMPLATE_PREFIX = /^(?:[fFtT]|[fFtT][rR]|[rR][fFtT])$/;
const PY_ESCAPE = /\\(?:x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|N\{[A-Za-z0-9 -]+\}|[^xuUN])/y;
const BYTES_ESCAPE = /\\(?:x[0-9a-fA-F]{2}|[^x])/y;

function match(re: RegExp, text: string, at: number): string | null {
  re.lastIndex = at;
  const m = re.exec(text);
  return m && m[0] ? m[0] : null;
}

/** Reads JSON text into a tree, or throws a ReadError. */
export const readJson = (text: string): Root => read(text, "json");

/** Reads a Python literal into a tree, or throws a ReadError. */
export const readPython = (text: string): Root => read(text, "python");

function read(text: string, mode: Mode): Root {
  const python = mode === "python";
  let pos = 0;
  let token = next();

  // ---- Tokenizer ---------------------------------------------------------

  function next(): Token {
    const comments = python ? trivia() : (match(JSON_SPACE, text, pos), (pos = JSON_SPACE.lastIndex), []);
    const start = pos;
    const t = python ? pythonToken(start) : jsonToken(start);
    return { ...t, start, comments } as Token;
  }

  // Skips whitespace and collects comments, noting which start their own line.
  function trivia(): Comment[] {
    const comments: Comment[] = [];
    let ownLine = pos === 0;
    for (;;) {
      PY_SPACE.lastIndex = pos;
      PY_SPACE.exec(text);
      pos = PY_SPACE.lastIndex;
      const nl = match(PY_NEWLINE, text, pos);
      if (nl) {
        pos += nl.length;
        ownLine = true;
        continue;
      }
      const c = match(PY_COMMENT, text, pos);
      if (!c) return comments;
      pos += c.length;
      comments.push({ text: c.trimEnd(), ownLine });
    }
  }

  function jsonToken(start: number) {
    if (pos >= text.length) return { type: "end", text: "" };
    const c = text[pos];
    if ("{}[]:,".includes(c)) {
      pos++;
      return { type: "punct", text: c };
    }
    if (c === '"') {
      pos = jsonStringEnd(start);
      return { type: "scalar", kind: "string", text: text.slice(start, pos) };
    }
    const word = match(JSON_WORD, text, pos);
    if (word) {
      pos += word.length;
      const kind = word === "true" || word === "false" || word === "null" ? "constant" : "number";
      return { type: "scalar", kind, text: word };
    }
    const n = match(JSON_NUMBER, text, pos);
    if (n) {
      pos += n.length;
      return { type: "scalar", kind: "number", text: n };
    }
    throw new ReadError(`unexpected character ${JSON.stringify(c)}`, start);
  }

  // The offset just past the string opening at `start`. A string still open
  // at the end of its line is unterminated, reported at its opening quote.
  function jsonStringEnd(start: number): number {
    let at = start + 1;
    for (;;) {
      const ch = text[at];
      if (ch === undefined || ch === "\n" || ch === "\r") throw new ReadError("unterminated string", start);
      if (ch === '"') return at + 1;
      if (ch === "\\") {
        const e = match(JSON_ESCAPE, text, at);
        if (!e) throw new ReadError("invalid escape in string", at);
        at += e.length;
      } else if (ch < " ") throw new ReadError("control character in string", at);
      else at++;
    }
  }

  function pythonToken(start: number) {
    if (pos >= text.length) return { type: "end", text: "" };
    const c = text[pos];
    if ("{}[]():,+-=".includes(c)) {
      pos++;
      return { type: "punct", text: c };
    }
    if (text.startsWith("...", pos)) {
      pos += 3;
      return { type: "scalar", kind: "constant", text: "..." };
    }
    if (c === "'" || c === '"') return pythonString(start, "");
    if (c === "<") return repr(start);
    const n = match(PY_NUMBER, text, pos);
    if (n) {
      pos += n.length;
      if (/^0[\d_]*$/.test(n) && /[1-9]/.test(n)) throw new ReadError("leading zeros are not allowed in an integer", start);
      if (/[\p{ID_Continue}]/u.test(text[pos] ?? "")) throw new ReadError("invalid number", start);
      return { type: "scalar", kind: "number", text: n };
    }
    const name = match(PY_NAME, text, pos);
    if (name) {
      const quoted = text[pos + name.length] === "'" || text[pos + name.length] === '"';
      if (quoted && STRING_PREFIX.test(name)) return pythonString(start, name);
      if (quoted && TEMPLATE_PREFIX.test(name)) {
        throw new ReadError(`${/[tT]/.test(name) ? "t" : "f"}-strings are not literals`, start);
      }
      pos += name.length;
      if (name === "True" || name === "False" || name === "None") return { type: "scalar", kind: "constant", text: name };
      if (name === "nan" || name === "inf") return { type: "scalar", kind: "number", text: name };
      return { type: "name", text: name };
    }
    throw new ReadError(`unexpected character ${JSON.stringify(c)}`, start);
  }

  // A string from `start`, its prefix already matched. A backslash always
  // skips the next character, even in a raw string, so `r'\''` holds a quote.
  function pythonString(start: number, prefix: string) {
    const raw = /[rR]/.test(prefix);
    const bytes = /[bB]/.test(prefix);
    let at = start + prefix.length;
    const q = text[at];
    const close = text.startsWith(q.repeat(3), at) ? q.repeat(3) : q;
    at += close.length;
    for (;;) {
      const ch = text[at];
      if (ch === undefined) throw new ReadError("unterminated string", start);
      if (close.length === 1 && (ch === "\n" || ch === "\r")) throw new ReadError("unterminated string", start);
      if (text.startsWith(close, at)) break;
      if (ch === "\\") {
        if (text[at + 1] === undefined) throw new ReadError("unterminated string", start);
        if (!raw && !match(bytes ? BYTES_ESCAPE : PY_ESCAPE, text, at)) throw new ReadError("invalid escape in string", at);
        at += text.startsWith("\r\n", at + 1) ? 3 : 2;
        continue;
      }
      if (bytes && ch > "\x7f") throw new ReadError("bytes can only contain ASCII characters", at);
      at++;
    }
    pos = at + close.length;
    return { type: "scalar", kind: "string", text: text.slice(start, pos), bytes };
  }

  // A `<…>` repr from `start`, one opaque value: nested `<…>` are matched
  // and quoted text is skipped, so a `>` in quotes doesn't end it. It must
  // close on its own line, else the error is at its `<`.
  function repr(start: number) {
    let depth = 0;
    let quote = "";
    for (let at = start; at < text.length; at++) {
      const ch = text[at];
      if (ch === "\n" || ch === "\r") break;
      if (quote) {
        if (ch === "\\") at++;
        else if (ch === quote) quote = "";
      } else if (ch === "'" || ch === '"') quote = ch;
      else if (ch === "<") depth++;
      else if (ch === ">" && --depth === 0) {
        pos = at + 1;
        return { type: "scalar", kind: "repr", text: text.slice(start, pos) };
      }
    }
    throw new ReadError("unclosed '<' in a repr", start);
  }

  // ---- Parser ------------------------------------------------------------

  // Comments met inside the item being read but not beside it; its reader
  // moves them before the item.
  let inside: string[] = [];

  // How many brackets the read is inside.
  let depth = 0;
  /** Reads inside one more bracket, the one at `at`, or throws once that is too deep. */
  function nested<T>(at: number, read: () => T): T {
    if (depth >= MAX_DEPTH) throw new ReadError("nested too deeply", at);
    depth++;
    try {
      return read();
    } finally {
      depth--;
    }
  }

  /** The current token's comments, taken so nothing else places them. */
  function take(): Comment[] {
    const c = token.comments;
    token.comments = [];
    return c;
  }

  /**
   * Moves past the current token as part of the item being read: comments
   * before it are inside the item. (Comments before an item's first token,
   * or before the comma or bracket after it, are placed by the collection.)
   */
  function advance() {
    inside.push(...take().map((c) => c.text));
    token = next();
  }

  const isPunct = (t: Token, p: Punct) => t.type === "punct" && t.text === p;

  function expect(punct: Punct, message: string) {
    if (!isPunct(token, punct)) throw new ReadError(message, token.start);
    advance();
  }

  /** Reads one item (a key and value in a dict, else a value) with its comments placed. */
  function item(read: () => Pick<Item, "key" | "name" | "value">, before: string[]): Item {
    const outer = inside;
    inside = [];
    const it = read();
    const placed = { ...it, before: [...before, ...inside] };
    inside = outer;
    return placed;
  }

  function value(): Node {
    const t = token;
    if (t.type === "scalar") {
      advance();
      if (t.kind === "string" && python) return strings(t);
      if (t.kind === "number" && python) return complex(t.text);
      return { type: "scalar", kind: t.kind, text: t.text };
    }
    if (python && (isPunct(t, "-") || isPunct(t, "+"))) {
      advance();
      return complex(t.text + signed(t.text));
    }
    if (t.type === "punct" && (t.text === "{" || t.text === "[" || (python && t.text === "("))) return collection(t.text);
    if (python && t.type === "name") {
      advance();
      return call(t);
    }
    throw new ReadError("expected a value", t.start);
  }

  // A name already read is only a value as a call: `Name(…)`, or `set()`.
  function call(name: Extract<Token, { type: "name" }>): Node {
    if (!isPunct(token, "(")) throw new ReadError(`unexpected name ${JSON.stringify(name.text)}`, name.start);
    const c = collection("(", name.text);
    if (name.text === "set" && c.type === "collection" && !c.items.length && c.open === undefined && !c.end.length) return { type: "emptySet" };
    return c;
  }

  // One argument of a call: `name=value`, or a value.
  function argument(): Pick<Item, "name" | "value"> {
    const t = token;
    if (t.type !== "name") return { value: value() };
    advance();
    if (isPunct(token, "=") && !t.text.includes(".")) {
      advance();
      return { name: t.text, value: value() };
    }
    return { value: call(t) };
  }

  // Adjacent strings join into one value, kept apart by one space.
  function strings(first: Extract<Token, { type: "scalar" }>): Node {
    let text = first.text;
    while (token.type === "scalar" && token.kind === "string") {
      if (!!token.bytes !== !!first.bytes) throw new ReadError("cannot mix bytes and strings", token.start);
      text += " " + token.text;
      advance();
    }
    return { type: "scalar", kind: "string", text };
  }

  // The number after `sign`: a bare number, or one in parentheses, as in `-(1)`.
  function signed(sign: string): string {
    const t = token;
    if (t.type === "scalar" && t.kind === "number") {
      advance();
      return t.text;
    }
    if (isPunct(t, "(")) {
      return nested(t.start, () => {
        advance();
        const inner = signed(sign);
        expect(")", "expected ')'");
        return `(${inner})`;
      });
    }
    throw new ReadError(`expected a number after '${sign}'`, t.start);
  }

  // A real number may be followed by `+` or `-` and an imaginary one, as in `1+2j`.
  function complex(real: string): Node {
    const imaginary = (s: string) => /[jJ]\)*$/.test(s);
    if (!imaginary(real) && (isPunct(token, "+") || isPunct(token, "-"))) {
      const op = token.text;
      advance();
      const at = token.start;
      const imag = signed(op);
      if (!imaginary(imag)) throw new ReadError(`expected an imaginary number after '${op}'`, at);
      return { type: "scalar", kind: "number", text: real + op + imag };
    }
    return { type: "scalar", kind: "number", text: real };
  }

  /** A bracketed collection, or with `name` a call's arguments. */
  function collection(open: "{" | "[" | "(", name?: string): Node {
    return nested(token.start, () => bracketed(open, name));
  }

  function bracketed(open: "{" | "[" | "(", name?: string): Node {
    const closer = { "{": "}", "[": "]", "(": ")" } as const;
    const close = closer[open];
    advance();
    const first = take();
    const afterOpen = first[0] && !first[0].ownLine ? first.shift()!.text : undefined;
    let before = first.map((c) => c.text);
    const items: Item[] = [];
    let shape: Shape = name !== undefined ? "call" : open === "[" ? "array" : open === "(" ? "tuple" : "object";
    let commas = 0;

    for (;;) {
      if (isPunct(token, close)) {
        // `(x)` without a comma is just `x`; its comments are inside the item it's in.
        if (shape === "tuple" && items.length === 1 && commas === 0) {
          const [it] = items;
          inside.push(...(afterOpen ? [afterOpen] : []), ...it.before, ...(it.after ? [it.after] : []), ...before);
          token = next();
          return { type: "group", inner: it.value };
        }
        token = next();
        return { type: "collection", shape, ...(name !== undefined && { name }), items, open: afterOpen, end: before };
      }
      const isFirst = items.length === 0;
      items.push(
        item(() => {
          if (shape === "call") return argument();
          if (open !== "{") return { value: value() };
          if (!python && (token.type !== "scalar" || token.kind !== "string")) throw new ReadError("expected a string key", token.start);
          const v = value();
          if (isFirst && python && !isPunct(token, ":")) shape = "set";
          if (shape === "set") return { value: v };
          expect(":", "expected ':' after a key");
          return { key: v, value: value() };
        }, before),
      );
      before = [];
      const it = items[items.length - 1];
      // Comments after the item: one on its line ends it; the rest go before the next.
      const place = (cs: Comment[]) => {
        for (const c of cs) {
          if (!c.ownLine && it.after === undefined) it.after = c.text;
          else before.push(c.text);
        }
      };
      place(take());
      if (isPunct(token, ",")) {
        commas++;
        token = next();
        place(take());
        if (!python && isPunct(token, close)) throw new ReadError("expected a value", token.start);
        continue;
      }
      if (!isPunct(token, close)) throw new ReadError(`expected ',' or '${close}'`, token.start);
    }
  }

  const first = take();
  const root = item(() => ({ value: value() }), first.map((c) => c.text));
  const end: string[] = [];
  for (const c of take()) {
    if (!c.ownLine && root.after === undefined) root.after = c.text;
    else end.push(c.text);
  }
  if (token.type !== "end") throw new ReadError("unexpected text after the value", token.start);
  return { item: root, end };
}
