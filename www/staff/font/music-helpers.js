export const DURATION_DENOMS = [1, 2, 4, 8, 16, 32, 64];
export const DURATION_CODES = {
  1: 'w',
  2: 'h',
  4: 'q',
  8: '8',
  16: '16',
  32: '32',
  64: '64',
};
export const MAX_DOTS = 3;
export const DURATION_TOLERANCE = 1e-6;

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

// Major key signature maps (letter -> offset from natural: -1 flat, +1 sharp)
// Matches the subset used in the ABCJS demo so behavior is consistent.
export const KEY_SIGS = {
  C: {},
  G: { F: +1 },
  D: { F: +1, C: +1 },
  A: { F: +1, C: +1, G: +1 },
  F: { B: -1 },
  Bb: { B: -1, E: -1 },
  Eb: { B: -1, E: -1, A: -1 },
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

export function durationFromDenom(denom, dots) {
  let value = 1 / denom;
  let addition = value;
  for (let i = 0; i < dots; i += 1) {
    addition /= 2;
    value += addition;
  }
  return value;
}

export function resolveDuration(value) {
  let bestMatch = null;
  DURATION_DENOMS.forEach((denom) => {
    const baseCode = DURATION_CODES[denom];
    if (!baseCode) return;
    for (let dots = 0; dots <= MAX_DOTS; dots += 1) {
      const total = durationFromDenom(denom, dots);
      const diff = Math.abs(total - value);
      const exact = diff <= DURATION_TOLERANCE;
      if (!bestMatch || diff < bestMatch.diff) {
        bestMatch = {
          code: baseCode,
          base: denom,
          dots,
          diff,
          exact,
        };
      }
      if (exact) {
        return;
      }
    }
  });
  return bestMatch;
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
    warning = `Unsupported accidental "${pitch.accidental}" on pitch ${pitch.name || key}.`;
  }
  return { key, accidental, warning };
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

export function midiToKeySpec(midi) {
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
  const info = SEMITONE_TO_FLAT[semitone] || SEMITONE_TO_FLAT[0];
  const letter = info.letter || 'c';
  const octave = Math.floor(rounded / 12) - 1;
  const key = `${letter}/${octave}`;
  return {
    key,
    letter,
    accidental: info.accidental,
    octave,
    diatonicIndex: diatonicIndexForLetter(letter, octave),
  };
}

export function diatonicIndexForLetter(letter, octave = 4) {
  const baseIndex = NOTE_LETTERS.indexOf((letter || 'c').toLowerCase());
  if (baseIndex < 0) return 0;
  return octave * 7 + baseIndex;
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

export function formatPitchLabel({ key, accidental }) {
  if (!key) return '';
  const [letterRaw, octaveRaw] = key.split('/');
  const letter = (letterRaw || '').toUpperCase();
  const octave = octaveRaw ?? '';
  const glyph = accidentalToGlyph(accidental);
  return `${letter}${glyph}${octave}`;
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

// Extract a simple canonical key signature token from ABC text (e.g., C, G, Bb, Eb).
export function extractKeySignatureFromAbc(abc) {
  if (!abc || typeof abc !== 'string') return 'C';
  const re = /(^|\n)K:([^\n]*)/g;
  let match = null;
  let key = 'C';
  while ((match = re.exec(abc)) !== null) {
    const value = (match[2] || '').trim();
    if (value) key = value.split(/\s+/)[0];
  }
  const m = /^([A-Ga-g])(bb|b|##|#)?$/.exec(key);
  const root = (m && m[1]) ? m[1] : 'C';
  const acc = (m && m[2]) ? m[2] : '';
  const canonical = root.replace(/^[a-g]/, (c) => c.toUpperCase()) + acc;
  return KEY_SIGS[canonical] ? canonical : 'C';
}

// Decide which accidental symbol to show for a derived pitch, given a key signature.
export function decideAccidentalForKey(derived, keySig) {
  if (!derived || !derived.key) return derived?.accidental || null;
  const [letterRaw] = derived.key.split('/');
  const letter = (letterRaw || 'c').toUpperCase();
  const baseMap = KEY_SIGS[keySig || 'C'] || {};
  const baseOffset = baseMap[letter] || 0; // -1 flat, +1 sharp, 0 natural
  const derivedOffset = ACCIDENTAL_OFFSETS[derived.accidental] ?? 0;
  if (derivedOffset === baseOffset) {
    // Matches the key signature: no courtesy accidental
    return null;
  }
  // If deviating to natural from a key-signature-altered pitch, show a courtesy natural.
  if (derivedOffset === 0 && baseOffset !== 0) return 'n';
  // Otherwise show the explicit accidental for the target pitch
  return derived.accidental || null;
}

export function applySpecPitchUpdate(spec, midi, keySig, index = 0) {
  if (!spec || !Number.isFinite(midi)) return null;
  const derived = midiToKeySpec(midi);
  const accidentalSymbol = decideAccidentalForKey(derived, keySig);
  const keys = Array.isArray(spec.keys) ? [...spec.keys] : [];
  const accidentals = Array.isArray(spec.accidentals) ? [...spec.accidentals] : [];
  const midis = Array.isArray(spec.midis) ? [...spec.midis] : [];
  keys[index] = derived.key;
  accidentals[index] = accidentalSymbol;
  midis[index] = midi;
  spec.keys = keys;
  spec.accidentals = accidentals;
  spec.midis = midis;
  return { derived, accidental: accidentalSymbol };
}

export function formatMeter(meter) {
  if (!meter) return null;
  if (meter.symbol) return meter.symbol;
  if (meter.num && meter.den) return `${meter.num}/${meter.den}`;
  return null;
}
