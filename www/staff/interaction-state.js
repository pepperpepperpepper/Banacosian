import { LETTER_TO_SEMITONE, ACCIDENTAL_OFFSETS } from './music-helpers.js';

export const selectionState = {
  noteEl: null,
  note: null,
  messageBase: '',
  baseTransform: '',
  headNodes: [],
  drag: null,
};

let statusElRef = null;
let requestRenderRef = null;
let handleRenderFailureRef = null;
let renderStateRef = null;
let dragQuantizerRef = null;
let pitchClassConfig = null;
let fallbackQuantizer = null;

export function setDragQuantizer(fn) {
  dragQuantizerRef = (typeof fn === 'function') ? fn : null;
}

export function getDragQuantizer() {
  return dragQuantizerRef || fallbackQuantizer;
}

export function setPitchClassConfig(config) {
  pitchClassConfig = normalizePitchClassConfig(config);
  fallbackQuantizer = pitchClassConfig ? createPitchClassQuantizer(pitchClassConfig) : null;
}

function normalizePitchClassConfig(config) {
  if (!config) return null;
  const midiMin = Number.isFinite(config.midiMin) ? config.midiMin : 36;
  const midiMax = Number.isFinite(config.midiMax) ? config.midiMax : 96;
  const clampedMin = Math.min(midiMin, midiMax);
  const clampedMax = Math.max(midiMin, midiMax);
  let pitchClasses = [];
  if (Array.isArray(config.pitchClasses) && config.pitchClasses.length > 0) {
    pitchClasses = config.pitchClasses
      .map((value) => normalizePitchClass(value))
      .filter((value) => value != null);
  } else if (Array.isArray(config.notes) && config.notes.length > 0) {
    pitchClasses = config.notes
      .map((note) => normalizePitchClassFromNote(note))
      .filter((value) => value != null);
  }
  if (pitchClasses.length === 0) {
    return null;
  }
  const unique = Array.from(new Set(pitchClasses));
  return {
    pitchClasses: unique,
    midiMin: clampedMin,
    midiMax: clampedMax,
  };
}

function normalizePitchClass(value) {
  if (!Number.isFinite(value)) return null;
  const normalized = ((Math.round(value) % 12) + 12) % 12;
  return normalized;
}

function normalizePitchClassFromNote(note) {
  if (!note || typeof note !== 'string') return null;
  const match = note.trim().match(/^([A-Ga-g])([#bx𝄪♯♭]{0,3})?(-?\d+)?/);
  if (!match) return null;
  const letter = match[1].toLowerCase();
  let accidental = (match[2] || '')
    .replace(/♯/g, '#')
    .replace(/♭/g, 'b')
    .replace(/x/g, '##')
    .replace(/𝄪/g, '##')
    .replace(/𝄫/g, 'bb');
  if (!ACCIDENTAL_OFFSETS.hasOwnProperty(accidental)) {
    accidental = '';
  }
  const base = LETTER_TO_SEMITONE[letter] ?? null;
  if (base == null) return null;
  const offset = ACCIDENTAL_OFFSETS[accidental] ?? 0;
  return ((base + offset) % 12 + 12) % 12;
}

export function createPitchClassQuantizer(config) {
  const allowed = new Set(config.pitchClasses);
  if (allowed.size === 0) return null;
  const midiMin = Number.isFinite(config.midiMin) ? config.midiMin : 36;
  const midiMax = Number.isFinite(config.midiMax) ? config.midiMax : 96;
  const limit = Math.max(12, midiMax - midiMin + 1);

  function clampMidi(value) {
    if (!Number.isFinite(value)) return null;
    const rounded = Math.round(value);
    if (rounded < midiMin) return midiMin;
    if (rounded > midiMax) return midiMax;
    return rounded;
  }

  function isAllowed(value) {
    if (!Number.isFinite(value)) return false;
    const pitchClass = ((Math.round(value) % 12) + 12) % 12;
    return allowed.has(pitchClass);
  }

  function searchFrom(start, step) {
    if (!step) return null;
    let current = start;
    for (let i = 0; i < limit; i += 1) {
      current += step;
      if (current < midiMin || current > midiMax) {
        break;
      }
      if (isAllowed(current)) {
        return current;
      }
    }
    return null;
  }

  return ({ previewMidi, lastMidi, direction, baseMidi }) => {
    const clampedPreview = clampMidi(previewMidi);
    if (clampedPreview == null) {
      return previewMidi;
    }
    if (isAllowed(clampedPreview)) {
      return clampedPreview;
    }
    const reference = Number.isFinite(lastMidi) ? lastMidi : clampedPreview;
    const directionHint = direction && direction !== 0
      ? Math.sign(direction)
      : (Number.isFinite(clampedPreview) && Number.isFinite(reference)
        ? Math.sign(clampedPreview - reference)
        : 0);
    const primaryStep = directionHint >= 0 ? 1 : -1;
    const primary = searchFrom(clampedPreview, primaryStep || 1);
    if (primary != null) {
      return primary;
    }
    const secondary = searchFrom(clampedPreview, (primaryStep || 1) * -1);
    if (secondary != null) {
      return secondary;
    }
    const fallback = clampMidi(baseMidi);
    if (fallback != null && isAllowed(fallback)) {
      return fallback;
    }
    return clampedPreview;
  };
}

export function setInteractionRefs({
  statusEl,
  requestRender,
  handleRenderFailure,
  renderState,
}) {
  statusElRef = statusEl || null;
  requestRenderRef = requestRender || null;
  handleRenderFailureRef = handleRenderFailure || null;
  renderStateRef = renderState || null;
}

export function updateRenderState(renderState) {
  renderStateRef = renderState || null;
}

export function getRenderState() {
  return renderStateRef;
}

export function setStatusText(text) {
  if (statusElRef) {
    statusElRef.textContent = text;
  }
}

export function triggerRender() {
  if (typeof requestRenderRef !== 'function') return;
  try {
    const result = requestRenderRef();
    if (result && typeof result.catch === 'function' && typeof handleRenderFailureRef === 'function') {
      result.catch(handleRenderFailureRef);
    }
  } catch (error) {
    if (typeof handleRenderFailureRef === 'function') handleRenderFailureRef(error);
  }
}

if (typeof window !== 'undefined') {
  window.VexflowInteraction = window.VexflowInteraction || {};
  window.VexflowInteraction.setDragQuantizer = setDragQuantizer;
  window.VexflowInteraction.getDragQuantizer = getDragQuantizer;
  window.VexflowInteraction.setPitchClassConfig = setPitchClassConfig;
  window.VexflowInteraction.createPitchClassQuantizer = createPitchClassQuantizer;
}
