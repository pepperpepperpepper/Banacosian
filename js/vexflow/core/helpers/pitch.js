import { Tables } from '/staff/vendor/lib/vexflow-esm/src/tables.js';
import { logStructured } from '/js/shared/utils.js';

export const NOTE_LETTERS = ['c', 'd', 'e', 'f', 'g', 'a', 'b'];

export const LETTER_TO_SEMITONE = {
  c: 0,
  d: 2,
  e: 4,
  f: 5,
  g: 7,
  a: 9,
  b: 11,
};

export const SEMITONE_TO_FLAT = [
  { letter: 'c', accidental: null },
  { letter: 'd', accidental: 'b' },
  { letter: 'd', accidental: null },
  { letter: 'e', accidental: 'b' },
  { letter: 'e', accidental: null },
  { letter: 'f', accidental: null },
  { letter: 'g', accidental: 'b' },
  { letter: 'g', accidental: null },
  { letter: 'a', accidental: 'b' },
  { letter: 'a', accidental: null },
  { letter: 'b', accidental: 'b' },
  { letter: 'b', accidental: null },
];

export const SEMITONE_TO_SHARP = [
  { letter: 'c', accidental: null },
  { letter: 'c', accidental: '#' },
  { letter: 'd', accidental: null },
  { letter: 'd', accidental: '#' },
  { letter: 'e', accidental: null },
  { letter: 'f', accidental: null },
  { letter: 'f', accidental: '#' },
  { letter: 'g', accidental: null },
  { letter: 'g', accidental: '#' },
  { letter: 'a', accidental: null },
  { letter: 'a', accidental: '#' },
  { letter: 'b', accidental: null },
];

export const ACCIDENTAL_MAP = {
  sharp: '#',
  flat: 'b',
  natural: 'n',
  dblsharp: '##',
  dblflat: 'bb',
  quartersharp: '#+',
  quarterflat: 'b-',
  oneandahalfsharp: '###',
  oneandahalfflat: 'bbb',
};

export const ACCIDENTAL_OFFSETS = {
  '#': 1,
  '##': 2,
  '###': 3,
  b: -1,
  bb: -2,
  bbb: -3,
  n: 0,
  null: 0,
  undefined: 0,
};

export function mod(value, base) {
  return ((value % base) + base) % base;
}

export function mapAccidental(accidental) {
  if (!accidental || accidental === 'none') return null;
  if (ACCIDENTAL_MAP[accidental]) return ACCIDENTAL_MAP[accidental];
  return null;
}

export function convertPitch(pitch) {
  const pitchIndex = typeof pitch.pitch === 'number' ? pitch.pitch : 0;
  const letterIndex = mod(pitchIndex, 7);
  const octave = 4 + Math.floor((pitchIndex - letterIndex) / 7);
  const key = `${NOTE_LETTERS[letterIndex]}/${octave}`;
  const accidental = mapAccidental(pitch.accidental);
  let warning = null;
  if (pitch.accidental && !accidental) {
    warning = `Unsupported accidental \"${pitch.accidental}\" on pitch ${pitch.name || key}.`;
  }
  return { key, accidental, warning };
}

export function diatonicIndexForLetter(letter, octave = 4) {
  const baseIndex = NOTE_LETTERS.indexOf((letter || 'c').toLowerCase());
  if (baseIndex < 0) return 0;
  return octave * 7 + baseIndex;
}

export function keyToMidi(key, accidental = null) {
  if (!key) return 60;
  const [letterRaw, octaveRaw] = key.split('/');
  const letter = (letterRaw || 'c').toLowerCase();
  const octave = parseInt(octaveRaw, 10);
  if (!(letter in LETTER_TO_SEMITONE) || Number.isNaN(octave)) return 60;
  const base = LETTER_TO_SEMITONE[letter];
  const accidentalOffset = ACCIDENTAL_OFFSETS[accidental] ?? 0;
  return 12 * (octave + 1) + base + accidentalOffset;
}

let midiNotePreference = 'flat';

function normalizePreference(value) {
  if (!value) return null;
  const normalized = String(value).toLowerCase();
  if (normalized === 'flat') return 'flat';
  if (normalized === 'sharp') return 'sharp';
  if (normalized === 'natural') return 'sharp';
  return null;
}

function selectSemitoneInfo(semitone, override) {
  const pref = override || midiNotePreference || 'flat';
  if (pref === 'sharp') {
    return SEMITONE_TO_SHARP[semitone] || SEMITONE_TO_SHARP[0];
  }
  return SEMITONE_TO_FLAT[semitone] || SEMITONE_TO_FLAT[0];
}

export function setMidiNotePreference(preference) {
  const normalized = normalizePreference(preference) || 'flat';
  midiNotePreference = normalized;
  return midiNotePreference;
}

export function midiToKeySpec(midi, options = {}) {
  if (!Number.isFinite(midi)) {
    return {
      key: 'c/4',
      letter: 'c',
      accidental: null,
      octave: 4,
      diatonicIndex: diatonicIndexForLetter('c', 4),
    };
  }
  const rounded = Math.round(midi);
  const semitone = mod(rounded, 12);
  const preferred = normalizePreference(options.preference);
  const info = selectSemitoneInfo(semitone, preferred);
  const letter = info.letter || 'c';
  const octave = Math.floor(rounded / 12) - 1;
  const accidental = info.accidental || '';
  const key = accidental ? `${letter}${accidental}/${octave}` : `${letter}/${octave}`;
  return {
    key,
    letter,
    accidental: info.accidental,
    octave,
    diatonicIndex: diatonicIndexForLetter(letter, octave),
  };
}

