import VexFlow from '/staff/vendor/lib/vexflow-esm/entry/vexflow-debug.js';
import { renderPipeline } from '/js/vexflow/core/renderPipeline.js';
import {
  canonicalizeKeySignature,
} from '/js/modules/KeySignatures.js';
import {
  configureVexflowFont,
  getFontChoice,
  DEFAULT_FONT_ID,
} from '/js/modules/StaffFonts.js';
import { keyToMidi, ACCIDENTAL_OFFSETS } from '/js/vexflow/core/helpers/pitch.js';
import { getKeySignatureAlteration } from '/js/modules/KeySignatures.js';
import { parsePositiveNumber } from '/js/shared/utils.js';
import {
  normalizeStaffSizing,
  resolveStaffScale,
  applyStaffSizingToState,
  getStaffTheme,
  applyVexflowTheme,
} from '/js/vexflow/core/config.js';
import { createRenderRuntime } from '/js/vexflow/core/seeds.js';

// Accept up to triple accidentals and multi-digit octaves in specs we receive from the app
const NOTE_REGEX = /^([A-Ga-g])([#x𝄪♯b♭]{0,3})(-?\d+)$/;
const DEFAULT_METER = Object.freeze({ num: 4, den: 4 });
const DEFAULT_DURATION = 'q';

function styleForStateFromTheme(state, theme) {
  const choose = (primary, fallback) => (primary ? { fillStyle: primary, strokeStyle: primary } : (fallback || undefined));
  switch (state) {
    case 'user':
      // Prefer selection, fall back to accent, then blue
      return choose(theme?.selection || theme?.accent, { fillStyle: '#2196F3', strokeStyle: '#2196F3' });
    case 'correct':
      return choose(theme?.correct, { fillStyle: '#4CAF50', strokeStyle: '#4CAF50' });
    case 'incorrect':
      return choose(theme?.incorrect, { fillStyle: '#F44336', strokeStyle: '#F44336' });
    case 'draft':
      return choose(theme?.muted || theme?.accent, { fillStyle: '#90A4AE', strokeStyle: '#90A4AE' });
    case 'highlight':
      // animated replay sweep (orange)
      return choose(theme?.answer || theme?.accent, { fillStyle: '#FF9800', strokeStyle: '#FF9800' });
    case 'answer':
      // static correction overlay (green, consistent with correct answers)
      return choose(theme?.correction || theme?.answer, { fillStyle: '#4CAF50', strokeStyle: '#4CAF50' });
    default:
      return undefined;
  }
}

function normalizeAccidental(raw) {
  if (!raw) return null;
  switch (raw) {
    case '#':
    case '♯':
      return '#';
    case 'x':
    case '𝄪':
      return '##';
    case '##':
      return '##';
    case '###':
      return '###';
    case 'b':
    case '♭':
      return 'b';
    case 'bb':
    case '𝄫':
      return 'bb';
    case 'bbb':
      return 'bbb';
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

// Determine which accidental symbol VexFlow should display for a spelled note in a given key.
// - Keeps the spelled key (letter + spelled accidental) intact for the note head.
// - Returns null when the key signature already implies the accidental.
// - Returns 'n' when the spelled note is natural but the key signature alters that letter.
function decideDisplayedAccidental(letter, spelledAccidental, keySig) {
  const base = getKeySignatureAlteration((letter || 'c').toUpperCase(), keySig || 'C');
  const spelled = ACCIDENTAL_OFFSETS[spelledAccidental || 'n'] ?? 0;
  if (spelled === base) return null;
  if (spelled === 0 && base !== 0) return 'n';
  // For non-zero differences, show the spelled accidental symbol itself (supports bb/##).
  return spelledAccidental || null;
}

function resolveStyle(entry, theme) {
  if (entry?.style) {
    const source = entry.style;
    return {
      fillStyle: source.fillStyle ?? source.fill ?? undefined,
      strokeStyle: source.strokeStyle ?? source.stroke ?? source.fill ?? undefined,
    };
  }
  if (entry?.state) {
    return styleForStateFromTheme(entry.state, theme);
  }
  return undefined;
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
    this.interactionRegistrar = null;
    this.highlightEntry = null;
    this.overlayEntries = null; // optional full-answer overlay
    this.widthOptions = normalizeStaffSizing({
      minWidth,
      maxWidth,
      targetWidth,
      baseHeight,
    });
    const initialState = {
      initialized: true,
      staffScale: parsePositiveNumber(staffScale),
      primaryClef: this.clef,
      meter: this.meter,
      keySig: this.keySignature,
      warnings: [],
      voices: [],
    };
    applyStaffSizingToState(initialState, this.widthOptions);
    this.renderRuntime = createRenderRuntime({ initialState });
    this.renderState = this.renderRuntime.state;
    this.fontConfigured = false;
  }

  async initialize() {
    await this.render();
  }

  async configureFont(force = false) {
    if (!force && this.fontConfigured && this.fontChoice) {
      return {
        fontChoice: this.fontChoice,
        warnings: [],
      };
    }
    this.fontChoice = getFontChoice(this.fontId);
    const fontResult = await configureVexflowFont(VexFlow, this.fontChoice);
    if (fontResult?.choice) {
      this.fontChoice = fontResult.choice;
    }
    const warnings = Array.isArray(fontResult?.warnings) ? fontResult.warnings : [];
    this.fontConfigured = true;
    return {
      fontChoice: this.fontChoice,
      warnings,
    };
  }

  async setFont(fontId) {
    if (!fontId || fontId === this.fontId) return;
    this.fontId = fontId;
    this.fontConfigured = false;
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

  async setClef(clef) {
    const next = (clef || '').toString().toLowerCase();
    if (!next) return this.render();
    if (next === this.clef) return this.render();
    this.clef = next;
    return this.render();
  }

  async setSequence(entries) {
    this.sequenceEntries = Array.isArray(entries) ? entries.slice() : [];
    return this.render();
  }

  async setOverlay(entries) {
    this.overlayEntries = Array.isArray(entries) ? entries.slice() : null;
    return this.render();
  }

  async clearOverlay() {
    this.overlayEntries = null;
    return this.render();
  }

  async setWidthOptions(options = {}) {
    if (!options || typeof options !== 'object') return this.render();
    const merged = normalizeStaffSizing({ ...this.widthOptions, ...options });
    const changed = ['minWidth', 'maxWidth', 'targetWidth', 'baseHeight'].some(
      (key) => this.widthOptions[key] !== merged[key],
    );
    if (!changed) return this.render();
    this.widthOptions = merged;
    applyStaffSizingToState(this.renderState, merged);
    if (this.renderRuntime) {
      this.renderRuntime.update({
        minWidth: merged.minWidth,
        maxWidth: merged.maxWidth,
        targetWidth: merged.targetWidth,
        baseHeight: merged.baseHeight,
      });
    }
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
    if (!entry) return null;
    const theme = getStaffTheme();
    const resolvedStyle = resolveStyle(entry, theme);
    if (entry.isRest === true) {
      return {
        isRest: true,
        duration: entry.duration || DEFAULT_DURATION,
        dots: entry.dots || 0,
        clef: entry.clef || this.clef,
        style: resolvedStyle,
      };
    }
    if (Array.isArray(entry.notes) && entry.notes.length > 0) {
      const parsedNotes = entry.notes
        .map((note) => parseNote(note))
        .filter(Boolean);
      if (parsedNotes.length === 0) return null;
      const keys = parsedNotes.map(({ letter, accidental, octave }) => {
        const base = `${letter}/${octave}`;
        return accidental ? `${letter}${accidental}/${octave}` : base;
      });
      const accidentals = parsedNotes.map(({ letter, accidental }) => (
        decideDisplayedAccidental(letter, accidental || null, this.keySignature)
      ));
      const midis = parsedNotes.map(({ letter, accidental, octave }) => {
        const base = `${letter}/${octave}`;
        return keyToMidi(base, accidental || null);
      });
      let keyStyles = undefined;
      if (Array.isArray(entry.perNoteStates) && entry.perNoteStates.length === parsedNotes.length) {
        keyStyles = entry.perNoteStates.map((state) => styleForStateFromTheme(state, theme) || undefined);
      }
      return {
        isRest: false,
        duration: entry.duration || DEFAULT_DURATION,
        dots: entry.dots || 0,
        clef: entry.clef || this.clef,
        keys,
        accidentals,
        midis,
        // If per-key styles exist, avoid applying a whole-note style so heads can differ.
        style: keyStyles ? undefined : resolvedStyle,
        keyStyles,
        stemless: entry.stemless === true,
      };
    }
    if (!entry.note) return null;
    const parsed = parseNote(entry.note);
    if (!parsed) return null;
    const { letter, accidental, octave } = parsed;
    const baseKey = `${letter}/${octave}`;
    const key = accidental ? `${letter}${accidental}/${octave}` : baseKey;
    const midi = keyToMidi(baseKey, accidental || null);
    return {
      isRest: false,
      duration: entry.duration || DEFAULT_DURATION,
      dots: entry.dots || 0,
      clef: entry.clef || this.clef,
      keys: [key],
      accidentals: [decideDisplayedAccidental(letter, accidental || null, this.keySignature)],
      midis: [midi],
      style: resolvedStyle,
      stemless: entry.stemless === true,
    };
  }

  async render() {
    applyStaffSizingToState(this.renderState, this.widthOptions);
    this.renderState.primaryClef = this.clef;
    this.renderState.keySig = this.keySignature;
    this.renderState.meter = this.meter;

    const result = await renderPipeline({
      container: this.container,
      statusEl: this.statusEl,
      statusBusyText: 'Rendering with VexFlow…',
      statusEmptyText: 'Staff unavailable.',
      renderState: this.renderState,
      resolveFont: async () => this.configureFont(),
      produceVoices: async () => {
        const voices = [];
        const specs = this.sequenceEntries
          .map((entry) => this.toSpec(entry))
          .filter(Boolean);
        voices.push({
          clef: this.clef,
          noteSpecs: specs,
        });
        if (Array.isArray(this.overlayEntries) && this.overlayEntries.length > 0) {
          const overlaySpecs = this.overlayEntries
            .map((entry) => this.toSpec({ ...entry, state: entry.state || 'answer' }))
            .filter(Boolean);
          if (overlaySpecs.length > 0) {
            voices.push({ clef: this.clef, noteSpecs: overlaySpecs });
          }
        }
        if (this.highlightEntry) {
          const highlightSpec = this.toSpec(this.highlightEntry);
          if (highlightSpec) {
            highlightSpec.style = resolveStyle({ state: 'highlight' }, getStaffTheme());
            voices.push({
              clef: this.clef,
              noteSpecs: [highlightSpec],
            });
          }
        }
        return {
          voices,
          meter: this.meter,
          keySig: this.keySignature,
          warnings: [],
        };
      },
      resolveTheme: () => getStaffTheme(),
      resolveScale: (state) => {
        applyStaffSizingToState(state, this.widthOptions);
        return resolveStaffScale(state);
      },
      registerInteractions: this.interactionRegistrar
        ? ({ context: vfContext, voices, baseMessage, scale }) => (
            this.interactionRegistrar({
              context: vfContext,
              voices,
              baseMessage,
              scale,
            })
          )
        : null,
      applyTheme: applyVexflowTheme,
      allowEmptyVoices: true,
    });

    if (this.renderRuntime && result?.warnings) {
      this.renderRuntime.recordWarnings(result.warnings);
    }

    return result;
  }

  setInteractionRegistrar(callback) {
    if (typeof callback === 'function') {
      this.interactionRegistrar = callback;
    } else {
      this.interactionRegistrar = null;
    }
  }
}

export default VexflowStaffDisplay;
