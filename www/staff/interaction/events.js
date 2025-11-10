import { HAS_POINTER_EVENTS, normalizePointerEvent, convertToSvgCoords } from '../interaction-dom.js';
import { selectableRegistry } from '../interaction-selectable.js';
import { getRenderState, selectionState } from '../interaction-state.js';
import { selectNote } from '../interaction-selection.js';
import { beginDrag, applyWheelDelta } from '../interaction-drag.js';
import { tryAddNoteAtCoords } from '../interaction-add.js';
import { logStructured } from '/js/shared/utils.js';

function isWithinStaffBounds(coords, metrics) {
  if (!coords) return false;
  if (!metrics) return true;
  const spacing = Number.isFinite(metrics.spacing) ? metrics.spacing : 12;
  const margin = spacing * 4;
  const top = (metrics.topY ?? 0) - margin;
  const bottom = (metrics.bottomY ?? top) + margin;
  const xStart = Number.isFinite(metrics.xStart) ? metrics.xStart - spacing : -Infinity;
  const xEnd = Number.isFinite(metrics.xEnd) ? metrics.xEnd + spacing : Infinity;
  const scaledSpacing = Number.isFinite(metrics.scaled?.spacing) ? metrics.scaled.spacing : null;
  const scaledMargin = scaledSpacing != null ? scaledSpacing * 4 : null;
  const scaledTop = scaledMargin != null && Number.isFinite(metrics.scaled?.topY)
    ? metrics.scaled.topY - scaledMargin
    : null;
  const scaledBottom = scaledMargin != null && Number.isFinite(metrics.scaled?.bottomY)
    ? metrics.scaled.bottomY + scaledMargin
    : null;
  const scaledXStart = scaledSpacing != null && Number.isFinite(metrics.scaled?.xStart)
    ? metrics.scaled.xStart - scaledSpacing
    : null;
  const scaledXEnd = scaledSpacing != null && Number.isFinite(metrics.scaled?.xEnd)
    ? metrics.scaled.xEnd + scaledSpacing
    : null;
  const within = coords.y >= top && coords.y <= bottom && coords.x >= xStart && coords.x <= xEnd;
  logStructured('[VexflowInteraction] withinStaffBounds?', {
    coords,
    bounds: { top, bottom, xStart, xEnd },
    scaledBounds: scaledTop != null ? {
      top: scaledTop,
      bottom: scaledBottom,
      xStart: scaledXStart,
      xEnd: scaledXEnd,
    } : null,
    within,
  });
  return within;
}

function handleVexflowWheel(event) {
  if (!selectionState.note) return;
  const delta = event.deltaY < 0 ? +1 : -1;
  if (delta !== 0) {
    if (event.cancelable) event.preventDefault();
    applyWheelDelta(delta);
  }
}

function handleSvgPointerDown(event, svg, handlers) {
  if (!svg || !handlers) return;
  logStructured('[VexflowInteraction] pointerdown', {
    type: event.type,
    targetTag: event.target?.tagName,
    targetClass: event.target?.className?.baseVal || event.target?.className,
    pointerId: event.pointerId,
    clientX: event.clientX ?? null,
    clientY: event.clientY ?? null,
    pageX: event.pageX ?? null,
    pageY: event.pageY ?? null,
    offsetX: event.offsetX ?? null,
    offsetY: event.offsetY ?? null,
  });
  const primary = normalizePointerEvent(event);
  const baseMessage = handlers.baseMessage;
  const directIndex = selectableRegistry.indexFromTarget(event.target);
  let selectable = directIndex >= 0 ? selectableRegistry.get(directIndex) : null;
  console.log(`[VexflowInteraction] directIndex: ${directIndex}`);
  if (!selectable) {
    const coords = convertToSvgCoords(primary, svg);
    logStructured('[VexflowInteraction] coords', {
      raw: coords ? { x: coords.x, y: coords.y } : null,
      scaled: coords ? { x: coords.scaledX, y: coords.scaledY } : null,
      scale: coords?.scale ?? null,
    });
    const renderState = getRenderState();
    let staveBox = null;
    try {
      const bbox = renderState?.activeStave?.getBoundingBox?.();
      if (bbox) {
        staveBox = {
          x: bbox.getX?.() ?? bbox.x ?? null,
          y: bbox.getY?.() ?? bbox.y ?? null,
          w: bbox.getW?.() ?? bbox.w ?? bbox.width ?? null,
          h: bbox.getH?.() ?? bbox.h ?? bbox.height ?? null,
        };
      }
    } catch (error) {
      console.warn('[VexflowInteraction] unable to read stave bounding box', error);
    }
    logStructured('[VexflowInteraction] staffMetrics', {
      metrics: renderState?.staffMetrics ?? null,
      staveBox,
      svgScale: svg.__vexflowScale ?? null,
    });
    if (coords && isWithinStaffBounds(coords, renderState?.staffMetrics)) {
      console.log('[VexflowInteraction] attempting add-note path');
      const scaledCoords = coords ? { x: coords.scaledX, y: coords.scaledY } : null;
      const added = tryAddNoteAtCoords({ coords, scaledCoords, baseMessage });
      console.log(`[VexflowInteraction] add-note result: ${added}`);
      if (added) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
    if (coords) {
      const closest = selectableRegistry.findClosest(coords.x, coords.y);
      if (closest) {
        selectable = closest;
      }
    }
  }
  console.log(`[VexflowInteraction] resolved: ${selectable?.index ?? 'none'}`);
  if (!selectable) return;

  event.preventDefault();
  event.stopPropagation();

  selectNote({
    note: selectable.note,
    noteEl: selectable.noteEl,
    baseMessage,
  });
  beginDrag(event, selectable.note, selectable.noteEl, svg, selectable.voiceIndex, selectable.noteIndex);
}

export function attachSvgInteractionHandlers(svg, container, baseMessage) {
  if (!svg) return;
  const existing = svg.__vexflowInteraction;
  if (existing) {
    existing.baseMessage = baseMessage;
    console.log('[VexflowInteraction] reusing existing handlers');
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
  svg.addEventListener('click', (event) => {
    logStructured('[VexflowInteraction] click event observed', {
      target: event.target?.tagName,
      className: event.target?.className?.baseVal || event.target?.className,
    });
  }, { passive: true });
  if (!HAS_POINTER_EVENTS) {
    svg.addEventListener('touchstart', downHandler, { passive: false });
  }
  if (container && container !== svg) {
    const containerDownHandler = (event) => {
      if (event.target !== container) return;
      logStructured('[VexflowInteraction] container pointerdown fallback', {
        target: event.target?.tagName,
      });
      handleSvgPointerDown(event, svg, handlers);
    };
    handlers.containerPointerDown = containerDownHandler;
    if (HAS_POINTER_EVENTS) {
      container.addEventListener('pointerdown', containerDownHandler, { passive: false });
    } else {
      container.addEventListener('mousedown', containerDownHandler, { passive: false });
      container.addEventListener('touchstart', containerDownHandler, { passive: false });
    }
  }
  const wheelHandler = (event) => handleVexflowWheel(event);
  handlers.wheel = wheelHandler;
  svg.addEventListener('wheel', wheelHandler, { passive: false });
  svg.__vexflowInteraction = handlers;
}
