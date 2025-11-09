# CSS Refactor Plan — Execution Notes

## Completed Tasks
- Split legacy `css/styles.css` (598 lines) into modular files:
  - `css/foundation/` for tokens and base styles.
  - `css/layout/` for container/timer/layout primitives.
  - `css/components/` for controls, piano, modal, and staff legacy styles.
  - `css/responsive.css` for unified breakpoints.
- Introduced shared custom properties in `css/foundation/tokens.css`, importing the notation token sheet so `/staff` and `/staff/font` can share palette settings.
- Added utility class `.ui-pill` for pill-shaped controls; selectors now opt-in via HTML classes instead of duplicating styles.
- Moved modal styling out of inline HTML and into `css/components/modal.css`; updated markup to use structured classes.

## Follow-Up Items
- Move inline styles produced in `UI.showHistory` into template strings that reference CSS classes rather than hard-coded `style` attributes.
- Gradually retire `css/components/staff-legacy.css` once the main app fully adopts the VexFlow SVG staff.
- Audit backup CSS copies under `www/staff/staff.bk/` and determine whether they can be removed or archived outside the repo.

## Tooling
- Added `stylelint` with the standard config and `npm run lint:css` script. Run this command before commits touching CSS.
- Configured ignores for `node_modules`, Android build artefacts, and backup CSS snapshots to keep lint noise low.
