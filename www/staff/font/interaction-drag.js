import { Accidental, StaveNote } from './vendor/lib/vexflow-esm/entry/vexflow-debug.js';
import { TickContext } from './vendor/lib/vexflow-esm/src/tickcontext.js';
import {
  decideAccidentalForKey,
  diatonicIndexForLetter,
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
} from './interaction-state.js';
import {
  HAS_POINTER_EVENTS,
  normalizePointerEvent,
  toAbsBBox,
} from './interaction-dom.js';
import {
  clearSelection,
  registerCancelDrag,
} from './interaction-selection.js';

const ACTIVE_LISTENERS = {
  move: null,
  up: null,
  cancel: null,
  touchMove: null,
  touchEnd: null,
  touchCancel: null,
  mouseMove: null,
  mouseUp: null,
};

function attachDragListeners() {
  if (selectionState.drag?.listenersAttached) return;
  if (HAS_POINTER_EVENTS) {
    ACTIVE_LISTENERS.move = (event) => handlePointerMove(event);
    ACTIVE_LISTENERS.up = (event) => handlePointerUp(event);
    ACTIVE_LISTENERS.cancel = (event) => handlePointerUp(event);
    window.addEventListener('pointermove', ACTIVE_LISTENERS.move, { passive: false });
    window.addEventListener('pointerup', ACTIVE_LISTENERS.up, { passive: true });
    window.addEventListener('pointercancel', ACTIVE_LISTENERS.cancel, { passive: true });
  } else {
    ACTIVE_LISTENERS.touchMove = (event) => handlePointerMove(event);
    ACTIVE_LISTENERS.touchEnd = (event) => handlePointerUp(event);
    ACTIVE_LISTENERS.touchCancel = (event) => handlePointerUp(event);
    ACTIVE_LISTENERS.mouseMove = (event) => handlePointerMove(event);
    ACTIVE_LISTENERS.mouseUp = (event) => handlePointerUp(event);
    window.addEventListener('touchmove', ACTIVE_LISTENERS.touchMove, { passive: false });
    window.addEventListener('touchend', ACTIVE_LISTENERS.touchEnd, { passive: true });
    window.addEventListener('touchcancel', ACTIVE_LISTENERS.touchCancel, { passive: true });
    window.addEventListener('mousemove', ACTIVE_LISTENERS.mouseMove, { passive: false });
    window.addEventListener('mouseup', ACTIVE_LISTENERS.mouseUp, { passive: true });
  }
  if (selectionState.drag) {
    selectionState.drag.listenersAttached = true;
  }
}

function detachDragListeners() {
  if (HAS_POINTER_EVENTS) {
    if (ACTIVE_LISTENERS.move) window.removeEventListener('pointermove', ACTIVE_LISTENERS.move, { passive: false });
    if (ACTIVE_LISTENERS.up) window.removeEventListener('pointerup', ACTIVE_LISTENERS.up, { passive: true });
    if (ACTIVE_LISTENERS.cancel) window.removeEventListener('pointercancel', ACTIVE_LISTENERS.cancel, { passive: true });
  } else {
    if (ACTIVE_LISTENERS.touchMove) window.removeEventListener('touchmove', ACTIVE_LISTENERS.touchMove, { passive: false });
    if (ACTIVE_LISTENERS.touchEnd) window.removeEventListener('touchend', ACTIVE_LISTENERS.touchEnd, { passive: true });
    if (ACTIVE_LISTENERS.touchCancel) window.removeEventListener('touchcancel', ACTIVE_LISTENERS.touchCancel, { passive: true });
    if (ACTIVE_LISTENERS.mouseMove) window.removeEventListener('mousemove', ACTIVE_LISTENERS.mouseMove, { passive: false });
    if (ACTIVE_LISTENERS.mouseUp) window.removeEventListener('mouseup', ACTIVE_LISTENERS.mouseUp, { passive: true });
  }
  Object.keys(ACTIVE_LISTENERS).forEach((key) => {
    ACTIVE_LISTENERS[key] = null;
  });
  if (selectionState.drag) {
    selectionState.drag.listenersAttached = false;
  }
}

