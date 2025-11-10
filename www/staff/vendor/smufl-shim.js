import { loadFont, ensureFontFaceLoaded, fontSupportsSmufl } from './smufl-core.js';

let NOTE_COUNTER = 0;

function nextNoteId() {
  NOTE_COUNTER += 1;
  return `smufl-note-${NOTE_COUNTER}`;
}

function readBBox(element) {
  if (!element || typeof element.getBBox !== 'function') return null;
  try {
    return element.getBBox();
  } catch (_err) {
    return null;
  }
}

function describePitch({ acc = '', letter = '', oct = '' }) {
  return `${acc}${letter}${oct}`;
}

/**
 * Lightweight wrapper around SMuFL glyph metadata.
 */
export class SmuflGlyph {
  constructor({ name, char, metrics }) {
    this.name = name;
    this.char = char;
    this.metrics = metrics || {};
  }

  stemAnchor(direction = 'up') {
    const anchors = this.metrics?.anchors || {};
    if (direction === 'down') {
      return anchors.stemDownNW || anchors.stemDownSE || null;
    }
    return anchors.stemUpSE || anchors.stemUpNW || null;
  }
}

/**
 * Represents a single notehead rendered by ABCJS that we want to mirror in SMuFL.
 */
export class SmuflNote {
  constructor({ id, group, token, staffStep = 6, reporter }) {
    this.id = id;
    this.group = group;
    this.token = token || {};
    this.staffStep = staffStep;
    this.reporter = reporter;
    this.preview = { diatonic: 0, semitone: 0 };
    this.baseBBox = readBBox(group);
    this.overlay = null;
    this._initDataAttributes();
  }

  _initDataAttributes() {
    if (!this.group) return;
    this.group.dataset.smuflNoteId = this.id;
    if (this.token) {
      this.group.dataset.smuflPitch = describePitch(this.token);
      if (this.token.duration) {
        this.group.dataset.smuflDuration = this.token.duration;
      }
    }
  }

  updateToken(token) {
    this.token = { ...this.token, ...token };
    this._initDataAttributes();
  }

  beginDrag() {
    this.preview = { diatonic: 0, semitone: 0 };
    if (this.group) {
      this.group.dataset.smuflDragging = 'true';
    }
  }

  previewDrag({ diatonic = 0, semitone = 0 }) {
    this.preview = { diatonic, semitone };
    if (!this.group) return;
    this.group.dataset.smuflPreviewDiatonic = String(diatonic);
    this.group.dataset.smuflPreviewSemitone = String(semitone);
  }

  commitDrag({ diatonic = 0, semitone = 0 }) {
    this.preview = { diatonic: 0, semitone: 0 };
    if (!this.group) return;
    delete this.group.dataset.smuflPreviewDiatonic;
    delete this.group.dataset.smuflPreviewSemitone;
    delete this.group.dataset.smuflDragging;
    this.group.dataset.smuflLastDelta = String(semitone);
  }

  cancelDrag() {
    this.preview = { diatonic: 0, semitone: 0 };
    if (!this.group) return;
    delete this.group.dataset.smuflPreviewDiatonic;
    delete this.group.dataset.smuflPreviewSemitone;
    delete this.group.dataset.smuflDragging;
  }
}

/**
 * Provides shared context for translating between ABCJS staff units and SMuFL metrics.
 */
export class SmuflStaffContext {
  constructor({ svg, keySignature, reporter }) {
    this.svg = svg;
    this.keySignature = keySignature;
    this.reporter = reporter;
    this._staffStep = null;
    this._baseline = null;
    this._computeMetrics();
  }

  _computeMetrics() {
    if (!this.svg) return;
    const staff = this.svg.querySelector('.abcjs-staff');
    if (staff) {
      const bbox = readBBox(staff);
      if (bbox) {
        const gap = bbox.height / 4;
        this._staffStep = gap / 2;
        this._baseline = bbox.y + bbox.height;
        return;
      }
    }
    this._staffStep = 6;
    this._baseline = 0;
  }

  get staffStep() {
    return this._staffStep ?? 6;
  }

  get baseline() {
    return this._baseline ?? 0;
  }
}

/**
 * Coordinates note registration, glyph lookup, and drag notifications.
 */
