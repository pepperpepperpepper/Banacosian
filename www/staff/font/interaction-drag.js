import { Accidental } from './vendor/lib/vexflow-esm/entry/vexflow-debug.js';
import { Tables } from './vendor/lib/vexflow-esm/src/tables.js';
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
  collectLedgerLineNodes,
  collectNoteheadNodes,
  collectStemNodes,
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

function staffRangeForClef(clef) {
  switch ((clef || 'treble').toLowerCase()) {
    case 'bass':
      return { bottom: { letter: 'g', octave: 2 }, top: { letter: 'a', octave: 3 } };
    case 'alto':
      return { bottom: { letter: 'f', octave: 3 }, top: { letter: 'g', octave: 4 } };
    case 'tenor':
      return { bottom: { letter: 'd', octave: 3 }, top: { letter: 'e', octave: 4 } };
    default:
      return { bottom: { letter: 'e', octave: 4 }, top: { letter: 'f', octave: 5 } };
  }
}

function previewNeedsLedger(diatonicIndex, clef) {
  const { bottom, top } = staffRangeForClef(clef);
  const b = diatonicIndexForLetter(bottom.letter, bottom.octave);
  const t = diatonicIndexForLetter(top.letter, top.octave);
  if (diatonicIndex < b) return (diatonicIndex % 2) === (b % 2);
  if (diatonicIndex > t) return (diatonicIndex % 2) === (t % 2);
  return false;
}

function ensureLedgerNodesCached(drag) {
  if (!drag || drag.ledgerNodes) return;
  const noteEl = drag.noteEl;
  if (!noteEl) return;
  const nodes = collectLedgerLineNodes(noteEl);
  if (nodes.length > 0) {
    drag.ledgerNodes = nodes.map((node) => ({ node, prevDisplay: node.style.display || '' }));
  } else {
    drag.ledgerNodes = [];
  }
}

function setLedgerVisibility(drag, visible) {
  if (!drag) return;
  ensureLedgerNodesCached(drag);
  if (!drag.ledgerNodes) return;
  drag.ledgerNodes.forEach((entry) => {
    const { node, prevDisplay } = entry;
    if (!node) return;
    if (visible) {
      node.style.display = prevDisplay;
    } else {
      node.style.display = 'none';
    }
  });
}

function restoreLedgerVisibility(drag) {
  if (!drag || !drag.ledgerNodes) return;
  drag.ledgerNodes.forEach((entry) => {
    const { node, prevDisplay } = entry;
    if (node) node.style.display = prevDisplay;
  });
  drag.ledgerNodes = null;
}

const STEM_PATH_RE = /M\s*([-\d.]+)[ ,]([-\d.]+)\s*L\s*([-\d.]+)[ ,]([-\d.]+)/i;

