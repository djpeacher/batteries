# Parsing JSON and Python literals in the browser

Research for the Pretty Print map, ticket 01. Question: how should Pretty Print parse both JSON and Python dict literals in the browser, keeping enough to pretty-print and fold and to report a precise line and column on failure? Should it use a library or a small hand-written parser?

Gathered 2026-10-28. Engine behaviour was measured with Playwright 1.64.1 in Chromium 156 (headless shell 156.0.8078.4) and WebKit 27.2. Firefox would not launch in this sandbox, so its behaviour comes from SpiderMonkey source. Python behaviour was measured with CPython 3.9.6 `ast.literal_eval` and checked against the 3.x language reference.

## Recommendation

**Write one small tokenizer and recursive-descent parser, with a JSON mode and a Python mode. Add no npm dependency.**

- No maintained npm package parses Python literals (see "Libraries"). Python support has to be written by hand whatever we pick, so the JSON side gains little from a library. Once a tokenizer handles Python's superset, strict JSON is a subset of it.
- The parser keeps each token's **original text and offset**. The printer re-emits token text and only changes whitespace. That gives number fidelity (`1.0`, `12345678901234567890`, `1e2`, `0x1F`, `1_000`, `1j`), string quoting and prefixes, and escapes as written, with no BigInt or reviver tricks.
- Errors come from our own parser, so the message and line/column are **the same in every browser**. `JSON.parse` cannot provide that (see "`JSON.parse` error positions").
- Estimated size: about 400–700 lines of TypeScript, a few KB gzipped. That is the same order as the smallest JSON-only libraries measured below. It is well under anything that would need ADR 0004's lazy loading, so it can load eagerly with the page.

## `JSON.parse` facts

### Number fidelity and source text access

- `JSON.parse` turns numbers into JS doubles before the reviver runs. MDN: "numbers in JSON text will have already been converted to JavaScript numbers, and may lose precision in the process." ([MDN JSON.parse](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse))
- The reviver's third argument `context` has `source`, "The original JSON string representing this value. This property is only present when reviving primitive values, but not when `value` is an object or array." (MDN, same page). The TC39 proposal is **Stage 4** and says "source text exposure is limited to primitive values". ([proposal-json-parse-with-source](https://github.com/tc39/proposal-json-parse-with-source))
- Support, from MDN browser-compat-data 8.1.7 (`javascript.builtins.JSON.parse.reviver_parameter_context_argument`): **Chrome 114, Firefox 135, Safari 18.4**. `JSON.rawJSON` / `JSON.isRawJSON` have the same versions.
- Measured in Chromium 156 and WebKit 27.2: parsing `{"a":1.0,"b":12345678901234567890,"c":1e2,"d":"\u0041","a":2}` with a reviver gave the same `context.source` in both engines: `b` → value `12345678901234567000`, source `"12345678901234567890"`; `c` → value `100`, source `"1e2"`; `d` → source `"\"\\u0041\""` (escapes kept). Because of the duplicate key, the reviver saw only the surviving `a` (value 2, source `"2"`). **The `1.0` text was lost along with the dropped duplicate.**
- So `context.source` could recover number text in JSON mode. It gives no offsets, no positions for objects or arrays, and does not survive duplicate keys. It is also no help for Python. A token-based parser makes it unnecessary.

### Duplicate keys

- In both measured engines `JSON.parse('{"a":1,"b":2,"a":3}')` gives `{"a":3,"b":2}`: the last value wins, at the first key's position. ECMAScript creates properties in order, so a repeated name overwrites the earlier one.
- CPython: `ast.literal_eval("{'a': 1, 'a': 2}")` → `{'a': 2}`, also last wins.
- A printer that works from tokens keeps **both** members as written, because it never builds a JS object. Later tickets must decide whether to show duplicates unchanged (the natural result here) or flag them. Nothing in the parser forces a choice.

### `JSON.parse` error positions differ across engines

Same inputs, measured:

