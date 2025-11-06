import VexFlow, {
  Renderer,
  Stave,
  StaveNote,
  Voice,
  Formatter,
  Accidental,
} from './lib/vexflow-esm/entry/vexflow-debug.js';
import { readTokens } from '/staff/theme/readTokens.js';
import { applyVexflowSvgTheme } from '/staff/theme/applySvgTheme.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const vexflowContainer = document.getElementById('vexflow-container');
const vexflowStatus = document.getElementById('vexflow-status');
const fontSelect = document.getElementById('font-select');

const STATUS_EMPTY = 'No playable content found for VexFlow.';
const DURATION_DENOMS = [1, 2, 4, 8, 16, 32, 64];
const DURATION_CODES = {
  1: 'w',
  2: 'h',
  4: 'q',
  8: '8',
  16: '16',
  32: '32',
  64: '64',
};
const MAX_DOTS = 3;
const DURATION_TOLERANCE = 1e-6;
const ACCIDENTAL_MAP = {
  sharp: '#',
  flat: 'b',
  natural: 'n',
  dblsharp: '##',
  dblflat: 'bb',
  quartersharp: '#+',
  quarterflat: 'b-',
  oneandahalfsharp: '###',
  oneandahalfflat: 'bbb',
};
const NOTE_LETTERS = ['c', 'd', 'e', 'f', 'g', 'a', 'b'];
const MUSIC_FONT_CHOICES = {
  bravura: {
    id: 'bravura',
    label: 'Bravura',
    stack: ['Bravura', 'Academico'],
  },
  petaluma: {
    id: 'petaluma',
    label: 'Petaluma',
    stack: ['Petaluma', 'Petaluma Script'],
  },
  leland: {
    id: 'leland',
    label: 'Leland',
    stack: ['Bravura', 'Academico'],
    fallback: true,
    warning: 'VexFlow does not bundle Leland; falling back to Bravura.',
  },
};

let abcjsPromise = null;
let resizeHandler = null;
const HAS_POINTER_EVENTS = typeof window !== 'undefined' && 'PointerEvent' in window;
const selectionState = {
  noteEl: null,
  note: null,
  messageBase: '',
  baseTransform: '',
  headNodes: [],
  drag: null,
};

const renderState = {
  abc: null,
  voices: null,
  meter: null,
  warnings: [],
  initialized: false,
};

const LETTER_TO_SEMITONE = {
  c: 0,
  d: 2,
  e: 4,
  f: 5,
  g: 7,
  a: 9,
  b: 11,
};

// Major key signature maps (letter -> offset from natural: -1 flat, +1 sharp)
// Matches the subset used in the ABCJS demo so behavior is consistent.
const KEY_SIGS = {
  C: {},
  G: { F: +1 },
  D: { F: +1, C: +1 },
  A: { F: +1, C: +1, G: +1 },
  F: { B: -1 },
  Bb: { B: -1, E: -1 },
  Eb: { B: -1, E: -1, A: -1 },
};

const SEMITONE_TO_FLAT = [
  { letter: 'c', accidental: null },
  { letter: 'd', accidental: 'b' },
  { letter: 'd', accidental: null },
  { letter: 'e', accidental: 'b' },
  { letter: 'e', accidental: null },
  { letter: 'f', accidental: null },
  { letter: 'g', accidental: 'b' },
  { letter: 'g', accidental: null },
  { letter: 'a', accidental: 'b' },
  { letter: 'a', accidental: null },
  { letter: 'b', accidental: 'b' },
  { letter: 'b', accidental: null },
];

const ACCIDENTAL_OFFSETS = {
  '#': 1,
  '##': 2,
  '###': 3,
  b: -1,
  bb: -2,
  bbb: -3,
  n: 0,
  null: 0,
  undefined: 0,
};

const SVG_GRAPHICS_ELEMENT = typeof SVGGraphicsElement === 'undefined' ? null : SVGGraphicsElement;

console.log('[VexflowDemo] script loaded');

const selectableRegistry = {
  items: [],
  svg: null,
  reset(svg) {
    this.items = [];
    this.svg = svg || null;
  },
  add(entry) {
    if (!entry || !entry.noteEl) return null;
    const index = this.items.length;
    const noteEl = entry.noteEl;
    noteEl.setAttribute('selectable', 'true');
    noteEl.setAttribute('tabindex', '0');
    noteEl.dataset.index = String(index);
    noteEl.style.pointerEvents = 'all';
    console.log('[VexflowSelectable] add', {
      index,
      voiceIndex: entry.voiceIndex,
      noteIndex: entry.noteIndex,
      id: noteEl.id,
      className: noteEl.className?.baseVal || noteEl.className,
    });
    this.items.push({
      index,
      note: entry.note,
      noteEl,
      voiceIndex: entry.voiceIndex,
      noteIndex: entry.noteIndex,
      staffSpacing: entry.staffSpacing,
      dim: null,
    });
    return this.items[index];
  },
  get(index) {
    return (index >= 0 && index < this.items.length) ? this.items[index] : null;
  },
  clearDims() {
    this.items.forEach((item) => { item.dim = null; });
  },
  indexFromTarget(target) {
    let el = target;
    while (el && el !== this.svg) {
      if (el.dataset && el.dataset.index !== undefined) {
        const idx = Number.parseInt(el.dataset.index, 10);
        if (Number.isInteger(idx)) return idx;
      }
      el = el.parentNode;
    }
    return -1;
  },
  ensureDim(item) {
    if (!item || item.dim) return item?.dim || null;
    try {
      const box = item.noteEl.getBBox();
      if (!box) {
        console.log('[VexflowSelectable] getBBox null', item.index);
        return null;
      }
      item.dim = {
        left: box.x,
        top: box.y,
        right: box.x + box.width,
        bottom: box.y + box.height,
      };
      console.log('[VexflowSelectable] bbox', item.index, item.dim);
    } catch (_err) {
      console.log('[VexflowSelectable] getBBox error', item.index, _err);
      item.dim = null;
    }
    return item.dim;
  },
  findClosest(x, y) {
    let best = null;
    let minDistance = Infinity;
    for (let i = 0; i < this.items.length; i += 1) {
      const item = this.items[i];
      const dim = this.ensureDim(item);
      if (!dim) continue;
      const withinX = x >= dim.left && x <= dim.right;
      const withinY = y >= dim.top && y <= dim.bottom;
      if (withinX && withinY) {
        best = item;
        minDistance = 0;
        break;
      }
      let distance = Infinity;
      if (withinY) {
        distance = Math.min(Math.abs(dim.left - x), Math.abs(dim.right - x));
      } else if (withinX) {
        distance = Math.min(Math.abs(dim.top - y), Math.abs(dim.bottom - y));
      } else {
        const dx = x < dim.left ? dim.left - x : x - dim.right;
        const dy = y < dim.top ? dim.top - y : y - dim.bottom;
        distance = Math.sqrt(dx * dx + dy * dy);
      }
      if (distance < minDistance) {
        minDistance = distance;
        best = item;
      }
    }
    if (best && minDistance <= 12) return best;
    console.log('[VexflowSelectable] findClosest miss', { x, y, minDistance });
    return null;
  },
};

