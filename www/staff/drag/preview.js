import { TickContext } from '../vendor/lib/vexflow-esm/src/tickcontext.js';
import { createVexflowNote } from '/js/vexflow/core/noteFactory.js';
import { cloneNoteComponents, ensureAccidentalsLength } from '/js/vexflow/core/utils/spec.js';

function buildPreviewSpec(drag, previewKey, accidentalSymbol) {
  if (!drag?.specClone || drag.specClone.isRest) return null;
  const base = drag.specClone;
  const { keys: originalKeys, accidentals: originalAccidentals } = cloneNoteComponents(base, { includeMidis: false });
  const keys = originalKeys.length > 0 ? originalKeys : [];
  if (keys.length === 0) {
    keys.push(previewKey?.key || 'c/4');
  } else if (previewKey?.key) {
    keys[0] = previewKey.key;
  }

  const accidentals = ensureAccidentalsLength(originalAccidentals, keys.length);
  const nextAccidental = (accidentalSymbol !== undefined)
    ? accidentalSymbol
    : (accidentals[0] ?? null);
  accidentals[0] = nextAccidental ?? null;

  return {
    ...base,
    keys,
    accidentals,
    midis: undefined,
  };
}

function applyPreviewStyles(note, drag, keyCount) {
  if (!note || !drag) return;
  const ledgerStyle = drag.note?.getLedgerLineStyle?.();
  if (ledgerStyle) {
    note.setLedgerLineStyle(ledgerStyle);
  }
  const style = drag.note?.getStyle?.();
  if (style) {
    note.setStyle(style);
  }
  const activationColor = drag.activationColor;
  if (activationColor) {
    const highlight = { fillStyle: activationColor, strokeStyle: activationColor };
    let applied = false;
    if (typeof note.setKeyStyle === 'function') {
      for (let i = 0; i < keyCount; i += 1) {
        note.setKeyStyle(i, highlight);
      }
      applied = true;
    }
    if (!applied && typeof note.setStyle === 'function') {
      const current = drag.note?.getStyle?.() || {};
      note.setStyle({ ...current, ...highlight });
    }
  }
  const xShift = typeof drag.note?.getXShift === 'function' ? drag.note.getXShift() : 0;
  if (Number.isFinite(xShift)) {
    note.setXShift(xShift);
  }
}

function createPreviewNote(drag, previewKey, accidentalSymbol) {
  const spec = buildPreviewSpec(drag, previewKey, accidentalSymbol);
  if (!spec) return null;
  const note = createVexflowNote(spec);
  const keyCount = Array.isArray(spec.keys) ? spec.keys.length : 1;
  applyPreviewStyles(note, drag, keyCount);
  return note;
}

export function clearPreviewGroup(drag) {
  if (!drag?.previewGroup) return;
  const { previewGroup } = drag;
  if (previewGroup.parentNode) {
    previewGroup.parentNode.removeChild(previewGroup);
  }
  drag.previewGroup = null;
  drag.previewNote = null;
}

export function drawPreviewGroup(drag, previewKey, accidentalSymbol) {
  if (!drag?.note) return;
  const ctx = drag.note.checkContext?.();
  const stave = drag.note.getStave?.();
  const originalTick = drag.note.getTickContext?.();
  if (!ctx || !stave || !originalTick) return;

  const previewNote = createPreviewNote(drag, previewKey, accidentalSymbol);
  if (!previewNote) return;

  previewNote.setContext(ctx);
  previewNote.setStave(stave);

  const tickContext = new TickContext();
  if (typeof originalTick.getX === 'function') tickContext.setX(originalTick.getX());
  if (typeof originalTick.getXBase === 'function') tickContext.setXBase(originalTick.getXBase());
  if (typeof originalTick.getXOffset === 'function') tickContext.setXOffset(originalTick.getXOffset());
  tickContext.addTickable(previewNote);
  tickContext.preFormat();

  clearPreviewGroup(drag);

  const group = ctx.openGroup?.('drag-preview');
  try {
    previewNote.draw();
  } catch (err) {
    console.error('[VexflowDrag] preview draw failed', err);
  } finally {
    ctx.closeGroup?.();
  }

  drag.previewGroup = group || null;
  drag.previewNote = previewNote;
}
