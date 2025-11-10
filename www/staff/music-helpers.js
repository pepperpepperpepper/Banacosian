export { canonicalizeKeySignature } from '/js/modules/KeySignatures.js';

export {
  DURATION_DENOMS,
  DURATION_CODES,
  MAX_DOTS,
  DURATION_TOLERANCE,
  durationFromDenom,
  resolveDuration,
} from './helpers/duration.js';

export {
  NOTE_LETTERS,
  LETTER_TO_SEMITONE,
  SEMITONE_TO_FLAT,
  ACCIDENTAL_MAP,
  ACCIDENTAL_OFFSETS,
  mod,
  mapAccidental,
  convertPitch,
  keyToMidi,
  midiToKeySpec,
  diatonicIndexForLetter,
  parseKeyString,
  getPrimaryMidi,
  formatPitchLabel,
  accidentalToGlyph,
  findClosestPitchForY,
} from './helpers/pitch.js';

export {
  extractKeySignatureFromAbc,
  decideAccidentalForKey,
  applySpecPitchUpdate,
} from './helpers/tonality.js';

export function formatMeter(meter) {
  if (!meter) return null;
  if (meter.symbol) return meter.symbol;
  if (meter.num && meter.den) return `${meter.num}/${meter.den}`;
  return null;
}
