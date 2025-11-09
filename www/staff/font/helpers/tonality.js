import {
  canonicalizeKeySignature,
  getKeySignatureAlteration,
} from '/js/modules/KeySignatures.js';
import { cloneNoteComponents } from '../utils/spec.js';
import { ACCIDENTAL_OFFSETS, midiToKeySpec } from './pitch.js';

export function extractKeySignatureFromAbc(abc) {
  if (!abc || typeof abc !== 'string') return 'C';
  const re = /(^|\n)K:([^\n]*)/g;
  let match = null;
  let key = 'C';
  while ((match = re.exec(abc)) !== null) {
    const value = (match[2] || '').trim();
    if (value) key = value.split(/\s+/)[0];
  }
  const canonical = canonicalizeKeySignature(key);
  return canonical || 'C';
}

export function decideAccidentalForKey(derived, keySig) {
  if (!derived || !derived.key) return derived?.accidental || null;
  const [letterRaw] = derived.key.split('/');
  const letter = (letterRaw || 'c').toUpperCase();
  const baseOffset = getKeySignatureAlteration(letter, keySig || 'C');
  const derivedOffset = ACCIDENTAL_OFFSETS[derived.accidental] ?? 0;
  if (derivedOffset === baseOffset) return null;
  if (derivedOffset === 0 && baseOffset !== 0) return 'n';
  return derived.accidental || null;
}

export function applySpecPitchUpdate(spec, midi, keySig, index = 0) {
  if (!spec || !Number.isFinite(midi)) return null;
  const derived = midiToKeySpec(midi);
  const accidentalSymbol = decideAccidentalForKey(derived, keySig);
  const { keys, accidentals, midis } = cloneNoteComponents(spec);
  keys[index] = derived.key;
  accidentals[index] = accidentalSymbol;
  if (midis) midis[index] = midi;
  spec.keys = keys;
  spec.accidentals = accidentals;
  if (midis) spec.midis = midis;
  return { derived, accidental: accidentalSymbol };
}
