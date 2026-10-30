import { describe, expect, it } from "vitest";
import { format, formatDelay } from "./_format";
import { MAX_DEPTH } from "./_reader";

/** The formatted text for a paste that reads, failing the test if it doesn't. */
function text(input: string): string {
  const f = format(input);
  if (f.kind !== "formatted") throw new Error(`expected formatted output, got ${JSON.stringify(f)}`);
  return f.text;
}

describe("format: blank text", () => {
  it.each(["", "   ", "\n\t \r\n"])("leaves the formatted side blank for %j", (input) => {
    expect(format(input)).toEqual({ kind: "blank" });
  });
});

describe("format: JSON layout", () => {
  it("puts every item on its own line at a 2-space indent", () => {
    expect(text(`{"a":1,"b":[true,false,null]}`)).toBe(
      `{\n  "a": 1,\n  "b": [\n    true,\n    false,\n    null\n  ]\n}`,
    );
  });
});

describe("format: JSON layout rules", () => {
  it.each([
    ["keeps empty {} and [] inline", `{"a":{},"b":[ ]}`, `{\n  "a": {},\n  "b": []\n}`],
    ["keeps a lone empty value on one line", ` { } `, `{}`],
    ["keeps the original key order", `{"z":1,"a":2,"m":3}`, `{\n  "z": 1,\n  "a": 2,\n  "m": 3\n}`],
    ["re-indents a badly indented paste", `{\n        "a" :1 ,\n"b":\n\n[1]}`, `{\n  "a": 1,\n  "b": [\n    1\n  ]\n}`],
    [
      "nests at 2 spaces per level",
      `[[{"a":[1]}]]`,
      `[\n  [\n    {\n      "a": [\n        1\n      ]\n    }\n  ]\n]`,
    ],
  ])("%s", (_, input, expected) => {
    expect(text(input)).toBe(expected);
  });
});

describe("format: JSON fidelity", () => {
  it.each([
    ["1.0", `[1.0]`, `[\n  1.0\n]`],
    ["1e3", `[1e3, -2.5E-7]`, `[\n  1e3,\n  -2.5E-7\n]`],
    ["a big integer", `[12345678901234567890]`, `[\n  12345678901234567890\n]`],
    ["escapes", `["a\\"b\\\\c\\u00e9\\n\\/"]`, `[\n  "a\\"b\\\\c\\u00e9\\n\\/"\n]`],
    ["duplicate keys, both of them", `{"a":1,"a":2}`, `{\n  "a": 1,\n  "a": 2\n}`],
    ["NaN, Infinity and -Infinity", `[NaN,Infinity,-Infinity]`, `[\n  NaN,\n  Infinity,\n  -Infinity\n]`],
  ])("keeps %s exactly as written", (_, input, expected) => {
    expect(text(input)).toBe(expected);
  });

  it.each([`{"a": [1, 2.50, {"b": null}], "c": "x\\ty", "d": true, "e": false, "f": {}}`, `[-0, 0.1e+2, "\\ud83d\\ude00"]`])(
    "gives text that loads back to the same value as %s",
    (input) => {
      expect(JSON.parse(text(input))).toEqual(JSON.parse(input));
    },
  );

  it("changes only whitespace and line breaks", () => {
    const input = `{"id":1042,"tags":["a" , "b"],"n":{"x":1.50}}`;
    expect(text(input).replace(/\s/g, "")).toBe(input.replace(/\s/g, ""));
  });
});

describe("format: bare top-level values", () => {
  it.each([
    ["42", "num"],
    [`"hi"`, "str"],
    ["null", "const"],
    ["-Infinity", "num"],
  ])("accepts and colours %s", (input, kind) => {
    const f = format(` ${input}\n`);
    expect(f).toMatchObject({ kind: "formatted", language: "JSON", text: input });
    if (f.kind === "formatted") expect(f.lines).toEqual([{ indent: 0, spans: [{ kind, text: input }] }]);
  });
});

