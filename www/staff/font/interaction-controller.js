import { StaveNote } from './vendor/lib/vexflow-esm/entry/vexflow-debug.js';
import {
  setInteractionRefs,
  selectionState,
} from './interaction-state.js';
import {
  HAS_POINTER_EVENTS,
  normalizePointerEvent,
  convertToSvgCoords,
} from './interaction-dom.js';
import { selectableRegistry } from './interaction-selectable.js';
import {
  clearSelection,
  selectNote,
} from './interaction-selection.js';
import {
  beginDrag,
  applyWheelDelta,
} from './interaction-drag.js';

function registerVexflowInteractions(context, voices, baseMessage, options = {}) {
  const scale = Number.isFinite(options.scale) && options.scale > 0 ? options.scale : 1;
  if (!context || typeof context.getSVG === 'function') {
    // Support VexFlow v4 Renderer contexts (getSVG())
  }
  const svg = context.svg ?? context.getSVG?.();
  if (!svg) return;

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

  attachSvgInteractionHandlers(svg, baseMessage);
  svg.__vexflowScale = scale;
}

function attachSvgInteractionHandlers(svg, baseMessage) {
  if (!svg) return;
  const existing = svg.__vexflowInteraction;
  if (existing) {
    existing.baseMessage = baseMessage;
    return;
  }

  const handlers = {
    baseMessage,
    pointerDown: null,
    wheel: null,
  };
  const downHandler = (event) => handleSvgPointerDown(event, svg, handlers);
  handlers.pointerDown = downHandler;
  svg.addEventListener('pointerdown', downHandler, { passive: false });
  svg.addEventListener('mousedown', downHandler, { passive: false });
  if (!HAS_POINTER_EVENTS) {
    svg.addEventListener('touchstart', downHandler, { passive: false });
  }
  const wheelHandler = (event) => handleVexflowWheel(event);
  handlers.wheel = wheelHandler;
  svg.addEventListener('wheel', wheelHandler, { passive: false });
  svg.__vexflowInteraction = handlers;
}

function handleSvgPointerDown(event, svg, handlers) {
  if (!svg || !handlers) return;
  console.log('[VexflowInteraction] pointerdown', {
    type: event.type,
    targetTag: event.target?.tagName,
    targetClass: event.target?.className?.baseVal || event.target?.className,
    pointerId: event.pointerId,
  });
  const primary = normalizePointerEvent(event);
  const directIndex = selectableRegistry.indexFromTarget(event.target);
  let selectable = directIndex >= 0 ? selectableRegistry.get(directIndex) : null;
  console.log('[VexflowInteraction] directIndex', directIndex);
  if (!selectable) {
    const coords = convertToSvgCoords(primary, svg);
    console.log('[VexflowInteraction] coords', coords);
    if (!coords) return;
    selectable = selectableRegistry.findClosest(coords.x, coords.y);
  }
  console.log('[VexflowInteraction] resolved', selectable?.index);
  if (!selectable) return;

  event.preventDefault();
  event.stopPropagation();

  const baseMessage = handlers.baseMessage;
  selectNote({
    note: selectable.note,
    noteEl: selectable.noteEl,
    baseMessage,
  });
  beginDrag(event, selectable.note, selectable.noteEl, svg, selectable.voiceIndex, selectable.noteIndex);
}

function handleVexflowWheel(event) {
  if (!selectionState.note) return;
  const delta = event.deltaY < 0 ? +1 : -1;
  if (delta !== 0) {
    if (event.cancelable) event.preventDefault();
    applyWheelDelta(delta);
  }
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
    register: (context, voices, baseMessage, scale) => registerVexflowInteractions(context, voices, baseMessage, { scale }),
    clearSelection: () => clearSelection(selectionState.messageBase),
  };
}

export { selectionState } from './interaction-state.js';