| Input | Chromium 156 (V8) | WebKit 27.2 (JSC) |
|---|---|---|
| `{\n  "a": 1,\n}` | `Expected double-quoted property name in JSON at position 12 (line 3 column 1)` | `JSON Parse error: Property name must be a string literal` |
| `{\n  'a': 1\n}` | `Expected property name or '}' in JSON at position 4 (line 2 column 3)` | `JSON Parse error: Single quotes (') are not allowed in JSON` |
| `{\n  "a" 1\n}` | `Expected ':' after property name in JSON at position 8 (line 2 column 7)` | `JSON Parse error: Expected ':' before value in object property definition` |
| `{"a": True}` | `Unexpected token 'T', "{"a": True}" is not valid JSON` | `JSON Parse error: Unexpected identifier "True"` |
| `{"a": [1, 2` | `Expected ',' or ']' after array element in JSON at position 11 (line 1 column 12)` | `JSON Parse error: Expected ']'` |
| `` (empty) | `Unexpected end of JSON input` | `JSON Parse error: Unexpected EOF` |
| `{"a":1} x` | `Unexpected non-whitespace character after JSON at position 8 (line 1 column 9)` | `JSON Parse error: Unable to parse JSON string` |
| `{"a":1,\n"b":\n  @}` | `Unexpected token '@', "{"a":1,\n"b":\n  @}" is not valid JSON` (no position) | `JSON Parse error: Unrecognized token '@'` |