describe("format: colouring", () => {
  it("colours keys, strings, numbers, constants and punctuation", () => {
    const f = format(`{"k":"v","n":[1,true]}`);
    if (f.kind !== "formatted") throw new Error("expected formatted output");
    expect(f.language).toBe("JSON");
    const kinds = f.lines.map((l) => l.spans.map((s) => (s.kind ? `${s.kind}:${s.text}` : s.text)));
    expect(kinds).toEqual([
      ["punct:{"],
      ["key:\"k\"", "punct::", " ", "str:\"v\"", "punct:,"],
      ["key:\"n\"", "punct::", " ", "punct:["],
      ["num:1", "punct:,"],
      ["const:true"],
      ["punct:]"],
      ["punct:}"],
    ]);
  });
});

describe("format: text that doesn't read", () => {
  it.each([`{"a":}`, `[1,,]`, `{'a': }`, `{"a" 1}`, `"unterminated`, `[1] 2`, `[01]`])("gives no formatted output for %s", (input) => {
    expect(format(input).kind).toBe("error");
  });
});

describe("format: where text that doesn't read goes wrong", () => {
  it.each([
    ["on the first line", `{"a":}`, "expected a value", 1, 6],
    ["mid-line on a later line", `{\n  "a": 1,\n  "b" 2\n}`, "expected ':' after a key", 3, 7],
    ["at the end of the text", `{"a": [1, 2],\n "b":`, "expected a value", 2, 6],
    ["an unterminated string, at its opening quote", `["ok",\n "never closed]`, "unterminated string", 2, 2],
    ["a missing ]", `[1, 2\n`, "expected ',' or ']'", 2, 1],
    ["a missing ] before a }", `{"a": [1, 2}`, "expected ',' or ']'", 1, 12],
    ["an unknown character", `[1, @]`, `unexpected character "@"`, 1, 5],
    ["a bad escape, at its backslash", `["a\\xqb"]`, "invalid escape in string", 1, 4],
    ["a raw tab in a string, at the tab", `[true, "a\tb"]`, "control character in string", 1, 10],
    ["text after the value", `[1]\n[2]`, "unexpected text after the value", 2, 1],
    ["a doubled comma", `[1,\n,]`, "expected a value", 2, 1],
  ])("reports %s", (_, input, message, line, column) => {
    expect(format(input)).toEqual({ kind: "error", language: "JSON", error: { message, line, column } });
  });
});

