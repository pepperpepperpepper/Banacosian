import { StaveNote } from './vendor/lib/vexflow-esm/entry/vexflow-debug.js';
import {
  setInteractionRefs,
  selectionState,
  getRenderState,
} from './interaction-state.js';
import { HAS_POINTER_EVENTS } from './interaction-dom.js';
import { selectableRegistry } from './interaction-selectable.js';
import {
  clearSelection,
  selectNote,
} from './interaction-selection.js';
import { logStructured } from './utils/log.js';
import { attachSvgInteractionHandlers } from './interaction/events.js';

logStructured('[VexflowInteraction] module loaded', {
  HAS_POINTER_EVENTS,
});

function registerVexflowInteractions(context, voices, baseMessage, options = {}) {
  const scale = Number.isFinite(options.scale) && options.scale > 0 ? options.scale : 1;
  const container = options.container || null;
  if (!context || typeof context.getSVG === 'function') {
    // Support VexFlow v4 Renderer contexts (getSVG())
  }
  const svg = context.svg ?? context.getSVG?.();
  if (!svg) {
    console.warn('[VexflowInteraction] no SVG context; skipping interaction wiring');
    return;
  }

  logStructured('[VexflowInteraction] register', {
    baseMessage,
    tickableVoiceCount: voices?.length ?? 0,
    scale,
    existingHandlers: Boolean(svg.__vexflowInteraction),
  });

  clearSelection(baseMessage);
  selectableRegistry.reset(svg);
  voices.forEach((voice, voiceIndex) => {
    const tickables = voice.getTickables ? voice.getTickables() : [];
    tickables.forEach((tickable, noteIndex) => {
      if (!(tickable instanceof StaveNote)) return;
      if (typeof tickable.isRest === 'function' && tickable.isRest()) return;
      let noteEl = null;
      try {
        if (typeof tickable.getSVGElement === 'function') {
          noteEl = tickable.getSVGElement();
        }
        if (!noteEl && typeof tickable.getAttributes === 'function') {
          const attrs = tickable.getAttributes();
          if (attrs?.id) {
            noteEl = document.getElementById(`vf-${attrs.id}`);
          }
        }
        if (!noteEl) {
          noteEl = tickable.getAttrs?.()?.el || null;
        }
      } catch (_err) {
        noteEl = null;
      }
      if (!noteEl) return;
      const baseSpacing = tickable.getStave?.()?.getSpacingBetweenLines?.() ?? 12;
      const staffSpacing = baseSpacing * scale;
      selectableRegistry.add({
        note: tickable,
        noteEl,
        voiceIndex,
        noteIndex,
        staffSpacing,
      });
    });
  });

  selectableRegistry.items.forEach((item) => {
    if (!item || !item.noteEl) return;
    try {
      const bbox = item.noteEl.getBBox?.();
      if (bbox) item.dim = bbox;
    } catch (_err) { /* ignore */ }
  });

  selectableRegistry.items.forEach((item) => {
    if (!item || !item.noteEl) return;
    item.noteEl.addEventListener('focus', () => {
      selectNote({
        note: item.note,
        noteEl: item.noteEl,
        baseMessage,
      });
    });
  });

  const renderState = getRenderState();
  const pendingSelection = renderState?.pendingSelection;
  if (pendingSelection && Number.isInteger(pendingSelection.voiceIndex) && Number.isInteger(pendingSelection.noteIndex)) {
    const pendingItem = selectableRegistry.items.find(
      (item) => item
        && item.voiceIndex === pendingSelection.voiceIndex
        && item.noteIndex === pendingSelection.noteIndex,
    );
    if (pendingItem) {
      selectNote({
        note: pendingItem.note,
        noteEl: pendingItem.noteEl,
        baseMessage,
      });
    }
    if (renderState) {
      renderState.pendingSelection = null;
    }
  }

  attachSvgInteractionHandlers(svg, container, baseMessage);
  svg.__vexflowScale = scale;
  logStructured('[VexflowInteraction] handlers attached', {
    hasPointerEvents: HAS_POINTER_EVENTS,
    listenerKeys: Object.keys(svg.__vexflowInteraction || {}),
  });
}

export function createInteractionController({
  statusEl,
  renderState,
  requestRender,
  handleRenderFailure,
}) {
  setInteractionRefs({
    statusEl,
    renderState,
    requestRender,
    handleRenderFailure,
  });
  return {
    register: (context, voices, baseMessage, scale, container) => registerVexflowInteractions(context, voices, baseMessage, { scale, container }),
    clearSelection: () => clearSelection(selectionState.messageBase),
  };
}

export { selectionState } from './interaction-state.js';