- **Safari/JSC gives no position at all** in its messages. V8 gives a 0-based position plus a 1-based line/column on most errors, but not on "Unexpected token" errors, where it quotes the input instead.
- **Firefox/SpiderMonkey** uses the template `"JSON.parse: {0} at line {1} column {2} of the JSON data"` (`JSMSG_JSON_BAD_PARSE` in [js/public/friend/ErrorNumbers.msg](https://github.com/mozilla-firefox/firefox/blob/main/js/public/friend/ErrorNumbers.msg)). Its texts, such as "expected double-quoted property name", "expected ',' or ']' after array element", "unterminated string literal" and "unexpected end of data", come from [js/src/vm/JSONParser.cpp](https://github.com/mozilla-firefox/firefox/blob/main/js/src/vm/JSONParser.cpp). That file's `getTextPosition` treats `\r\n` as one newline. (Firefox was not measured because it would not launch in this sandbox.)
- Conclusion: the three engines share no message wording and no position format, and one gives no position. Any "line/column" built on `JSON.parse` would need per-engine regexes plus a fallback that cannot work on Safari. **Use our own parser's error for both languages.**

## Python literal syntax the parser must cover

Source: [Python lexical analysis](https://docs.python.org/3/reference/lexical_analysis.html), [`ast.literal_eval`](https://docs.python.org/3/library/ast.html#ast.literal_eval), and measurements with CPython 3.9.6.

`ast.literal_eval` accepts "strings, bytes, numbers, tuples, lists, dicts, sets, booleans, `None` and `Ellipsis`", plus `set()` since 3.9. That set is the natural definition of "plain literals" for the Python mode.

**Strings**
- Quotes: `'…'`, `"…"`, `'''…'''`, `"""…"""`. Triple-quoted strings may span lines.
- Prefixes (case-insensitive): `r`, `u`, `b`, `br`, `rb`. These are accepted by `literal_eval`: `r'\d'`, `u'x'` and `b'x'` all parse. `f` and `t` (and `fr`/`rf`/`tr`/`rt`) are real Python prefixes, but `literal_eval` rejects f-strings (`malformed node or string: JoinedStr`). The parser should give a clear error for them.
- Escapes when not raw: `\<newline> \\ \' \" \a \b \f \n \r \t \v \ooo \xhh \N{name} \uxxxx \Uxxxxxxxx`. `\N`, `\u` and `\U` are not allowed in bytes. Unrecognised escapes keep the backslash. Since the printer re-emits token text, the tokenizer only needs to find where a string ends: skip the character after a backslash and stop at the matching quote. Decoding escapes is only needed if later tickets want to show decoded values.
- **Adjacent literals concatenate**: `'x' 'y'` → `'xy'` (measured). The parser should treat a run of string tokens as one value, and the printer keeps them as written.

**Numbers** (underscores allowed between digits since 3.6)
- Integers: decimal (no leading zeros: `01` is a SyntaxError, measured), `0x`, `0o`, `0b`, and `0`, `00` (zeros only).
- Floats: `1.5`, `.5`, `5.`, `1e3`, `1.5e-3`.
- Imaginary: a float or digits followed by `j`/`J` (`1j`, `1.5e10j`).
- Unary sign: `-1` and `+1` are accepted, `--1` is rejected (measured).
- Complex: `1+2j` is accepted (measured). `literal_eval` allows real ± imaginary as a binary operation, but no other operators.
- `nan`, `inf` and `float('nan')` are rejected (Name/Call nodes, measured). Python's own `repr` of infinity prints `inf`, which `literal_eval` cannot read back. Treat these as the "exotic values" question already in the map.

**Constants and containers**
- `True`, `False`, `None`, `...` (Ellipsis).
- Dicts with any hashable literal key, e.g. `{(1,2): 3}`. Lists, tuples (`()`, `(1,)`, `(1, 2)`; `(1)` is just `1` in parentheses, and `-(1)` is accepted), sets `{1, 2}`, and `set()`.
- Trailing commas are allowed in every container (`{'a': 1,}` parses).

**Layout**
- Comments: `#` to end of line (`{'a': True} # c` parses). Inside brackets, newlines and indentation are insignificant (implicit line joining). A backslash at end of line joins lines anywhere.
- Error reporting sets a precedent: CPython reports a 1-based `lineno` and `offset` (`"{'a':\n  [1,\n   2 3]}"` → line 3, offset 6). This matches V8's and SpiderMonkey's 1-based line/column convention, so 1-based is the convention to adopt.

## JSON (RFC 8259) for strict mode

Strict mode means double-quoted strings only, with escapes `\" \\ \/ \b \f \n \r \t \uXXXX`. No raw control characters inside strings (V8: "Bad control character in string literal"). Numbers match `-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?`. Constants are `true`, `false`, `null`. No comments and no trailing commas. Whitespace is space, tab, LF and CR only.

## Libraries

Sizes are esbuild `--bundle --minify` of the named exports, gzipped with `gzip -c`. Dates are from the npm registry.

| Package | Latest (date) | min / gz | Positions | Original number text | Python? | Notes |
|---|---|---|---|---|---|---|
| `jsonc-parser` (Microsoft) | 3.3.1 (2024-06-24) | 10.6 KB / 3.6 KB (`parseTree`, `visit`, `createScanner`) | Offset and length on every node and error; visitor gets line/char | Yes, by slicing `offset`/`length` | No | Error-tolerant: returns `errors[]` (`{error, offset, length}` codes) and still builds a tree. Options `allowTrailingComma` and `disallowComments` (`//` and `/* */` only). Used by VS Code. |
| `@humanwhocodes/momoa` | 3.3.13 (2026-09-02) | 27.8 KB / 8.2 KB | `loc` line/column, optional `ranges`, `tokens` | Yes, through `range` | No | Modes `json`, `jsonc`, `json5`. Throws errors like `Unexpected token Number found. (3:7)` with `.line`/`.column`. Keeps both duplicate keys in the AST (measured). |
| `lossless-json` | 4.3.3 (2026-10-21) | 6.1 KB / 2.3 KB | No | Yes (`LosslessNumber` keeps the string) | No | Values only; no AST or positions for folding. |
| `json5` | 2.2.3 (2022-12-31) | 32.4 KB / 10.0 KB | Error line/column only | No | No | Accepts single quotes, comments, trailing commas, but not Python (`True`, tuples, `#`). Effectively unmaintained since 2022. |
| `json-source-map` | 0.6.1 (2019) | n/a | JSON-pointer → positions | — | No | Stale. |
| `json-bigint` | 1.0.0 (2020) | n/a | No | BigInt only | No | Stale. |
| `jsonrepair` | 3.15.0 (2026-07-03) | 583 KB unpacked | No | — | Partly | Rewrites Python constants and quotes into JSON. It *repairs* input instead of rejecting it, so it cannot give a "broken input" error. It also outputs JSON, which goes against "same language you pasted". Not suitable. |
| `@lezer/python`, `@lezer/json` | 1.1.19 / 1.0.3 | `@lezer/python` 134 KB unpacked, plus `@lezer/lr` runtime | Full syntax tree with offsets | Yes | Full Python grammar | An editor-highlighting grammar. It recovers from errors instead of reporting them as messages, needs a separate pass to reject non-literals, and its runtime cost would bring in ADR 0004. Overkill. |
| Python-literal parsers | — | — | — | — | — | npm searches for "python literal", "literal_eval", "python dict parse", "python repr parse" and "pyon" found **no maintained package**. The only hit, `fah-pyon` 1.4.6, dates from 2021. |

The best JSON-only library is `jsonc-parser`: small, offsets everywhere, number text recoverable. It still covers only half the problem. Adding it would mean two parsers with two error vocabularies, one of them ours, and a mismatched "line/column" style unless we translate its offsets ourselves. One tokenizer for both languages costs about the same and keeps the error panel uniform.

## Sketch of the hand-written parser

**Tokenizer** (one pass over the string, tracking offset). Each token is `{kind, text, start, end}`. Line/column comes from the offset by a line-start table, only when needed for an error or the gutter.

- Punctuation: `{ } [ ] ( ) : , + -`.
- Strings: optional prefix letters, then a quote run of 1 or 3, then scan to the matching close quote, skipping the character after `\` unless raw. Raw still can't end with an odd backslash before the quote. Errors: unterminated string, and a newline inside a single-quoted string. JSON mode also rejects raw control characters and non-JSON escapes.
- Numbers: one maximal-munch regex per mode, applied with the `y` (sticky) flag at the offset. Python: `0[xX](_?[0-9a-fA-F])+ | 0[oO](_?[0-7])+ | 0[bB](_?[01])+ | (digitpart? \. digitpart | digitpart \.?) exponent? [jJ]? | 0+(_?0)*`, with a check that a decimal integer has no leading zero. JSON: the RFC regex.
- Names: `True False None` (Python), `true false null` (JSON), `set` followed by `()`. Any other identifier is an error, naming the token, e.g. "`nan` is not a literal", which feeds the exotic-values decision.
- Trivia: whitespace, `#…` comments (Python), `\`-newline (Python). Keep comments as tokens if later tickets want to show them; otherwise skip them.
- `...` for Ellipsis.

**Parser** (recursive descent, about 150 lines). `value := sign? number (('+'|'-') imag)? | string+ | const | dict | list | tuple-or-paren | set | 'set' '(' ')'`. Dicts and sets share `{`: parse the first element, then branch on `:`. Every container accepts a trailing comma in Python mode and none in JSON mode. The output is a small tree (`{kind: 'object'|'array'|'tuple'|'set'|'scalar', open, close, members:[{key?, value}], tokens}`) with token ranges. That is exactly what the printer needs to indent and what folding needs to collapse a node. The first error throws `{message, offset}`, and the UI turns the offset into a 1-based line and column.

**Detection** (later ticket, but the tokenizer makes it cheap). Parse in JSON mode first. Text like `{"a": 1}` is valid as both, so treat it as JSON. If JSON mode fails, try Python mode. If both fail, report the error from the mode whose parse got further, or the one hinted by the first distinctive token (`True`/`None`/`'`/`(`/`#` → Python; `true`/`null` → JSON, since `literal_eval` rejects those names). Deciding which error to show is the detection ticket's call.

**Printer**. Walk the tree. Emit each scalar's token text verbatim, joining adjacent strings with a space. Use 2-space indent per level, keep empty containers on one line (`{}`, `[]`, `()`), and write `(x,)` for one-element tuples because the trailing comma is required. Only whitespace changes, so the output text equals the pasted values exactly.

**Size and effort.** The tokenizer is about 250 lines, the parser about 150, the printer about 100, plus tests (vitest is already in the repo). A Vitest table can check Python mode against cases like those above, derived once from CPython. No new dependency, so ADR 0004 does not apply.

## Open points for later tickets

- Duplicate keys: show both as written (default with this design) or warn?
- Comments in Python input: keep them in the output or drop them? The tokenizer can do either.
- String display: keep original quotes and prefixes (default) or normalise them?
- Exotic values (`nan`, `inf`, `datetime(...)`, `Decimal(...)`, reprs) are already listed under "Not yet specified". The parser's "not a literal" error is the hook.
- Which error to show when neither mode parses (detection ticket).
