import { renderVexflowStaff as renderStaff } from './render-staff.js';
import { selectionState, createInteractionController } from './interaction-controller.js';
import {
  SUPPORTED_KEY_SIGNATURES,
  canonicalizeKeySignature,
} from '/js/modules/KeySignatures.js';
import {
  applySpecPitchUpdate,
  keyToMidi,
} from './music-helpers.js';

const vexflowContainer = document.getElementById('vexflow-container');
const vexflowStatus = document.getElementById('vexflow-status');
const fontSelect = document.getElementById('font-select');
const keySelect = document.getElementById('key-select');

const STATUS_EMPTY = 'No playable content found for VexFlow.';
const MUSIC_FONT_CHOICES = {
  bravura: {
    id: 'bravura',
    label: 'Bravura',
    stack: ['Bravura', 'Academico'],
  },
  petaluma: {
    id: 'petaluma',
    label: 'Petaluma',
    stack: ['Petaluma', 'Petaluma Script'],
  },
  leland: {
    id: 'leland',
    label: 'Leland',
    stack: ['Bravura', 'Academico'],
    fallback: true,
    warning: 'VexFlow does not bundle Leland; falling back to Bravura.',
  },
};

let resizeHandler = null;
const renderState = {
  abc: null,
  voices: null,
  meter: null,
  warnings: [],
  initialized: false,
  keySig: 'C',
};

const interactions = createInteractionController({
  statusEl: vexflowStatus,
  renderState,
  requestRender: () => renderVexflowStaff(),
  handleRenderFailure,
});

console.log('[VexflowDemo] script loaded');

window.addEventListener('pointerdown', (event) => {
  console.log('[VexflowDemo] window pointerdown', {
    target: event.target?.tagName,
    className: event.target?.className?.baseVal || event.target?.className,
  });
}, true);

window.addEventListener('mousedown', (event) => {
  console.log('[VexflowDemo] window mousedown', {
    target: event.target?.tagName,
    className: event.target?.className?.baseVal || event.target?.className,
  });
}, true);

if (vexflowContainer && vexflowStatus) {
  initializeKeySelect();
  initializeVexflowDemo();
} else if (vexflowStatus) {
  vexflowStatus.textContent = STATUS_EMPTY;
}

if (typeof window !== 'undefined') {
  window.requestVexflowRender = () => renderVexflowStaff().catch((error) => {
    handleRenderFailure(error);
    return null;
  });
}

function initializeVexflowDemo() {
  renderVexflowStaff().catch(handleRenderFailure);
  resizeHandler = debounce(() => {
    renderVexflowStaff().catch(handleRenderFailure);
  }, 150);
  window.addEventListener('resize', resizeHandler);
  if (fontSelect) {
    fontSelect.addEventListener('change', () => {
      renderVexflowStaff().catch(handleRenderFailure);
    });
  }
  if (keySelect) {
    keySelect.addEventListener('change', onKeySignatureChange);
  }
}

function handleRenderFailure(error) {
  console.error('[VexFlow Demo] Render failed.', error);
  if (vexflowStatus) {
    vexflowStatus.textContent = 'Unable to render VexFlow staff.';
  }
}

async function renderVexflowStaff() {
  const result = await renderStaff({
    container: vexflowContainer,
    statusEl: vexflowStatus,
    fontSelect,
    fontChoices: MUSIC_FONT_CHOICES,
    statusEmptyText: STATUS_EMPTY,
    renderState,
    selectionState,
    registerInteractions: ({ context, voices, baseMessage, scale }) => {
      interactions.register(context, voices, baseMessage, scale, vexflowContainer);
    },
  });
  syncKeySelectWithState();
  return result;
}

function debounce(fn, delay) {
  let timer = null;
  return () => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      fn();
    }, delay);
  };
}

function initializeKeySelect() {
  if (!keySelect) return;
  const currentKey = canonicalizeKeySignature(renderState.keySig) || 'C';
  keySelect.innerHTML = '';
  SUPPORTED_KEY_SIGNATURES.forEach((key) => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = key;
    if (key === currentKey) {
      option.selected = true;
    }
    keySelect.appendChild(option);
  });
}

function onKeySignatureChange(event) {
  const value = event?.target?.value ?? 'C';
  const canonical = canonicalizeKeySignature(value) || 'C';
  renderState.keySig = canonical;
  if (keySelect && keySelect.value !== canonical) {
    keySelect.value = canonical;
  }
  applyKeySignatureToVoices(renderState.voices, canonical);
  renderVexflowStaff().catch(handleRenderFailure);
}

function syncKeySelectWithState() {
  if (!keySelect) return;
  const canonical = canonicalizeKeySignature(renderState.keySig) || 'C';
  if (keySelect.value !== canonical) {
    keySelect.value = canonical;
  }
}

function applyKeySignatureToVoices(voices, keySig) {
  const canonical = canonicalizeKeySignature(keySig) || 'C';
  if (!Array.isArray(voices)) return;
  voices.forEach((voice) => {
    if (!voice || !Array.isArray(voice.noteSpecs)) return;
    voice.noteSpecs.forEach((spec) => {
      if (!spec || spec.isRest) return;
      const keyCount = Array.isArray(spec.keys) ? spec.keys.length : 0;
      if (keyCount === 0) return;
      const midiSource = Array.isArray(spec.midis) && spec.midis.length >= keyCount
        ? spec.midis
        : spec.keys.map((key, index) => {
            const accidental = Array.isArray(spec.accidentals) ? spec.accidentals[index] : null;
            return keyToMidi(key, accidental);
          });
      for (let i = 0; i < keyCount; i += 1) {
        const midi = midiSource[i];
        if (!Number.isFinite(midi)) continue;
        applySpecPitchUpdate(spec, midi, canonical, i);
      }
    });
  });
}
