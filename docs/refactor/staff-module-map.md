# Staff Module Map

## `/staff` (ABCJS demo)

- `www/staff/staff-demo.js`
  - Responsibilities: bootstraps ABCJS + SMuFL renderer, stores ABC snippets per key, manages drag selection, rewrites ABC on drag, updates status text.
  - Pain points: mixes loader, state, DOM wiring, pointer handling, and ABC parsing in a single 700+ line file.
- External dependencies: `createSmuflRenderer` (SMuFL shim), `/staff/theme/readTokens.js`, `/js/modules/KeySignatures.js`.

### Suggested extraction targets

| Concern | Proposed module | Notes |
| --- | --- | --- |
| ABCJS boot/loading + renderer creation | `www/staff/abc/loader.js` | Wrap `waitForABCJS`, SMuFL renderer creation, font/theme setup |
| Key-based ABC storage + selection | `www/staff/abc/state.js` | Handle `CURRENT_ABC`, active key, selection preservation |
| Drag + token rewrite logic | `www/staff/abc/drag.js` | Keep pointer state, convert drag to ABC replacements |
| DOM wiring + UI controls | `www/staff/abc/demo.js` | Thin orchestrator imported by `index.html` |

## `/staff/font` (VexFlow demo)

- `www/staff/font/music-helpers.js`
  - Responsibilities: duration math, pitch↔midi conversions, accidental/key signature helpers, spec cloning.
  - Pain points: mixed concerns; many consumers need only slices.
- `www/staff/font/render-staff.js`
  - Responsibilities: prepare seed voices, apply theme, construct renderer, register interactions, manage cache.
  - Pain points: interleaves voice prep, theme, rendering, and post-hooks, making reuse difficult.
- `www/staff/font/interaction-controller.js`
  - Responsibilities: register SVG event handlers, maintain selectable registry, bridge to drag/add.
  - Pain points: mixes selection reset, DOM queries, event handler attachment; hard to unit test.
- Other key modules: `interaction-drag.js`, `interaction-add.js`, `interaction-dom.js`, `drag/preview.js`, `render/note-factory.js`.

### Suggested extraction targets

| Concern | Proposed module | Notes |
| --- | --- | --- |
| Pitch helpers | `www/staff/font/helpers/pitch.js` | `keyToMidi`, `midiToKeySpec`, `findClosestPitchForY` |
| Duration helpers | `www/staff/font/helpers/duration.js` | `durationFromDenom`, `resolveDuration` |
| Tonality helpers | `www/staff/font/helpers/tonality.js` | Accidental maps, key signature utilities |
| Render pipeline | `www/staff/font/render/buildSeedVoices.js`, `render/theme.js`, `render/draw.js` | Compose from `render-staff.js` entry |
| Interaction wiring | `www/staff/font/interaction/events.js`, `interaction/selection.js` (existing), `drag/state.js` | Reduce `interaction-controller.js` size |
| Shared utilities | `www/staff/shared/` | Logging, config, ABC loader reuse |

This map will guide staged refactors while keeping `/staff` and `/staff/font` behaviour stable.