function cloneSpec(spec) {
  if (!spec) return null;
  return {
    keys: Array.isArray(spec.keys) ? [...spec.keys] : [],
    accidentals: Array.isArray(spec.accidentals) ? [...spec.accidentals] : undefined,
    duration: spec.duration,
    isRest: spec.isRest === true,
    clef: spec.clef,
    dots: spec.dots,
    strokePx: spec.strokePx,
  };
}

function clearPreviewGroup(drag) {
  if (!drag?.previewGroup) return;
  const { previewGroup } = drag;
  if (previewGroup.parentNode) {
    previewGroup.parentNode.removeChild(previewGroup);
  }
  drag.previewGroup = null;
  drag.previewNote = null;
}

function buildPreviewNote(drag, previewKey, accidentalSymbol) {
  if (!drag?.specClone || drag.specClone.isRest) return null;
  const base = drag.specClone;
  const keys = [...base.keys];
  if (keys.length === 0) {
    keys.push(previewKey?.key || 'c/4');
  }
  if (previewKey?.key) {
    keys[0] = previewKey.key;
  }
  const struct = {
    keys,
    duration: `${base.duration || 'q'}`,
    clef: base.clef || drag.clef || 'treble',
  };
  if (base.strokePx) {
    struct.strokePx = base.strokePx;
  }
  const note = new StaveNote(struct);
  const accidentals = Array.isArray(base.accidentals)
    ? [...base.accidentals]
    : new Array(keys.length).fill(null);
  while (accidentals.length < keys.length) {
    accidentals.push(null);
  }
  const nextAccidental = (accidentalSymbol !== undefined)
    ? accidentalSymbol
    : (accidentals[0] ?? null);
  accidentals[0] = nextAccidental;
  accidentals.forEach((acc, idx) => {
    if (acc) {
      note.addModifier(new Accidental(acc), idx);
    }
  });
  const dotCount = Number.isFinite(base.dots) ? base.dots : 0;
  for (let i = 0; i < dotCount; i += 1) {
    note.addDotToAll();
  }
  note.autoStem?.();
  const ledgerStyle = drag.note.getLedgerLineStyle?.();
  if (ledgerStyle) {
    note.setLedgerLineStyle(ledgerStyle);
  }
  const style = drag.note.getStyle?.();
  if (style) {
    note.setStyle(style);
  }
  const xShift = typeof drag.note.getXShift === 'function' ? drag.note.getXShift() : 0;
  if (Number.isFinite(xShift)) {
    note.setXShift(xShift);
  }
  return note;
}

function drawPreviewGroup(drag, previewKey, accidentalSymbol) {
  if (!drag?.note) return;
  const ctx = drag.note.checkContext?.();
  const stave = drag.note.getStave?.();
  const originalTick = drag.note.getTickContext?.();
  if (!ctx || !stave || !originalTick) return;

  const previewNote = buildPreviewNote(drag, previewKey, accidentalSymbol);
  if (!previewNote) return;

  previewNote.setContext(ctx);
  previewNote.setStave(stave);

  const tickContext = new TickContext();
  if (typeof originalTick.getX === 'function') tickContext.setX(originalTick.getX());
  if (typeof originalTick.getXBase === 'function') tickContext.setXBase(originalTick.getXBase());
  if (typeof originalTick.getXOffset === 'function') tickContext.setXOffset(originalTick.getXOffset());
  tickContext.addTickable(previewNote);
  tickContext.preFormat();

  clearPreviewGroup(drag);

  const group = ctx.openGroup?.('drag-preview');
  try {
    previewNote.draw();
  } catch (err) {
    console.error('[VexflowDrag] preview draw failed', err);
  } finally {
    ctx.closeGroup?.();
  }

  drag.previewGroup = group || null;
  drag.previewNote = previewNote;
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
  const specClone = cloneSpec(spec);
  const originalVisibility = noteEl.style.visibility || '';

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
  attachDragListeners();
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
  const previewMidi = drag.baseMidi + drag.previewDelta;
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
  const targetMidi = drag.baseMidi + (delta || 0);
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
  const targetMidi = baseMidi + delta;
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
