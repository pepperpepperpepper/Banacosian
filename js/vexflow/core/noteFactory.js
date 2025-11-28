import { StaveNote, Accidental, BarNote, Barline } from '/staff/vendor/lib/vexflow-esm/entry/vexflow-debug.js';
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

function normalizeBarlineType(raw) {
  if (!Barline || !Barline.type) {
    return null;
  }
  if (typeof raw === 'number') {
    return raw;
  }
  if (typeof raw === 'string') {
    const key = raw.trim().toLowerCase().replace(/\s+/g, '_');
    switch (key) {
      case 'double':
        return Barline.type.DOUBLE;
      case 'final':
      case 'end':
        return Barline.type.END;
      case 'repeat_begin':
      case 'repeat-start':
      case 'repeatstart':
        return Barline.type.REPEAT_BEGIN;
      case 'repeat_end':
      case 'repeat-stop':
      case 'repeatstop':
        return Barline.type.REPEAT_END;
      case 'repeat_both':
      case 'repeat':
        return Barline.type.REPEAT_BOTH;
      case 'single':
      default:
        return Barline.type.SINGLE;
    }
  }
  return Barline.type.SINGLE;
}

export function createVexflowNote(spec, theme) {
  if (spec.barline) {
    const barType = normalizeBarlineType(spec.barline) ?? (Barline?.type?.SINGLE);
    const barNote = new BarNote(barType);
    barNote.__smuflSpec = spec;
    return barNote;
  }
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