const KEY_STRING_RE = /^([A-Ga-g])([#bn]{0,3})?\/(-?\\d+)$/;

export function parseKeyString(key) {
  if (typeof key !== 'string') return null;
  const match = KEY_STRING_RE.exec(key.trim());
  if (!match) return null;
  const letterRaw = match[1] || 'c';
  const accidentalRaw = match[2] || '';
  const octave = Number.parseInt(match[3], 10);
  if (!Number.isFinite(octave)) return null;
  const letter = letterRaw.toLowerCase();
  const accidental = accidentalRaw.length > 0 ? accidentalRaw : null;
  const diatonicIndex = diatonicIndexForLetter(letter, octave);
  return {
    key,
    letter,
    accidental,
    octave,
    diatonicIndex,
  };
}

export function getPrimaryMidi(spec, fallback = 60) {
  if (!spec) return fallback;
  const existing = Array.isArray(spec.midis) ? spec.midis[0] : null;
  if (Number.isFinite(existing)) return existing;
  const keys = Array.isArray(spec.keys) ? spec.keys : [];
  if (keys.length === 0) return fallback;
  const accidentals = Array.isArray(spec.accidentals) ? spec.accidentals : [];
  return keyToMidi(keys[0], accidentals[0]) ?? fallback;
}

export function accidentalToGlyph(accidental) {
  switch (accidental) {
    case '#': return '♯';
    case '##': return '♯♯';
    case '###': return '♯♯♯';
    case 'b': return '♭';
    case 'bb': return '♭♭';
    case 'bbb': return '♭♭♭';
    case 'n': return '♮';
    default: return '';
  }
}

export function formatPitchLabel({ key, accidental }) {
  if (!key) return '';
  const [letterRaw, octaveRaw] = key.split('/');
  const letter = (letterRaw || '').toUpperCase();
  const octave = octaveRaw ?? '';
  const glyph = accidentalToGlyph(accidental);
  return `${letter}${glyph}${octave}`;
}

export function findClosestPitchForY(targetY, clef = 'treble', options = {}) {
  if (!Number.isFinite(targetY)) return null;
  const {
    stave,
    metrics,
    midiMin = 36,
    midiMax = 96,
    preferNatural = true,
  } = options;
  logStructured('[MusicHelpers] findClosestPitchForY request', {
    targetY,
    clef,
    hasStave: Boolean(stave),
    metrics: metrics ? {
      topY: metrics.topY,
      bottomY: metrics.bottomY,
      spacing: metrics.spacing,
      scale: metrics.scale,
    } : null,
    midiMin,
    midiMax,
  });
  let best = null;
  for (let midi = midiMin; midi <= midiMax; midi += 1) {
    const candidateSpec = midiToKeySpec(midi);
    const key = `${(candidateSpec.letter || 'c').toUpperCase()}/${candidateSpec.octave}`;
    let props;
    try {
      props = Tables.keyProperties(key, clef);
    } catch (_err) {
      continue;
    }
    let candidateY = null;
    let mappedLine = null;
    if (props && Number.isFinite(props.line)) {
      mappedLine = 5 - props.line;
    }
    if (stave && typeof stave.getYForLine === 'function' && Number.isFinite(mappedLine)) {
      candidateY = stave.getYForLine(mappedLine);
    } else if (metrics && Number.isFinite(metrics.topY) && Number.isFinite(metrics.spacing) && Number.isFinite(mappedLine)) {
      candidateY = metrics.topY + (mappedLine * metrics.spacing);
    }
    if (!Number.isFinite(candidateY)) continue;
    const diff = Math.abs(candidateY - targetY);
    const chooseByAccidental = () => {
      if (!preferNatural || !best) return true;
      const currentAcc = candidateSpec.accidental || null;
      const bestAcc = best.spec?.accidental || null;
      if (bestAcc && !currentAcc) return true;
      if (!bestAcc && currentAcc) return false;
      return false;
    };
    if (!best || diff < best.diff || (Math.abs(diff - best.diff) <= 1e-6 && chooseByAccidental())) {
      best = {
        midi,
        spec: candidateSpec,
        props,
        diff,
        y: candidateY,
        line: mappedLine,
      };
      if (diff === 0) break;
    }
  }
  logStructured('[MusicHelpers] findClosestPitchForY result', {
    targetY,
    clef,
    best: best ? {
      midi: best.midi,
      key: best.spec?.key,
      accidental: best.spec?.accidental ?? null,
      octave: best.spec?.octave,
      mappedLine: best.line,
      propsLine: best.props?.line ?? null,
      diff: best.diff,
      candidateY: best.y,
    } : null,
  });
  return best;
}

if (typeof window !== 'undefined') {
  window.VexflowPitch = window.VexflowPitch || {};
  window.VexflowPitch.setMidiNotePreference = setMidiNotePreference;
  window.VexflowPitch.formatPitchLabel = formatPitchLabel;
  window.VexflowPitch.findClosestPitchForY = findClosestPitchForY;
}
