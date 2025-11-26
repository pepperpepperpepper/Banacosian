import { drawStaff } from './draw.js';

function ensureArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

function cloneVoicesForState(voices) {
  return voices.map((voice) => ({
    ...voice,
    noteSpecs: Array.isArray(voice.noteSpecs)
      ? voice.noteSpecs.map((spec) => ({ ...spec }))
      : [],
  }));
}

export async function renderPipeline({
  container,
  statusEl = null,
  statusBusyText = 'Rendering with VexFlow…',
  statusEmptyText = 'Unable to render VexFlow staff.',
  renderState = {},
  resolveFont = null,
  produceVoices,
  resolveTheme = null,
  resolveScale = null,
  registerInteractions = null,
  applyTheme = null,
  allowEmptyVoices = false,
}) {
  if (!container || typeof produceVoices !== 'function') {
    return null;
  }

  if (statusEl) {
    statusEl.textContent = statusBusyText;
  }

  const state = renderState;

  const fontInfo = typeof resolveFont === 'function'
    ? await resolveFont(state)
    : null;
  const fontChoice = fontInfo?.fontChoice ?? fontInfo?.choice ?? null;
  const fontWarnings = ensureArray(fontInfo?.warnings);

  const voiceResult = await produceVoices(state, { fontChoice });
  const voices = ensureArray(voiceResult?.voices);
  const meter = voiceResult?.meter ?? state.meter ?? null;
  const keySig = voiceResult?.keySig ?? state.keySig ?? null;
  const voiceWarnings = ensureArray(voiceResult?.warnings);

  const combinedWarningsPreDraw = new Set([
    ...fontWarnings,
    ...voiceWarnings,
  ]);

  if (voices.length === 0 && !allowEmptyVoices) {
    if (container) container.innerHTML = '';
    if (statusEl) statusEl.textContent = statusEmptyText;
    state.voices = [];
    state.meter = meter;
    state.keySig = keySig;
    state.baseMessage = '';
    state.warnings = Array.from(combinedWarningsPreDraw);
    return null;
  }

  state.voices = cloneVoicesForState(voices);
  state.meter = meter;
  state.keySig = keySig;

  const theme = resolveTheme ? resolveTheme(state) : null;
  const staffScale = resolveScale ? resolveScale(state) : state.staffScale;
  const staffScaleY = Number.isFinite(state.staffScaleY) && state.staffScaleY > 0
    ? state.staffScaleY
    : staffScale;

  state.staffScale = staffScale;
  state.staffScaleY = staffScaleY;

  const drawResult = drawStaff({
    container,
    theme,
    staffScale,
    staffScaleY,
    voices,
    meter,
    keySig,
    fontChoice,
    renderState: state,
    warnings: Array.from(combinedWarningsPreDraw),
    registerInteractions,
    applyTheme,
  });

  if (!drawResult) {
    if (statusEl) statusEl.textContent = statusEmptyText;
    state.baseMessage = '';
    return null;
  }

  const drawWarnings = ensureArray(drawResult.warnings);
  const combinedWarnings = Array.from(new Set([
    ...combinedWarningsPreDraw,
    ...drawWarnings,
  ]));
  state.warnings = combinedWarnings;
  state.baseMessage = drawResult.baseMessage || '';
  if (fontChoice) {
    state.fontChoice = fontChoice;
  }

  if (statusEl) {
    statusEl.textContent = state.baseMessage || '';
  }

  return {
    context: drawResult.context,
    voices: drawResult.vexflowVoices,
    vexflowVoices: drawResult.vexflowVoices,
    baseMessage: drawResult.baseMessage,
    warnings: combinedWarnings,
    fontChoice,
    theme,
    staffScale,
    staffScaleY,
  };
}

export default renderPipeline;
