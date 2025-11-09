// Shared key-signature helpers for browser modules.
// Provides canonical major-key signature alteration maps and convenience accessors.

const MAKE_FROZEN_MAP = (entries) => Object.freeze(entries.reduce((acc, [key, value]) => {
  acc[key] = Object.freeze({ ...value });
  return acc;
}, {}));

const RAW_KEY_SIGNATURES = [
  ['C', {}],
  ['G', { F: +1 }],
  ['D', { F: +1, C: +1 }],
  ['A', { F: +1, C: +1, G: +1 }],
  ['E', { F: +1, C: +1, G: +1, D: +1 }],
  ['B', { F: +1, C: +1, G: +1, D: +1, A: +1 }],
  ['F#', { F: +1, C: +1, G: +1, D: +1, A: +1, E: +1 }],
  ['C#', { F: +1, C: +1, G: +1, D: +1, A: +1, E: +1, B: +1 }],
  ['F', { B: -1 }],
  ['Bb', { B: -1, E: -1 }],
  ['Eb', { B: -1, E: -1, A: -1 }],
  ['Ab', { B: -1, E: -1, A: -1, D: -1 }],
  ['Db', { B: -1, E: -1, A: -1, D: -1, G: -1 }],
  ['Gb', { B: -1, E: -1, A: -1, D: -1, G: -1, C: -1 }],
  ['Cb', { B: -1, E: -1, A: -1, D: -1, G: -1, C: -1, F: -1 }],
];

export const KEY_SIGNATURE_ALTERATIONS = MAKE_FROZEN_MAP(RAW_KEY_SIGNATURES);

export const SUPPORTED_KEY_SIGNATURES = Object.freeze(Object.keys(KEY_SIGNATURE_ALTERATIONS));

const EMPTY_MAP = Object.freeze({});

function normalizeAccidentalSuffix(input) {
  if (!input) return '';
  return input
    .replace(/♯/g, '#')
    .replace(/♭/g, 'b')
    .replace(/x/g, '##') // treat double-sharp shorthand as ##.
    .replace(/𝄪/g, '##')
    .replace(/𝄫/g, 'bb');
}

/**
 * Normalize a key-signature token to canonical major-key spelling (e.g., 'Db').
 * Returns null if the token is unsupported.
 */
export function canonicalizeKeySignature(spec) {
  if (!spec || typeof spec !== 'string') return null;
  const trimmed = spec.trim();
  if (!trimmed) return null;

  const primary = trimmed.split(/\s+/)[0];
  const match = /^([A-Ga-g])([#♯b♭x𝄪𝄫]{0,2})/.exec(primary);
  if (!match) return null;

  const letter = match[1].toUpperCase();
  const accidental = normalizeAccidentalSuffix(match[2] || '');
  const canonical = `${letter}${accidental}`;

  return KEY_SIGNATURE_ALTERATIONS[canonical] ? canonical : null;
}

export function isSupportedKeySignature(spec) {
  return canonicalizeKeySignature(spec) !== null;
}

export function getKeySignatureMap(spec) {
  const canonical = canonicalizeKeySignature(spec);
  if (!canonical) return EMPTY_MAP;
  return KEY_SIGNATURE_ALTERATIONS[canonical] || EMPTY_MAP;
}

export function getKeySignatureAlteration(letter, spec) {
  if (!letter) return 0;
  const map = getKeySignatureMap(spec);
  return map[letter.toUpperCase()] || 0;
}

