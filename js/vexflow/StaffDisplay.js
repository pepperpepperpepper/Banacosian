import VexFlow from '/staff/vendor/lib/vexflow-esm/entry/vexflow-debug.js';
import { drawStaff } from '/js/vexflow/core/draw.js';
import {
  getStaffTheme,
  computeStaffScale,
  applyVexflowTheme,
} from '/staff/render/theme.js';
import {
  canonicalizeKeySignature,
} from '/js/modules/KeySignatures.js';
import {
  configureVexflowFont,
  getFontChoice,
  DEFAULT_FONT_ID,
} from '/js/modules/StaffFonts.js';
import { keyToMidi } from '/js/vexflow/core/helpers/pitch.js';
import { parsePositiveNumber } from '/js/shared/utils.js';

const NOTE_REGEX = /^([A-Ga-g])([#♯b♭]{0,2})(-?\d)$/;
const DEFAULT_METER = Object.freeze({ num: 4, den: 4 });
const DEFAULT_DURATION = 'q';

const STATE_STYLES = {
  user: { fillStyle: '#2196F3', strokeStyle: '#2196F3' },
  correct: { fillStyle: '#4CAF50', strokeStyle: '#4CAF50' },
  incorrect: { fillStyle: '#F44336', strokeStyle: '#F44336' },
  highlight: { fillStyle: '#FF9800', strokeStyle: '#FF9800' },
};

function normalizeAccidental(raw) {
  if (!raw) return null;
  switch (raw) {
    case '#':
    case '♯':
      return '#';
    case '##':
    case 'x':
    case '𝄪':
      return '##';
    case 'b':
    case '♭':
      return 'b';
    case 'bb':
    case '𝄫':
      return 'bb';
    case 'n':
    case '♮':
      return 'n';
    default:
      return raw;
  }
}

function parseNote(note) {
  if (!note || typeof note !== 'string') return null;
  const trimmed = note.trim();
  const match = NOTE_REGEX.exec(trimmed);
  if (!match) return null;
  const letter = match[1].toLowerCase();
  const accidental = normalizeAccidental(match[2] || '');
  const octave = Number.parseInt(match[3], 10);
  if (!Number.isFinite(octave)) return null;
  return { letter, accidental, octave };
}

function resolveStyle(entry) {
  if (entry?.style) {
    const source = entry.style;
    return {
      fillStyle: source.fillStyle ?? source.fill ?? undefined,
      strokeStyle: source.strokeStyle ?? source.stroke ?? source.fill ?? undefined,
    };
  }
  const stateStyle = entry?.state ? STATE_STYLES[entry.state] : null;
  if (!stateStyle) return undefined;
  return {
    fillStyle: stateStyle.fillStyle ?? stateStyle.fill ?? undefined,
    strokeStyle: stateStyle.strokeStyle ?? stateStyle.stroke ?? stateStyle.fillStyle ?? undefined,
  };
}

export class VexflowStaffDisplay {
  constructor({
    container,
    statusEl = null,
    clef = 'treble',
    keySignature = 'C',
    fontId = DEFAULT_FONT_ID,
    meter = DEFAULT_METER,
    minWidth = null,
    maxWidth = null,
    targetWidth = null,
    baseHeight = null,
    staffScale = null,
  } = {}) {
    if (!container) {
      throw new Error('VexflowStaffDisplay requires a container element.');
    }
    this.container = container;
    this.statusEl = statusEl;
    this.clef = clef;
    this.keySignature = canonicalizeKeySignature(keySignature) || 'C';
    this.fontId = fontId || DEFAULT_FONT_ID;
    this.fontChoice = getFontChoice(this.fontId);
    this.meter = meter && Number.isFinite(meter.num) && Number.isFinite(meter.den)
      ? { num: meter.num, den: meter.den }
      : { ...DEFAULT_METER };
    this.sequenceEntries = [];
    this.highlightEntry = null;
    this.widthOptions = {
      minWidth: parsePositiveNumber(minWidth),
      maxWidth: parsePositiveNumber(maxWidth),
      targetWidth: parsePositiveNumber(targetWidth),
      baseHeight: parsePositiveNumber(baseHeight),
    };
    this.renderState = {
      initialized: true,
      staffScale: parsePositiveNumber(staffScale),
      primaryClef: this.clef,
      meter: this.meter,
      keySig: this.keySignature,
      warnings: [],
      voices: [],
      minWidth: this.widthOptions.minWidth,
      maxWidth: this.widthOptions.maxWidth,
      targetWidth: this.widthOptions.targetWidth,
      baseHeight: this.widthOptions.baseHeight,
    };
    this.fontConfigured = false;
  }

  async initialize() {
    await this.configureFont();
    computeStaffScale(this.renderState);
    await this.render();
  }

  async configureFont() {
    this.fontChoice = getFontChoice(this.fontId);
    const fontResult = await configureVexflowFont(VexFlow, this.fontChoice);
    if (fontResult?.choice) {
      this.fontChoice = fontResult.choice;
    }
    if (Array.isArray(fontResult?.warnings) && fontResult.warnings.length > 0) {
      const combinedWarnings = Array.isArray(this.renderState.warnings)
        ? this.renderState.warnings.concat(fontResult.warnings)
        : fontResult.warnings.slice();
      this.renderState.warnings = [...new Set(combinedWarnings)];
    }
    this.fontConfigured = true;
  }

  async setFont(fontId) {
    if (!fontId || fontId === this.fontId) return;
    this.fontId = fontId;
    await this.configureFont();
    await this.render();
  }

  async setKeySignature(keySig) {
    const canonical = canonicalizeKeySignature(keySig);
    if (!canonical || canonical === this.keySignature) {
      if (!this.fontConfigured) await this.configureFont();
      return this.render();
    }
    this.keySignature = canonical;
    return this.render();
  }

  async setSequence(entries) {
    this.sequenceEntries = Array.isArray(entries) ? entries.slice() : [];
    return this.render();
  }

  async setWidthOptions(options = {}) {
    if (!options || typeof options !== 'object') return this.render();
    const updated = { ...this.widthOptions };
    let dirty = false;
    if ('minWidth' in options) {
      const parsed = parsePositiveNumber(options.minWidth);
      if (updated.minWidth !== parsed) {
        updated.minWidth = parsed;
        dirty = true;
      }
    }
    if ('maxWidth' in options) {
      const parsed = parsePositiveNumber(options.maxWidth);
      if (updated.maxWidth !== parsed) {
        updated.maxWidth = parsed;
        dirty = true;
      }
    }
    if ('targetWidth' in options) {
      const parsed = parsePositiveNumber(options.targetWidth);
      if (updated.targetWidth !== parsed) {
        updated.targetWidth = parsed;
        dirty = true;
      }
    }
    if ('baseHeight' in options) {
      const parsed = parsePositiveNumber(options.baseHeight);
      if (updated.baseHeight !== parsed) {
        updated.baseHeight = parsed;
        dirty = true;
      }
    }
    if (!dirty) {
      return this.render();
    }
    this.widthOptions = updated;
    return this.render();
  }

  async updateEntry(index, mutateFn) {
    if (!Number.isInteger(index) || index < 0 || index >= this.sequenceEntries.length) return this.render();
    const entries = this.sequenceEntries.slice();
    entries[index] = mutateFn ? mutateFn({ ...entries[index] }) : entries[index];
    this.sequenceEntries = entries;
    return this.render();
  }

  async setHighlight(entry) {
    this.highlightEntry = entry ? { ...entry, state: entry.state || 'highlight' } : null;
    return this.render();
  }

  async clearHighlight() {
    this.highlightEntry = null;
    return this.render();
  }

  getFontLabel() {
    return this.fontChoice?.label || '';
  }

  toSpec(entry) {
    if (!entry || !entry.note) return null;
    const parsed = parseNote(entry.note);
    if (!parsed) return null;
    const { letter, accidental, octave } = parsed;
    const baseKey = `${letter}/${octave}`;
    const key = accidental ? `${letter}${accidental}/${octave}` : baseKey;
    const midi = keyToMidi(baseKey, accidental || null);
    const style = resolveStyle(entry);
    return {
      isRest: false,
      duration: entry.duration || DEFAULT_DURATION,
      dots: entry.dots || 0,
      clef: entry.clef || this.clef,
      keys: [key],
      accidentals: [accidental || null],
      midis: [midi],
      style,
    };
  }

  async render() {
    if (!this.fontConfigured) {
      await this.configureFont();
    }
    const theme = getStaffTheme();
    const staffScale = computeStaffScale(this.renderState);
    this.renderState.minWidth = this.widthOptions.minWidth;
    this.renderState.maxWidth = this.widthOptions.maxWidth;
    this.renderState.targetWidth = this.widthOptions.targetWidth;
    this.renderState.baseHeight = this.widthOptions.baseHeight;
    const voices = [];
    const specs = this.sequenceEntries
      .map((entry) => this.toSpec(entry))
      .filter(Boolean);
    if (specs.length > 0) {
      voices.push({
        clef: this.clef,
        noteSpecs: specs,
      });
    }
    if (this.highlightEntry) {
      const highlightSpec = this.toSpec(this.highlightEntry);
      if (highlightSpec) {
        highlightSpec.style = resolveStyle({ state: 'highlight' });
        voices.push({
          clef: this.clef,
          noteSpecs: [highlightSpec],
        });
      }
    }
    this.renderState.primaryClef = this.clef;
    this.renderState.keySig = this.keySignature;
    this.renderState.meter = this.meter;
    this.renderState.voices = voices.map((voice) => ({
      clef: voice.clef,
      noteSpecs: voice.noteSpecs.map((spec) => ({ ...spec })),
    }));

    const result = drawStaff({
      container: this.container,
      theme,
      staffScale,
      voices,
      meter: this.meter,
      keySig: this.keySignature,
      fontChoice: this.fontChoice,
      renderState: this.renderState,
      warnings: [],
      registerInteractions: null,
      applyTheme: applyVexflowTheme,
    });

    if (this.statusEl) {
      if (!result) {
        this.statusEl.textContent = 'Staff unavailable.';
      } else {
        this.statusEl.textContent = result.baseMessage || '';
      }
    }
    return result;
  }
}

export default VexflowStaffDisplay;
