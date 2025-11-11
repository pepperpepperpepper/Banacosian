import VexFlow from './vendor/lib/vexflow-esm/entry/vexflow-debug.js';
import { extractKeySignatureFromAbc, canonicalizeKeySignature } from './music-helpers.js';
import {
  defaultAbc,
  replaceKeySignatureInAbc,
  parseInitialVoices,
  cloneVoices,
} from '/js/vexflow/core/buildSeedVoices.js';
import {
  getStaffTheme,
  resolveSelectedFont,
  computeStaffScale,
  applyVexflowTheme,
} from './render/theme.js';
import { renderPipeline } from '/js/vexflow/core/renderPipeline.js';
import { waitForAbcjs, INITIAL_NOTE_COUNT } from '/js/vexflow/core/seeds.js';
import { configureVexflowFont } from '/js/modules/StaffFonts.js';

export async function renderVexflowStaff({
  container,
  statusEl,
  fontSelect,
  fontChoices,
  statusEmptyText,
  renderState,
  selectionState,
  registerInteractions,
}) {
  if (!container || !statusEl) return null;

  const result = await renderPipeline({
    container,
    statusEl,
    statusBusyText: 'Rendering with VexFlow…',
    statusEmptyText,
    renderState,
    resolveFont: async () => {
      const requestedFontChoice = resolveSelectedFont(fontSelect, fontChoices);
      const fontSetup = await configureVexflowFont(VexFlow, requestedFontChoice);
      return {
        fontChoice: fontSetup?.choice || requestedFontChoice,
        warnings: Array.isArray(fontSetup?.warnings) ? fontSetup.warnings : [],
      };
    },
    produceVoices: async (state) => {
      const requestedKeySig = canonicalizeKeySignature(state.keySig) || null;
      const defaultAbcString = defaultAbc(requestedKeySig || 'C');
      if (!state.initialized) {
        state.abc = defaultAbcString;
      } else if (!state.abc) {
        state.abc = defaultAbcString;
      }

      let keySig = extractKeySignatureFromAbc(state.abc);
      if (requestedKeySig && requestedKeySig !== keySig) {
        state.abc = replaceKeySignatureInAbc(state.abc, requestedKeySig);
        keySig = requestedKeySig;
      }
      state.keySig = keySig;

      const abcjs = await waitForAbcjs({ requireMethod: 'parseOnly' });

      let voices;
      let meter;
      let warnings = [];

      if (!state.initialized) {
        const parsed = parseInitialVoices(abcjs, state.abc, state, { maxNotes: INITIAL_NOTE_COUNT });
        voices = parsed.voices;
        meter = parsed.meter;
        warnings = parsed.warnings || [];
        state.initialized = true;
      } else {
        voices = cloneVoices(state.voices);
        meter = state.meter;
        warnings = state.warnings ? [...state.warnings] : [];
      }

      return {
        voices,
        meter,
        keySig,
        warnings,
      };
    },
    resolveTheme: () => getStaffTheme(),
    resolveScale: (state) => computeStaffScale(state),
    registerInteractions: typeof registerInteractions === 'function'
      ? ({ context: vfContext, voices, baseMessage, scale }) => {
        registerInteractions({
          context: vfContext,
          voices,
          baseMessage,
          scale,
          container,
        });
      }
      : null,
    applyTheme: applyVexflowTheme,
  });

  if (selectionState) {
    selectionState.messageBase = result?.baseMessage || '';
  }

  return result;
}