function getStaffTheme() { return readTokens(); }

if (vexflowContainer && vexflowStatus) {
  initializeVexflowDemo();
} else if (vexflowStatus) {
  vexflowStatus.textContent = STATUS_EMPTY;
}

if (typeof window !== 'undefined') {
  window.requestVexflowRender = () => renderVexflowStaff().catch((error) => {
    handleRenderFailure(error);
    return null;
  });
}

function initializeVexflowDemo() {
  renderVexflowStaff().catch(handleRenderFailure);
  resizeHandler = debounce(() => {
    renderVexflowStaff().catch(handleRenderFailure);
  }, 150);
  window.addEventListener('resize', resizeHandler);
  if (fontSelect) {
    fontSelect.addEventListener('change', () => {
      renderVexflowStaff().catch(handleRenderFailure);
    });
  }
}

function handleRenderFailure(error) {
  console.error('[VexFlow Demo] Render failed.', error);
  if (vexflowStatus) {
    vexflowStatus.textContent = 'Unable to render VexFlow staff.';
  }
}

async function renderVexflowStaff() {
  if (!vexflowContainer || !vexflowStatus) return;

  vexflowStatus.textContent = 'Rendering with VexFlow…';

  const defaultAbcString = (typeof window !== 'undefined' && window.__SMUFL_SAMPLE_ABC) || defaultAbc();
  if (!renderState.abc) {
    renderState.abc = defaultAbcString;
  }
  // Extract key signature once per render (used for stave and accidental display)
  const keySig = extractKeySignatureFromAbc(renderState.abc);
  renderState.keySig = keySig;

  const abcjs = await waitForAbcjs();
  let voices;
  let meter;
  let warnings;

  if (!renderState.initialized) {
    const parsed = parseAbcToVoices(abcjs, renderState.abc);
    voices = parsed.voices;
    meter = parsed.meter;
    warnings = parsed.warnings;
    renderState.voices = cloneVoices(voices);
    renderState.meter = meter;
    renderState.warnings = warnings;
    renderState.initialized = true;
  } else {
    voices = cloneVoices(renderState.voices);
    meter = renderState.meter;
    warnings = renderState.warnings ? [...renderState.warnings] : [];
  }

  if (voices.length === 0) {
    vexflowContainer.innerHTML = '';
    vexflowStatus.textContent = STATUS_EMPTY;
    return;
  }

  const fontChoice = resolveSelectedFont();
  if (fontChoice?.warning) {
    warnings.push(fontChoice.warning);
  }
  renderState.warnings = warnings.slice();
  if (Array.isArray(fontChoice?.stack) && fontChoice.stack.length > 0) {
    const stack = fontChoice.stack.filter(Boolean);
    try {
      if (stack.length > 0) {
        await VexFlow.loadFonts(...stack);
        VexFlow.setFonts(...stack);
      }
    } catch (error) {
      console.warn('[VexFlow Demo] Unable to switch VexFlow font stack to', stack.join(', '), error);
    }
  }

  const theme = getStaffTheme();

  const width = Math.max(480, vexflowContainer.clientWidth || vexflowContainer.parentElement?.clientWidth || 720);
  const height = 200;

  vexflowContainer.innerHTML = '';

  const renderer = new Renderer(vexflowContainer, Renderer.Backends.SVG);
  renderer.resize(width, height);
  const context = renderer.getContext();
  context.setBackgroundFillStyle('transparent');
  if (theme.fill) context.setFillStyle(theme.fill);
  if (theme.stroke) context.setStrokeStyle(theme.stroke);

  const stave = new Stave(24, 36, width - 48);
  const primaryClef = voices[0]?.clef || 'treble';
  stave.addClef(primaryClef);
  // Add key signature to match ABC staff (affects reader expectations and accidental display logic)
  if (keySig) {
    try { stave.addKeySignature(keySig); } catch (_err) { /* ignore */ }
  }
  const timeLabel = meter.symbol || formatMeter(meter);
  if (timeLabel) {
    stave.addTimeSignature(timeLabel);
  }
  const ledgerStyle = {};
  if (theme.ledger) {
    ledgerStyle.strokeStyle = theme.ledger;
    ledgerStyle.fillStyle = theme.ledger;
  }
  if (Number.isFinite(theme.ledgerWidth) && theme.ledgerWidth > 0) {
    ledgerStyle.lineWidth = theme.ledgerWidth;
  }
  if (Object.keys(ledgerStyle).length > 0) {
    stave.setDefaultLedgerLineStyle(ledgerStyle);
  }
  stave.setContext(context).draw();

  const vexflowVoices = voices.map((voice, voiceIndex) => {
    const tickables = voice.noteSpecs.map((spec, noteIndex) => {
      const note = createVexflowNote(spec, theme);
      note.__voiceIndex = voiceIndex;
      note.__noteIndex = noteIndex;
      return note;
    });
    const vfVoice = new Voice({
      num_beats: meter?.num || 4,
      beat_value: meter?.den || 4,
      resolution: VexFlow.RESOLUTION,
    });
    vfVoice.setStrict(false);
    vfVoice.addTickables(tickables);
    return vfVoice;
  });

  const formatter = new Formatter({ align_rests: true });
  formatter.joinVoices(vexflowVoices);
  formatter.format(vexflowVoices, width - 96);

  vexflowVoices.forEach((voice) => voice.draw(context, stave));

  vexflowVoices.forEach((voice, voiceIndex) => {
    const tickables = voice.getTickables ? voice.getTickables() : [];
    tickables.forEach((tickable, noteIndex) => {
      console.log('[VexflowDraw] attrs after draw', {
        voiceIndex,
        noteIndex,
        attrs: tickable.getAttrs?.(),
        rawAttrs: tickable.attrs,
      });
    });
  });

  const totalElements = voices.reduce((sum, voice) => sum + voice.noteSpecs.length, 0);
  const warningSuffix = warnings.length ? ` — ${warnings.length} warning${warnings.length === 1 ? '' : 's'} (see console)` : '';
  const fontSuffix = fontChoice?.label ? ` using ${fontChoice.label}` : '';
  const baseMessage = `VexFlow rendered ${totalElements} element${totalElements === 1 ? '' : 's'} across ${voices.length} voice${voices.length === 1 ? '' : 's'}${fontSuffix}.${warningSuffix}`;
  selectionState.messageBase = baseMessage;
  vexflowStatus.textContent = baseMessage;

  warnings.forEach((warning) => console.warn('[VexFlow Demo]', warning));

  applyVexflowTheme(vexflowContainer, theme);
  registerVexflowInteractions(context, vexflowVoices, baseMessage);
}

