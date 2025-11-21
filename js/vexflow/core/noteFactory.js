import { StaveNote, Accidental } from '/staff/vendor/lib/vexflow-esm/entry/vexflow-debug.js';
import { keyToMidi } from './helpers/pitch.js';

export function buildLedgerStyle(theme) {
  if (!theme) return null;
  const ledgerStyle = {};
  if (theme.ledger) {
    ledgerStyle.strokeStyle = theme.ledger;
    ledgerStyle.fillStyle = theme.ledger;
  }
  if (Number.isFinite(theme.ledgerWidth) && theme.ledgerWidth > 0) {
    ledgerStyle.lineWidth = theme.ledgerWidth;
  }
  return Object.keys(ledgerStyle).length > 0 ? ledgerStyle : null;
}

export function createVexflowNote(spec, theme) {
  const isRest = spec.isRest === true;
  const noteStruct = {
    keys: isRest ? ['b/4'] : spec.keys,
    duration: `${spec.duration}${isRest ? 'r' : ''}`,
    clef: spec.clef || 'treble',
    ...(theme && Number.isFinite(theme.ledgerWidth) && theme.ledgerWidth > 0
      ? { strokePx: theme.ledgerWidth }
      : {}),
  };
  const note = new StaveNote(noteStruct);
  note.__smuflSpec = spec;
  if (!isRest && typeof note.autoStem === 'function') {
    note.autoStem();
  }
  if (!isRest && spec.stemless) {
    if (typeof note.setStemLength === 'function') {
      note.setStemLength(0);
    }
    if (typeof note.getStem === 'function') {
      const stem = note.getStem();
      if (stem && typeof stem.setVisibility === 'function') {
        stem.setVisibility(false);
      }
    }
    if (typeof note.setStemStyle === 'function') {
      note.setStemStyle({ strokeStyle: 'transparent', fillStyle: 'transparent' });
    }
    if (note.flag && typeof note.setFlagStyle === 'function') {
      note.setFlagStyle({ strokeStyle: 'transparent', fillStyle: 'transparent' });
    }
  }
  if (theme) {
    const ledgerStyle = buildLedgerStyle(theme);
    if (ledgerStyle) {
      note.setLedgerLineStyle(ledgerStyle);
    }
  }
  if (!isRest) {
    const accidentals = Array.isArray(spec.accidentals) ? spec.accidentals : [];
    if (!Array.isArray(spec.midis)) {
      spec.midis = spec.keys.map((key, index) => keyToMidi(key, accidentals[index]));
    }
    accidentals.forEach((accidental, index) => {
      if (accidental) {
        note.addModifier(new Accidental(accidental), index);
      }
    });
  }
  for (let i = 0; i < (spec.dots || 0); i += 1) {
    note.addDotToAll();
  }
  return note;
}
