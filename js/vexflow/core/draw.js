import VexFlow, {
  Renderer,
  Stave,
  Voice,
  Formatter,
} from '/staff/vendor/lib/vexflow-esm/entry/vexflow-debug.js';
import { logStructured, parsePositiveNumber, normalizeDomRect } from '/js/shared/utils.js';
import { calculateDefaultStaffPadding } from './config.js';
import { buildLedgerStyle, createVexflowNote } from './noteFactory.js';

export function computeDimensions(container, staffScale, renderState) {
  const configuredMinWidth = parsePositiveNumber(renderState?.minWidth);
  const configuredMaxWidth = parsePositiveNumber(renderState?.maxWidth);
  const configuredTargetWidth = parsePositiveNumber(renderState?.targetWidth);
  const configuredBaseHeight = parsePositiveNumber(renderState?.baseHeight);

  const minWidth = configuredMinWidth ?? 480;
  const targetWidth = configuredTargetWidth ?? null;
  const measuredWidth = container.clientWidth ? (container.clientWidth / staffScale) : 0;
  const parentWidth = container.parentElement?.clientWidth
    ? (container.parentElement.clientWidth / staffScale)
    : 0;
  const widthCandidate = targetWidth || measuredWidth || parentWidth || minWidth || 720;
  let baseWidth = widthCandidate;
  if (configuredMaxWidth) {
    baseWidth = Math.min(baseWidth, configuredMaxWidth);
  }
  baseWidth = Math.max(minWidth, baseWidth);
  const baseHeight = configuredBaseHeight ?? 200;
  const scaledWidth = Math.round(baseWidth * staffScale);
  const scaledHeight = Math.round(baseHeight * staffScale);
  if (renderState) {
    renderState.computedWidth = baseWidth;
    renderState.computedHeight = baseHeight;
  }
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
    const rawSvgRect = (context.svg && typeof context.svg.getBoundingClientRect === 'function')
      ? context.svg.getBoundingClientRect()
      : null;
    const svgRect = normalizeDomRect(rawSvgRect);
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
  applyTheme,
}) {
  const { baseWidth, baseHeight, scaledWidth, scaledHeight } = computeDimensions(container, staffScale, renderState);
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
    context.svg.removeAttribute('width');
    context.svg.removeAttribute('height');
    context.svg.style.width = '100%';
    context.svg.style.height = 'auto';
    context.svg.style.display = 'block';
  }

  const { horizontal: horizontalPadding, vertical: verticalPadding } = calculateDefaultStaffPadding(
    baseWidth,
    baseHeight,
  );
  const staveWidth = Math.max(0, baseWidth - horizontalPadding * 2);
  const spaceAboveStaffLn = Math.max(0, renderState?.spaceAboveStaffLn ?? 1.3);
  const spaceBelowStaffLn = Math.max(0, renderState?.spaceBelowStaffLn ?? 0.7);
  const stave = new Stave(horizontalPadding, verticalPadding, staveWidth, {
    spaceAboveStaffLn,
    spaceBelowStaffLn,
  });
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

  console.debug('[VexflowDraw] incoming voices', voices);

  const vexflowVoices = voices.map((voice, voiceIndex) => {
    const tickables = voice.noteSpecs.map((spec, noteIndex) => {
      const note = createVexflowNote(spec, theme);
      if (spec?.style && typeof note.setStyle === 'function') {
        const fill = spec.style.fillStyle ?? spec.style.fill ?? null;
        const stroke = spec.style.strokeStyle ?? spec.style.stroke ?? fill ?? null;
        note.setStyle({
          fillStyle: fill ?? stroke ?? undefined,
          strokeStyle: stroke ?? fill ?? undefined,
        });
      }
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

  const playableVoices = vexflowVoices.filter((voice) => {
    if (typeof voice.getTickables !== 'function') return false;
    const tickables = voice.getTickables();
    return Array.isArray(tickables) && tickables.length > 0;
  });

  let drawnVoices = playableVoices;

  if (playableVoices.length > 0) {
    try {
      const formatter = new Formatter({ align_rests: true });
      formatter.joinVoices(playableVoices);
      formatter.format(playableVoices, baseWidth - 96);

      playableVoices.forEach((voice) => voice.draw(context, stave));

      playableVoices.forEach((voice, voiceIndex) => {
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
    } catch (error) {
      console.warn('[VexflowDraw] unable to format voices', error);
      drawnVoices = [];
    }
  }

  const totalElements = voices.reduce((sum, voice) => sum + voice.noteSpecs.length, 0);
  const warningSuffix = warnings.length ? ` — ${warnings.length} warning${warnings.length === 1 ? '' : 's'} (see console)` : '';
  const fontSuffix = fontChoice?.label ? ` using ${fontChoice.label}` : '';
  const keySuffix = keySig ? ` Key: ${keySig}.` : '';
  const baseMessage = `VexFlow rendered ${totalElements} element${totalElements === 1 ? '' : 's'} across ${voices.length} voice${voices.length === 1 ? '' : 's'}${fontSuffix}.${warningSuffix}${keySuffix}`;

  if (typeof applyTheme === 'function') {
    applyTheme(container, theme);
  }

  if (typeof registerInteractions === 'function') {
    registerInteractions({
      context,
      voices: drawnVoices,
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
