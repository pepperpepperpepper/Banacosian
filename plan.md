# Notation Styling Centralization Plan

This document outlines a low‑risk refactor to centralize all visual styling for the staff demos (ABCJS and VexFlow). It keeps all behavior and visuals identical while making styling discoverable, consistent, and easy to maintain.

## Goals

- Single source of truth for notation visual tokens (colors, thickness, fonts, spacing).
- Keep CSS vanilla and declarative; JS only reads tokens and applies via library APIs.
- Minimize DOM style mutations; confine unavoidable ones to a single helper.
- Ensure theming for the VexFlow demo at `www/staff/index.html` stays aligned with the main app.
- Zero functional or visual change in this pass.

## Non‑Goals (for this pass)

- No redesign or new visuals.
- No change to drag/selection logic.
- No cross‑library abstraction of rendering code.

## Current State (as of 2025‑11‑04)

- CSS variables live in two places:
  - `www/staff/styles.css` (page shell for the VexFlow demo) — includes `--staff-ledger-thickness`
- JS reads tokens in `www/staff/vexflow-demo.js` → `getStaffTheme()` and the older experimental `www/staff/font-demo.js`.
- Post‑render theming:
  - VexFlow: `applyVexflowTheme(container, palette)` sets stroke/fill and adjusts ledger node attributes.
  - ABCJS: `applyThemeToSvg(svg, palette)` does similar DOM mutations.
- Library APIs:
  - VexFlow supports `stave.setDefaultLedgerLineStyle()` and `note.setLedgerLineStyle()` (preferred over DOM changes).

## Proposed Structure (No Behavior Change)

1) Add a shared token file

- `www/staff/theme/tokens.css`
- Contains only CSS variables (with comments) for notation visuals, e.g.:
  - `--notation-staff-stroke`
  - `--notation-staff-fill`
  - `--notation-ledger-color`
  - `--notation-ledger-thickness`
  - `--notation-accent`, `--notation-selection`
  - `--notation-font-stack-music`, `--notation-font-stack-text`
- Both demos import this file; page‑specific CSS can reference these vars.

2) Add a shared token reader

- `www/staff/theme/readTokens.js`
- Exports `readTokens(): { stroke, fill, ledger, ledgerWidth, accent, ... }`
- Reads from CSS variables using `getComputedStyle(document.documentElement)` once per call.
- Demos keep their `getStaffTheme()` but delegate to `readTokens()` (so callers don’t change).

3) Centralize SVG theming helpers

- `www/staff/theme/applySvgTheme.js`
- Exports:
  - `applyVexflowSvgTheme(svg, tokens)` — contains the current logic from `applyVexflowTheme()`
  - `applyAbcjsSvgTheme(svg, tokens)` — contains the current logic from `applyThemeToSvg()`
- Demos import and call these. All DOM attribute tweaks live in this one file.

4) Prefer library APIs; restrict DOM styling to the helper

- Keep using VexFlow API calls in `vexflow-demo.js`:
  - `stave.setDefaultLedgerLineStyle({ strokeStyle, fillStyle, lineWidth })`
  - `note.setLedgerLineStyle({ ... })`
- Any remaining DOM `setAttribute` calls must live only in `applySvgTheme.js` and be documented with a brief rationale (e.g., “library lacks direct API for X”).

5) Minimal, vanilla CSS in page styles

- Keep interaction CSS (e.g., `touch-action: none`, `user-select: none`) in the page‑specific styles since it’s behavioral.
- Visual rules in page CSS should reference the shared `--notation-*` tokens.

## Token Naming (Canonical)

- `--notation-staff-stroke`, `--notation-staff-fill`
- `--notation-ledger-color`, `--notation-ledger-thickness`
- `--notation-accent`, `--notation-selection`
- `--notation-font-stack-music`, `--notation-font-stack-text`

We will alias current names (e.g., `--staff-ledger-thickness`) to the new canonical names to avoid breaking changes. Aliases can live in `tokens.css`:

```css
:root {
  /* Canonical */
  --notation-ledger-thickness: 6;
  /* Alias for existing code (do not remove until code is migrated) */
  --staff-ledger-thickness: var(--notation-ledger-thickness);
}
```

## File Layout Changes

- New:
  - `www/staff/theme/tokens.css`
  - `www/staff/theme/readTokens.js`
  - `www/staff/theme/applySvgTheme.js`
  - `www/staff/theme/README.md` (how to theme + where to change things)
- Updated imports in:
- `www/staff/index.html` includes `theme/tokens.css`
- `www/staff/vexflow-demo.js` and `www/staff/font-demo.js` use shared helpers

## Migration Steps (Phased, Safe)

1. Create `tokens.css` with current values and aliases; import it in both HTML pages.
2. Add `readTokens.js`; update the two `getStaffTheme()` functions to call it internally (keep the same function name/signature).
3. Extract theme logic into `applySvgTheme.js`; wire both demos to call the shared helpers (copy existing code verbatim).
4. Add comments at styling call sites in the demos: “Prefer VexFlow API; DOM styling lives in `applySvgTheme.js` only.”
5. Verify visuals match (see checklist below). If all good, remove any redundant CSS rules that now duplicate the helper’s work.

## Guardrails

- No functional or visual changes in this refactor.
- Keep public function names and call sites the same to simplify diffs.
- Any change that impacts visuals must be flagged in PR description with screenshots.

## Verification Checklist

- ABCJS page (`/staff`):
  - Staff stroke/fill
  - Ledger color and thickness above/below the staff
  - Selection and drag visuals
- VexFlow page (`/staff/`):
  - Same items as above, including ledger thickness and extent
- Wheel/drag interactions still prevent page scroll
- Hard‑reload behavior (cache‑busting) doesn’t affect token resolution

## Rollback Plan

- The refactor is additive and file‑scoped. To roll back, remove imports of `theme/tokens.css` and helper module usage; restore previous inline helpers.

## Future Enhancements (Post‑refactor)

- Key‑aware enharmonic spelling policy (optional): choose accidentals based on ABC key signature.
- Snapshot tests (visual diffs) for the two demo pages at common widths.
- Expose a small runtime `window.setNotationTheme({...})` (already exists in `font-demo.js`) that updates CSS vars and triggers a refresh in both demos.

## Ownership

- Styling tokens: shared ownership; PRs must update `theme/README.md`.
- Helper modules: code owners of the demos.