function createVexflowNote(spec, theme) {
  const isRest = spec.isRest === true;
  const noteStruct = {
    keys: isRest ? ['b/4'] : spec.keys,
    duration: `${spec.duration}${isRest ? 'r' : ''}`,
    clef: spec.clef || 'treble',
    // Align ledger line extent with themed ledger thickness. In VexFlow v4,
    // StaveNote uses `strokePx` to extend ledger lines beyond the notehead on
    // both sides (width = glyphWidth + strokePx*2). Use our themed ledger
    // thickness so outside-the-staff ledger lines match others visually.
    ...(theme && Number.isFinite(theme.ledgerWidth) && theme.ledgerWidth > 0
      ? { strokePx: theme.ledgerWidth }
      : {}),
  };
  const note = new StaveNote(noteStruct);
  note.__smuflSpec = spec;
  if (theme) {
    const noteLedgerStyle = {};
    if (theme.ledger) {
      noteLedgerStyle.strokeStyle = theme.ledger;
      noteLedgerStyle.fillStyle = theme.ledger;
    }
    if (Number.isFinite(theme.ledgerWidth) && theme.ledgerWidth > 0) {
      noteLedgerStyle.lineWidth = theme.ledgerWidth;
    }
    if (Object.keys(noteLedgerStyle).length > 0) {
      note.setLedgerLineStyle(noteLedgerStyle);
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

function parseAbcToVoices(abcjs, abcString) {
  const warnings = [];
  const tunebook = abcjs.parseOnly(abcString, { experimental: { warn: false } }) || [];
  if (tunebook.length === 0) {
    warnings.push('ABCJS returned no tunes for the sample string.');
    return { voices: [], meter: null, warnings };
  }
  const tune = tunebook[0];
  const meter = extractMeter(tune);
  const voiceMap = new Map();

  tune.lines.forEach((line) => {
    if (!line.staff) return;
    line.staff.forEach((staff, staffIndex) => {
      const clef = staff.clef?.type || 'treble';
      const voices = staff.voices || [];
      voices.forEach((voiceElements, voiceIndex) => {
        const key = `${staffIndex}:${voiceIndex}`;
        if (!voiceMap.has(key)) {
          voiceMap.set(key, {
            staffIndex,
            voiceIndex,
            clef,
            noteSpecs: [],
          });
        }
        const entry = voiceMap.get(key);
        voiceElements.forEach((element) => {
          if (element.el_type !== 'note') return;
          if (!element.duration || element.duration <= 0) return;
          const spec = convertElementToSpec(element, clef, warnings);
          if (spec) {
            entry.noteSpecs.push(spec);
          }
        });
      });
    });
  });

  const orderedVoices = Array.from(voiceMap.values())
    .filter((entry) => entry.noteSpecs.length > 0)
    .sort((a, b) => (a.staffIndex - b.staffIndex) || (a.voiceIndex - b.voiceIndex));

  return { voices: orderedVoices, meter, warnings };
}

function convertElementToSpec(element, clef, warnings) {
  const durationInfo = resolveDuration(element.duration);
  if (!durationInfo) {
    warnings.push(`Unsupported duration value: ${element.duration}`);
    return null;
  }
  if (!durationInfo.exact) {
    warnings.push(`Approximated duration ${element.duration} to 1/${durationInfo.base} with ${durationInfo.dots} dot(s).`);
  }
  if (element.rest) {
    return {
      isRest: true,
      duration: durationInfo.code,
      dots: durationInfo.dots,
      clef,
      keys: [],
      accidentals: [],
    };
  }
  if (!Array.isArray(element.pitches) || element.pitches.length === 0) {
    return null;
  }
  const keys = [];
  const accidentals = [];
  const sortedPitches = [...element.pitches].sort((a, b) => (typeof b.pitch === 'number' ? b.pitch : 0) - (typeof a.pitch === 'number' ? a.pitch : 0));
  sortedPitches.forEach((pitch) => {
    const { key, accidental, warning } = convertPitch(pitch);
    keys.push(key);
    accidentals.push(accidental);
    if (warning) warnings.push(warning);
  });
  const midis = keys.map((key, index) => keyToMidi(key, accidentals[index]));
  return {
    isRest: false,
    keys,
    accidentals,
    midis,
    duration: durationInfo.code,
    dots: durationInfo.dots,
    clef,
  };
}

function resolveDuration(value) {
  let bestMatch = null;
  DURATION_DENOMS.forEach((denom) => {
    const baseCode = DURATION_CODES[denom];
    if (!baseCode) return;
    for (let dots = 0; dots <= MAX_DOTS; dots += 1) {
      const total = durationFromDenom(denom, dots);
      const diff = Math.abs(total - value);
      const exact = diff <= DURATION_TOLERANCE;
      if (!bestMatch || diff < bestMatch.diff) {
        bestMatch = {
          code: baseCode,
          base: denom,
          dots,
          diff,
          exact,
        };
      }
      if (exact) {
        return;
      }
    }
  });
  return bestMatch;
}

function durationFromDenom(denom, dots) {
  let value = 1 / denom;
  let addition = value;
  for (let i = 0; i < dots; i += 1) {
    addition /= 2;
    value += addition;
  }
  return value;
}

function convertPitch(pitch) {
  const pitchIndex = typeof pitch.pitch === 'number' ? pitch.pitch : 0;
  const letterIndex = mod(pitchIndex, 7);
  const octave = 4 + Math.floor((pitchIndex - letterIndex) / 7);
  const key = `${NOTE_LETTERS[letterIndex]}/${octave}`;
  const accidental = mapAccidental(pitch.accidental);
  let warning = null;
  if (pitch.accidental && !accidental) {
    warning = `Unsupported accidental "${pitch.accidental}" on pitch ${pitch.name || key}.`;
  }
  return { key, accidental, warning };
}

function mapAccidental(accidental) {
  if (!accidental || accidental === 'none') return null;
  if (ACCIDENTAL_MAP[accidental]) return ACCIDENTAL_MAP[accidental];
  return null;
}

function extractMeter(tune) {
  for (const line of tune.lines || []) {
    if (!line.staff) continue;
    for (const staff of line.staff) {
      const meter = staff.meter;
      if (!meter) continue;
      if (meter.type === 'specified' && Array.isArray(meter.value) && meter.value.length > 0) {
        const first = meter.value[0];
        const num = parseInt(first.num, 10) || 4;
        const den = parseInt(first.den, 10) || 4;
        return { num, den };
      }
      if (meter.type === 'common_time') {
        return { num: 4, den: 4, symbol: 'C' };
      }
      if (meter.type === 'cut_time') {
        return { num: 2, den: 2, symbol: 'C|' };
      }
    }
  }
  return { num: 4, den: 4 };
}

function formatMeter(meter) {
  if (!meter) return null;
  if (meter.symbol) return meter.symbol;
  if (meter.num && meter.den) return `${meter.num}/${meter.den}`;
  return null;
}

function resolveSelectedFont() {
  if (!fontSelect) return MUSIC_FONT_CHOICES.bravura;
  const value = fontSelect.value;
  return MUSIC_FONT_CHOICES[value] || MUSIC_FONT_CHOICES.bravura;
}

function waitForAbcjs() {
  if (abcjsPromise) return abcjsPromise;
  abcjsPromise = new Promise((resolve, reject) => {
    if (window.ABCJS?.parseOnly) {
      resolve(window.ABCJS);
      return;
    }
    let attempts = 0;
    const maxAttempts = 40;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (window.ABCJS?.parseOnly) {
        window.clearInterval(timer);
        resolve(window.ABCJS);
      } else if (attempts >= maxAttempts) {
        window.clearInterval(timer);
        reject(new Error('ABCJS failed to load.'));
      }
    }, 100);
  });
  return abcjsPromise;
}

function debounce(fn, delay) {
  let timer = null;
  return () => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      fn();
    }, delay);
  };
}

