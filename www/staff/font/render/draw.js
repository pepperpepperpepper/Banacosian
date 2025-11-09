import VexFlow, {
  Renderer,
  Stave,
  Voice,
  Formatter,
} from '../vendor/lib/vexflow-esm/entry/vexflow-debug.js';
import { logStructured } from '../utils/log.js';
import { buildLedgerStyle, createVexflowNote } from '../render/note-factory.js';
import { applyVexflowTheme } from './theme.js';

export function computeDimensions(container, staffScale) {
  const measuredWidth = container.clientWidth ? (container.clientWidth / staffScale) : 0;
  const parentWidth = container.parentElement?.clientWidth || 0;
  const widthCandidate = measuredWidth || parentWidth || 720;
  const baseWidth = Math.max(480, widthCandidate);
  const baseHeight = 200;
  const scaledWidth = Math.round(baseWidth * staffScale);
  const scaledHeight = Math.round(baseHeight * staffScale);
  return {
    baseWidth,
    baseHeight,
    scaledWidth,
    scaledHeight,
  };
}

export function cacheStaffMetrics({ context, stave, baseWidth, staffScale, renderState }) {
  try {
    const tables = VexFlow?.Tables;
    const clefProps = tables?.clefProperties ? tables.clefProperties(renderState.primaryClef) : null;
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
      clef: renderState.primaryClef,
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
}

export function drawStaff({
  container,
  theme,
  staffScale,
  voices,
  meter,
  keySig,
  fontChoice,
  renderState,
  warnings,
  registerInteractions,
}) {
  const { baseWidth, baseHeight, scaledWidth, scaledHeight } = computeDimensions(container, staffScale);
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
  renderState.primaryClef = primaryClef;
  stave.addClef(primaryClef);
  if (keySig) {
    try { stave.addKeySignature(keySig); } catch (_err) { /* ignore */ }
  }
  const ledgerStyle = buildLedgerStyle(theme);
  if (ledgerStyle) {
    stave.setDefaultLedgerLineStyle(ledgerStyle);
  }
  stave.setContext(context).draw();

  cacheStaffMetrics({ context, stave, baseWidth, staffScale, renderState });

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
  const keySuffix = keySig ? ` Key: ${keySig}.` : '';
  const baseMessage = `VexFlow rendered ${totalElements} element${totalElements === 1 ? '' : 's'} across ${voices.length} voice${voices.length === 1 ? '' : 's'}${fontSuffix}.${warningSuffix}${keySuffix}`;

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
    vexflowVoices,
    baseMessage,
    warnings,
  };
}
