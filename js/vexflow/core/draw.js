import VexFlow, {
  Renderer,
  Stave,
  Voice,
  Formatter,
} from '/staff/vendor/lib/vexflow-esm/entry/vexflow-debug.js';
import { logStructured, parsePositiveNumber, normalizeDomRect } from '/js/shared/utils.js';
import {
  calculateDefaultStaffPadding,
  DEFAULT_KEY_SIGNATURE_SCALE,
  DEFAULT_KEY_SIGNATURE_SPACING_SCALE,
  DEFAULT_KEY_SIGNATURE_PADDING_SCALE,
  DEFAULT_KEY_SIGNATURE_CLEF_OFFSET,
} from './config.js';

const KeySignatureClass = VexFlow?.KeySignature;
const StaveModifierPosition = VexFlow?.StaveModifierPosition;
let keySignatureScalingPatched = false;

function ensureKeySignatureScalingSupport() {
  if (keySignatureScalingPatched || !KeySignatureClass) return;
  keySignatureScalingPatched = true;
  if (typeof KeySignatureClass.prototype.setGlyphScale !== 'function') {
    KeySignatureClass.prototype.setGlyphScale = function setGlyphScale(scale = 1, spacingScale) {
      this.__glyphScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
      const resolvedSpacing = Number.isFinite(spacingScale) && spacingScale > 0
        ? spacingScale
        : this.__glyphScale;
      this.__glyphSpacingScale = resolvedSpacing;
      return this;
    };
  }
  const originalFormat = KeySignatureClass.prototype.__formatWithScalePatched
    ? null
    : KeySignatureClass.prototype.format;
  if (originalFormat) {
    KeySignatureClass.prototype.__formatWithScalePatched = true;
    KeySignatureClass.prototype.format = function formatWithScale(...args) {
      const result = originalFormat.apply(this, args);
      const scale = Number.isFinite(this.__glyphScale) ? this.__glyphScale : 1;
      const spacingScale = Number.isFinite(this.__glyphSpacingScale)
        ? this.__glyphSpacingScale
        : scale;
      if ((scale !== 1 || spacingScale !== 1) && Array.isArray(this.children)) {
        for (const glyph of this.children) {
          if (!glyph) continue;
          if (scale !== 1 && glyph.fontInfo) {
            if (typeof glyph.__baseFontSize !== 'number') {
              glyph.__baseFontSize = glyph.fontInfo.size;
            }
            const baseSize = glyph.__baseFontSize || glyph.fontInfo.size;
            if (baseSize && typeof glyph.setFontSize === 'function') {
              glyph.setFontSize(baseSize * scale);
            }
          }
          if (spacingScale !== 1) {
            const currentShift = typeof glyph.getXShift === 'function'
              ? glyph.getXShift()
              : glyph.xShift ?? 0;
            if (typeof glyph.__baseXShift !== 'number') {
              glyph.__baseXShift = currentShift;
            }
            const nextShift = glyph.__baseXShift * spacingScale;
            if (typeof glyph.setXShift === 'function') {
              glyph.setXShift(nextShift);
            } else {
              glyph.xShift = nextShift;
            }
          }
        }
        if (typeof this.calculateDimensions === 'function') {
          this.calculateDimensions();
        }
        if (typeof this.padding === 'number') {
          this.padding = this.padding * spacingScale;
        }
      }
      return result;
    };
  }
}

function assignKeySignatureScale(stave, scale) {
  if (!stave || !Number.isFinite(scale) || scale <= 0 || Math.abs(scale - 1) < 0.001) {
    return;
  }
  if (typeof stave.getModifiers !== 'function') return;
  const category = KeySignatureClass?.CATEGORY || 'KeySignature';
  const modifiers = stave.getModifiers(
    StaveModifierPosition?.BEGIN ?? 1,
    category,
  );
  if (!Array.isArray(modifiers) || modifiers.length === 0) return;
  const keySig = modifiers[modifiers.length - 1];
  if (keySig && typeof keySig.setGlyphScale === 'function') {
    keySig.setGlyphScale(scale, DEFAULT_KEY_SIGNATURE_SPACING_SCALE);
  }
  if (keySig) {
    if (typeof keySig.__basePadding !== 'number') {
      keySig.__basePadding = typeof keySig.padding === 'number' ? keySig.padding : 10;
    }
    const padScale = Number.isFinite(DEFAULT_KEY_SIGNATURE_PADDING_SCALE)
      ? DEFAULT_KEY_SIGNATURE_PADDING_SCALE
      : 1;
    if (typeof keySig.setPadding === 'function') {
      keySig.setPadding(keySig.__basePadding * padScale);
    } else if (typeof keySig.padding === 'number') {
      keySig.padding = keySig.__basePadding * padScale;
    }

    if (typeof keySig.__baseClefShift !== 'number') {
      if (typeof keySig.getXShift === 'function') {
        keySig.__baseClefShift = keySig.getXShift();
      } else {
        keySig.__baseClefShift = keySig.xShift ?? 0;
      }
    }
    const clefOffset = Number.isFinite(DEFAULT_KEY_SIGNATURE_CLEF_OFFSET)
      ? DEFAULT_KEY_SIGNATURE_CLEF_OFFSET
      : 0;
    if (clefOffset !== 0) {
      const nextShift = keySig.__baseClefShift + clefOffset;
      if (typeof keySig.setXShift === 'function') {
        keySig.setXShift(nextShift);
      } else {
        keySig.xShift = nextShift;
      }
    }
  }
}