function mod(value, base) {
  return ((value % base) + base) % base;
}

function defaultAbc() {
  return `X:1
T:VexFlow Default
M:4/4
L:1/4
K:C
C D E F | G A B c | ^C _D =E ^F | _G ^A _B =c |]`;
}

function applyVexflowTheme(container, palette) {
  if (!container) return;
  const svg = container.querySelector('svg');
  if (!svg) return;
  const colors = palette || getStaffTheme();
  applyVexflowSvgTheme(svg, colors);
}

function cloneVoices(voices) {
  return (voices || []).map((voice) => ({
    staffIndex: voice.staffIndex,
    voiceIndex: voice.voiceIndex,
    clef: voice.clef,
    noteSpecs: (voice.noteSpecs || []).map((spec) => ({
      ...spec,
      keys: Array.isArray(spec.keys) ? [...spec.keys] : [],
      accidentals: Array.isArray(spec.accidentals) ? [...spec.accidentals] : [],
      midis: Array.isArray(spec.midis) ? [...spec.midis] : undefined,
    })),
  }));
}

function keyToMidi(key, accidental) {
  if (!key) return 60;
  const [letterRaw, octaveRaw] = key.split('/');
  const letter = (letterRaw || '').toLowerCase();
  const octave = parseInt(octaveRaw, 10);
  const base = LETTER_TO_SEMITONE[letter];
  if (base == null || Number.isNaN(octave)) return 60;
  const offset = ACCIDENTAL_OFFSETS[accidental] ?? 0;
  return (octave + 1) * 12 + base + offset;
}

function midiToKeySpec(midi) {
  const wrapped = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const pref = SEMITONE_TO_FLAT[wrapped] || { letter: 'c', accidental: null };
  const accidental = pref.accidental;
  const key = `${pref.letter}/${octave}`;
  return {
    key,
    accidental,
    diatonicIndex: diatonicIndexForLetter(pref.letter, octave),
  };
}

function diatonicIndexForLetter(letter, octave = 4) {
  const order = ['c', 'd', 'e', 'f', 'g', 'a', 'b'];
  const base = order.indexOf(letter?.toLowerCase());
  if (base === -1) return 0;
  return octave * 7 + base;
}

function registerVexflowInteractions(context, voices, baseMessage) {
  if (!context || !context.svg) return;
  const svg = context.svg;
  clearSelectedNote(baseMessage);
  selectableRegistry.reset(svg);

  voices.forEach((voice, voiceIndex) => {
    const tickables = voice.getTickables ? voice.getTickables() : [];
    tickables.forEach((tickable, noteIndex) => {
      if (!(tickable instanceof StaveNote)) return;
      if (typeof tickable.isRest === 'function' && tickable.isRest()) return;
      // VexFlow v4: prefer Element#getSVGElement(); fall back to id lookup.
      let noteEl = null;
      try {
        if (typeof tickable.getSVGElement === 'function') {
          noteEl = tickable.getSVGElement();
        }
        if (!noteEl && typeof tickable.getAttributes === 'function') {
          const attrs = tickable.getAttributes();
          if (attrs?.id) {
            noteEl = document.getElementById(`vf-${attrs.id}`);
          }
        }
        // Legacy (v3) fallback — kept for safety when using older builds
        if (!noteEl) {
          noteEl = tickable.getAttrs?.()?.el || null;
        }
      } catch (_err) {
        // Swallow and report below
      }
      if (!noteEl) {
        console.log('[VexflowSelectable] missing noteEl', {
          voiceIndex,
          noteIndex,
          attrs: tickable.getAttrs?.(),
          rawAttrs: tickable.attrs,
          keys: tickable.keys,
        });
        return;
      }
      noteEl.classList.add('vf-note');
      noteEl.dataset.voiceIndex = String(voiceIndex);
      noteEl.dataset.noteIndex = String(noteIndex);
      const staffSpacing = tickable.getStave?.()?.getSpacingBetweenLines?.() ?? 10;
      selectableRegistry.add({
        note: tickable,
        noteEl,
        voiceIndex,
        noteIndex,
        staffSpacing,
      });
    });
  });

  console.log('[VexflowSelectable] total', selectableRegistry.items.length);

  attachSvgInteractionHandlers(svg, baseMessage);
}

function collectNoteheadNodes(noteEl) {
  if (!noteEl) return [];
  const nodes = new Set();
  const pushNodes = (list) => {
    list.forEach((node) => {
      if (SVG_GRAPHICS_ELEMENT && !(node instanceof SVG_GRAPHICS_ELEMENT)) return;
      if (!node.getBBox) return;
      nodes.add(node);
    });
  };
  pushNodes(Array.from(noteEl.querySelectorAll('[class*="vf-notehead"]')));
  pushNodes(Array.from(noteEl.querySelectorAll('[data-name="notehead"]')));
  const unique = [];
  nodes.forEach((node) => {
    unique.push(node);
  });
  return unique;
}

