import {
  resolveDuration,
  convertPitch,
  keyToMidi,
} from './music-helpers.js';

export function parseAbcToVoices(abcjs, abcString) {
  const warnings = [];
  const tunebook = abcjs.parseOnly(abcString, { experimental: { warn: false } }) || [];
  if (tunebook.length === 0) {
    warnings.push('ABCJS returned no tunes for the sample string.');
    return { voices: [], meter: null, warnings };
  }
  const tune = tunebook[0];
  const meter = extractMeter(tune);
  const voiceMap = new Map();

  tune.lines.forEach((line) => {
    if (!line.staff) return;
    line.staff.forEach((staff, staffIndex) => {
      const clef = staff.clef?.type || 'treble';
      const voices = staff.voices || [];
      voices.forEach((voiceElements, voiceIndex) => {
        const key = `${staffIndex}:${voiceIndex}`;
        if (!voiceMap.has(key)) {
          voiceMap.set(key, {
            staffIndex,
            voiceIndex,
            clef,
            noteSpecs: [],
          });
        }
        const entry = voiceMap.get(key);
        voiceElements.forEach((element) => {
          if (element.el_type !== 'note') return;
          if (!element.duration || element.duration <= 0) return;
          const spec = convertElementToSpec(element, clef, warnings);
          if (spec) {
            entry.noteSpecs.push(spec);
          }
        });
      });
    });
  });

  const orderedVoices = Array.from(voiceMap.values())
    .filter((entry) => entry.noteSpecs.length > 0)
    .sort((a, b) => (a.staffIndex - b.staffIndex) || (a.voiceIndex - b.voiceIndex));

  return { voices: orderedVoices, meter, warnings };
}

export function convertElementToSpec(element, clef, warnings) {
  const durationInfo = resolveDuration(element.duration);
  if (!durationInfo) {
    warnings.push(`Unsupported duration value: ${element.duration}`);
    return null;
  }
  if (!durationInfo.exact) {
    warnings.push(`Approximated duration ${element.duration} to 1/${durationInfo.base} with ${durationInfo.dots} dot(s).`);
  }
  if (element.rest) {
    return {
      isRest: true,
      duration: durationInfo.code,
      dots: durationInfo.dots,
      clef,
      keys: [],
      accidentals: [],
    };
  }
  if (!Array.isArray(element.pitches) || element.pitches.length === 0) {
    return null;
  }
  const keys = [];
  const accidentals = [];
  const sortedPitches = [...element.pitches].sort((a, b) => (typeof b.pitch === 'number' ? b.pitch : 0) - (typeof a.pitch === 'number' ? a.pitch : 0));
  sortedPitches.forEach((pitch) => {
    const { key, accidental, warning } = convertPitch(pitch);
    keys.push(key);
    accidentals.push(accidental);
    if (warning) warnings.push(warning);
  });
  const midis = keys.map((key, index) => keyToMidi(key, accidentals[index]));
  return {
    isRest: false,
    keys,
    accidentals,
    midis,
    duration: durationInfo.code,
    dots: durationInfo.dots,
    clef,
  };
}

export function extractMeter(tune) {
  for (const line of tune.lines || []) {
    if (!line.staff) continue;
    for (const staff of line.staff) {
      const meter = staff.meter;
      if (!meter) continue;
      if (meter.type === 'specified' && Array.isArray(meter.value) && meter.value.length > 0) {
        const first = meter.value[0];
        const num = parseInt(first.num, 10) || 4;
        const den = parseInt(first.den, 10) || 4;
        return { num, den };
      }
      if (meter.type === 'common_time') {
        return { num: 4, den: 4, symbol: 'C' };
      }
      if (meter.type === 'cut_time') {
        return { num: 2, den: 2, symbol: 'C|' };
      }
    }
  }
  return { num: 4, den: 4 };
}