ensureKeySignatureScalingSupport();
import { buildLedgerStyle, createVexflowNote } from './noteFactory.js';

export function computeDimensions(container, staffScaleX, staffScaleY = staffScaleX, renderState) {
  const safeScaleX = Number.isFinite(staffScaleX) && staffScaleX > 0 ? staffScaleX : 1;
  const safeScaleY = Number.isFinite(staffScaleY) && staffScaleY > 0 ? staffScaleY : safeScaleX;
  const containerWidth = container?.clientWidth ?? 0;
  const parentWidth = container?.parentElement?.clientWidth ?? 0;
  const configuredMinWidth = parsePositiveNumber(renderState?.minWidth);
  const configuredMaxWidth = parsePositiveNumber(renderState?.maxWidth);
  const configuredTargetWidth = parsePositiveNumber(renderState?.targetWidth);
  const configuredBaseHeight = parsePositiveNumber(renderState?.baseHeight);

  const minWidth = configuredMinWidth ?? 480;
  const targetWidth = configuredTargetWidth ?? null;
  const measuredWidth = containerWidth ? (containerWidth / safeScaleX) : 0;
  const normalizedParentWidth = parentWidth ? (parentWidth / safeScaleX) : 0;
  const widthCandidate = targetWidth || measuredWidth || normalizedParentWidth || minWidth || 720;
  let baseWidth = widthCandidate;
  if (configuredMaxWidth) {
    baseWidth = Math.min(baseWidth, configuredMaxWidth);
  }
  baseWidth = Math.max(minWidth, baseWidth);
  const baseHeight = configuredBaseHeight ?? 200;
  const scaledWidth = Math.round(baseWidth * safeScaleX);
  const scaledHeight = Math.round(baseHeight * safeScaleY);
  const isProductionEnv = typeof process !== 'undefined'
    && typeof process.env === 'object'
    && process.env !== null
    && process.env.NODE_ENV === 'production';
  if (!isProductionEnv) {
    console.debug('[VexflowDraw] sizing', {
      containerWidth,
      parentWidth,
      staffScaleX: safeScaleX,
      staffScaleY: safeScaleY,
      measuredWidth,
      normalizedParentWidth,
      minWidth,
      targetWidth,
      configuredMaxWidth,
      baseWidth,
      scaledWidth,
      scaledHeight,
    });
  }
  if (renderState) {
    renderState.computedWidth = baseWidth;
    renderState.computedHeight = baseHeight;
  }
  return {
    baseWidth,
    baseHeight,
    scaledWidth,
    scaledHeight,
    scaleX: safeScaleX,
    scaleY: safeScaleY,
  };
}