function attachSvgInteractionHandlers(svg, baseMessage) {
  if (!svg) return;
  if (!svg.__vexflowInteraction) {
    const handlers = {
      baseMessage,
    };
    const downHandler = (event) => handleSvgPointerDown(event, svg, handlers);
    handlers.down = downHandler;
    if (HAS_POINTER_EVENTS) {
      svg.addEventListener('pointerdown', downHandler);
    } else {
      svg.addEventListener('mousedown', downHandler);
      svg.addEventListener('touchstart', downHandler, { passive: false });
    }
    // Wheel-to-semitone adjustment (active selection required)
    const wheelHandler = (event) => handleVexflowWheel(event, svg);
    handlers.wheel = wheelHandler;
    svg.addEventListener('wheel', wheelHandler, { passive: false });
    svg.__vexflowInteraction = handlers;
  } else {
    svg.__vexflowInteraction.baseMessage = baseMessage;
  }
}

function normalizePointerEvent(event) {
  if (!event) return null;
  if (event.touches && event.touches.length > 0) {
    return event.touches[0];
  }
  if (event.changedTouches && event.changedTouches.length > 0) {
    return event.changedTouches[0];
  }
  return event;
}

function convertToSvgCoords(pointerEvent, svg) {
  if (!pointerEvent || !svg || typeof svg.createSVGPoint !== 'function') return null;
  const point = svg.createSVGPoint();
  const clientX = pointerEvent.clientX ?? pointerEvent.pageX;
  const clientY = pointerEvent.clientY ?? pointerEvent.pageY;
  if (clientX == null || clientY == null) return null;
  point.x = clientX;
  point.y = clientY;
  const screenCTM = svg.getScreenCTM?.();
  if (!screenCTM) return null;
  const inverse = screenCTM.inverse?.();
  if (!inverse) return null;
  const transformed = point.matrixTransform(inverse);
  return { x: transformed.x, y: transformed.y };
}

function handleSvgPointerDown(event, svg, handlers) {
  if (!svg || !handlers) return;
  console.log('[VexflowInteraction] pointerdown', {
    type: event.type,
    targetTag: event.target?.tagName,
    targetClass: event.target?.className?.baseVal || event.target?.className,
    pointerId: event.pointerId,
  });
  const primary = normalizePointerEvent(event);
  const directIndex = selectableRegistry.indexFromTarget(event.target);
  let selectable = directIndex >= 0 ? selectableRegistry.get(directIndex) : null;
  console.log('[VexflowInteraction] directIndex', directIndex);
  if (!selectable) {
    const coords = convertToSvgCoords(primary, svg);
    console.log('[VexflowInteraction] coords', coords);
  if (!coords) return;
    selectable = selectableRegistry.findClosest(coords.x, coords.y);
  }
  console.log('[VexflowInteraction] resolved', selectable?.index);
  if (!selectable) return;

  event.preventDefault();
  event.stopPropagation();

  const baseMessage = handlers.baseMessage;
  selectVexflowNote({
    note: selectable.note,
    noteEl: selectable.noteEl,
    baseMessage,
  });
  beginVexflowDrag(event, selectable.note, selectable.noteEl, svg, selectable.voiceIndex, selectable.noteIndex);
}

function handleVexflowWheel(event, svg) {
  // Only respond to wheel when a note is currently selected.
  if (!selectionState.note) return;
  // Wheel up raises, wheel down lowers (match ABCJS behavior).
  const delta = event.deltaY < 0 ? +1 : -1;
  if (delta !== 0) {
    if (event.cancelable) event.preventDefault();
    commitVexflowWheelDelta(delta);
  }
}


function clearSelectedNote(baseMessage) {
  if (selectionState.drag) {
    detachVexflowDragListeners();
    selectionState.drag = null;
  }
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
    vexflowStatus.textContent = baseMessage;
  }
}

function selectVexflowNote({ note, noteEl, baseMessage }) {
  clearSelectedNote();
  selectionState.note = note;
  selectionState.noteEl = noteEl || null;
  console.log('[VexflowSelection] select', {
    noteElTag: noteEl?.tagName,
    classes: noteEl?.className?.baseVal || noteEl?.className,
    baseMessage,
  });
  if (noteEl) {
    noteEl.classList.add('vf-note-selected');
  }
  selectionState.baseTransform = noteEl?.getAttribute('transform') || '';
  if (noteEl) {
    const headNodes = collectNoteheadNodes(noteEl);
    headNodes.forEach((node) => node.classList.add('vf-notehead-selected'));
    selectionState.headNodes = headNodes;
  }
  if (baseMessage) {
    selectionState.messageBase = baseMessage;
  }
  const base = selectionState.messageBase || '';
  const description = describeSpec(note?.__smuflSpec);
  vexflowStatus.textContent = description ? `${base} — Selected ${description}` : `${base} — Selected note`;
}

function describeSpec(spec) {
  if (!spec) return '';
  if (spec.isRest) return `rest (${spec.duration})`;
  const key = Array.isArray(spec.keys) ? spec.keys[0] : spec.keys;
  const accidental = Array.isArray(spec.accidentals) ? spec.accidentals[0] : null;
  const midi = Array.isArray(spec.midis) ? spec.midis[0] : keyToMidi(key, accidental);
  const derived = midiToKeySpec(midi);
  const label = formatPitchLabel(derived);
  const duration = spec.duration || '';
  return duration ? `${label} (${duration})` : label;
}

