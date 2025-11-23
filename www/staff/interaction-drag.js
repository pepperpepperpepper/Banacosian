import {
  decideAccidentalForKey,
  formatPitchLabel,
  midiToKeySpec,
  getPrimaryMidi,
  applySpecPitchUpdate,
  parseKeyString,
} from './music-helpers.js';
import {
  selectionState,
  triggerRender,
  getRenderState,
  setStatusText,
  getDragQuantizer,
} from './interaction-state.js';
import {
  normalizePointerEvent,
  toAbsBBox,
} from './interaction-dom.js';
import {
  clearSelection,
  registerCancelDrag,
} from './interaction-selection.js';
import { readTokens } from '/staff/theme/readTokens.js';
import {
  attachDragListeners,
  detachDragListeners,
} from './drag/listeners.js';
import {
  clearPreviewGroup,
  drawPreviewGroup,
} from './drag/preview.js';
import { cloneNoteSpec } from '/js/vexflow/core/utils/spec.js';

const DEFAULT_ACTIVATION_COLOR = '#1a2fd6';

function resolveActivationColor() {
  try {
    const tokens = typeof readTokens === 'function' ? readTokens() : {};
    if (tokens?.selection && tokens.selection.trim() !== '') return tokens.selection.trim();
    if (tokens?.accent && tokens.accent.trim() !== '') return tokens.accent.trim();
  } catch (_error) {
    /* ignore token read failures and fall back to default */
  }
  return DEFAULT_ACTIVATION_COLOR;
}

export function beginDrag(event, note, noteEl, pointerTarget, voiceIndex, noteIndex) {
  const primary = normalizePointerEvent(event);
  if (!note || !noteEl || !primary) return;
  const svg = noteEl.ownerSVGElement;
  const renderState = getRenderState();
  const voice = renderState?.voices?.[voiceIndex];
  const spec = voice?.noteSpecs?.[noteIndex];
  if (!voice || !spec) return;

  const bbox = toAbsBBox(noteEl, svg, noteEl.getBBox?.());
  const stave = typeof note.getStave === 'function' ? note.getStave() : null;
  const renderStateScale = Number.isFinite(renderState?.staffScale) && renderState.staffScale > 0
    ? renderState.staffScale
    : null;
  const svgScale = Number.isFinite(svg?.__vexflowScale) && svg.__vexflowScale > 0
    ? svg.__vexflowScale
    : null;
  const staffScale = renderStateScale || svgScale || 1;
  const baseSpacing = stave?.getSpacingBetweenLines?.() ?? 12;
  const staffSpacing = baseSpacing * staffScale;
  const staffStep = staffSpacing / 2;
  const pxPerSemitone = Math.max(2, staffStep * 0.6);
  const baseMidi = getPrimaryMidi(spec);
  const keyString = Array.isArray(spec.keys) ? spec.keys[0] : null;
  const baseKeyFromSpec = parseKeyString(keyString);
  const midiKey = midiToKeySpec(baseMidi);
  const baseKey = baseKeyFromSpec || midiKey;
  const baseDiatonic = Number.isFinite(baseKeyFromSpec?.diatonicIndex)
    ? baseKeyFromSpec.diatonicIndex
    : midiKey.diatonicIndex;
  const originalVisibility = noteEl.style.visibility || '';
  const specClone = cloneNoteSpec(spec, { includeMidis: false });
  const activationColor = resolveActivationColor();

  selectionState.drag = {
    note,
    noteEl,
    pointerTarget,
    pointerId: primary.pointerId ?? null,
    svgRoot: svg,
    bbox,
    baseMidi,
    baseKey,
    baseDiatonic,
    previewDelta: 0,
    accum: 0,
    lastY: primary.clientY ?? 0,
    baseMessage: selectionState.messageBase,
    clef: spec.clef || voice.clef || 'treble',
    voiceIndex,
    noteIndex,
    staffStep,
    staffSpacing,
    pxPerSemitone,
    baseTransform: selectionState.baseTransform,
    listenersAttached: false,
    specClone,
    hiddenNoteVisibility: originalVisibility,
    activationColor,
    quantizedMidi: baseMidi,
    lastDirection: 0,
    lastPreviewDelta: 0,
  };
  if (noteEl && !(specClone?.isRest)) {
    noteEl.style.visibility = 'hidden';
  }
  if (specClone && !specClone.isRest) {
    const initialSymbol = Array.isArray(specClone.accidentals) ? specClone.accidentals[0] : null;
    try {
      drawPreviewGroup(selectionState.drag, selectionState.drag.baseKey, initialSymbol);
    } catch (err) {
      console.error('[VexflowDrag] initial preview failed', err);
    }
  }
  attachDragListeners({
    onMove: handlePointerMove,
    onUp: handlePointerUp,
  });
  if (pointerTarget && selectionState.drag.pointerId != null && pointerTarget.setPointerCapture) {
    try { pointerTarget.setPointerCapture(selectionState.drag.pointerId); } catch (_err) { /* ignore */ }
  }
  console.log('[VexflowDrag] begin', selectionState.drag);
}