describe("format: text nested too deeply", () => {
  it("formats text nested as deep as the limit", () => {
    const input = "[".repeat(MAX_DEPTH) + "1" + "]".repeat(MAX_DEPTH);
    expect(format(input).kind).toBe("formatted");
  });
  it.each([
    ["a JSON list", "[".repeat(100_000), "JSON"],
    ["Python tuples", "(".repeat(100_000), "Python"],
    ["Python calls", "f(".repeat(50_000), "Python"],
  ])("reports %s nested past the limit at the bracket that goes too deep, without throwing", (_, input, language) => {
    const f = format(input);
    expect(f.kind).toBe("error");
    if (f.kind !== "error") return;
    expect(f.language).toBe(language);
    expect(f.error.message).toBe("nested too deeply");
    expect(f.error.line).toBe(1);
    expect(input.slice(0, f.error.column)).toMatch(/[[(]$/);
  });
  it("reports parentheses nested past the limit after a sign", () => {
    const f = format("-" + "(".repeat(100_000) + "1");
    expect(f.kind === "error" && f.error.message).toBe("nested too deeply");
  });
});

describe("format: detection", () => {
  it.each([
    ["an object", `{"a": 1}`, "JSON"],
    ["a list", `[1, 2]`, "JSON"],
    ["a trailing comma", `{"a": 1,}`, "Python"],
    ["single quotes and True", `{'a': True}`, "Python"],
    ["a # comment", `{"a": 1}  # note`, "Python"],
    ["None at the top level", `None`, "Python"],
  ])("labels %s as %s", (_, input, language) => {
    expect(format(input)).toMatchObject({ kind: "formatted", language });
  });
});

// Expected text checked once against CPython 3.9: each input and its
// expected output load to the same value with `ast.literal_eval`.
describe("format: Python layout", () => {
  it.each([
    ["a tuple like a list", "(1, 'a')", "(\n  1,\n  'a'\n)"],
    ["a set like a list", "{1, 2}", "{\n  1,\n  2\n}"],
    ["an empty tuple inline", "[(), ( )]", "[\n  (),\n  ()\n]"],
    ["set() inline", "{'s': set( )}", "{\n  's': set()\n}"],
    ["a one-item tuple keeps its comma", "('x',)", "(\n  'x',\n)"],
    ["a nested one-item tuple keeps its comma", "[(1,), 2]", "[\n  (\n    1,\n  ),\n  2\n]"],
    ["trailing commas dropped", "{'a': [1, 2,], 'b': {3,},}", "{\n  'a': [\n    1,\n    2\n  ],\n  'b': {\n    3\n  }\n}"],
    ["trailing comma dropped from a tuple", "(1, 2,)", "(\n  1,\n  2\n)"],
    ["dict keys of any literal", "{1: 'a', None: 2, (1, 2): 3}", "{\n  1: 'a',\n  None: 2,\n  (\n    1,\n    2\n  ): 3\n}"],
    ["parentheses that aren't a tuple", "[(1), ('a'\n 'b')]", "[\n  (1),\n  ('a' 'b')\n]"],
    ["True, False, None and Ellipsis", "[True, False, None, ...]", "[\n  True,\n  False,\n  None,\n  ...\n]"],
    ["implicit line joining and backslash continuation", "[1,\n\n   2, \\\n 3]", "[\n  1,\n  2,\n  3\n]"],
    ["adjacent strings on one line with one space", "{'k': 'hello '\n    \"world\"   r'!'}", "{\n  'k': 'hello ' \"world\" r'!'\n}"],
  ])("%s", (_, input, expected) => {
    expect(format(input)).toMatchObject({ kind: "formatted", language: "Python", text: expected });
  });
});

describe("format: Python fidelity", () => {
  it.each([
    ["quote forms", "['a', \"b\", '''c\nd''', \"\"\"e\"\"\"]", "[\n  'a',\n  \"b\",\n  '''c\nd''',\n  \"\"\"e\"\"\"\n]"],
    ["prefixes in any case", "[r'\\d', U'x', b'y', Br'\\z', rB'w', R\"v\"]", "[\n  r'\\d',\n  U'x',\n  b'y',\n  Br'\\z',\n  rB'w',\n  R\"v\"\n]"],
    ["escapes", "['it\\'s', \"\\x41\\u00e9\\N{BULLET}\\n\", 'a\\\nb', r'\\'']", "[\n  'it\\'s',\n  \"\\x41\\u00e9\\N{BULLET}\\n\",\n  'a\\\nb',\n  r'\\''\n]"],
    ["unknown escapes kept", "['\\q', b'\\u']", "[\n  '\\q',\n  b'\\u'\n]"],
    ["int forms", "[0x1F, 0o17, 0b101, 1_000, 0, 00, 12345678901234567890]", "[\n  0x1F,\n  0o17,\n  0b101,\n  1_000,\n  0,\n  00,\n  12345678901234567890\n]"],
    ["float forms", "[.5, 5., 1e3, 1.5E-3, 1_0.0_1, 01.5]", "[\n  .5,\n  5.,\n  1e3,\n  1.5E-3,\n  1_0.0_1,\n  01.5\n]"],
    ["imaginary and complex", "[1j, 1.5e10J, 1+2j, -1 - 2.5j, 3-0j]", "[\n  1j,\n  1.5e10J,\n  1+2j,\n  -1-2.5j,\n  3-0j\n]"],
    ["unary signs", "[-1, +2, - 3, -(4), -.5]", "[\n  -1,\n  +2,\n  -3,\n  -(4),\n  -.5\n]"],
  ])("keeps %s exactly as written", (_, input, expected) => {
    expect(format(input)).toMatchObject({ kind: "formatted", language: "Python", text: expected });
  });
});

describe("format: Python comments", () => {
  it.each([
    ["an own-line comment before the same item at its indent", "{'a': 1,\n        # about b\n 'b': 2}", "{\n  'a': 1,\n  # about b\n  'b': 2\n}"],
    ["an end-of-line comment after the item's comma", "{'a': 1, # one\n 'b': 2}", "{\n  'a': 1,  # one\n  'b': 2\n}"],
    ["an end-of-line comment written before the comma", "[1 # one\n , 2]", "[\n  1,  # one\n  2\n]"],
    ["an end-of-line comment on the last item, its trailing comma dropped", "[1,\n 2,   # two   \n]", "[\n  1,\n  2  # two\n]"],
    ["a comment after an opening bracket on that line", "[ # list\n 1]", "[  # list\n  1\n]"],
    ["a comment before a closing bracket on its own line at the inner indent", "{'a': [1,\n# end of list\n]}", "{\n  'a': [\n    1\n    # end of list\n  ]\n}"],
    ["comments in an empty collection", "[ # open\n  # inside\n]", "[  # open\n  # inside\n]"],
    ["an end-of-line comment after a nested closing bracket", "{'a': [1], # list\n 'b': 2}", "{\n  'a': [\n    1\n  ],  # list\n  'b': 2\n}"],
    ["comments around the whole value", "# head\n{'a': 1}  # tail\n# after", "# head\n{\n  'a': 1\n}  # tail\n# after"],
    ["a comment inside an item moves before it", "{'a': # about a\n   1, 'b': ('x'  # x\n  'y')}", "{\n  # about a\n  'a': 1,\n  # x\n  'b': ('x' 'y')\n}"],
    ["a one-item tuple's comment after its comma", "('x', # only\n)", "(\n  'x',  # only\n)"],
  ])("keeps %s", (_, input, expected) => {
    expect(format(input)).toMatchObject({ kind: "formatted", language: "Python", text: expected });
  });

  it("colours comments as comments", () => {
    const f = format(`[1, # one\n]`);
    if (f.kind !== "formatted") throw new Error("expected formatted output");
    expect(f.lines[1].spans).toContainEqual({ kind: "comment", text: "# one" });
  });
});

describe("format: text neither reader reads", () => {
  it.each([
    ["Python got further", `{'name': 'Ada', 'age': }`, "Python", "expected a value", 1, 24],
    ["a tie goes to JSON", `{"a": @}`, "JSON", `unexpected character "@"`, 1, 7],
    ["a bare word, a tie", `{"a": foo}`, "JSON", `unexpected character "f"`, 1, 7],
    ["a bare word after a single quote", `{'a': foo}`, "Python", `unexpected name "foo"`, 1, 7],
    ["JSON got further", `[1, null, nan]`, "JSON", `unexpected character "n"`, 1, 11],
    ["a bare word after Python-only text", `{'a': True, 'b': foo}`, "Python", `unexpected name "foo"`, 1, 18],
    ["an f-string", `{'a': 1, 'b': f'x'}`, "Python", "f-strings are not literals", 1, 15],
    ["a t-string", `('a', T"x")`, "Python", "t-strings are not literals", 1, 7],
    ["a leading zero", `('a', 01)`, "Python", "leading zeros are not allowed in an integer", 1, 7],
    ["a malformed number", `('a', 1_)`, "Python", "invalid number", 1, 7],
    ["bytes joined to a string", `('a', b'x' 'y')`, "Python", "cannot mix bytes and strings", 1, 12],
    ["non-ASCII in bytes", `('a', b'é')`, "Python", "bytes can only contain ASCII characters", 1, 9],
    ["a bad escape", `('a', '\\x4')`, "Python", "invalid escape in string", 1, 8],
    ["an unterminated triple-quoted string", `('a',\n '''never\n closed)`, "Python", "unterminated string", 2, 2],
    ["a newline in a single-quoted string", `('a', 'b\n')`, "Python", "unterminated string", 1, 7],
    ["a real number plus a real number", `('a', 1+2)`, "Python", "expected an imaginary number after '+'", 1, 9],
    ["a sign before a string", `('a', -'b')`, "Python", "expected a number after '-'", 1, 8],
    ["a mismatched bracket", `('a', 2]`, "Python", "expected ',' or ')'", 1, 8],
    ["a set item in a dict", `{'a': 1, 'b'}`, "Python", "expected ':' after a key", 1, 13],
    ["a bare top-level tuple", `'a', 'b'`, "Python", "unexpected text after the value", 1, 4],
  ])("reports %s", (_, input, language, message, line, column) => {
    expect(format(input)).toEqual({ kind: "error", language, error: { message, line, column } });
  });
});

describe("formatDelay", () => {
  it("formats at once up to about 1 MB of text", () => {
    expect(formatDelay(0)).toBe(0);
    expect(formatDelay(1_000_000)).toBe(0);
  });

  it("waits about 300 ms after the last keystroke above about 1 MB", () => {
    expect(formatDelay(1_000_001)).toBe(300);
    expect(formatDelay(5_000_000)).toBe(300);
  });
});

describe("format: fold ranges", () => {
  /** Each foldable line: where its item starts and ends, the item's path, and what it holds. */
  function folds(input: string) {
    const f = format(input);
    if (f.kind !== "formatted") throw new Error("expected formatted output");
    return f.lines.flatMap((l) => (l.fold ? [{ first: l.fold.first, last: l.fold.last, path: l.fold.path, count: l.fold.count, unit: l.fold.unit }] : []));
  }

  it("marks every multi-line object and list, the outermost included, with its lines, path and count", () => {
    expect(folds(`{"user":{"a":1,"b":2},"tags":["x"],"e":[]}`)).toEqual([
      { first: 0, last: 9, path: [], count: 3, unit: "key" },
      { first: 1, last: 4, path: [`"user"`], count: 2, unit: "key" },
      { first: 5, last: 7, path: [`"tags"`], count: 1, unit: "item" },
    ]);
  });

  it("steps into lists by position", () => {
    expect(folds(`[[1],{"a":[2]}]`).map((f) => f.path)).toEqual([[], [0], [1], [1, `"a"`]]);
  });

  it("counts tuple and set members as items", () => {
    expect(folds(`{'t': (1, 2), 's': {1, 2, 3}}`).slice(1)).toEqual([
      { first: 1, last: 4, path: [`'t'`], count: 2, unit: "item" },
      { first: 5, last: 9, path: [`'s'`], count: 3, unit: "item" },
    ]);
  });

  it("tells a repeated key's items apart", () => {
    expect(folds(`{"a":[1],"a":[2]}`).map((f) => f.path)).toEqual([[], [`"a"`], [`"a"#2`]]);
  });

  it.each([`{"a":{},"b":[]}`, `{'a': (), 'b': set()}`])("gives one-line things in %s no fold", (input) => {
    expect(folds(input)).toHaveLength(1);
  });
});

/** Each span of each line, as `kind:text` (a plain span as its text). */
function spans(input: string) {
  const f = format(input);
  if (f.kind !== "formatted") throw new Error(`expected formatted output, got ${JSON.stringify(f)}`);
  return f.lines.map((l) => l.spans.map((s) => (s.kind ? `${s.kind}:${s.text}` : s.text)));
}

describe("format: Python nan and inf", () => {
  it.each([
    ["nan, inf and -inf", "[nan, inf, -inf]", "[\n  nan,\n  inf,\n  -inf\n]"],
    ["as dict values", "{'x': nan, 'y': - inf}", "{\n  'x': nan,\n  'y': -inf\n}"],
  ])("accepts %s", (_, input, expected) => {
    expect(format(input)).toMatchObject({ kind: "formatted", language: "Python", text: expected });
  });

  it("colours them like numbers", () => {
    expect(spans("[nan, -inf]").slice(1, 3)).toEqual([["num:nan", "punct:,"], ["num:-inf"]]);
  });
});

describe("format: Python reprs", () => {
  it.each([
    ["an object repr", "{'obj': <Foo object at 0x10a2b3c40>}", "{\n  'obj': <Foo object at 0x10a2b3c40>\n}"],
    ["a repr kept as written, spaces and all", "[<Foo   a=1,  b=[2, 3]>]", "[\n  <Foo   a=1,  b=[2, 3]>\n]"],
    ["nested <…> matched", "[<Outer <Inner x> y>, 1]", "[\n  <Outer <Inner x> y>,\n  1\n]"],
    ["a > inside quotes ignored", `[<Tag name='a>b' "c>">]`, `[\n  <Tag name='a>b' "c>">\n]`],
    ["a repr at the top level", "<function f at 0x1>", "<function f at 0x1>"],
    ["a repr as a key", "{<Key 1>: 2}", "{\n  <Key 1>: 2\n}"],
  ])("accepts %s", (_, input, expected) => {
    expect(format(input)).toMatchObject({ kind: "formatted", language: "Python", text: expected });
  });

  it("colours the whole repr as one span", () => {
    expect(spans("[<Foo object at 0x1>]")[1]).toEqual(["repr:<Foo object at 0x1>"]);
  });

  it.each([
    ["a < with no > on its line", "{'a': <Foo\n>}", 1, 7],
    ["a > only inside quotes", "['a', <Foo '>'\n]", 1, 7],
    ["an unmatched nested <", "('a', <Outer <Inner>)", 1, 7],
  ])("reports %s at the <", (_, input, line, column) => {
    expect(format(input)).toEqual({ kind: "error", language: "Python", error: { message: "unclosed '<' in a repr", line, column } });
  });
});

// Expected text checked once against CPython 3.9: each input and its
// expected output `eval` to the same value, with the names imported.
describe("format: Python calls kept on one line", () => {
  it.each([
    ["a call on a name", "{'n': Decimal('1.5')}", "{\n  'n': Decimal('1.5')\n}"],
    ["a call on a dotted name", "[datetime.datetime(2024, 1, 2)]", "[\n  datetime.datetime(2024, 1, 2)\n]"],
    ["named arguments", "[timedelta(days=1,seconds = 30)]", "[\n  timedelta(days=1, seconds=30)\n]"],
    ["calls nested in calls", "[Fraction(Decimal('1.5'), _normalize=True)]", "[\n  Fraction(Decimal('1.5'), _normalize=True)\n]"],
    ["empty collections inside", "[Counter({}), frozenset(set()), Foo([], ())]", "[\n  Counter({}),\n  frozenset(set()),\n  Foo([], ())\n]"],
    ["no arguments", "[Foo( )]", "[\n  Foo()\n]"],
    ["a trailing comma dropped", "[Foo(1, 2,)]", "[\n  Foo(1, 2)\n]"],
    ["parentheses that aren't a tuple", "[Foo((1), ('a' 'b'))]", "[\n  Foo((1), ('a' 'b'))\n]"],
    ["nan, inf and reprs", "[Foo(nan, x=-inf, y=<Bar>)]", "[\n  Foo(nan, x=-inf, y=<Bar>)\n]"],
    ["a call at the top level", "UUID('12345678-1234-5678-1234-567812345678')", "UUID('12345678-1234-5678-1234-567812345678')"],
    ["set() with an argument", "set('ab')", "set('ab')"],
  ])("keeps %s inline", (_, input, expected) => {
    expect(format(input)).toMatchObject({ kind: "formatted", language: "Python", text: expected });
  });
});

describe("format: Python calls opened like a tuple", () => {
  it.each([
    ["a non-empty list inside", "OrderedDict([('a', 1)])", "OrderedDict(\n  [\n    (\n      'a',\n      1\n    )\n  ]\n)"],
    ["a non-empty set inside", "frozenset({1})", "frozenset(\n  {\n    1\n  }\n)"],
    [
      "named arguments one per line",
      "{'p': Point(x=1, tags=['a'])}",
      "{\n  'p': Point(\n    x=1,\n    tags=[\n      'a'\n    ]\n  )\n}",
    ],
    ["a collection deep inside", "Foo(Bar(Baz([1])))", "Foo(\n  Bar(\n    Baz(\n      [\n        1\n      ]\n    )\n  )\n)"],
    ["a one-argument call without a comma", "Foo([1],)", "Foo(\n  [\n    1\n  ]\n)"],
    ["a comment inside", "Foo(1, # one\n 2)", "Foo(\n  1,  # one\n  2\n)"],
    ["a comment after the opening bracket", "Foo( # args\n 1)", "Foo(  # args\n  1\n)"],
    ["a comment before the closing bracket", "Foo(1\n # end\n)", "Foo(\n  1\n  # end\n)"],
  ])("opens a call with %s", (_, input, expected) => {
    expect(format(input)).toMatchObject({ kind: "formatted", language: "Python", text: expected });
  });

  it("colours call names and named arguments", () => {
    expect(spans("{'p': P(x=[1], y=Q(z=1))}")).toEqual([
      ["punct:{"],
      ["key:'p'", "punct::", " ", "call:P", "punct:("],
      ["arg:x=", "punct:["],
      ["num:1"],
      ["punct:]", "punct:,"],
      ["arg:y=", "call:Q", "punct:(", "arg:z=", "num:1", "punct:)"],
      ["punct:)"],
      ["punct:}"],
    ]);
  });
});

describe("format: bare words that stay errors", () => {
  it.each([
    ["a bare word", `{'a': foo}`, `unexpected name "foo"`, 1, 7],
    ["a dotted name not called", `{'a': Color.RED}`, `unexpected name "Color.RED"`, 1, 7],
    ["a dotted named argument", `('a', Foo(a.b=1))`, `unexpected name "a.b"`, 1, 11],
    ["a bare word as an argument", `('a', Foo(bar))`, `unexpected name "bar"`, 1, 11],
    ["an unclosed call", `('a', Foo(1, 2)`, "expected ',' or ')'", 1, 16],
  ])("reports %s", (_, input, message, line, column) => {
    expect(format(input)).toEqual({ kind: "error", language: "Python", error: { message, line, column } });
  });

  it("shows Color.RED alone as an error", () => {
    expect(format("Color.RED").kind).toBe("error");
  });
});

describe("format: fold ranges of opened calls", () => {
  it("folds an opened call, counting its arguments as items, stepping into named ones by name", () => {
    const f = format("{'d': OrderedDict([('a', 1)]), 'p': P(1, x=[2])}");
    if (f.kind !== "formatted") throw new Error("expected formatted output");
    const folds = f.lines.flatMap((l) => (l.fold ? [{ path: l.fold.path, count: l.fold.count, unit: l.fold.unit, open: l.fold.open }] : []));
    expect(folds).toEqual([
      { path: [], count: 2, unit: "key", open: "{" },
      { path: [`'d'`], count: 1, unit: "item", open: "(" },
      { path: [`'d'`, 0], count: 1, unit: "item", open: "[" },
      { path: [`'d'`, 0, 0], count: 2, unit: "item", open: "(" },
      { path: [`'p'`], count: 2, unit: "item", open: "(" },
      { path: [`'p'`, "x"], count: 1, unit: "item", open: "[" },
    ]);
  });

  it("gives a call kept on one line no fold", () => {
    const f = format("[Decimal('1.5'), datetime.datetime(2024, 1, 2)]");
    if (f.kind !== "formatted") throw new Error("expected formatted output");
    expect(f.lines.filter((l) => l.fold)).toHaveLength(1);
  });
});

describe("format: text too big to colour or fold", () => {
  const input = `{"a": [1, "x"], "b": null}`;

  it("shows plain indented text above the plain limit: no colours, no fold toggles", () => {
    const f = format(input, input.length - 1);
    if (f.kind !== "formatted") throw new Error("expected formatted output");
    expect(f.plain).toBe(true);
    expect(f.text).toBe(`{\n  "a": [\n    1,\n    "x"\n  ],\n  "b": null\n}`);
    expect(f.lines.some((l) => l.fold || l.spans.some((s) => s.kind))).toBe(false);
  });

  it("colours and folds text at the limit", () => {
    const f = format(input, input.length);
    if (f.kind !== "formatted") throw new Error("expected formatted output");
    expect(f.plain).toBe(false);
    expect(f.lines.some((l) => l.fold)).toBe(true);
  });

  it("still shows the error for broken text over the limit", () => {
    expect(format(`{"a": }`, 1)).toMatchObject({ kind: "error", language: "JSON" });
  });
});