function beginVexflowDrag(event, note, noteEl, pointerTarget, voiceIndex, noteIndex) {
  const spec = note?.__smuflSpec;
  if (!noteEl || !spec) return;
  const point = event.touches && event.touches[0] ? event.touches[0] : event;
  if (!point || point.clientY == null) return;
  console.log('[VexflowDrag] begin', {
    pointerId: event.pointerId,
    clientY: point.clientY,
    voiceIndex,
    noteIndex,
  });
  const stave = note.getStave();
  const staffSpacing = stave?.getSpacingBetweenLines() ?? 12;
  const staffStep = staffSpacing / 2;
  const pxPerSemitone = Math.max(2, staffStep * 0.6);
  const accidentals = Array.isArray(spec.accidentals) ? spec.accidentals : [];
  const baseMidi = Array.isArray(spec.midis) && spec.midis.length > 0
    ? spec.midis[0]
    : keyToMidi(spec.keys?.[0], accidentals[0]);
  const [baseLetterRaw = 'c', baseOctaveRaw = '4'] = (spec.keys?.[0] || 'c/4').split('/');
  const baseOctave = parseInt(baseOctaveRaw, 10);
  const baseDiatonic = diatonicIndexForLetter(baseLetterRaw, Number.isNaN(baseOctave) ? 4 : baseOctave);
  selectionState.drag = {
    pointerId: event.pointerId ?? null,
    lastY: point.clientY,
    accum: 0,
    pxPerSemitone,
    baseMidi,
    baseDiatonic,
    staffStep,
    note,
    noteEl,
    pointerTarget,
    voiceIndex,
    noteIndex,
    baseTransform: selectionState.baseTransform,
    previewDelta: 0,
    baseMessage: selectionState.messageBase,
    theme: getStaffTheme(),
    clef: (spec.clef || note.clef || 'treble'),
    svgRoot: (pointerTarget && pointerTarget.ownerSVGElement) ? pointerTarget.ownerSVGElement : pointerTarget,
    hiddenTextNodes: null,
    previewAccEl: null,
    ledgerNodes: null,
  };
  // Immediately hide any existing accidental so preview overlays don't double up.
  try { ensureOriginalAccidentalsHidden(selectionState.drag); } catch (_e) { /* ignore */ }
  attachVexflowDragListeners();
  if (pointerTarget && selectionState.drag.pointerId != null && pointerTarget.setPointerCapture) {
    try { pointerTarget.setPointerCapture(selectionState.drag.pointerId); } catch (_err) { /* ignore */ }
  }
}

function attachVexflowDragListeners() {
  if (HAS_POINTER_EVENTS) {
    window.addEventListener('pointermove', handleVexflowPointerMove, { passive: false });
    window.addEventListener('pointerup', handleVexflowPointerUp, { passive: true });
    window.addEventListener('pointercancel', handleVexflowPointerUp, { passive: true });
  } else {
    window.addEventListener('touchmove', handleVexflowPointerMove, { passive: false });
    window.addEventListener('touchend', handleVexflowPointerUp, { passive: true });
    window.addEventListener('touchcancel', handleVexflowPointerUp, { passive: true });
    window.addEventListener('mousemove', handleVexflowPointerMove, { passive: false });
    window.addEventListener('mouseup', handleVexflowPointerUp, { passive: true });
  }
}

function detachVexflowDragListeners() {
  if (HAS_POINTER_EVENTS) {
    window.removeEventListener('pointermove', handleVexflowPointerMove, { passive: false });
    window.removeEventListener('pointerup', handleVexflowPointerUp, { passive: true });
    window.removeEventListener('pointercancel', handleVexflowPointerUp, { passive: true });
  } else {
    window.removeEventListener('touchmove', handleVexflowPointerMove, { passive: false });
    window.removeEventListener('touchend', handleVexflowPointerUp, { passive: true });
    window.removeEventListener('touchcancel', handleVexflowPointerUp, { passive: true });
    window.removeEventListener('mousemove', handleVexflowPointerMove, { passive: false });
    window.removeEventListener('mouseup', handleVexflowPointerUp, { passive: true });
  }
}

// --- Key / accidental formatting helpers ---
function formatPitchLabel({ key, accidental }) {
  if (!key) return '';
  const [letterRaw, octaveRaw] = key.split('/');
  const letter = (letterRaw || '').toUpperCase();
  const octave = octaveRaw ?? '';
  const glyph = accidentalToGlyph(accidental);
  return `${letter}${glyph}${octave}`;
}

function accidentalToGlyph(accidental) {
  switch (accidental) {
    case 'b': return '♭';
    case '#': return '♯';
    case 'n': return '♮';
    case 'bb': return '♭♭';
    case '##': return '♯♯';
    default: return '';
  }
}

// Extract a simple canonical key signature token from ABC text (e.g., C, G, Bb, Eb).
function extractKeySignatureFromAbc(abc) {
  if (!abc || typeof abc !== 'string') return 'C';
  const re = /(^|\n)K:([^\n]*)/g;
  let match = null;
  let key = 'C';
  while ((match = re.exec(abc)) !== null) {
    const value = (match[2] || '').trim();
    if (value) key = value.split(/\s+/)[0];
  }
  const m = /^([A-Ga-g])(bb|b|##|#)?$/.exec(key);
  const root = (m && m[1]) ? m[1] : 'C';
  const acc = (m && m[2]) ? m[2] : '';
  const canonical = root.replace(/^[a-g]/, (c) => c.toUpperCase()) + acc;
  return KEY_SIGS[canonical] ? canonical : 'C';
}

// Decide which accidental symbol to show for a derived pitch, given a key signature.
function decideAccidentalForKey(derived, keySig) {
  if (!derived || !derived.key) return derived?.accidental || null;
  const [letterRaw] = derived.key.split('/');
  const letter = (letterRaw || 'c').toUpperCase();
  const baseMap = KEY_SIGS[keySig || 'C'] || {};
  const baseOffset = baseMap[letter] || 0; // -1 flat, +1 sharp, 0 natural
  const derivedOffset = ACCIDENTAL_OFFSETS[derived.accidental] ?? 0;
  if (derivedOffset === baseOffset) {
    // Matches the key signature: no courtesy accidental
    return null;
  }
  // If deviating to natural from a key-signature-altered pitch, show a courtesy natural.
  if (derivedOffset === 0 && baseOffset !== 0) return 'n';
  // Otherwise show the explicit accidental for the target pitch
  return derived.accidental || null;
}

// --- Preview accidental overlay & original-accidental hiding ---
function ensureOriginalAccidentalsHidden(drag) {
  if (!drag || drag.hiddenTextNodes || !drag.noteEl) return;
  const svgRoot = drag.svgRoot || drag.noteEl.ownerSVGElement;
  if (!svgRoot) return;

  const toHide = new Set();

  // 1) Fast path: known accidental classes (when present in some builds)
  drag.noteEl
    .querySelectorAll('[class*="accidental"], [data-name="accidental"], g.vf-accidental, path.vf-accidental, g.vf-accidental text, g[class*="accidental"] text, [data-name="accidental"] text, text.vf-accidental')
    .forEach((el) => {
      try { if (el.getBBox) toHide.add(el); } catch (_) { /* ignore */ }
    });

  // 2) Content-based detection (no geometry):
  //    Hide any text within a notehead group that uses SMuFL accidental codepoints
  //    (roughly U+E260–U+E4FF), or Unicode ♯/♭/♮/#/b/n. Do NOT hide augmentation dots (U+E1E7).
  const isAccidentalText = (text) => {
    if (!text) return false;
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      if (!cp) continue;
      if (cp === 0xe1e7) return false; // augmentation dot — keep
      if (cp >= 0xe260 && cp <= 0xe4ff) return true;
      if (ch === '♯' || ch === '♭' || ch === '♮' || ch === '#' || ch === 'b' || ch === 'n') return true;
    }
    return false;
  };
  drag.noteEl.querySelectorAll('g[class*="notehead"] text').forEach((txt) => {
    try {
      const content = txt.textContent || '';
      if (isAccidentalText(content)) toHide.add(txt);
    } catch (_) { /* ignore */ }
  });

  // 3) Fallback: plain text accidentals directly under the stavenote group
  //    (seen in some builds). This will not affect noteheads or flags.
  drag.noteEl.querySelectorAll(':scope > text').forEach((txt) => {
    try {
      const content = txt.textContent || '';
      if (isAccidentalText(content)) toHide.add(txt);
    } catch (_) { /* ignore */ }
  });

  if (toHide.size === 0) return;
  drag.hiddenTextNodes = [];
  toHide.forEach((node) => {
    const prev = node.style.display || '';
    node.style.display = 'none';
    drag.hiddenTextNodes.push({ node, prevDisplay: prev });
  });
}

