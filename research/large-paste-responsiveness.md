# How large a paste stays responsive (Pretty Print)

Question: with live formatting, colouring and folding on every edit, how large an input (1 MB, 5 MB, 20 MB) can the browser handle before typing stalls? Which techniques push the limit (debounce, Web Worker, virtualised output, collapse by default)? What do established in-browser JSON viewers do, and at what sizes does each technique become necessary?

Researched 2026-10-28. Sources are primary: library and browser source code, MDN, web.dev. The measurements were run for this note and are labelled as such.

## Budget: what "stalls" means

- A task over **50 ms** is a "long task" and blocks input ([web.dev, Optimize long tasks](https://web.dev/articles/optimize-long-tasks)).
- Interaction to Next Paint (INP) is **good at 200 ms or less**, **needs improvement up to 500 ms**, and is **poor above 500 ms** ([web.dev, INP](https://web.dev/articles/inp)).
- So per keystroke, the work from `input` to the next paint should stay under ~50 ms to feel instant, and must stay under 200 ms.

## Measurements (this note's own, Chromium 155 / Node 24 on a Mac)

Synthetic JSON: an array of small records with nested objects, about 9 % of characters in keys. Bench code is reproduced in the appendix.

**Pure JS (Node 24, same V8 as Chrome):**

| Input | `JSON.parse` | `JSON.stringify(v,null,2)` | Build coloured HTML string | Output size |
|---|---|---|---|---|
| 0.1 MB | 1 ms | 1 ms | 13 ms | 11.8 k lines |
| 1 MB | 8 ms | 4 ms | 52 ms | 115 k lines, 138 k spans |
| 5 MB | 35 ms | 42 ms | 269 ms | 567 k lines, 680 k spans |
| 20 MB | 109 ms | 139 ms | 682 ms | 2.24 M lines, 2.7 M spans |

**DOM, in Chromium (time from setting the output to the next frame):**

| Input | Coloured + `<details>` folds, whole doc | Coloured spans only, whole doc | Plain text, no colour | **Only a 200-line window** |
|---|---|---|---|---|
| 0.1 MB | 150 ms | — | 27 ms | — |
| 0.5 MB | 573 ms | — | 119 ms | — |
| 1 MB | 1,181 ms | 567 ms | 234 ms | **1 ms** |
| 2 MB | 2,812 ms | — | 532 ms | — |
| 5 MB | 17,340 ms | 3,475 ms | 1,826 ms | **7 ms** |
| 20 MB | (not attempted) | (not attempted) | — | **1 ms** (parse + line build 675 ms) |

What the numbers show:

1. **The DOM is the bottleneck, not parsing.** At 1 MB, parsing takes 8 ms and painting the whole coloured document takes 0.6 to 1.2 s. Formatting fails first because of node count, not bytes.
2. **Rendering the whole document with folds as nested `<details>` stops being live at about 50 to 100 KB.** At 0.1 MB, a rebuild already takes 150 ms per keystroke, near the 200 ms INP line. Spans alone do about 2x better, and that is still ~0.5 s at 1 MB.
3. **Rendering only the visible lines makes the DOM cost constant** (1 to 7 ms at any size). What remains is parse plus building the line model: about 45 ms at 1 MB, ~100 ms at 5 MB and ~700 ms at 20 MB. That stays within one frame up to roughly 1 MB, and within the 200 ms INP line up to roughly 5 MB.
4. Python input needs a hand-written parser, not native `JSON.parse`. Expect it to be several times slower than the JSON column, so the Python thresholds sit lower. This was not measured; the parser ticket owns that number.
5. Saving to `localStorage` on each keystroke is cheap: 2 to 5 ms for 1 to 4 M characters. But storage throws `QuotaExceededError` at about 5 M characters (measured: 6 M failed). See the storage section.

## What established viewers do

### Firefox JSON viewer (devtools/client/jsonview)

Source: [`json-viewer.mjs`](https://github.com/mozilla-firefox/firefox/blob/main/devtools/client/jsonview/json-viewer.mjs), [`JsonPanel.mjs`](https://github.com/mozilla-firefox/firefox/blob/main/devtools/client/jsonview/components/JsonPanel.mjs), [`ObjectProvider.mjs`](https://github.com/mozilla-firefox/firefox/blob/main/devtools/client/shared/components/tree/ObjectProvider.mjs).

- `AUTO_EXPAND_MAX_SIZE = 100 * 1024`: "Expand the document by default if its size isn't bigger than 100KB." Below 100 KB it expands to `AUTO_EXPAND_MAX_LEVEL = 7`. **Above 100 KB the tree opens collapsed.**
- `EXPAND_ALL_MAX_NODES = 100000` caps "Expand all".
- `MAX_STRING_LENGTH = 250`: long strings are cropped in the tree.
- Large arrays are split into **buckets** of 100 (`MAX_NUMERICAL_PROPERTIES`), nested further if needed, so one expand never renders a 100 k-item array.
- Parsing is a plain `JSON.parse` on the main thread, with no worker.

### svelte-jsoneditor (josdejong)

Source: [`constants.ts`](https://github.com/josdejong/svelte-jsoneditor/blob/main/src/lib/constants.ts), [`documentState.ts`](https://github.com/josdejong/svelte-jsoneditor/blob/main/src/lib/logic/documentState.ts), [`JSONEditor.svelte`](https://github.com/josdejong/svelte-jsoneditor/blob/main/src/lib/components/JSONEditor.svelte), [`TextMode.svelte`](https://github.com/josdejong/svelte-jsoneditor/blob/main/src/lib/components/modes/textmode/TextMode.svelte), [README](https://github.com/josdejong/svelte-jsoneditor).

- `MAX_DOCUMENT_SIZE_EXPAND_ALL = 10 * 1024`: `expandSmart` expands everything only when the content is ≤ **10 KB**. Otherwise it uses `expandMinimal`, which opens the root plus the first array item.
- `ARRAY_SECTION_SIZE = 100`: tree mode renders only the first 100 items of an array, with "show more" sections for the rest.
- Tree and table modes truncate strings at `truncateTextSize` (default 1000 bytes).
- Text mode (CodeMirror) refuses documents over `maxDocumentSizeTextMode` (default **10 MB**). It shows a truncated 20,000-character preview (`MAX_CHARACTERS_TEXT_PREVIEW`) and offers "open anyway", "open in tree mode" or "cancel". The README warns the browser may crash.
- `TEXT_MODE_ONCHANGE_DELAY = 300` ms: edits in text mode are **debounced 300 ms** (lodash `debounce`) before they are re-parsed. The linter uses the same delay.
- `MAX_AUTO_REPAIRABLE_SIZE` and `MAX_MULTILINE_PASTE_SIZE` are both **1 MB**: costlier helpers are switched off above that.
- No Web Worker: the repo has no `new Worker`. The README claims documents "up to 512 MB" through immutable data and re-rendering only changed sections, together with the collapsing above.
- The older `jsoneditor` needed a separate read-only "preview mode" for large files. The rewrite dropped it because both modes now cope, citing "performance limitations in the old editor" (Ace).

### CodeMirror 6

- Viewport rendering: "CodeMirror doesn't render the entire document, when that document is big". It renders the visible part plus a margin, and "chunks of folded code can still make the viewport rather huge" ([CodeMirror guide, Viewport](https://codemirror.net/docs/guide/)).
- Highlighting parses incrementally in time slices, not a worker ([`@codemirror/language` language.ts, `enum Work`](https://github.com/codemirror/language/blob/main/src/language.ts)). It does 20 ms of parsing right after a change (`Apply`), then idle slices of at least 25 ms (`MinSlice`). It parses no further than 100,000 characters past the viewport (`MaxParseAhead = 1e5`), within a budget of 3 s per 30 s (`ChunkBudget`, `ChunkTime`).

### Monaco / VS Code

Source: [`textModel.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/editor/common/model/textModel.ts).

- `LARGE_FILE_SIZE_THRESHOLD = 20 MB` and `LARGE_FILE_LINE_COUNT_THRESHOLD = 300,000` lines. Above either one (with `largeFileOptimizations` on), the model is "too large for tokenization": **syntax colouring and folding are switched off.**
- `_MODEL_SYNC_LIMIT = 50 MB`: above this the model is not synced to the language worker.
- `LARGE_FILE_HEAP_OPERATION_THRESHOLD`: 256 M characters.

### Web Workers (MDN)

- Data passed by `postMessage` "is copied, not shared": it is structured-cloned on both sides. Only transferables such as `ArrayBuffer` move with zero copy ([MDN, Using Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)).
- So a worker that parses and sends back a parsed tree or a list of lines pays a clone of roughly the output's size. A worker keeps typing smooth while it parses, but it does not shorten the time until the output appears.

### localStorage (MDN)

- localStorage holds **5 MiB per origin** and throws `QuotaExceededError` past it ([MDN, Storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)). The quota is shared with Markdown Preview's and Text Diff's saved texts, since they are on the same origin.
- The repo's `src/scripts/storage.ts` `save()` already swallows that error: "the value lasts for this page only". So a paste of about 5 M characters or more is formatted but **does not survive a reload**, silently.

## When each technique becomes necessary (synthesis)

| Technique | Needed from about | Evidence |
|---|---|---|
| Coalescing to one render per frame (`requestAnimationFrame`, as Markdown Preview does) | always (cheap) | existing pattern |
| Render only visible lines (virtualised output) | **~50 to 100 KB** if folds and colour are full DOM | measured 150 ms at 0.1 MB with `<details>`; Firefox stops auto-expanding at 100 KB; CodeMirror and Monaco both render only the viewport |
| Collapse deep levels by default | **10 KB** (svelte-jsoneditor) to **100 KB** (Firefox), *when the output is a DOM tree without virtualisation* | constants above |
| Debounce the re-parse (trailing, ~300 ms) | **~1 MB**, where parse plus line model goes past one frame (~45 ms) | measured; svelte-jsoneditor uses 300 ms |
| Parse in a Web Worker | **~5 MB and up** (parse plus model ≥ 100 ms, ~700 ms at 20 MB) | measured; no surveyed viewer uses one, and the result must be cloned back |
| Turn off colour and folds, or refuse | **10 MB** (svelte-jsoneditor text mode) / **20 MB or 300 k lines** (Monaco) | constants above |
| Saved text not surviving a reload | **~5 M characters** | MDN quota; measured |

## Recommendation for v1

1. **Virtualise the output: render only the visible lines.** This is the one technique v1 needs. Without it, a whole-document coloured, foldable DOM stalls typing at about 100 KB, which is a small API response. With it, the DOM costs a few ms at any size. Model the output as an array of coloured lines. A fold hides a range of lines in that model instead of nesting `<details>`. The output's scroll height comes from line count × line height (monospace, no wrapping, so lines are fixed height). Copy and download use the full text, as the scope already says, so they do not depend on what is rendered.
2. **Keep Markdown Preview's one-render-per-frame coalescing, and add a trailing debounce (~300 ms) only when the input is over ~1 MB.** Below that, parse plus line model fit in a frame and the output can follow every keystroke. Text Diff's existing time-limit pattern (`LIVE_TIME_LIMIT = 400` ms with an explicit Compare) is the precedent if a size cut-off proves better than a debounce.
3. **No Web Worker in v1.** It only matters above ~5 MB of JSON. None of the surveyed viewers use one, and it adds a clone round-trip plus a second bundle. Revisit if the Python parser turns out several times slower than `JSON.parse`, because then its 1 MB cost could pass 200 ms.
4. **No collapse by default for performance.** With virtualisation it is unnecessary, and the settled scope shows the whole document indented. It is a lever only if virtualisation is dropped (then follow Firefox: expand fully at 100 KB or less, otherwise open collapsed).
5. **Set an upper bound of about 20 MB** (Monaco's colouring cut-off, 2 M+ lines). Above it, a parse plus line build of ~700 ms or more blocks typing even when virtualised. Either show plain uncoloured text or ask before formatting, as svelte-jsoneditor does at 10 MB. Exactly what to show is an appearance decision.
6. **Above ~5 M characters, the text won't survive a reload** because of the localStorage quota. The shared storage helper already fails silently. The spec should say whether that warrants a notice.

## Caveats

- The measurements come from one machine (a recent Mac) and one data shape. A low-end phone can be 3 to 5 times slower, which lowers every threshold by about that factor (for example, debounce from ~250 KB).
- The text side's own typing cost (the textarea plus the shared textbox helper) was not measured. Chromium textareas handle multi-MB values, but any per-keystroke gutter work in `textbox.ts` would add to it.
- The Python parser's cost is unknown and should be measured once that ticket picks a parser.

## Appendix: bench code

Node (pure JS):

```js
function make(bytes){const a=[];let s=0,i=0;while(s<bytes){const o={id:i,name:"user "+i,email:`u${i}@example.com`,active:i%2==0,score:i*1.5,tags:["a","b","c"],addr:{city:"Springfield",zip:"12345",geo:{lat:1.23,lng:4.56}}};a.push(o);s+=JSON.stringify(o).length+1;i++}return JSON.stringify(a)}
// time JSON.parse, JSON.stringify(v,null,2), and a recursive HTML builder emitting <span class=k|s|m> and <details open><summary>
```

Browser: the same generator. Each run sets `pre.innerHTML` (or `textContent`), forces layout with `offsetHeight`, then awaits `requestAnimationFrame` + `setTimeout(0)`. The windowed case sets `innerHTML` to `lines.slice(0, 200).join("\n")`.