export function cacheStaffMetrics({ context, stave, baseWidth, staffScaleX, staffScaleY, renderState }) {
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
    const scaleX = Number.isFinite(staffScaleX) && staffScaleX > 0 ? staffScaleX : 1;
    const scaleY = Number.isFinite(staffScaleY) && staffScaleY > 0 ? staffScaleY : scaleX;
    renderState.staffMetrics = {
      clef: renderState.primaryClef,
      lineShift: clefProps?.lineShift ?? 0,
      topY: baseTopY,
      bottomY: baseBottomY,
      spacing: baseSpacing,
      xStart: baseXStart,
      xEnd: baseXEnd,
      scale: scaleX,
      scaleX,
      scaleY,
      staveY: typeof stave.getY === 'function' ? stave.getY() : null,
      scaled: {
        topY: baseTopY * scaleY,
        bottomY: baseBottomY * scaleY,
        spacing: baseSpacing * scaleY,
        xStart: baseXStart * scaleX,
        xEnd: baseXEnd * scaleX,
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
  staffScaleY,
  voices,
  meter,
  keySig,
  fontChoice,
  renderState,
  warnings,
  registerInteractions,
  applyTheme,
}) {
  const safeScaleX = Number.isFinite(staffScale) && staffScale > 0 ? staffScale : 1;
  const safeScaleY = Number.isFinite(staffScaleY) && staffScaleY > 0 ? staffScaleY : safeScaleX;
  const { baseWidth, baseHeight, scaledWidth, scaledHeight } = computeDimensions(
    container,
    safeScaleX,
    safeScaleY,
    renderState,
  );
  container.innerHTML = '';

  const renderer = new Renderer(container, Renderer.Backends.SVG);
  renderer.resize(scaledWidth, scaledHeight);
  const context = renderer.getContext();
  if (typeof context.scale === 'function') {
    context.scale(safeScaleX, safeScaleY);
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
  const defaultVerticalOffset = Math.round(Math.max(12, baseHeight * 0.22));
  const staffVerticalOffset = Number.isFinite(renderState?.staffVerticalOffset)
    ? renderState.staffVerticalOffset
    : defaultVerticalOffset;
  if (renderState && !Number.isFinite(renderState.staffVerticalOffset)) {
    renderState.staffVerticalOffset = staffVerticalOffset;
  }
  const spaceAboveStaffLn = Math.max(0, renderState?.spaceAboveStaffLn ?? 1.3);
  const spaceBelowStaffLn = Math.max(0, renderState?.spaceBelowStaffLn ?? 0.7);
  const stave = new Stave(horizontalPadding, verticalPadding + staffVerticalOffset, staveWidth, {
    spaceAboveStaffLn,
    spaceBelowStaffLn,
  });
  const primaryClef = voices[0]?.clef || 'treble';
  renderState.primaryClef = primaryClef;
  stave.addClef(primaryClef);
  if (keySig) {
    try { stave.addKeySignature(keySig); } catch (_err) { /* ignore */ }
    assignKeySignatureScale(stave, DEFAULT_KEY_SIGNATURE_SCALE);
  }
  const ledgerStyle = buildLedgerStyle(theme);
  if (ledgerStyle) {
    stave.setDefaultLedgerLineStyle(ledgerStyle);
  }
  stave.setContext(context).draw();

  cacheStaffMetrics({
    context,
    stave,
    baseWidth,
    staffScaleX: safeScaleX,
    staffScaleY: safeScaleY,
    renderState,
  });

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
      // Apply per-key styles (e.g., harmonic chord correct/incorrect coloring)
      if (Array.isArray(spec?.keyStyles) && typeof note.setKeyStyle === 'function') {
        for (let i = 0; i < spec.keyStyles.length; i += 1) {
          const ks = spec.keyStyles[i];
          if (ks && typeof ks === 'object') {
            const kfill = ks.fillStyle ?? ks.fill ?? null;
            const kstroke = ks.strokeStyle ?? ks.stroke ?? kfill ?? null;
            note.setKeyStyle(i, {
              fillStyle: kfill ?? kstroke ?? undefined,
              strokeStyle: kstroke ?? kfill ?? undefined,
            });
          }
        }
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
      // Use formatToStave so justification width adapts to clef/key signature width.
      const formatter = new Formatter({ globalSoftmax: true, softmaxFactor: VexFlow.SOFTMAX_FACTOR, maxIterations: 8 });
      formatter.joinVoices(playableVoices);
      // Optional packing ratio (<=1 packs notes tighter). Default 1.
      const packRatio = Number.isFinite(renderState?.staffPack) && renderState.staffPack > 0 ? renderState.staffPack : 1;
      if (packRatio === 1) {
        formatter.formatToStave(playableVoices, stave, { alignRests: true });
      } else {
        const justifyWidth = stave.getNoteEndX() - stave.getNoteStartX() - Stave.defaultPadding;
        const packedWidth = Math.max(0, justifyWidth * packRatio);
        formatter.format(playableVoices, packedWidth, { alignRests: true, stave, context });
      }

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
  const baseMessage = totalElements > 0
    ? `VexFlow rendered ${totalElements} element${totalElements === 1 ? '' : 's'} across ${voices.length} voice${voices.length === 1 ? '' : 's'}${fontSuffix}.${warningSuffix}${keySuffix}`
    : '';

  if (typeof applyTheme === 'function') {
    applyTheme(container, theme);
  }

  if (typeof registerInteractions === 'function') {
    registerInteractions({
      context,
      voices: drawnVoices,
      baseMessage,
      scale: safeScaleX,
      scaleY: safeScaleY,
    });
  }

  return {
    context,
    vexflowVoices,
    baseMessage,
    warnings,
    scale: safeScaleX,
    scaleY: safeScaleY,
  };
}
