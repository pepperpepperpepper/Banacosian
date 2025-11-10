import { selectionState, setStatusText } from './interaction-state.js';
import { collectNoteheadNodes } from './interaction-dom.js';
import { formatPitchLabel } from './music-helpers.js';

let cancelDragFn = null;

export function registerCancelDrag(fn) {
  cancelDragFn = typeof fn === 'function' ? fn : null;
}

export function clearSelection(baseMessage) {
  if (selectionState.drag && cancelDragFn) {
    cancelDragFn(selectionState.drag);
  }
  selectionState.drag = null;
  if (selectionState.headNodes.length > 0) {
    selectionState.headNodes.forEach((node) => node.classList.remove('vf-notehead-selected'));
  }
  selectionState.headNodes = [];
  if (selectionState.noteEl) {
    selectionState.noteEl.classList.remove('vf-note-selected');
    if (selectionState.baseTransform && selectionState.baseTransform !== '') {
      selectionState.noteEl.setAttribute('transform', selectionState.baseTransform);
    } else {
      selectionState.noteEl.removeAttribute('transform');
    }
  }
  selectionState.noteEl = null;
  selectionState.note = null;
  selectionState.baseTransform = '';
  if (baseMessage !== undefined) {
    selectionState.messageBase = baseMessage;
    setStatusText(baseMessage);
  }
}

export function selectNote({ note, noteEl, baseMessage }) {
  clearSelection();
  selectionState.note = note;
  selectionState.noteEl = noteEl || null;
  if (noteEl) {
    noteEl.classList.add('vf-note-selected');
    selectionState.baseTransform = noteEl.getAttribute('transform') || '';
    const headNodes = collectNoteheadNodes(noteEl);
    headNodes.forEach((node) => node.classList.add('vf-notehead-selected'));
    selectionState.headNodes = headNodes;
  } else {
    selectionState.baseTransform = '';
    selectionState.headNodes = [];
  }
  if (baseMessage !== undefined) {
    selectionState.messageBase = baseMessage;
  }
  const base = selectionState.messageBase || '';
  let description = null;
  if (note) {
    description = describeSpec(note.__smuflSpec);
  }
  setStatusText(description ? `${base} — Selected ${description}` : `${base} — Selected note`);
}

function describeSpec(spec) {
  if (!spec || spec.isRest) return 'rest';
  const keys = Array.isArray(spec.keys) ? spec.keys : [];
  if (keys.length === 0) return 'note';
  const accidentals = Array.isArray(spec.accidentals) ? spec.accidentals : [];
  const parts = keys.map((key, index) => formatPitchLabel({
    key,
    accidental: accidentals[index] ?? null,
  })).filter(Boolean);
  if (parts.length === 1) return parts[0];
  return `${parts[parts.length - 1]} (chord)`;
}
