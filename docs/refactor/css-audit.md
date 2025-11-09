# CSS Audit — November 9, 2025

## Overview
- Primary bundle `css/styles.css` weighs in at 598 lines and mixes globals, layout, controls, piano, legacy staff, modal styling, and media queries.
- Shared theme tokens already exist for notation demos under `www/staff/theme/tokens.css`; the main app still hardcodes colors, radii, blur amounts, and box shadows.
- Additional CSS lives under `www/staff/font/styles.css` (294 lines) and `www/staff/theme/tokens.css`, plus backup snapshots in `www/staff/staff.bk/`.

## Component Groupings
- **Foundations**: universal reset, body background, typography (`styles.css:1-46`).
- **Containers & Layout**: `.container`, `.timer-display`, `.game-controls`, flex/grid wrappers (`styles.css:48-170`).
- **Controls**: `.control-btn`, `.settings-row select`, difficulty selector variants (repeated button/selector styles with slight tweaks).
- **Status & Sequencing**: `.status-area`, `.feedback`, `.sequence-display` blocks (`styles.css:190-260`).
- **Piano UI**: `.piano`, `.piano-keys`, `.flat-key`, `.white-key`, `.black-key`, key labels and pressed/disabled states (`styles.css:270-380`).
- **Legacy Staff**: `.staff-container`, `.staff`, `.staff-line`, `.note.*`, `.accidental`, ledger rules, tonic highlights, animations (`styles.css:390-560`).
- **Responsive Rules**: Two `@media (max-width: 800px)` blocks handling general layout and piano sizing (`styles.css:560-598`).
- **Modal & Inline Styles**: Inline styles remain in `index.html:104-145` for history modal; should migrate into component CSS.

## Reusable Values (Token Candidates)
- **Neutrals**: `#404040`, `rgba(255,255,255,0.1/0.2/0.3/0.5)`, `rgba(0,0,0,0.1/0.3)`, `#f5f5f5` (already tokenized in notation theme).
- **Accents**: `#4CAF50`, `#f44336`, `#2196F3`, `#FF9800`.
- **Effects**: `border-radius: 20px/25px/15px`, `backdrop-filter: blur(10px)`, box shadows `0 8px 32px rgba(0,0,0,0.1)` etc.
- **Spacing**: consistent gap values `gap: 15px`, `padding: 12px 20px`, `margin: 20px`.
- **Key Heights**: repeated clamp expressions for piano keys and responsive overrides.

## Duplication Hotspots
- Buttons (`.control-btn`, modal close button, `.settings-row select`) replicate nearly identical backgrounds, borders, transitions.
- Select elements have at least three separate style blocks with similar logic.
- Note/staff positioning uses repeated pixel rules for each pitch; legacy once DOM-based — pending removal after full VexFlow adoption.
- Media queries duplicated for `.piano-keys` height adjustments.

## Integration Notes
- Any refactor should align color tokens with `/staff/font` theme variables (e.g., `--notation-accent`, `--staff-selection-color`) to keep brand consistency.
- Once VexFlow staff replaces the DOM nodes on the main page, `.staff`/`.note.*` rules become removable; isolate them to simplify later deletion.
- Investigate whether backup CSS under `www/staff/staff.bk/*` can be dropped or archived outside the repo after migration.
