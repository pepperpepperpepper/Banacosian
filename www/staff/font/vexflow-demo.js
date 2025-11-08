import { renderVexflowStaff as renderStaff } from './render-staff.js';
import { selectionState, createInteractionController } from './interaction-controller.js';

const vexflowContainer = document.getElementById('vexflow-container');
const vexflowStatus = document.getElementById('vexflow-status');
const fontSelect = document.getElementById('font-select');

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
};

const interactions = createInteractionController({
  statusEl: vexflowStatus,
  renderState,
  requestRender: () => renderVexflowStaff(),
  handleRenderFailure,
});

console.log('[VexflowDemo] script loaded');

if (vexflowContainer && vexflowStatus) {
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
}

function handleRenderFailure(error) {
  console.error('[VexFlow Demo] Render failed.', error);
  if (vexflowStatus) {
    vexflowStatus.textContent = 'Unable to render VexFlow staff.';
  }
}

async function renderVexflowStaff() {
  return renderStaff({
    container: vexflowContainer,
    statusEl: vexflowStatus,
    fontSelect,
    fontChoices: MUSIC_FONT_CHOICES,
    statusEmptyText: STATUS_EMPTY,
    renderState,
    selectionState,
    registerInteractions: ({ context, voices, baseMessage, scale }) => {
      interactions.register(context, voices, baseMessage, scale);
    },
  });
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