function restoreOriginalAccidentals(drag) {
  if (!drag || !drag.hiddenTextNodes) return;
  drag.hiddenTextNodes.forEach(({ node, prevDisplay }) => {
    if (node) node.style.display = prevDisplay;
  });
  drag.hiddenTextNodes = null;
}

function toAbsBBox(el, svgRoot, localBBox) {
  if (!el || !svgRoot || !localBBox) return null;
  try {
    const elCTM = el.getScreenCTM?.();
    const rootCTM = svgRoot.getScreenCTM?.();
    if (!elCTM || !rootCTM || !rootCTM.inverse) return null;
    const toRoot = elCTM.multiply(rootCTM.inverse());
    const p = svgRoot.createSVGPoint();
    const transformPoint = (x, y) => { p.x = x; p.y = y; const r = p.matrixTransform(toRoot); return { x: r.x, y: r.y }; };
    const p1 = transformPoint(localBBox.x, localBBox.y);
    const p2 = transformPoint(localBBox.x + localBBox.width, localBBox.y);
    const p3 = transformPoint(localBBox.x, localBBox.y + localBBox.height);
    const p4 = transformPoint(localBBox.x + localBBox.width, localBBox.y + localBBox.height);
    const minX = Math.min(p1.x, p2.x, p3.x, p4.x);
    const maxX = Math.max(p1.x, p2.x, p3.x, p4.x);
    const minY = Math.min(p1.y, p2.y, p3.y, p4.y);
    const maxY = Math.max(p1.y, p2.y, p3.y, p4.y);
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  } catch (_e) {
    return null;
  }
}

// --- Ledger line preview visibility ---
function staffRangeForClef(clef) {
  switch ((clef || 'treble').toLowerCase()) {
    case 'bass':
      return { bottom: { letter: 'g', octave: 2 }, top: { letter: 'a', octave: 3 } };
    case 'alto':
      return { bottom: { letter: 'f', octave: 3 }, top: { letter: 'g', octave: 4 } };
    case 'tenor':
      return { bottom: { letter: 'd', octave: 3 }, top: { letter: 'e', octave: 4 } };
    // default treble
    default:
      return { bottom: { letter: 'e', octave: 4 }, top: { letter: 'f', octave: 5 } };
  }
}

function previewNeedsLedger(diatonicIndex, clef) {
  const { bottom, top } = staffRangeForClef(clef);
  const b = diatonicIndexForLetter(bottom.letter, bottom.octave);
  const t = diatonicIndexForLetter(top.letter, top.octave);
  if (diatonicIndex < b) return (diatonicIndex % 2) === (b % 2);
  if (diatonicIndex > t) return (diatonicIndex % 2) === (t % 2);
  return false;
}

function collectLedgerLineNodes(noteEl) {
  if (!noteEl) return [];
  const nodes = [];
  // Heuristic: ledger lines are horizontal stroke paths drawn before noteheads
  // inside the stavenote group. Pick <path> children that look like one straight
  // horizontal segment (M x y L x2 y).
  const children = Array.from(noteEl.querySelectorAll(':scope > path'));
  const horizPathRe = /M\s*([\-\d\.]+)[ ,]([\-\d\.]+)\s*L\s*([\-\d\.]+)[ ,]([\-\d\.]+)/i;
  children.forEach((p) => {
    const d = p.getAttribute('d') || '';
    const m = horizPathRe.exec(d);
    if (!m) return;
    const y1 = parseFloat(m[2]);
    const y2 = parseFloat(m[4]);
    if (!Number.isFinite(y1) || !Number.isFinite(y2)) return;
    if (Math.abs(y1 - y2) < 0.001) {
      nodes.push(p);
    }
  });
  return nodes;
}

function ensureLedgerNodesCached(drag) {
  if (!drag || drag.ledgerNodes) return;
  const noteEl = drag.noteEl;
  if (!noteEl) return;
  const nodes = collectLedgerLineNodes(noteEl);
  if (nodes.length > 0) {
    drag.ledgerNodes = nodes.map((node) => ({ node, prevDisplay: node.style.display || '' }));
  } else {
    drag.ledgerNodes = [];
  }
}

function setLedgerVisibility(drag, visible) {
  if (!drag) return;
  ensureLedgerNodesCached(drag);
  if (!drag.ledgerNodes) return;
  drag.ledgerNodes.forEach((entry) => {
    const { node, prevDisplay } = entry;
    if (!node) return;
    if (visible) {
      node.style.display = prevDisplay;
    } else {
      node.style.display = 'none';
    }
  });
}

function restoreLedgerVisibility(drag) {
  if (!drag || !drag.ledgerNodes) return;
  drag.ledgerNodes.forEach((entry) => {
    const { node, prevDisplay } = entry;
    if (node) node.style.display = prevDisplay;
  });
  drag.ledgerNodes = null;
}

