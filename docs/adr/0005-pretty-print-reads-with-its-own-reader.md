# Pretty Print reads JSON and Python with its own reader

Pretty Print must keep values exactly as written: `1.0` stays `1.0`, big integers keep every digit, escapes and duplicate keys survive, and Python comments, tuples, sets, calls and `<…>` reprs come through. `JSON.parse` rounds numbers, drops duplicates and loses escapes, and no small library reads Python literals with comments, so `src/pages/pretty-print/_reader.ts` is a hand-written tokenizer and parser with a JSON mode and a Python mode, and the printer only changes whitespace and line breaks. The language is found by trying both: the one that reads the text wins, and when neither does, the error comes from the one that got further, with a tie going to JSON. We rejected a parsing library because none keeps the text as written, and a new npm dependency for one battery was not worth it.

## Consequences

- Some edges are looser or stricter than CPython (a bare top-level `1, 2` is an error; `Foo(x=1, 2)` is accepted). Formatted Python output is checked against `ast.literal_eval` in the test tables instead.
- Nesting is capped at 500 levels so a deep paste shows the error panel instead of overflowing the stack.
