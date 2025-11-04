import VexFlow, {
  Renderer,
  Stave,
  StaveNote,
  Voice,
  Formatter,
  Accidental,
} from './lib/vexflow-esm/entry/vexflow-debug.js';

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

// Patch VexFlow ledger line rendering to enforce themed thickness and rounded caps.
let __LEDGER_PATCHED__ = false;
function ensureLedgerLineRendering(theme) {
  if (__LEDGER_PATCHED__) return;
  try {
    const original = StaveNote.prototype.drawLedgerLines;
    if (typeof original !== 'function') return;
    StaveNote.prototype.drawLedgerLines = function patchedDrawLedgerLines() {
      try {
        // Ensure each note has a ledger style with the themed lineWidth.
        if (theme && Number.isFinite(theme.ledgerWidth) && theme.ledgerWidth > 0) {
          const cur = (typeof this.getLedgerLineStyle === 'function') ? (this.getLedgerLineStyle() || {}) : {};
          if (cur.lineWidth !== theme.ledgerWidth) {
            if (typeof this.setLedgerLineStyle === 'function') {
              this.setLedgerLineStyle(Object.assign({}, cur, { lineWidth: theme.ledgerWidth }));
            }
          }
        }
        const ctx = this.checkContext();
        ctx.save?.();
        // Round caps look closer to ABCJS styling and avoid “spiky” ends.
        if (typeof ctx.setLineCap === 'function') ctx.setLineCap('round');
        // Delegate to original which applies strokeStyle/fillStyle/lineWidth as needed.
        const result = original.call(this);
        ctx.restore?.();
        return result;
      } catch (e) {
        return original.call(this);
      }
    };
    __LEDGER_PATCHED__ = true;
  } catch (_err) {
    // no-op
  }
}

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

function getStaffTheme() {
  if (typeof window === 'undefined' || !window.getComputedStyle) {
    return {
      stroke: '#f5f5f5',
      fill: '#f5f5f5',
      ledger: '#f5f5f5',
      ledgerWidth: 6,
    };
  }
  const rootStyle = getComputedStyle(document.documentElement);
  const read = (varName, fallback) => {
    const value = rootStyle.getPropertyValue(varName);
    return value ? value.trim() || fallback : fallback;
  };
  const stroke = read('--staff-stroke-color', '#f5f5f5');
  const fill = read('--staff-fill-color', stroke);
  const ledger = read('--staff-ledger-color', stroke);
  const ledgerWidthRaw = read('--staff-ledger-thickness', '6');
  const ledgerWidth = Number.parseFloat(ledgerWidthRaw) || 6;
  return { stroke, fill, ledger, ledgerWidth };
}

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
  // Ensure ledger lines draw with themed thickness and rounded caps.
  ensureLedgerLineRendering(theme);

  const width = Math.max(480, vexflowContainer.clientWidth || vexflowContainer.parentElement?.clientWidth || 720);
  const height = 200;

  vexflowContainer.innerHTML = '';

  const renderer = new Renderer(vexflowContainer, Renderer.Backends.SVG);
  renderer.resize(width, height);
  const context = renderer.getContext();
  context.setBackgroundFillStyle('transparent');
  context.setFillStyle(theme.fill);
  context.setStrokeStyle(theme.stroke);

  const stave = new Stave(24, 36, width - 48);
  const primaryClef = voices[0]?.clef || 'treble';
  stave.addClef(primaryClef);
  const timeLabel = meter.symbol || formatMeter(meter);
  if (timeLabel) {
    stave.addTimeSignature(timeLabel);
  }
  const ledgerStyle = {
    strokeStyle: theme.ledger,
    fillStyle: theme.ledger,
  };
  if (Number.isFinite(theme.ledgerWidth) && theme.ledgerWidth > 0) {
    ledgerStyle.lineWidth = theme.ledgerWidth;
  }
  stave.setDefaultLedgerLineStyle(ledgerStyle);
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
  const ledgerLines = svg.querySelectorAll('[class*="ledgerline"]');
  ledgerLines.forEach((node) => {
    if (!node) return;
    node.setAttribute('stroke', colors.ledger);
    node.setAttribute('stroke-opacity', '1');
    if (colors.ledgerWidth) {
      node.setAttribute('stroke-width', String(colors.ledgerWidth));
      node.setAttribute('stroke-linecap', 'round');
      if (node.style) {
        node.style.strokeWidth = `${colors.ledgerWidth}px`;
        node.style.strokeLinecap = 'round';
      }
    }
    if (node.getAttribute('fill') && node.getAttribute('fill') !== 'none') {
      node.setAttribute('fill', colors.ledger);
      node.setAttribute('fill-opacity', '1');
    }
    if (node.style) {
      node.style.stroke = colors.ledger;
      node.style.strokeOpacity = '1';
      if (node.style.fill && node.style.fill !== 'none') {
        node.style.fill = colors.ledger;
        node.style.fillOpacity = '1';
      }
    }
  });
  svg.querySelectorAll('[stroke]').forEach((node) => {
    const stroke = node.getAttribute('stroke');
    if (!stroke || /^#0{3,6}$/i.test(stroke) || stroke.toLowerCase() === 'black') {
      node.setAttribute('stroke', colors.stroke);
    }
  });
  svg.querySelectorAll('[fill]').forEach((node) => {
    const fill = node.getAttribute('fill');
    if (!fill || /^#0{3,6}$/i.test(fill) || fill.toLowerCase() === 'black') {
      if (fill !== 'none') {
        node.setAttribute('fill', colors.fill);
      }
    }
  });
  if (svg.style) {
    svg.style.color = colors.stroke;
  }
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
  };
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
    window.removeEventListener('pointermove', handleVexflowPointerMove);
    window.removeEventListener('pointerup', handleVexflowPointerUp);
    window.removeEventListener('pointercancel', handleVexflowPointerUp);
  } else {
    window.removeEventListener('touchmove', handleVexflowPointerMove);
    window.removeEventListener('touchend', handleVexflowPointerUp);
    window.removeEventListener('touchcancel', handleVexflowPointerUp);
    window.removeEventListener('mousemove', handleVexflowPointerMove);
    window.removeEventListener('mouseup', handleVexflowPointerUp);
  }
}