function handlePointerMove(event) {
  const drag = selectionState.drag;
  if (!drag) return;
  const primary = normalizePointerEvent(event);
  if (event?.cancelable) event.preventDefault();
  if (!primary || primary.clientY == null) return;
  const dy = drag.lastY - primary.clientY;
  drag.lastY = primary.clientY;
  drag.accum += dy;
  const step = drag.pxPerSemitone;
  let semitones = 0;
  while (Math.abs(drag.accum) >= step) {
    semitones += (drag.accum > 0) ? 1 : -1;
    drag.accum -= (drag.accum > 0) ? step : -step;
  }
  if (semitones !== 0) drag.previewDelta += semitones;
  let previewMidi = drag.baseMidi + drag.previewDelta;
  const quantizer = getDragQuantizer()
    || (typeof window !== 'undefined' ? window.__EarStaffDragQuantizer : null);
  if (typeof quantizer === 'function') {
    const previousDelta = Number.isFinite(drag.lastPreviewDelta) ? drag.lastPreviewDelta : 0;
    const deltaChange = drag.previewDelta - previousDelta;
    const directionHint = deltaChange !== 0
      ? Math.sign(deltaChange)
      : (drag.lastDirection || Math.sign(drag.previewDelta) || 0);
    const quantizedMidi = quantizer({
      baseMidi: drag.baseMidi,
      previewMidi,
      lastMidi: drag.quantizedMidi ?? (drag.baseMidi + previousDelta),
      direction: directionHint,
    });
    if (Number.isFinite(quantizedMidi)) {
      previewMidi = quantizedMidi;
      drag.previewDelta = previewMidi - drag.baseMidi;
      drag.quantizedMidi = previewMidi;
      drag.lastDirection = directionHint || drag.lastDirection || 0;
    }
    drag.lastPreviewDelta = drag.previewDelta;
  }
  let previewKey = midiToKeySpec(previewMidi);
  if ((drag.previewDelta === 0 || !Number.isFinite(previewKey?.diatonicIndex)) && drag.baseKey) {
    previewKey = drag.baseKey;
  }
  drag.previewKey = previewKey;
  const renderState = getRenderState();
  const symbol = decideAccidentalForKey(previewKey, renderState?.keySig);
  try {
    drawPreviewGroup(drag, previewKey, symbol);
  } catch (err) {
    console.error('[VexflowDrag] preview update failed', err);
  }
  const label = formatPitchLabel(previewKey);
  const base = drag.baseMessage || '';
  setStatusText(`${base} — Dragging to ${label}`);
}

function handlePointerUp(event) {
  const drag = selectionState.drag;
  if (!drag) return;
  if (drag.pointerTarget && drag.pointerId != null && drag.pointerTarget.releasePointerCapture) {
    try { drag.pointerTarget.releasePointerCapture(drag.pointerId); } catch (_e) { /* ignore */ }
  }
  detachDragListeners();
  clearPreviewGroup(drag);
  if (drag.noteEl) {
    drag.noteEl.style.visibility = drag.hiddenNoteVisibility ?? '';
  }
  const delta = drag.previewDelta || 0;
  selectionState.drag = null;
  commitNoteDelta(drag, delta);
}

function commitNoteDelta(drag, delta) {
  const renderState = getRenderState();
  const voice = renderState?.voices?.[drag.voiceIndex];
  if (!voice) { triggerRender(); return; }
  const spec = voice.noteSpecs?.[drag.noteIndex];
  if (!spec || spec.isRest) { triggerRender(); return; }
  let targetMidi = drag.baseMidi + (delta || 0);
  const quantizer = getDragQuantizer()
    || (typeof window !== 'undefined' ? window.__EarStaffDragQuantizer : null);
  if (typeof quantizer === 'function') {
    const resolved = quantizer({
      baseMidi: drag.baseMidi,
      previewMidi: targetMidi,
      lastMidi: drag.quantizedMidi ?? targetMidi,
      direction: Math.sign(delta || drag.lastDirection || 0) || 0,
    });
    if (Number.isFinite(resolved)) {
      targetMidi = resolved;
    }
  }
  applySpecPitchUpdate(spec, targetMidi, renderState?.keySig);
  clearSelection(selectionState.messageBase);
  triggerRender();
}

export function applyWheelDelta(delta) {
  const note = selectionState.note;
  if (!note) return;
  const renderState = getRenderState();
  const voiceIndex = note.__voiceIndex;
  const noteIndex = note.__noteIndex;
  const voice = renderState?.voices?.[voiceIndex];
  if (!voice) return;
  const spec = voice.noteSpecs?.[noteIndex];
  if (!spec || spec.isRest) return;
  const baseMidi = getPrimaryMidi(spec);
  let targetMidi = baseMidi + (delta || 0);
  const quantizer = getDragQuantizer()
    || (typeof window !== 'undefined' ? window.__EarStaffDragQuantizer : null);
  if (typeof quantizer === 'function') {
    const resolved = quantizer({
      baseMidi,
      previewMidi: targetMidi,
      lastMidi: baseMidi,
      direction: Math.sign(delta) || 0,
    });
    if (Number.isFinite(resolved)) {
      targetMidi = resolved;
    }
  }
  applySpecPitchUpdate(spec, targetMidi, renderState?.keySig);
  clearSelection(selectionState.messageBase);
  triggerRender();
}

export function cancelActiveDrag(drag = selectionState.drag) {
  if (!drag) return;
  detachDragListeners();
  clearPreviewGroup(drag);
  if (drag.pointerTarget && drag.pointerId != null && drag.pointerTarget.releasePointerCapture) {
    try { drag.pointerTarget.releasePointerCapture(drag.pointerId); } catch (_e) { /* ignore */ }
  }
  if (drag.noteEl) {
    drag.noteEl.style.visibility = drag.hiddenNoteVisibility ?? '';
  }
  if (selectionState.drag === drag) {
    selectionState.drag = null;
  }
}

registerCancelDrag(cancelActiveDrag);
