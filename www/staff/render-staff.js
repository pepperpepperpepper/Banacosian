import VexFlow from './vendor/lib/vexflow-esm/entry/vexflow-debug.js';
import { extractKeySignatureFromAbc, canonicalizeKeySignature } from './music-helpers.js';
import { waitForAbcjs } from './utils/abcjs-loader.js';
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
import { drawStaff } from '/js/vexflow/core/draw.js';
import { INITIAL_NOTE_COUNT } from './staff-config.js';
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

  statusEl.textContent = 'Rendering with VexFlow…';

  const requestedKeySig = canonicalizeKeySignature(renderState.keySig) || null;
  const defaultAbcString = defaultAbc(requestedKeySig || 'C');
  if (!renderState.initialized) {
    renderState.abc = defaultAbcString;
  } else if (!renderState.abc) {
    renderState.abc = defaultAbcString;
  }

  let keySig = extractKeySignatureFromAbc(renderState.abc);
  if (requestedKeySig && requestedKeySig !== keySig) {
    renderState.abc = replaceKeySignatureInAbc(renderState.abc, requestedKeySig);
    keySig = requestedKeySig;
  }
  renderState.keySig = keySig;

  const abcjs = await waitForAbcjs({ requireMethod: 'parseOnly' });

  let voices;
  let meter;
  let warnings = [];

  if (!renderState.initialized) {
    const parsed = parseInitialVoices(abcjs, renderState.abc, renderState, { maxNotes: INITIAL_NOTE_COUNT });
    voices = parsed.voices;
    meter = parsed.meter;
    warnings = parsed.warnings || [];
  } else {
    voices = cloneVoices(renderState.voices);
    meter = renderState.meter;
    warnings = renderState.warnings ? [...renderState.warnings] : [];
  }

  if (!voices || voices.length === 0) {
    container.innerHTML = '';
    statusEl.textContent = statusEmptyText;
    return null;
  }

  const requestedFontChoice = resolveSelectedFont(fontSelect, fontChoices);
  const fontSetup = await configureVexflowFont(VexFlow, requestedFontChoice);
  const fontChoice = fontSetup?.choice || requestedFontChoice;
  if (Array.isArray(fontSetup?.warnings) && fontSetup.warnings.length > 0) {
    warnings.push(...fontSetup.warnings);
  }

  const uniqueWarnings = [...new Set(warnings)];
  renderState.warnings = uniqueWarnings;

  const theme = getStaffTheme();
  const staffScale = computeStaffScale(renderState);

  const drawResult = drawStaff({
    container,
    theme,
    staffScale,
    voices,
    meter,
    keySig,
    fontChoice,
    renderState,
    warnings: uniqueWarnings,
    registerInteractions,
    applyTheme: applyVexflowTheme,
  });

  if (!drawResult) {
    statusEl.textContent = statusEmptyText;
    return null;
  }

  const { context, vexflowVoices, baseMessage } = drawResult;
  renderState.warnings = drawResult.warnings.slice();

  if (selectionState) selectionState.messageBase = baseMessage;
  statusEl.textContent = baseMessage;
  renderState.baseMessage = baseMessage;

  return {
    context,
    voices: vexflowVoices,
    theme,
    baseMessage,
    warnings: drawResult.warnings,
  };
}
