# Staff Module Map

## `/staff` (VexFlow demo)

- `www/staff/music-helpers.js`
  - Responsibilities: duration math, pitch↔midi conversions, accidental/key signature helpers, spec cloning.
  - Pain points: mixed concerns; many consumers need only slices.
- `www/staff/render-staff.js`
  - Responsibilities: prepare seed voices, apply theme, construct renderer, register interactions, manage cache.
  - Pain points: interleaves voice prep, theme, rendering, and post-hooks, making reuse difficult.
- `www/staff/interaction-controller.js`
  - Responsibilities: register SVG event handlers, maintain selectable registry, bridge to drag/add.
  - Pain points: mixes selection reset, DOM queries, event handler attachment; hard to unit test.
- Other key modules: `interaction-drag.js`, `interaction-add.js`, `interaction-dom.js`, `drag/preview.js`, `render/note-factory.js`.

### Suggested extraction targets

| Concern | Proposed module | Notes |
| --- | --- | --- |
| Pitch helpers | `www/staff/helpers/pitch.js` | `keyToMidi`, `midiToKeySpec`, `findClosestPitchForY` |
| Duration helpers | `www/staff/helpers/duration.js` | `durationFromDenom`, `resolveDuration` |
| Tonality helpers | `www/staff/helpers/tonality.js` | Accidental maps, key signature utilities |
| Render pipeline | `www/staff/render/buildSeedVoices.js`, `render/theme.js`, `render/draw.js` | Compose from `render-staff.js` entry |
| Interaction wiring | `www/staff/interaction/events.js`, `interaction/selection.js` (existing), `drag/state.js` | Reduce `interaction-controller.js` size |
| Shared utilities | `www/staff/shared/` | Logging, config, ABC loader reuse |

This map reflects the post-migration layout where the VexFlow demo lives directly under `/staff`.
