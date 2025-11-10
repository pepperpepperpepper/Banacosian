import { selectionState } from '../interaction-state.js';
import { HAS_POINTER_EVENTS } from '../interaction-dom.js';

const ACTIVE_LISTENERS = {
  move: null,
  up: null,
  cancel: null,
  touchMove: null,
  touchEnd: null,
  touchCancel: null,
  mouseMove: null,
  mouseUp: null,
};

function removeWindowListener(type, listener, options) {
  if (listener) {
    window.removeEventListener(type, listener, options);
  }
}

export function attachDragListeners({ onMove, onUp }) {
  if (!selectionState.drag || selectionState.drag.listenersAttached) return;
  if (typeof onMove !== 'function' || typeof onUp !== 'function') return;

  if (HAS_POINTER_EVENTS) {
    ACTIVE_LISTENERS.move = (event) => onMove(event);
    ACTIVE_LISTENERS.up = (event) => onUp(event);
    ACTIVE_LISTENERS.cancel = (event) => onUp(event);
    window.addEventListener('pointermove', ACTIVE_LISTENERS.move, { passive: false });
    window.addEventListener('pointerup', ACTIVE_LISTENERS.up, { passive: true });
    window.addEventListener('pointercancel', ACTIVE_LISTENERS.cancel, { passive: true });
  } else {
    ACTIVE_LISTENERS.touchMove = (event) => onMove(event);
    ACTIVE_LISTENERS.touchEnd = (event) => onUp(event);
    ACTIVE_LISTENERS.touchCancel = (event) => onUp(event);
    ACTIVE_LISTENERS.mouseMove = (event) => onMove(event);
    ACTIVE_LISTENERS.mouseUp = (event) => onUp(event);
    window.addEventListener('touchmove', ACTIVE_LISTENERS.touchMove, { passive: false });
    window.addEventListener('touchend', ACTIVE_LISTENERS.touchEnd, { passive: true });
    window.addEventListener('touchcancel', ACTIVE_LISTENERS.touchCancel, { passive: true });
    window.addEventListener('mousemove', ACTIVE_LISTENERS.mouseMove, { passive: false });
    window.addEventListener('mouseup', ACTIVE_LISTENERS.mouseUp, { passive: true });
  }

  selectionState.drag.listenersAttached = true;
}

export function detachDragListeners() {
  if (HAS_POINTER_EVENTS) {
    removeWindowListener('pointermove', ACTIVE_LISTENERS.move, { passive: false });
    removeWindowListener('pointerup', ACTIVE_LISTENERS.up, { passive: true });
    removeWindowListener('pointercancel', ACTIVE_LISTENERS.cancel, { passive: true });
  } else {
    removeWindowListener('touchmove', ACTIVE_LISTENERS.touchMove, { passive: false });
    removeWindowListener('touchend', ACTIVE_LISTENERS.touchEnd, { passive: true });
    removeWindowListener('touchcancel', ACTIVE_LISTENERS.touchCancel, { passive: true });
    removeWindowListener('mousemove', ACTIVE_LISTENERS.mouseMove, { passive: false });
    removeWindowListener('mouseup', ACTIVE_LISTENERS.mouseUp, { passive: true });
  }

  Object.keys(ACTIVE_LISTENERS).forEach((key) => {
    ACTIVE_LISTENERS[key] = null;
  });

  if (selectionState.drag) {
    selectionState.drag.listenersAttached = false;
  }
}
