import { renderVexflowStaff as renderStaff } from './render-staff.js';
import { createInteractionController } from './interaction-controller.js';
import {
  SUPPORTED_KEY_SIGNATURES,
  canonicalizeKeySignature,
} from '/js/modules/KeySignatures.js';
import {
  applySpecPitchUpdate,
  keyToMidi,
} from './music-helpers.js';
import { MUSIC_FONT_CHOICES } from '/js/modules/StaffFonts.js';
import { debounce } from '/js/shared/utils.js';
import { createRenderRuntime } from '/js/vexflow/core/seeds.js';
import {
  readStaffConfigFromDataset,
  applyStaffSizingToState,
} from '/js/vexflow/core/config.js';

const fontSelect = document.getElementById('font-select');
const keySelect = document.getElementById('key-select');

const STATUS_EMPTY = 'No playable content found for VexFlow.';

const DEMO_CONFIGS = [
  {
    id: 'ui-demo',
    containerId: 'vexflow-container-ui',
    statusId: 'vexflow-status-ui',
    interactive: false,
  },
  {
    id: 'interaction-demo',
    containerId: 'vexflow-container',
    statusId: 'vexflow-status',
    interactive: true,
  },
];

let resizeHandler = null;

const demoContexts = DEMO_CONFIGS.map(createDemoContext).filter(Boolean);

console.log('[VexflowDemo] script loaded', {
  demoCount: demoContexts.length,
});

if (demoContexts.length > 0) {
  initializeKeySelect();
  initializeVexflowDemos();
} else {
  console.warn('[VexflowDemo] No demo containers found on page.');
}

if (typeof window !== 'undefined') {
  window.requestVexflowRender = () => renderAllDemos().catch((error) => {
    reportRenderFailure(null, error);
    return null;
  });
}

function applyRuntimeSizing(runtime, sizing, scale) {
  if (!runtime) return;
  const update = {};
  if (sizing && typeof sizing === 'object') {
    if (Number.isFinite(sizing.minWidth)) update.minWidth = sizing.minWidth;
    if (Number.isFinite(sizing.maxWidth)) update.maxWidth = sizing.maxWidth;
    if (Number.isFinite(sizing.targetWidth)) update.targetWidth = sizing.targetWidth;
    if (Number.isFinite(sizing.baseHeight)) update.baseHeight = sizing.baseHeight;
  }
  if (Number.isFinite(scale)) {
    update.staffScale = scale;
  }
  if (Object.keys(update).length > 0) {
    runtime.update(update);
  }
}

function createDemoContext(config) {
  const container = document.getElementById(config.containerId);
  const statusEl = document.getElementById(config.statusId);
  if (!container || !statusEl) {
    return null;
  }

  const containerConfig = readStaffConfigFromDataset(container.dataset || null);
  const sizingConfig = containerConfig?.sizing || {};
  const configuredScale = containerConfig?.scale ?? null;

  const initialState = {
    interactionEnabled: Boolean(config.interactive),
    keySig: 'C',
  };
  applyStaffSizingToState(initialState, sizingConfig);
  if (Number.isFinite(configuredScale)) {
    initialState.staffScale = configuredScale;
  }

  const runtime = createRenderRuntime({ initialState });
  const renderState = runtime.state;
  applyStaffSizingToState(renderState, sizingConfig);
  applyRuntimeSizing(runtime, sizingConfig, configuredScale);

  const context = {
    ...config,
    container,
    statusEl,
    renderRuntime: runtime,
    renderState,
    interactions: null,
    sizingConfig: {
      sizing: sizingConfig,
      scale: configuredScale,
    },
  };

  context.interactions = createInteractionController({
    statusEl,
    renderState,
    requestRender: () => renderDemo(context),
    handleRenderFailure: (error) => reportRenderFailure(context, error),
    enabled: renderState.interactionEnabled,
  });

  return context;
}

function initializeVexflowDemos() {
  renderAllDemos().catch((error) => reportRenderFailure(null, error));
  resizeHandler = debounce(() => {
    renderAllDemos().catch((error) => reportRenderFailure(null, error));
  }, 150);
  window.addEventListener('resize', resizeHandler);
  if (fontSelect) {
    fontSelect.addEventListener('change', () => {
      renderAllDemos().catch((error) => reportRenderFailure(null, error));
    });
  }
  if (keySelect) {
    keySelect.addEventListener('change', onKeySignatureChange);
  }
}

async function renderDemo(context) {
  try {
    if (context.interactions) {
      context.interactions.updateDependencies({
        statusEl: context.statusEl,
        renderState: context.renderState,
      });
      context.interactions.setEnabled(Boolean(context.renderState.interactionEnabled));
    }
    if (context.renderRuntime) {
      applyRuntimeSizing(
        context.renderRuntime,
        context.sizingConfig?.sizing,
        context.sizingConfig?.scale,
      );
    }
    const selectionStateForRender = context.interactions?.enabled
      ? context.interactions.selectionState
      : null;
    const result = await renderStaff({
      container: context.container,
      statusEl: context.statusEl,
      fontSelect,
      fontChoices: MUSIC_FONT_CHOICES,
      statusEmptyText: STATUS_EMPTY,
      renderState: context.renderState,
      selectionState: selectionStateForRender,
      registerInteractions: ({ context: vfContext, voices, baseMessage, scale }) => {
        if (!context.interactions) return;
        context.interactions.register(
          vfContext,
          voices,
          baseMessage,
          scale,
          context.container,
        );
      },
    });
    syncKeySelectWithState();
    if (context.renderRuntime && result?.warnings) {
      context.renderRuntime.recordWarnings(result.warnings);
    }
    return result;
  } catch (error) {
    reportRenderFailure(context, error);
    throw error;
  }
}

function renderAllDemos() {
  if (demoContexts.length === 0) return Promise.resolve([]);
  return Promise.all(
    demoContexts.map((context) => renderDemo(context).catch((error) => {
      reportRenderFailure(context, error);
      return null;
    })),
  );
}

function reportRenderFailure(context, error) {
  const label = context?.id || 'unknown-demo';
  console.error(`[VexFlow Demo] Render failed for ${label}.`, error);
  if (context?.statusEl) {
    context.statusEl.textContent = 'Unable to render VexFlow staff.';
  }
}

function initializeKeySelect() {
  if (!keySelect) return;
  const primaryState = demoContexts[0]?.renderState;
  const currentKey = canonicalizeKeySignature(primaryState?.keySig) || 'C';
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
  demoContexts.forEach((context) => {
    context.renderState.keySig = canonical;
    applyKeySignatureToVoices(context.renderState.voices, canonical);
  });
  if (keySelect && keySelect.value !== canonical) {
    keySelect.value = canonical;
  }
  renderAllDemos().catch((error) => reportRenderFailure(null, error));
}

function syncKeySelectWithState() {
  if (!keySelect) return;
  const canonical = canonicalizeKeySignature(demoContexts[0]?.renderState?.keySig) || 'C';
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