function handleVexflowPointerMove(event) {
  const drag = selectionState.drag;
  if (!drag) return;
  if (event.pointerId != null && drag.pointerId != null && event.pointerId !== drag.pointerId) return;
  const point = event.touches && event.touches[0] ? event.touches[0] : event;
  if (!point || point.clientY == null) return;
  const dy = drag.lastY - point.clientY;
  drag.lastY = point.clientY;
  drag.accum += dy;
  const preview = Math.round(drag.accum / drag.pxPerSemitone);
  console.log('[VexflowDrag] move', {
    pointerId: event.pointerId,
    clientY: point.clientY,
    dy,
    accum: drag.accum,
    preview,
  });
  if (preview !== drag.previewDelta) {
    drag.previewDelta = preview;
    previewVexflowNote(drag, preview);
  }
  if (event.cancelable) {
    event.preventDefault();
  }
}

function handleVexflowPointerUp(event) {
  const drag = selectionState.drag;
  if (!drag) return;
  if (event.pointerId != null && drag.pointerId != null && event.pointerId !== drag.pointerId) return;
  console.log('[VexflowDrag] end', {
    pointerId: event.pointerId,
    previewDelta: drag.previewDelta,
  });
  detachVexflowDragListeners();
  if (drag.pointerTarget && drag.pointerId != null && typeof drag.pointerTarget.releasePointerCapture === 'function') {
    try { drag.pointerTarget.releasePointerCapture(drag.pointerId); } catch (_err) { /* ignore */ }
  }
  const delta = drag.previewDelta || 0;
  if (delta !== 0) {
    commitVexflowNoteDelta(drag, delta);
  } else if (drag.noteEl) {
    if (drag.baseTransform && drag.baseTransform !== '') {
      drag.noteEl.setAttribute('transform', drag.baseTransform);
    } else {
      drag.noteEl.removeAttribute('transform');
    }
    updateStatusPreview(drag, 0);
  }
  selectionState.drag = null;
}

function previewVexflowNote(drag, preview) {
  const noteEl = drag.noteEl;
  if (!noteEl) return;
  if (preview === 0) {
    if (drag.baseTransform && drag.baseTransform !== '') {
      noteEl.setAttribute('transform', drag.baseTransform);
    } else {
      noteEl.removeAttribute('transform');
    }
    updateStatusPreview(drag, 0);
    return;
  }
  const targetMidi = drag.baseMidi + preview;
  const derived = midiToKeySpec(targetMidi);
  const diatonicDelta = derived.diatonicIndex - drag.baseDiatonic;
  const translateY = -(diatonicDelta * drag.staffStep);
  const translate = `translate(0, ${translateY})`;
  const combined = drag.baseTransform && drag.baseTransform !== '' ? `${translate} ${drag.baseTransform}` : translate;
  noteEl.setAttribute('transform', combined);
  drag.previewKey = derived;
  updateStatusPreview(drag, preview, derived);
}

function updateStatusPreview(drag, preview, derived) {
  const baseMessage = drag.baseMessage || selectionState.messageBase || '';
  const prefix = baseMessage ? `${baseMessage} — ` : '';
  const spec = selectionState.note?.__smuflSpec;
  const baseDescription = describeSpec(spec);
  if (preview === 0) {
    const message = baseDescription ? `Selected ${baseDescription}` : 'Selected note';
    vexflowStatus.textContent = `${prefix}${message}`;
    return;
  }
  const target = derived || midiToKeySpec(drag.baseMidi + preview);
  const targetLabel = formatPitchLabel(target);
  const suffix = baseDescription ? `${baseDescription} → ${targetLabel}` : `note → ${targetLabel}`;
  vexflowStatus.textContent = `${prefix}Selected ${suffix}`;
}

function commitVexflowNoteDelta(drag, delta) {
  const voice = renderState.voices?.[drag.voiceIndex];
  if (!voice) {
    renderVexflowStaff().catch(handleRenderFailure);
    return;
  }
  const spec = voice.noteSpecs?.[drag.noteIndex];
  if (!spec || spec.isRest) {
    renderVexflowStaff().catch(handleRenderFailure);
    return;
  }
  const targetMidi = drag.baseMidi + delta;
  const derived = midiToKeySpec(targetMidi);
  const accidentalSymbol = derived.accidental ? derived.accidental : null;
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
  const accidentalSymbol = derived.accidental ? derived.accidental : null;
  spec.keys = [derived.key];
  spec.accidentals = [accidentalSymbol];
  spec.midis = [targetMidi];
  clearSelectedNote(selectionState.messageBase);
  renderVexflowStaff().catch(handleRenderFailure);
}

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
