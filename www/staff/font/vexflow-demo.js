import VexFlow, {
  Renderer,
  Stave,
  StaveNote,
  Voice,
  Formatter,
  Accidental,
} from './lib/vexflow-esm/entry/vexflow-debug.js';

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

  const abcString = (typeof window !== 'undefined' && window.__SMUFL_SAMPLE_ABC) || defaultAbc();
  const abcjs = await waitForAbcjs();
  const { voices, meter, warnings } = parseAbcToVoices(abcjs, abcString);

  if (voices.length === 0) {
    vexflowContainer.innerHTML = '';
    vexflowStatus.textContent = STATUS_EMPTY;
    return;
  }

  const fontChoice = resolveSelectedFont();
  if (fontChoice?.warning) {
    warnings.push(fontChoice.warning);
  }
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

  const vexflowVoices = voices.map((voice) => {
    const tickables = voice.noteSpecs.map((spec) => createVexflowNote(spec, theme));
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

  const totalElements = voices.reduce((sum, voice) => sum + voice.noteSpecs.length, 0);
  const warningSuffix = warnings.length ? ` — ${warnings.length} warning${warnings.length === 1 ? '' : 's'} (see console)` : '';
  const fontSuffix = fontChoice?.label ? ` using ${fontChoice.label}` : '';
  vexflowStatus.textContent = `VexFlow rendered ${totalElements} element${totalElements === 1 ? '' : 's'} across ${voices.length} voice${voices.length === 1 ? '' : 's'}${fontSuffix}.${warningSuffix}`;

  warnings.forEach((warning) => console.warn('[VexFlow Demo]', warning));

  applyVexflowTheme(vexflowContainer, theme);
}

function createVexflowNote(spec, theme) {
  const isRest = spec.isRest === true;
  const noteStruct = {
    keys: isRest ? ['b/4'] : spec.keys,
    duration: `${spec.duration}${isRest ? 'r' : ''}`,
    clef: spec.clef || 'treble',
  };
  const note = new StaveNote(noteStruct);
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
    spec.accidentals.forEach((accidental, index) => {
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
  return {
    isRest: false,
    keys,
    accidentals,
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