function computeHeadMetrics(noteEl) {
  const headNodes = collectNoteheadNodes(noteEl);
  if (!headNodes || headNodes.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let centerSumY = 0;
  let count = 0;
  headNodes.forEach((node) => {
    if (!node) return;
    try {
      const bbox = node.getBBox();
      if (!bbox) return;
      const left = bbox.x;
      const right = bbox.x + bbox.width;
      minX = Math.min(minX, left);
      maxX = Math.max(maxX, right);
      centerSumY += bbox.y + bbox.height / 2;
      count += 1;
    } catch (_err) { /* ignore */ }
  });
  if (count === 0 || !Number.isFinite(minX) || !Number.isFinite(maxX)) return null;
  return {
    minX,
    maxX,
    centerY: centerSumY / count,
  };
}

function parseStemGeometry(node) {
  if (!node) return null;
  const tag = node.tagName?.toLowerCase?.() || '';
  if (tag === 'path') {
    const d = node.getAttribute('d') || '';
    const match = STEM_PATH_RE.exec(d);
    if (!match) return null;
    const x1 = parseFloat(match[1]);
    const y1 = parseFloat(match[2]);
    const x2 = parseFloat(match[3]);
    const y2 = parseFloat(match[4]);
    if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
    return {
      type: 'path',
      baseX: x1,
      baseY: y1,
      tipX: x2,
      tipY: y2,
      length: Math.max(0, Math.hypot(x2 - x1, y2 - y1)),
      orientation: y2 < y1 ? 1 : -1,
      original: { d },
    };
  }
  if (tag === 'line') {
    const x1 = parseFloat(node.getAttribute('x1'));
    const y1 = parseFloat(node.getAttribute('y1'));
    const x2 = parseFloat(node.getAttribute('x2'));
    const y2 = parseFloat(node.getAttribute('y2'));
    if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
    return {
      type: 'line',
      baseX: x1,
      baseY: y1,
      tipX: x2,
      tipY: y2,
      length: Math.max(0, Math.hypot(x2 - x1, y2 - y1)),
      orientation: y2 < y1 ? 1 : -1,
      original: { x1, y1, x2, y2 },
    };
  }
  return null;
}

function ensureStemNodesCached(drag) {
  if (!drag || drag.stemCache) return;
  const nodes = collectStemNodes(drag.noteEl);
  if (!nodes || nodes.length === 0) {
    drag.stemCache = [];
    return;
  }
  const baseMetrics = computeHeadMetrics(drag.noteEl);
  drag.headMetrics = baseMetrics || null;
  const cache = [];
  nodes.forEach((node) => {
    const geom = parseStemGeometry(node);
    if (!geom || !geom.length || geom.length <= 0) return;
    let offsetLeft = 0;
    let offsetRight = 0;
    if (baseMetrics) {
      if (geom.orientation === -1) {
        offsetLeft = geom.baseX - baseMetrics.minX;
      } else if (geom.orientation === 1) {
        offsetRight = geom.baseX - baseMetrics.maxX;
      }
    }
    const entry = {
      node,
      type: geom.type,
      original: geom.original,
      length: geom.length,
      baseYOffset: baseMetrics ? geom.baseY - baseMetrics.centerY : 0,
      offsetLeft,
      offsetRight,
      orientation: geom.orientation,
    };
    cache.push(entry);
  });
  drag.stemCache = cache;
  let baseDir = null;
  if (drag.note?.getStemDirection) {
    try {
      baseDir = drag.note.getStemDirection();
    } catch (_err) {
      baseDir = null;
    }
  }
  drag.initialStemDir = Number.isFinite(baseDir) ? baseDir : (cache[0]?.orientation ?? null);
  drag.currentStemDir = drag.initialStemDir;
}

function calculateStemDirectionForKey(previewKey, clef) {
  if (!previewKey || !previewKey.key) return null;
  const letter = previewKey.letter || 'c';
  const accidental = previewKey.accidental || '';
  const octave = Number.isFinite(previewKey.octave) ? previewKey.octave : 4;
  const key = `${letter}${accidental}/${octave}`;
  try {
    const props = Tables.keyProperties(key, clef || 'treble');
    if (!props) return null;
    return props.line < 3 ? 1 : -1;
  } catch (_err) {
    return null;
  }
}

function applyStemDirectionPreview(entry, direction, metrics) {
  if (!entry || !entry.node || !metrics || !direction) return;
  const baseYOffset = Number.isFinite(entry.baseYOffset) ? entry.baseYOffset : 0;
  const offsetLeft = Number.isFinite(entry.offsetLeft) ? entry.offsetLeft : 0;
  const offsetRight = Number.isFinite(entry.offsetRight) ? entry.offsetRight : 0;
  const length = Number.isFinite(entry.length) ? entry.length : 0;
  if (length <= 0) return;
  const anchorX = direction === 1
    ? metrics.maxX + offsetRight
    : metrics.minX + offsetLeft;
  const baseY = metrics.centerY + baseYOffset;
  const tipY = baseY + (direction === 1 ? -length : length);
  const xStr = anchorX.toFixed(2);
  const baseStr = baseY.toFixed(2);
  const tipStr = tipY.toFixed(2);
  if (entry.type === 'path') {
    entry.node.setAttribute('d', `M ${xStr} ${baseStr} L ${xStr} ${tipStr}`);
  } else if (entry.type === 'line') {
    entry.node.setAttribute('x1', xStr);
    entry.node.setAttribute('x2', xStr);
    entry.node.setAttribute('y1', baseStr);
    entry.node.setAttribute('y2', tipStr);
  }
}

function updatePreviewStemDirection(drag, previewKey) {
  if (!drag) return;
  ensureStemNodesCached(drag);
  if (!drag.stemCache || drag.stemCache.length === 0) return;
  const desired = calculateStemDirectionForKey(previewKey, drag.clef);
  if (!desired || desired === drag.currentStemDir) return;
  const baseMetrics = drag.headMetrics;
  if (!baseMetrics) return;
  const translateY = drag.previewTranslateY ?? 0;
  const metrics = {
    minX: baseMetrics.minX,
    maxX: baseMetrics.maxX,
    centerY: baseMetrics.centerY + translateY,
  };
  drag.stemCache.forEach((entry) => applyStemDirectionPreview(entry, desired, metrics));
  drag.currentStemDir = desired;
}

function restoreOriginalStems(drag) {
  if (!drag || !drag.stemCache) return;
  drag.stemCache.forEach((entry) => {
    if (!entry?.node || !entry.original) return;
    if (entry.type === 'path') {
      entry.node.setAttribute('d', entry.original.d);
    } else if (entry.type === 'line') {
      entry.node.setAttribute('x1', `${entry.original.x1}`);
      entry.node.setAttribute('x2', `${entry.original.x2}`);
      entry.node.setAttribute('y1', `${entry.original.y1}`);
      entry.node.setAttribute('y2', `${entry.original.y2}`);
    }
  });
  drag.stemCache = null;
  drag.headMetrics = null;
  drag.initialStemDir = null;
  drag.currentStemDir = null;
}

function ensureOriginalAccidentalsHidden(drag) {
  if (!drag || drag.hiddenTextNodes || !drag.noteEl) return;
  const toHide = new Set();
  drag.noteEl
    .querySelectorAll('[class*="accidental"], [data-name="accidental"], g.vf-accidental, path.vf-accidental, g.vf-accidental text, g[class*="accidental"] text, [data-name="accidental"] text, text.vf-accidental')
    .forEach((el) => {
      try { if (el.getBBox) toHide.add(el); } catch (_) { /* ignore */ }
    });

  const isAccidentalText = (text) => {
    if (!text) return false;
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      if (!cp) continue;
      if (cp === 0xe1e7) return false;
      if (cp >= 0xe260 && cp <= 0xe4ff) return true;
      if (ch === '♯' || ch === '♭' || ch === '♮' || ch === '#' || ch === 'b' || ch === 'n') return true;
    }
    return false;
  };

  drag.noteEl.querySelectorAll('text').forEach((textEl) => {
    const text = textEl.textContent || '';
    if (isAccidentalText(text)) {
      toHide.add(textEl);
    }
  });

  drag.hiddenTextNodes = Array.from(toHide).map((node) => {
    const prevDisplay = node.style.display || '';
    node.style.display = 'none';
    return { node, prevDisplay };
  });
}

