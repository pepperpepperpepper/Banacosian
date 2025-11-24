## Refactor Plan

### Goals
- Shorten oversized source files (`js/MelodicDictation.js`, `js/modules/Staff.js`, etc.) and isolate concerns so staff input parity and state tracking are easier to maintain.
- Reuse `/staff` interaction logic directly, including audio preview behavior, without sprinkling hooks across dictation code.
- Keep the round-state machine explicit but move it into a reusable module so UI and logic share the same source of truth.

### Proposed Steps

1. **RoundPhase Controller**
   - Create `js/modules/RoundPhaseController.js`.
   - Move `ROUND_PHASES`, `setRoundPhase`, countdown helpers, verbose logging, and debug toggles into this module.
   - MelodicDictation imports the controller and delegates all state transitions through it.

2. **Staff Input Controller**
   - Introduce `js/modules/StaffInputController.js` that wraps `/staff`’s `interaction-controller`.
   - Responsibilities: bind/unbind staff input, manage practice vs. answer stacks, emit events (`onPracticeChange`, `onAnswerChange`, `onPitchPreview`), and keep VexFlow snapshots in sync.
   - MelodicDictation listens to controller events instead of manipulating staff arrays directly.

3. **Audio Preview Service**
   - Add `js/modules/AudioPreview.js` that exposes `previewPitch(note, context)` with built-in guards (phase, throttling, browser support).
   - Used by StaffInputController (and potentially keyboard) so audio feedback rules live in one place.

4. **UI Controller Extraction**
   - Create `js/modules/DictationUIController.js` to encapsulate form wiring, feedback updates, submit button toggles, and history modal management.
   - `UIModule` keeps DOM utilities; MelodicDictation talks to the new controller, reducing the main class footprint.

5. **Settings Wrapper**
   - Extract load/save/normalize logic into `js/modules/DictationSettings.js`.
   - Provide helpers like `loadInitialSettings()` and `persist(settings)` used by MelodicDictation and StorageModule.

6. **Progressive Adoption**
   - Refactor one module at a time, ensuring `/staff` demo keeps working after each step.
   - After each extraction, reroute the main dictation flow to the new module, delete redundant code, and keep files under ~400 lines.

7. **Testing / Verification**
   - After each milestone, run `npm run dev` and manually verify `/`, `/staff`, `/keyboard`, and `/intervals`.
   - Use `?stateDebug=1` to confirm phase transitions still log correctly after the controller move.

