# Batteries

_Batteries Included._ A personal static website of small, self-contained tools — batteries — that run entirely in the browser.

Live at <https://batteries.djpeacher.com/>.

## Batteries

- **Markdown Preview**: type markdown and see it rendered live, with code highlighting, Mermaid diagrams and math.
- **Pretty Print**: paste JSON or a Python dict and see it laid out, coloured and foldable.
- **Text Diff**: supply two texts and see the differences between them highlighted.

## Development

Built with [Astro](https://astro.build).

```sh
npm install
npm run dev      # local dev server
npm test         # unit tests (Vitest)
npm run check    # type check
npm run build    # static build into dist/
```

Pushes to `main` deploy to GitHub Pages via `.github/workflows/deploy.yml`.