export class SmuflRenderer {
  constructor({ fontKey = 'bravura', reporter } = {}) {
    this.fontKey = fontKey;
    this.reporter = reporter;
    this.font = null;
    this.notes = new Map();
    this.staffContexts = new WeakMap();
    this.readyPromise = null;
  }

  async ensureFontLoaded() {
    if (!this.readyPromise) {
      this.readyPromise = (async () => {
        const font = await loadFont(this.fontKey, this.reporter);
        await ensureFontFaceLoaded(font, this.reporter);
        if (!fontSupportsSmufl(font, this.reporter)) {
          this.reporter?.warn?.(`[SMuFL] Font "${font.label}" may not have loaded correctly.`);
        }
        this.font = font;
      })();
    }
    return this.readyPromise;
  }

  setFontKey(fontKey) {
    if (fontKey && fontKey !== this.fontKey) {
      this.fontKey = fontKey;
      this.readyPromise = null;
    }
  }

  async bindSvg(svg, { keySignature } = {}) {
    if (!svg) return;
    await this.ensureFontLoaded();
    const context = new SmuflStaffContext({ svg, keySignature, reporter: this.reporter });
    this.staffContexts.set(svg, context);
    const groups = svg.querySelectorAll('g.abcjs-note');
    groups.forEach((group) => {
      if (!group.dataset.smuflNoteId) {
        const id = nextNoteId();
        const token = extractTokenFromGroup(group);
        const note = new SmuflNote({
          id,
          group,
          token,
          staffStep: context.staffStep,
          reporter: this.reporter,
        });
        this.notes.set(id, note);
      }
    });
  }

  getNoteForGroup(group) {
    if (!group) return null;
    const id = group.dataset.smuflNoteId;
    if (!id && group instanceof Element) {
      // Attempt to register lazily if missing
      const context = this._findContext(group);
      if (!context) return null;
      const noteId = nextNoteId();
      const token = extractTokenFromGroup(group);
      const note = new SmuflNote({
        id: noteId,
        group,
        token,
        staffStep: context.staffStep,
        reporter: this.reporter,
      });
      this.notes.set(noteId, note);
      return note;
    }
    return this.notes.get(id) || null;
  }

  _findContext(element) {
    for (const [svg, ctx] of this.staffContexts.entries()) {
      if (svg.contains(element)) {
        return ctx;
      }
    }
    return null;
  }
}

function extractTokenFromGroup(group) {
  if (!group) return {};
  const accidentalEl = group.querySelector('[data-name*="accidentals"], .abcjs-accidental');
  const accName = accidentalEl?.getAttribute?.('data-name') || '';
  const acc = deriveAccidentalFromName(accName);
  const letterNode = group.querySelector('[data-name*="noteheads"], .abcjs-notehead, ellipse');
  const octave = deriveOctaveFromClasses(group.getAttribute('class') || '');
  return {
    acc,
    letter: letterNode ? deriveLetterFromGroup(group) : '',
    oct: octave,
  };
}

function deriveLetterFromGroup(group) {
  if (!group) return '';
  const classes = group.getAttribute('class') || '';
  const match = classes.match(/\bp([0-9-]+)\b/);
  if (!match) return '';
  const pitchIndex = parseInt(match[1], 10);
  const letters = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  return letters[((pitchIndex % 7) + 7) % 7] || '';
}

function deriveOctaveFromClasses(classes) {
  // ABCJS encodes pitch class with pN; convert to octave heuristically.
  if (!classes) return '';
  const match = classes.match(/\bp(-?\d+)\b/);
  if (!match) return '';
  const pitchIndex = parseInt(match[1], 10);
  const octave = Math.floor((pitchIndex + 1) / 7) + 4;
  if (octave > 5) {
    return "'".repeat(octave - 5);
  }
  if (octave < 4) {
    return ",".repeat(4 - octave);
  }
  return '';
}

function deriveAccidentalFromName(name) {
  if (!name) return '';
  if (name.includes('sharp')) return '^';
  if (name.includes('flat')) return '_';
  if (name.includes('natural')) return '=';
  return '';
}

export function createSmuflRenderer(options = {}) {
  return new SmuflRenderer(options);
}
