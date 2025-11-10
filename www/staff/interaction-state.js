export const selectionState = {
  noteEl: null,
  note: null,
  messageBase: '',
  baseTransform: '',
  headNodes: [],
  drag: null,
};

let statusElRef = null;
let requestRenderRef = null;
let handleRenderFailureRef = null;
let renderStateRef = null;

export function setInteractionRefs({
  statusEl,
  requestRender,
  handleRenderFailure,
  renderState,
}) {
  statusElRef = statusEl || null;
  requestRenderRef = requestRender || null;
  handleRenderFailureRef = handleRenderFailure || null;
  renderStateRef = renderState || null;
}

export function updateRenderState(renderState) {
  renderStateRef = renderState || null;
}

export function getRenderState() {
  return renderStateRef;
}

export function setStatusText(text) {
  if (statusElRef) {
    statusElRef.textContent = text;
  }
}

export function triggerRender() {
  if (typeof requestRenderRef !== 'function') return;
  try {
    const result = requestRenderRef();
    if (result && typeof result.catch === 'function' && typeof handleRenderFailureRef === 'function') {
      result.catch(handleRenderFailureRef);
    }
  } catch (error) {
    if (typeof handleRenderFailureRef === 'function') handleRenderFailureRef(error);
  }
}