function getHeadBBoxAbs(noteEl, svgRoot) {
  const heads = collectNoteheadNodes(noteEl) || [];
  let union = null;
  heads.forEach((h) => {
    let b = null; try { b = h.getBBox(); } catch (_) { b = null; }
    if (!b) return;
    const abs = toAbsBBox(h, svgRoot, b);
    if (!abs) return;
    if (!union) union = abs; else {
      const ux = Math.min(union.x, abs.x);
      const uy = Math.min(union.y, abs.y);
      const ur = Math.max(union.x + union.width, abs.x + abs.width);
      const ub = Math.max(union.y + union.height, abs.y + abs.height);
      union = { x: ux, y: uy, width: ur - ux, height: ub - uy };
    }
  });
  return union;
}

// Render a temporary accidental using VexFlow so font/color match.
function drawVexflowPreviewAccidental(drag, symbol) {
  if (!drag) return;
  // Remove previous preview first
  removeVexflowPreviewAccidental(drag);
  if (!symbol) return;
  const note = drag.note;
  const ctx = note?.getContext?.();
  if (!note || !ctx || typeof Accidental !== 'function') return;
  let translateY = 0;
  if (drag.previewKey && Number.isFinite(drag.previewKey.diatonicIndex)) {
    translateY = -(drag.previewKey.diatonicIndex - drag.baseDiatonic) * drag.staffStep;
  }
  const group = ctx.openGroup?.('preview-accidental') || null;
  try {
    const acc = new Accidental(symbol);
    acc.setNote(note);
    acc.setIndex(0);
    acc.setContext(ctx);
    if (Number.isFinite(translateY)) acc.setYShift(translateY);
    acc.drawWithStyle?.();
  } catch (_e) { /* ignore */ }
  if (ctx.closeGroup) ctx.closeGroup();
  drag.previewAccGroup = group;
}

function removeVexflowPreviewAccidental(drag) {
  if (!drag || !drag.previewAccGroup) return;
  const g = drag.previewAccGroup;
  if (g && g.parentNode) g.parentNode.removeChild(g);
  drag.previewAccGroup = null;
}

// --- Drag handlers ---
function handleVexflowPointerMove(event) {
  const drag = selectionState.drag;
  if (!drag) return;
  const primary = normalizePointerEvent(event);
  if (event?.cancelable) event.preventDefault();
  if (!primary || primary.clientY == null) return;
  const dy = drag.lastY - primary.clientY; // up is negative Y on screen => positive semitone delta
  drag.lastY = primary.clientY;
  drag.accum += dy;
  const step = drag.pxPerSemitone;
  let semitones = 0;
  while (Math.abs(drag.accum) >= step) {
    semitones += (drag.accum > 0) ? 1 : -1;
    drag.accum -= (drag.accum > 0) ? step : -step;
  }
  if (semitones !== 0) drag.previewDelta += semitones;
  const previewMidi = drag.baseMidi + drag.previewDelta;
  const previewKey = midiToKeySpec(previewMidi);
  drag.previewKey = previewKey;

  // Move the notehead visually with a transform (diatonic grid), and preview accidental.
  const diffSteps = previewKey.diatonicIndex - drag.baseDiatonic;
  const translateY = -(diffSteps * drag.staffStep);
  try {
    const base = drag.baseTransform && drag.baseTransform !== '' ? `${drag.baseTransform} ` : '';
    drag.noteEl.setAttribute('transform', `${base}translate(0, ${translateY.toFixed(2)})`);
  } catch (_e) { /* ignore */ }

  ensureOriginalAccidentalsHidden(drag);
  // Show or hide ledger lines based on whether preview position is outside the staff.
  try {
    const needLedger = previewNeedsLedger(previewKey.diatonicIndex, drag.clef);
    setLedgerVisibility(drag, needLedger);
  } catch (_e) { /* ignore */ }
  const symbol = decideAccidentalForKey(previewKey, renderState.keySig);
  drawVexflowPreviewAccidental(drag, symbol);
  const label = formatPitchLabel(previewKey);
  const base = drag.baseMessage || '';
  vexflowStatus.textContent = `${base} — Dragging to ${label}`;
}

function handleVexflowPointerUp(event) {
  const drag = selectionState.drag;
  if (!drag) return;
  try {
    if (drag.pointerTarget && drag.pointerId != null && drag.pointerTarget.releasePointerCapture) {
      drag.pointerTarget.releasePointerCapture(drag.pointerId);
    }
  } catch (_e) { /* ignore */ }
  detachVexflowDragListeners();
  // Clean up preview and restore original accidental visibility
  try { removeVexflowPreviewAccidental(drag); } catch (_e) { /* ignore */ }
  try { restoreOriginalAccidentals(drag); } catch (_e) { /* ignore */ }
  try { restoreLedgerVisibility(drag); } catch (_e) { /* ignore */ }
  const delta = drag.previewDelta || 0;
  commitVexflowNoteDelta(drag, delta);
}

// --- Commit helpers ---
function commitVexflowNoteDelta(drag, delta) {
  const voice = renderState.voices?.[drag.voiceIndex];
  if (!voice) { renderVexflowStaff().catch(handleRenderFailure); return; }
  const spec = voice.noteSpecs?.[drag.noteIndex];
  if (!spec || spec.isRest) { renderVexflowStaff().catch(handleRenderFailure); return; }
  const targetMidi = drag.baseMidi + (delta || 0);
  const derived = midiToKeySpec(targetMidi);
  const accidentalSymbol = decideAccidentalForKey(derived, renderState.keySig);
  spec.keys = [derived.key];
  spec.accidentals = [accidentalSymbol];
  spec.midis = [targetMidi];
  selectionState.drag = null;
  clearSelectedNote(selectionState.messageBase);
  renderVexflowStaff().catch(handleRenderFailure);
}

// Commit a semitone delta for the currently selected note (wheel support).
function commitVexflowWheelDelta(delta) {
  const note = selectionState.note;
  if (!note) return;
  const voiceIndex = note.__voiceIndex;
  const noteIndex = note.__noteIndex;
  const voice = renderState.voices?.[voiceIndex];
  if (!voice) return;
  const spec = voice.noteSpecs?.[noteIndex];
  if (!spec || spec.isRest) return;
  const accidentals = Array.isArray(spec.accidentals) ? spec.accidentals : [];
  const baseMidi = Array.isArray(spec.midis) && spec.midis.length > 0
    ? spec.midis[0]
    : keyToMidi(spec.keys?.[0], accidentals[0]);
  const targetMidi = baseMidi + delta;
  const derived = midiToKeySpec(targetMidi);
  const accidentalSymbol = decideAccidentalForKey(derived, renderState.keySig);
  spec.keys = [derived.key];
  spec.accidentals = [accidentalSymbol];
  spec.midis = [targetMidi];
  clearSelectedNote(selectionState.messageBase);
  renderVexflowStaff().catch(handleRenderFailure);
}
