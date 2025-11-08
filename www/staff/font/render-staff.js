import VexFlow, {
  Renderer,
  Stave,
  StaveNote,
  Voice,
  Formatter,
  Accidental,
} from './vendor/lib/vexflow-esm/entry/vexflow-debug.js';
import { readTokens } from '/staff/theme/readTokens.js';
import { applyVexflowSvgTheme } from '/staff/theme/applySvgTheme.js';
import { parseAbcToVoices } from './score-parser.js';
import {
  extractKeySignatureFromAbc,
  keyToMidi,
} from './music-helpers.js';
import { INITIAL_NOTE_COUNT } from './staff-config.js';

let abcjsPromise = null;

const DEFAULT_STAFF_SCALE = 1.8;
const LOG_PRECISION = 3;

function logStructured(label, data) {
  const replacer = (key, value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Number(value.toFixed(LOG_PRECISION));
    }
    return value;
  };
  try {
    console.log(`${label}: ${JSON.stringify(data, replacer)}`);
  } catch (error) {
    console.log(label, data);
  }
}

function getStaffTheme() {
  return readTokens();
}

function defaultAbc() {
  return `X:1
T:VexFlow Default
M:4/4
L:1/4
K:C
C D |]`;
}

function constrainSeedVoices(voices) {
  if (!Array.isArray(voices) || voices.length === 0) return;
  let remaining = INITIAL_NOTE_COUNT;
  logStructured('[VexflowRender] constrainSeedVoices start', {
    INITIAL_NOTE_COUNT,
    voiceCount: voices.length,
  });
  voices.forEach((voice, voiceIndex) => {
    if (!voice || !Array.isArray(voice.noteSpecs)) return;
    if (remaining <= 0) {
      logStructured('[VexflowRender] clearing voice specs', { voiceIndex });
      voice.noteSpecs = [];
      return;
    }
    const takeCount = Math.min(voice.noteSpecs.length, remaining);
    if (takeCount < voice.noteSpecs.length) {
      logStructured('[VexflowRender] trimming voice specs', {
        voiceIndex,
        before: voice.noteSpecs.length,
        after: takeCount,
      });
      voice.noteSpecs = voice.noteSpecs.slice(0, takeCount);
    }
    remaining -= takeCount;
  });
  logStructured('[VexflowRender] constrainSeedVoices complete', { remaining });
}

function applyVexflowTheme(container, palette) {
  if (!container) return;
  const svg = container.querySelector('svg');
  if (!svg) return;
  const colors = palette || getStaffTheme();
  applyVexflowSvgTheme(svg, colors);
}

