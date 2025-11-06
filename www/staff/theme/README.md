# Staff Theme Tokens

This folder centralizes visual styling for the notation demos (ABCJS and VexFlow).

- `tokens.css` defines canonical CSS variables with `--notation-*` names and provides aliases to the previous `--staff-*` names to avoid breaking changes.
- `readTokens.js` reads the effective values from CSS variables and returns a JS object `{ stroke, fill, ledger, ledgerWidth, accent, selection }`.
- `applySvgTheme.js` contains helpers to apply colors and ledger thickness to SVGs produced by the libraries:
  - `applyVexflowSvgTheme(svg, tokens)`
  - `applyAbcjsSvgTheme(svg, tokens)`

How to change visuals:
- Prefer editing `tokens.css`. Page-specific CSS may override the variables if needed.
- JS should call `readTokens()` and pass the result to the helper appropriate for the library.

Scope:
- No behavior changes. Only centralizes where values come from and where DOM mutations live.

