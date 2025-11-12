import { logStructured } from '/js/shared/utils.js';
import { parseAbcToVoices } from './scoreParser.js';
import { cloneNoteSpec } from './utils/spec.js';
import { canonicalizeKeySignature } from '/js/modules/KeySignatures.js';
import { DEFAULT_SEED_NOTE_LIMIT } from './seeds.js';

export function replaceKeySignatureInAbc(abc, keySig) {
  const canonical = canonicalizeKeySignature(keySig);
  if (!abc || typeof abc !== 'string' || !canonical) return abc;
  const keyLineRegex = /(^|\n)K:[^\n]*/;
  if (keyLineRegex.test(abc)) {
    return abc.replace(keyLineRegex, (match, prefix) => `${prefix || ''}K:${canonical}`);
  }
  const separator = abc.endsWith('\n') ? '' : '\n';
  return `${abc}${separator}K:${canonical}\n`;
}

export function defaultAbc(keySig = 'C') {
  const canonical = canonicalizeKeySignature(keySig) || 'C';
  return `X:1
T:VexFlow Default
M:4/4
L:1/4
K:${canonical}
C D |]`;
}

export function constrainSeedVoices(voices, options = {}) {
  const maxNotes = Number.isFinite(options.maxNotes) && options.maxNotes >= 0
    ? Math.floor(options.maxNotes)
    : DEFAULT_SEED_NOTE_LIMIT;
  if (!Array.isArray(voices) || voices.length === 0) return;
  let remaining = maxNotes;
  logStructured('[VexflowRender] constrainSeedVoices start', {
    maxNotes,
    voiceCount: voices.length,
  });
  voices.forEach((voice, voiceIndex) => {
    if (!voice || !Array.isArray(voice.noteSpecs)) return;
    if (remaining <= 0) {
      logStructured('[VexflowRender] clearing voice specs', { voiceIndex });
      voice.noteSpecs = [];
      return;
    }
    const takeCount = Math.min(voice.noteSpecs.length, remaining);
    if (takeCount < voice.noteSpecs.length) {
      logStructured('[VexflowRender] trimming voice specs', {
        voiceIndex,
        before: voice.noteSpecs.length,
        after: takeCount,
      });
      voice.noteSpecs = voice.noteSpecs.slice(0, takeCount);
    }
    remaining -= takeCount;
  });
  logStructured('[VexflowRender] constrainSeedVoices complete', { remaining });
}

export function cloneVoices(voices) {
  return (voices || []).map((voice) => ({
    staffIndex: voice.staffIndex,
    voiceIndex: voice.voiceIndex,
    clef: voice.clef,
    noteSpecs: (voice.noteSpecs || []).map((spec) => cloneNoteSpec(spec)),
  }));
}

export function parseInitialVoices(abcjs, abc, renderState, options = {}) {
  const parsed = parseAbcToVoices(abcjs, abc);
  constrainSeedVoices(parsed.voices, options);
  renderState.voices = cloneVoices(parsed.voices);
  renderState.meter = parsed.meter;
  renderState.warnings = parsed.warnings;
  renderState.initialized = true;
  return {
    voices: parsed.voices,
    meter: parsed.meter,
    warnings: parsed.warnings,
  };
}