function resolveSelectedFont(fontSelect, fontChoices) {
  if (!fontSelect) return fontChoices.bravura;
  const value = fontSelect.value;
  return fontChoices[value] || fontChoices.bravura;
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

function buildLedgerStyle(theme) {
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

function createVexflowNote(spec, theme) {
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

async function waitForAbcjs() {
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

export async function renderVexflowStaff({
  container,
  statusEl,
  fontSelect,
  fontChoices,
  statusEmptyText,
  renderState,
  selectionState,
  registerInteractions,
}) {
  if (!container || !statusEl) return null;

  statusEl.textContent = 'Rendering with VexFlow…';

  const defaultAbcString = defaultAbc();
  if (!renderState.initialized) {
    renderState.abc = defaultAbcString;
  } else if (!renderState.abc) {
    renderState.abc = defaultAbcString;
  }

  const keySig = extractKeySignatureFromAbc(renderState.abc);
  renderState.keySig = keySig;

  const abcjs = await waitForAbcjs();
  let voices;
  let meter;
  let warnings;

  if (!renderState.initialized) {
    const parsed = parseAbcToVoices(abcjs, renderState.abc);
    constrainSeedVoices(parsed.voices);
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
    container.innerHTML = '';
    statusEl.textContent = statusEmptyText;
    return null;
  }

  const fontChoice = resolveSelectedFont(fontSelect, fontChoices);
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
  const staffScaleOverride = Number.isFinite(renderState.staffScale) && renderState.staffScale > 0
    ? renderState.staffScale
    : null;
  const globalScaleOverride = (typeof window !== 'undefined' && Number.isFinite(window.__VEXFLOW_STAFF_SCALE))
    ? window.__VEXFLOW_STAFF_SCALE
    : null;
  const staffScale = staffScaleOverride || globalScaleOverride || DEFAULT_STAFF_SCALE;
  renderState.staffScale = staffScale;

  const measuredWidth = container.clientWidth ? (container.clientWidth / staffScale) : 0;
  const parentWidth = container.parentElement?.clientWidth || 0;
  const widthCandidate = measuredWidth || parentWidth || 720;
  const baseWidth = Math.max(480, widthCandidate);
  const baseHeight = 200;
  const scaledWidth = Math.round(baseWidth * staffScale);
  const scaledHeight = Math.round(baseHeight * staffScale);

  container.innerHTML = '';

  const renderer = new Renderer(container, Renderer.Backends.SVG);
  renderer.resize(scaledWidth, scaledHeight);
  const context = renderer.getContext();
  if (typeof context.scale === 'function') {
    context.scale(staffScale, staffScale);
  }
  context.setBackgroundFillStyle('transparent');
  if (theme.fill) context.setFillStyle(theme.fill);
  if (theme.stroke) context.setStrokeStyle(theme.stroke);

  if (context.svg) {
    context.svg.setAttribute('viewBox', `0 0 ${baseWidth} ${baseHeight}`);
  }

  const stave = new Stave(24, 36, baseWidth - 48);
  const primaryClef = voices[0]?.clef || 'treble';
  stave.addClef(primaryClef);
  if (keySig) {
    try { stave.addKeySignature(keySig); } catch (_err) { /* ignore */ }
  }
  const ledgerStyle = buildLedgerStyle(theme);
  if (ledgerStyle) {
    stave.setDefaultLedgerLineStyle(ledgerStyle);
  }
  stave.setContext(context).draw();

  try {
    const tables = VexFlow?.Tables;
    const clefProps = tables?.clefProperties ? tables.clefProperties(primaryClef) : null;
    let svgRect = null;
    if (context.svg?.getBoundingClientRect) {
      const rect = context.svg.getBoundingClientRect();
      if (rect) {
        svgRect = {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        };
      }
    }
    const baseTopY = stave.getYForLine?.(0) ?? 0;
    const baseBottomY = stave.getYForLine?.(4) ?? 0;
    const baseSpacing = stave.getSpacingBetweenLines?.() ?? 12;
    const baseXStart = stave.getX?.() ?? 0;
    const staveWidth = stave.getWidth?.() ?? (baseWidth - 48);
    const baseXEnd = baseXStart + staveWidth;
    renderState.staffMetrics = {
      clef: primaryClef,
      lineShift: clefProps?.lineShift ?? 0,
      topY: baseTopY,
      bottomY: baseBottomY,
      spacing: baseSpacing,
      xStart: baseXStart,
      xEnd: baseXEnd,
      scale: staffScale,
      staveY: typeof stave.getY === 'function' ? stave.getY() : null,
      scaled: {
        topY: baseTopY * staffScale,
        bottomY: baseBottomY * staffScale,
        spacing: baseSpacing * staffScale,
        xStart: baseXStart * staffScale,
        xEnd: baseXEnd * staffScale,
      },
    };
    renderState.activeStave = stave;
    renderState.svgRect = svgRect;
    logStructured('[VexflowRender] cached staff metrics', {
      staffMetrics: renderState.staffMetrics,
      svgRect,
    });
  } catch (error) {
    console.warn('[VexFlow Demo] Unable to cache staff metrics.', error);
    renderState.staffMetrics = null;
    renderState.activeStave = null;
    renderState.svgRect = null;
  }

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
  formatter.format(vexflowVoices, baseWidth - 96);

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

  if (selectionState) selectionState.messageBase = baseMessage;
  if (statusEl) statusEl.textContent = baseMessage;
  warnings.forEach((warning) => console.warn('[VexFlow Demo]', warning));

  applyVexflowTheme(container, theme);

  if (typeof registerInteractions === 'function') {
    registerInteractions({
      context,
      voices: vexflowVoices,
      baseMessage,
      scale: staffScale,
    });
  }

  return {
    context,
    voices: vexflowVoices,
    theme,
    baseMessage,
    warnings,
  };
}

export function clearAbcParserCache() {
  abcjsPromise = null;
}