function restoreOriginalAccidentals(drag) {
  if (!drag || !drag.hiddenTextNodes) return;
  drag.hiddenTextNodes.forEach((entry) => {
    const { node, prevDisplay } = entry;
    if (node) node.style.display = prevDisplay;
  });
  drag.hiddenTextNodes = null;
}

function drawVexflowPreviewAccidental(drag, symbol) {
  if (!drag || !drag.note) return;
  const ctx = drag.note.checkContext?.();
  if (!ctx || !drag.note.getModifierContext) return;
  removeVexflowPreviewAccidental(drag);
  const note = drag.note;
  const translateY = drag.previewTranslateY ?? 0;
  if (!symbol) return;
  if (!ctx.openGroup) return;
  const group = ctx.openGroup('preview-accidental');
  try {
    const acc = new Accidental(symbol);
    acc.setNote(note);
    acc.setIndex(0);
    acc.setContext(ctx);
    if (Number.isFinite(translateY)) acc.setYShift(translateY);
    acc.drawWithStyle?.();
  } catch (_e) { /* ignore */ }
  if (ctx.closeGroup) ctx.closeGroup();
  drag.previewAccGroup = group;
}

function removeVexflowPreviewAccidental(drag) {
  if (!drag || !drag.previewAccGroup) return;
  const g = drag.previewAccGroup;
  if (g && g.parentNode) g.parentNode.removeChild(g);
  drag.previewAccGroup = null;
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
  const staffSpacing = stave?.getSpacingBetweenLines?.() ?? 12;
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
  };
  ensureLedgerNodesCached(selectionState.drag);
  ensureOriginalAccidentalsHidden(selectionState.drag);
  ensureStemNodesCached(selectionState.drag);
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

  const diffSteps = previewKey.diatonicIndex - drag.baseDiatonic;
  const translateY = -(diffSteps * drag.staffStep);
  drag.previewTranslateY = translateY;
  try {
    const base = drag.baseTransform && drag.baseTransform !== '' ? `${drag.baseTransform} ` : '';
    drag.noteEl.setAttribute('transform', `${base}translate(0, ${translateY.toFixed(2)})`);
  } catch (_e) { /* ignore */ }

  ensureOriginalAccidentalsHidden(drag);
  try {
    const needLedger = previewNeedsLedger(previewKey.diatonicIndex, drag.clef);
    setLedgerVisibility(drag, needLedger);
  } catch (_e) { /* ignore */ }
  try { updatePreviewStemDirection(drag, previewKey); } catch (_e) { /* ignore */ }
  const renderState = getRenderState();
  const symbol = decideAccidentalForKey(previewKey, renderState?.keySig);
  drawVexflowPreviewAccidental(drag, symbol);
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
  try { removeVexflowPreviewAccidental(drag); } catch (_e) { /* ignore */ }
  try { restoreOriginalAccidentals(drag); } catch (_e) { /* ignore */ }
  try { restoreOriginalStems(drag); } catch (_e) { /* ignore */ }
  try { restoreLedgerVisibility(drag); } catch (_e) { /* ignore */ }
  if (drag.noteEl) {
    if (drag.baseTransform && drag.baseTransform !== '') {
      drag.noteEl.setAttribute('transform', drag.baseTransform);
    } else {
      drag.noteEl.removeAttribute('transform');
    }
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
  try { removeVexflowPreviewAccidental(drag); } catch (_e) { /* ignore */ }
  try { restoreOriginalAccidentals(drag); } catch (_e) { /* ignore */ }
  try { restoreOriginalStems(drag); } catch (_e) { /* ignore */ }
  try { restoreLedgerVisibility(drag); } catch (_e) { /* ignore */ }
  if (drag.pointerTarget && drag.pointerId != null && drag.pointerTarget.releasePointerCapture) {
    try { drag.pointerTarget.releasePointerCapture(drag.pointerId); } catch (_e) { /* ignore */ }
  }
  if (drag.noteEl) {
    if (drag.baseTransform && drag.baseTransform !== '') {
      drag.noteEl.setAttribute('transform', drag.baseTransform);
    } else {
      drag.noteEl.removeAttribute('transform');
    }
  }
  if (selectionState.drag === drag) {
    selectionState.drag = null;
  }
}

registerCancelDrag(cancelActiveDrag);
