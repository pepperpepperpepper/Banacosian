# VexFlow Codebase Dependency Map (November 2025)

Generated 2025-11-11 via a quick static crawl of `import` statements across the primary JavaScript sources (`js/**`, `www/staff/**`).  Supporting data lives in `docs/vexflow-deps.json`.

## Module Clusters

- **Core Rendering (`js/vexflow/core/…`)**  
  - `draw.js`, `noteFactory.js`, `buildSeedVoices.js`, `helpers/*`, `utils/spec.js` provide the canonical VexFlow abstractions.  
  - All downstream consumers (main app + demos) should flow through these modules to avoid duplication.

- **Main Application (`js/modules`, `js/vexflow/StaffDisplay.js`)**  
  - `Staff.js` and `StaffDisplay.js` orchestrate rendering inside the melodic dictation experience, layering app-specific state (highlights, correctness, storage) on top of the core.

- **Demo Playground (`www/staff/*`)**  
  - `render-staff.js`, `vexflow-demo.js`, `interaction-*.js`, `drag/*` compose the interactive font playground.  
  - Also ships vendor copies of VexFlow/SMuFL fonts plus theme tooling (`www/staff/theme/*`).

## Duplication Hot Spots

- **Render Harness Logic**  
  - **Status:** ✅ Addressed by introducing `js/vexflow/core/renderPipeline.js`, now used by both `js/vexflow/StaffDisplay.js` and `www/staff/render-staff.js`.  
  - Follow-up: ensure future consumers route through the pipeline instead of re-implementing font/ABC/theming steps.

- **State Management & Sequencing**  
  - **Status:** ✅ Shared runtime via `createRenderRuntime` now seeds both the main staff (`Staff.js`) and the playground (`vexflow-demo.js`), keeping key signatures, warnings, and pending selections in sync.  
  - Future tweaks can extend the helper with additional metadata (e.g., playback cues) instead of duplicating state fields.

- **Interaction Wiring**  
  - `interaction-controller.js` wraps drag/click behaviours, but preview construction currently re-imports `noteFactory` & spec helpers the core already owns.  
  - Consider moving interaction engines under `js/vexflow/interaction/` so future app features can reuse them directly.

- **Theme & Font Handling**  
  - Theme tokens live under `www/staff/theme/`; the main app fetches them indirectly via `/staff/render/theme.js`.  
  - Font selection metadata centralised in `js/modules/StaffFonts.js`, but demos still pass around `fontSelect` DOM references; a shared font service could provide consistent warnings/labels.

## Suggested Next Steps

1. **Automate dependency graph generation** for CI (reuse the `docs/vexflow-deps.json` script) so new modules stay mapped.  
2. **Document the shared render harness** (`renderPipeline`) API in `docs/vexflow-render.md` so new modules know how to integrate.  
3. **Audit demo interaction files** for logic that belongs in the core (especially preview note creation, spec math).  
4. **Consolidate theme utilities** into a shared package to remove the `/staff/theme` indirection once consumers migrate.  
5. **Introduce smoke-test checklist** for `/` and `/staff` to keep parity as files converge.
