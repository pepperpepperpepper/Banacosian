import {
  decideAccidentalForKey,
  formatPitchLabel,
  findClosestPitchForY,
} from './music-helpers.js';
import {
  INITIAL_NOTE_COUNT,
  MAX_ADDITIONAL_NOTES,
} from './staff-config.js';
import {
  getRenderState,
  triggerRender,
  setStatusText,
} from './interaction-state.js';
import { selectableRegistry } from './interaction-selectable.js';
import { clearSelection } from './interaction-selection.js';
import { logStructured } from '/js/shared/utils.js';

const MAX_TOTAL_NOTES = INITIAL_NOTE_COUNT + MAX_ADDITIONAL_NOTES;

function computeLineFromCoords(coords, renderState) {
  if (!coords || !renderState) return null;
  const base = {
    line: null,
    method: null,
    rawY: coords.y,
  };
  const stave = renderState.activeStave;
  if (stave?.getLineForY) {
    try {
      const line = stave.getLineForY(coords.y);
      logStructured('[VexflowAdd] line metrics', {
        rawY: coords.y,
        method: 'stave',
        line,
      });
      return Number.isFinite(line) ? { ...base, line, method: 'stave' } : null;
    } catch (error) {
      console.warn('[VexflowAdd] line via stave failed', error);
    }
  }
  const metrics = renderState.staffMetrics;
  if (!metrics) return null;
  const { topY, spacing } = metrics;
  if (!Number.isFinite(topY) || !Number.isFinite(spacing) || spacing === 0) return null;
  const line = (coords.y - topY) / spacing;
  logStructured('[VexflowAdd] line metrics', {
    rawY: coords.y,
    method: 'fallback',
    topY,
    spacing,
    line,
  });
  return Number.isFinite(line) ? { ...base, line, method: 'fallback' } : null;
}

function determineInsertIndex(voiceIndex, coordsX) {
  const candidates = selectableRegistry.items
    .filter((item) => item && item.voiceIndex === voiceIndex)
    .sort((a, b) => a.noteIndex - b.noteIndex);
  if (!Number.isFinite(coordsX)) return candidates.length;
  for (const item of candidates) {
    const center = selectableRegistry.getItemCenter(item);
    if (!center) continue;
    if (coordsX <= center.x) {
      return item.noteIndex;
    }
  }
  return candidates.length;
}

function totalNotesCount(voices = []) {
  return voices.reduce((sum, voice) => {
    const specs = Array.isArray(voice?.noteSpecs) ? voice.noteSpecs.length : 0;
    return sum + specs;
  }, 0);
}

export function tryAddNoteAtCoords({ coords, scaledCoords, baseMessage }) {
  logStructured('[VexflowAdd] request', { coords, scaledCoords, baseMessage });
  const renderState = getRenderState();
  if (!renderState) {
    console.warn('[VexflowAdd] aborted: missing renderState');
    return false;
  }
  if (!coords) {
    console.warn('[VexflowAdd] aborted: missing coords');
    return false;
  }
  const staffMetricsSnapshot = renderState.staffMetrics
    ? {
        topY: renderState.staffMetrics.topY,
        bottomY: renderState.staffMetrics.bottomY,
        spacing: renderState.staffMetrics.spacing,
        xStart: renderState.staffMetrics.xStart,
        xEnd: renderState.staffMetrics.xEnd,
        scale: renderState.staffMetrics.scale,
        clef: renderState.staffMetrics.clef,
      }
    : null;
  logStructured('[VexflowAdd] renderState snapshot', {
    hasActiveStave: Boolean(renderState.activeStave),
    staffMetrics: staffMetricsSnapshot,
    svgRect: renderState.svgRect || null,
    scaledStaffMetrics: renderState.staffMetrics?.scaled || null,
    totalVoices: Array.isArray(renderState.voices) ? renderState.voices.length : 0,
  });
  const voices = Array.isArray(renderState.voices) ? renderState.voices : [];
  if (voices.length === 0) {
    console.warn('[VexflowAdd] aborted: no voices');
    return false;
  }

  const currentTotal = totalNotesCount(voices);
  console.log(`[VexflowAdd] currentTotal: ${currentTotal}`);
  if (currentTotal >= MAX_TOTAL_NOTES) {
    if (baseMessage) setStatusText(`${baseMessage} — Note limit reached`);
    console.warn('[VexflowAdd] aborted: limit reached', { MAX_TOTAL_NOTES });
    return false;
  }

  const metrics = renderState.staffMetrics;
  const lineInfo = computeLineFromCoords(coords, renderState);
  const line = lineInfo?.line ?? null;
  const clefContext = metrics?.clef || voices[0]?.clef || 'treble';
  const pitchInfo = findClosestPitchForY(coords.y, clefContext, {
    stave: renderState.activeStave,
    metrics,
    midiMin: 36,
    midiMax: 96,
    preferNatural: !renderState.keySig,
  });
  if (!pitchInfo) {
    console.warn('[VexflowAdd] aborted: could not derive pitch from Y', { coords, metrics });
    return false;
  }
  logStructured('[VexflowAdd] pitch derived', {
    line,
    lineSource: lineInfo?.method || null,
    clef: clefContext,
    pitchInfo,
    source: pitchInfo.props ? {
      keyProps: {
        line: pitchInfo.props.line,
        octave: pitchInfo.props.octave,
        index: pitchInfo.props.index,
      },
      diff: pitchInfo.diff,
      targetY: coords.y,
      candidateY: pitchInfo.y,
    } : null,
  });

  const voiceIndex = 0;
  const voice = voices[voiceIndex];
  if (!voice) {
    console.warn('[VexflowAdd] aborted: missing target voice', { voiceIndex });
    return false;
  }
  const template = Array.isArray(voice.noteSpecs) && voice.noteSpecs.length > 0
    ? voice.noteSpecs[voice.noteSpecs.length - 1]
    : null;

  const duration = template?.duration || 'q';
  const dots = Number.isFinite(template?.dots) ? template.dots : 0;
  const clef = template?.clef || metrics?.clef || voice.clef || 'treble';
  const strokePx = template?.strokePx;

  const { midi } = pitchInfo;
  const derived = pitchInfo.spec;
  const accidentalSymbol = decideAccidentalForKey(derived, renderState.keySig);
  const label = formatPitchLabel({
    key: derived.key,
    accidental: accidentalSymbol ?? derived.accidental,
  });

  const spec = {
    isRest: false,
    duration,
    dots,
    clef,
    keys: [derived.key],
    accidentals: [accidentalSymbol ?? null],
    midis: [midi],
  };
  if (Number.isFinite(strokePx)) {
    spec.strokePx = strokePx;
  }

  const insertIndex = determineInsertIndex(voiceIndex, coords.x);
  logStructured('[VexflowAdd] inserting', {
    insertIndex,
    totalBefore: voice.noteSpecs.length,
    coordsX: coords.x,
  });
  voice.noteSpecs.splice(insertIndex, 0, spec);
  renderState.pendingSelection = {
    voiceIndex,
    noteIndex: insertIndex,
  };

  clearSelection(baseMessage);
  if (baseMessage) {
    setStatusText(`${baseMessage} — Adding ${label}`);
  }
  triggerRender();
  logStructured('[VexflowAdd] success', {
    newTotal: totalNotesCount(voices),
    spec,
    label,
  });
  return true;
}
