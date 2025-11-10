export function cloneNoteSpec(spec, { includeMidis = true } = {}) {
  if (!spec) return null;
  const clone = {
    ...spec,
    keys: Array.isArray(spec.keys) ? [...spec.keys] : [],
    accidentals: Array.isArray(spec.accidentals) ? [...spec.accidentals] : [],
  };
  if (includeMidis) {
    clone.midis = Array.isArray(spec.midis) ? [...spec.midis] : undefined;
  } else {
    delete clone.midis;
  }
  return clone;
}

export function cloneNoteComponents(spec, { includeMidis = true } = {}) {
  const keys = Array.isArray(spec?.keys) ? [...spec.keys] : [];
  const accidentals = Array.isArray(spec?.accidentals) ? [...spec.accidentals] : [];
  const midis = includeMidis ? (Array.isArray(spec?.midis) ? [...spec.midis] : []) : undefined;
  return { keys, accidentals, midis };
}

export function ensureAccidentalsLength(accidentals, targetLength) {
  const output = Array.isArray(accidentals) ? [...accidentals] : [];
  while (output.length < targetLength) {
    output.push(null);
  }
  return output;
}
