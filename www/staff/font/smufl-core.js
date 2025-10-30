const BASE_URL = new URL('./', import.meta.url);

const REMOTE_FONT_SOURCES = {
  bravura: 'https://raw.githubusercontent.com/steinbergmedia/bravura/master/redist/otf/Bravura.otf',
  bravuraText: 'https://raw.githubusercontent.com/steinbergmedia/bravura/master/redist/otf/BravuraText.otf',
  petaluma: 'https://raw.githubusercontent.com/steinbergmedia/petaluma/master/redist/otf/Petaluma.otf',
  petalumaText: 'https://raw.githubusercontent.com/steinbergmedia/petaluma/master/redist/otf/PetalumaText.otf',
  leland: 'https://raw.githubusercontent.com/MuseScoreFonts/Leland/main/Leland.otf',
  lelandText: 'https://raw.githubusercontent.com/MuseScoreFonts/Leland/main/LelandText.otf',
};

export const FONT_CATALOG = {
  bravura: {
    id: 'bravura',
    label: 'Bravura (Steinberg)',
    family: 'Bravura',
    metadataPath: new URL('./bravura_metadata.json', BASE_URL).href,
    faces: [
      {
        family: 'Bravura',
        sources: [
          { src: new URL('./Bravura.otf', BASE_URL).href, credentials: 'same-origin' },
          { src: REMOTE_FONT_SOURCES.bravura, credentials: 'omit', mode: 'cors' },
        ],
      },
      {
        family: 'Bravura Text',
        sources: [
          { src: new URL('./BravuraText.otf', BASE_URL).href, credentials: 'same-origin' },
          { src: REMOTE_FONT_SOURCES.bravuraText, credentials: 'omit', mode: 'cors' },
        ],
      },
    ],
    fallbackFamilies: ['Bravura Text'],
  },
  petaluma: {
    id: 'petaluma',
    label: 'Petaluma (Steinberg)',
    family: 'Petaluma',
    metadataPath: new URL('./petaluma_metadata.json', BASE_URL).href,
    faces: [
      {
        family: 'Petaluma',
        sources: [
          { src: new URL('./Petaluma.otf', BASE_URL).href, credentials: 'same-origin' },
          { src: REMOTE_FONT_SOURCES.petaluma, credentials: 'omit', mode: 'cors' },
        ],
      },
      {
        family: 'Petaluma Text',
        sources: [
          { src: new URL('./PetalumaText.otf', BASE_URL).href, credentials: 'same-origin' },
          { src: REMOTE_FONT_SOURCES.petalumaText, credentials: 'omit', mode: 'cors' },
        ],
      },
    ],
    fallbackFamilies: ['Petaluma Text'],
  },
  leland: {
    id: 'leland',
    label: 'Leland (MuseScore)',
    family: 'Leland',
    metadataPath: new URL('./leland_metadata.json', BASE_URL).href,
    faces: [
      {
        family: 'Leland',
        sources: [
          { src: new URL('./Leland.otf', BASE_URL).href, credentials: 'same-origin' },
          { src: REMOTE_FONT_SOURCES.leland, credentials: 'omit', mode: 'cors' },
        ],
      },
      {
        family: 'Leland Text',
        sources: [
          { src: new URL('./LelandText.otf', BASE_URL).href, credentials: 'same-origin' },
          { src: REMOTE_FONT_SOURCES.lelandText, credentials: 'omit', mode: 'cors' },
        ],
      },
    ],
    fallbackFamilies: ['Leland Text'],
  },
};

export const DEFAULT_FONT_KEY = 'bravura';
const GLYPH_TABLE_URL = new URL('./glyphnames.json', BASE_URL).href;
const SVG_NS = 'http://www.w3.org/2000/svg';
const DEFAULT_FALLBACK_FONTS = ['serif'];
const NOTEHEAD_ALIASES = {
  'noteheads.quarter': 'noteheadBlack',
  'noteheads.black': 'noteheadBlack',
  'noteheads.half': 'noteheadHalf',
  'noteheads.whole': 'noteheadWhole',
  'noteheads.doublewhole': 'noteheadDoubleWhole',
};
const ACCIDENTAL_ALIASES = {
  'accidentals.sharp': 'accidentalSharp',
  'accidentals.flat': 'accidentalFlat',
  'accidentals.nat': 'accidentalNatural',
  'accidentals.dblsharp': 'accidentalDoubleSharp',
  'accidentals.dblflat': 'accidentalDoubleFlat',
  'accidentals.sharp-slash': 'accidentalSharp',
  'accidentals.flat-slash': 'accidentalFlat',
};
const NOTEHEAD_DURATION_MAP = [
  { classToken: 'abcjs-d2', glyph: 'noteheadDoubleWhole' },
  { classToken: 'abcjs-d1', glyph: 'noteheadWhole' },
  { classToken: 'abcjs-d0-5', glyph: 'noteheadHalf' },
];
const FONT_PROBE_GLYPH = '\uE0A4';

const state = {
  glyphTablePromise: null,
  fontCache: new Map(),
};

function defaultReporter() {
  const prefix = '[SMuFL]';
  return {
    info: (message, detail) => {
      if (detail !== undefined) console.info(prefix, message, detail);
      else console.info(prefix, message);
    },
    warn: (message, detail) => {
      if (detail !== undefined) console.warn(prefix, message, detail);
      else console.warn(prefix, message);
    },
    error: (message, detail) => {
      if (detail !== undefined) console.error(prefix, message, detail);
      else console.error(prefix, message);
    },
  };
}

function getReporter(reporter) {
  if (!reporter) return defaultReporter();
  return {
    info: reporter.info || defaultReporter().info,
    warn: reporter.warn || defaultReporter().warn,
    error: reporter.error || defaultReporter().error,
  };
}

function parseJsonResource({ text, label, url }, reporter) {
  try {
    return JSON.parse(text);
  } catch (err) {
    const location = url ? `${label} (${url})` : label;
    getReporter(reporter).error(`Failed to parse ${location}.`, err);
    throw err;
  }
}

function normalizeFamilyName(name) {
  return String(name || '').replace(/\s+/g, '').toLowerCase();
}

function prepareFaceSource(source, face) {
  if (!source || !source.src) return null;
  return {
    src: source.src,
    mode: source.mode || face.mode || 'cors',
    credentials: source.credentials || face.credentials || 'omit',
    referrerPolicy: source.referrerPolicy,
  };
}

function identifyFontFormat(buffer) {
  if (!buffer || buffer.byteLength < 4) return null;
  const view = new DataView(buffer, 0, 4);
  const signature = view.getUint32(0, false);
  switch (signature) {
    case 0x00010000: return 'OpenType/TTF';
    case 0x4f54544f: return 'OpenType/CFF'; // 'OTTO'
    case 0x774f4632: return 'WOFF2'; // 'wOF2'
    case 0x774f4646: return 'WOFF'; // 'wOFF'
    default: return null;
  }
}

function guessFontMime(format, contentType) {
  if (contentType && /font\//i.test(contentType)) return contentType;
  if (format === 'OpenType/CFF' || format === 'OpenType/TTF') return 'font/otf';
  if (format === 'WOFF') return 'font/woff';
  if (format === 'WOFF2') return 'font/woff2';
  return 'application/octet-stream';
}

function describeSource(src) {
  try {
    const url = new URL(src, window.location.href);
    if (url.origin === window.location.origin) return url.pathname;
    return url.origin + url.pathname;
  } catch (_err) {
    return src;
  }
}

class SmuflFont {
  constructor(spec, glyphNames, metadata, reporter) {
    this.id = spec.id;
    this.label = spec.label;
    this.family = spec.family;
    this.spec = spec;
    this.glyphNames = glyphNames;
    this.metadata = metadata;
    this.cache = new Map();
    this.loadCache = new Map();
    this.faces = Array.isArray(spec.faces) && spec.faces.length > 0
      ? spec.faces.slice()
      : [{
        family: spec.family,
        sources: [{
          src: spec.fontPath,
          credentials: spec.fontCredentials,
          mode: spec.fontMode,
        }],
      }];
    this.familySources = new Map();
    this.canonicalNames = new Map();
    this.faces.forEach((face) => {
      if (!face?.family) return;
      const normalized = normalizeFamilyName(face.family);
      if (!this.canonicalNames.has(normalized)) {
        this.canonicalNames.set(normalized, face.family);
      }
      const optionList = this.familySources.get(normalized) || [];
      const sources = Array.isArray(face.sources) && face.sources.length > 0
        ? face.sources
        : face.src
          ? [face]
          : [];
      sources.map((source) => prepareFaceSource(source, face)).forEach((prepared) => {
        if (!prepared) return;
        if (!optionList.some((existing) => existing.src === prepared.src)) {
          optionList.push(prepared);
        }
      });
      this.familySources.set(normalized, optionList);
    });
    this.familyStack = Array.from(new Set([
      ...this.faces.map((face) => face.family),
      ...(spec.fallbackFamilies || []),
      ...DEFAULT_FALLBACK_FONTS,
    ].filter(Boolean)));
    this.reporter = getReporter(reporter);
  }

  cssStack() {
    return this.familyStack.map((name) => `"${name}"`).join(', ');
  }

  resolveFamilySources(family) {
    if (!family) return null;
    const normalized = normalizeFamilyName(family);
    if (this.familySources.has(normalized)) {
      return {
        name: this.canonicalNames.get(normalized) || family,
        sources: this.familySources.get(normalized),
      };
    }
    for (const [key, name] of this.canonicalNames.entries()) {
      if (normalizeFamilyName(name) === normalized) {
        return {
          name,
          sources: this.familySources.get(key) || [],
        };
      }
    }
    return null;
  }

  async ensureFamilyLoaded(family) {
    if (!family) return;
    const entry = this.resolveFamilySources(family);
    if (!entry || entry.sources.length === 0) return;
    const cacheKey = entry.name;
    if (this.loadCache.has(cacheKey)) {
      await this.loadCache.get(cacheKey);
      return;
    }
    const loader = (async () => {
      if (typeof FontFace !== 'function') {
        try {
          await document.fonts.load(`24px "${entry.name}"`, FONT_PROBE_GLYPH);
        } catch (err) {
          this.reporter.warn(`[SMuFL] FontFace API unavailable; unable to guarantee load for "${entry.name}".`, err);
        }
        return;
      }
      let lastError = null;
      for (const option of entry.sources) {
        let fontFace = null;
        let blobUrl = null;
        try {
          const response = await fetch(option.src, {
            mode: option.mode || 'cors',
            credentials: option.credentials || 'omit',
            referrerPolicy: option.referrerPolicy,
          });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const contentType = response.headers.get('content-type') || '';
          let notedUnexpectedType = null;
          if (contentType && !/font|opentype|truetype|application\/octet|application\/font/i.test(contentType)) {
            notedUnexpectedType = contentType;
          }
          const buffer = await response.arrayBuffer();
          const format = identifyFontFormat(buffer);
          if (!format) {
            throw new Error('Unrecognized font signature in downloaded data.');
          }
          const descriptors = {
            style: 'normal',
            weight: 'normal',
            stretch: 'normal',
          };
          let loaded = false;
          let lastLoadError = null;
          const attempts = [
            () => new FontFace(entry.name, buffer, descriptors),
            () => {
              const mime = guessFontMime(format, contentType);
              const blob = new Blob([buffer], { type: mime });
              blobUrl = URL.createObjectURL(blob);
              return new FontFace(entry.name, `url(${blobUrl})`, descriptors);
            },
          ];
          for (const create of attempts) {
            try {
              fontFace = create();
              await fontFace.load();
              loaded = true;
              break;
            } catch (loadErr) {
              lastLoadError = loadErr;
              if (fontFace) {
                try {
                  document.fonts.delete(fontFace);
                } catch (_err) {
                  // ignore
                }
              }
              fontFace = null;
              if (blobUrl) {
                URL.revokeObjectURL(blobUrl);
                blobUrl = null;
              }
            }
          }
          if (!loaded || !fontFace) {
            throw lastLoadError || new Error('Unknown FontFace load failure.');
          }
          document.fonts.add(fontFace);
          await document.fonts.load(`24px "${entry.name}"`, FONT_PROBE_GLYPH);
          if (notedUnexpectedType) {
            this.reporter.info(`[SMuFL] Loaded ${entry.name} (${format}) from ${describeSource(option.src)} despite MIME ${notedUnexpectedType}.`);
          } else {
            this.reporter.info(`[SMuFL] Loaded ${entry.name} (${format}) from ${describeSource(option.src)}.`);
          }
          if (blobUrl) {
            URL.revokeObjectURL(blobUrl);
            blobUrl = null;
          }
          return;
        } catch (err) {
          lastError = err;
          this.reporter.warn(`[SMuFL] Unable to load font family "${entry.name}" from ${option.src}:`, err);
          if (fontFace) {
            try {
              document.fonts.delete(fontFace);
            } catch (_err) {
              // ignore cleanup error
            }
          }
          if (blobUrl) {
            URL.revokeObjectURL(blobUrl);
            blobUrl = null;
          }
        }
      }
      if (lastError) throw lastError;
    })();
    this.loadCache.set(cacheKey, loader);
    await loader;
  }

  async ensureFacesLoaded() {
    for (const family of this.familyStack) {
      try {
        await this.ensureFamilyLoaded(family);
      } catch (err) {
        this.reporter.warn(`[SMuFL] Proceeding without "${family}" after load failure.`);
      }
    }
  }

  glyph(name) {
    if (!name) return null;
    if (!this.cache.has(name)) {
      const entry = this.resolveGlyph(name);
      this.cache.set(name, entry);
    }
    return this.cache.get(name);
  }

  resolveGlyph(name) {
    const mapping = this.glyphNames[name];
    if (!mapping) return null;
    const codepoint = mapping.codepoint || mapping.alternateCodepoint;
    if (!codepoint) return null;
    const metrics = this.extractMetrics(name);
    return {
      name,
      char: codepointToChar(codepoint),
      metrics,
    };
  }

  extractMetrics(name) {
    const boxes = this.metadata.glyphBBoxes?.[name] || null;
    const anchors = this.metadata.glyphsWithAnchors?.[name] || null;
    if (!boxes) {
      return {
        bbox: null,
        anchors,
        width: 1,
        height: 1,
        centerX: 0.5,
        centerY: 0,
      };
    }
    const xMin = boxes.bBoxSW?.[0] ?? 0;
    const yMin = boxes.bBoxSW?.[1] ?? 0;
    const xMax = boxes.bBoxNE?.[0] ?? 1;
    const yMax = boxes.bBoxNE?.[1] ?? 1;
    const width = xMax - xMin || 1;
    const height = yMax - yMin || 1;
    return {
      bbox: boxes,
      anchors,
      width,
      height,
      centerX: xMin + width / 2,
      centerY: yMin + height / 2,
    };
  }
}

function codepointToChar(codepoint) {
  const hex = codepoint.replace('U+', '');
  return String.fromCodePoint(parseInt(hex, 16));
}

async function loadGlyphTable(reporter) {
  if (!state.glyphTablePromise) {
    state.glyphTablePromise = fetch(GLYPH_TABLE_URL).then(async (response) => {
      if (!response.ok) throw new Error(`Failed to load SMuFL glyph table (${response.status})`);
      const text = await response.text();
      return parseJsonResource({
        text,
        label: 'SMuFL glyph table',
        url: response.url,
      }, reporter);
    });
  }
  return state.glyphTablePromise;
}

export async function loadFont(fontKey, reporter) {
  const spec = FONT_CATALOG[fontKey];
  if (!spec) throw new Error(`Unknown SMuFL font "${fontKey}"`);
  if (!state.fontCache.has(fontKey)) {
    const [glyphNames, metadata] = await Promise.all([
      loadGlyphTable(reporter),
      fetch(spec.metadataPath).then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load ${spec.label} metadata (${response.status})`);
        }
        const text = await response.text();
        return parseJsonResource({
          text,
          label: `${spec.label} metadata`,
          url: response.url,
        }, reporter);
      }),
    ]);
    const font = new SmuflFont(spec, glyphNames, metadata, reporter);
    state.fontCache.set(fontKey, font);
  }
  return state.fontCache.get(fontKey);
}

export async function ensureFontFaceLoaded(font, reporter) {
  if (!('fonts' in document) || !font) return;
  await font.ensureFacesLoaded();
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch (_err) {
      // ignore readiness failure
    }
  }
  const unresolved = font.familyStack.filter((family) => family && !document.fonts.check(`24px "${family}"`, FONT_PROBE_GLYPH));
  if (unresolved.length > 0) {
    getReporter(reporter).warn('[SMuFL] Some font families are still unavailable:', unresolved);
  }
}

export function fontSupportsSmufl(font, reporter) {
  if (!document?.body) return true;
  const families = font.faces?.map((face) => face.family).filter(Boolean) || [];
  if (families.length === 0) return false;
  const fallbackWidth = measureGlyphWidth('serif');
  for (const family of families) {
    const stack = `"${family}", serif`;
    const width = measureGlyphWidth(stack);
    if (Number.isFinite(width) && Number.isFinite(fallbackWidth) && Math.abs(width - fallbackWidth) > 0.5) {
      return true;
    }
    if (document.fonts?.check && document.fonts.check(`24px ${stack}`, FONT_PROBE_GLYPH)) {
      return true;
    }
  }
  getReporter(reporter).warn('[SMuFL] Glyph probe width matches serif fallback; assuming SMuFL font missing.');
  return false;
}

function measureGlyphWidth(fontFamily) {
  try {
    if (!document?.body) return NaN;
    const span = document.createElement('span');
    span.textContent = FONT_PROBE_GLYPH;
    span.style.position = 'absolute';
    span.style.visibility = 'hidden';
    span.style.pointerEvents = 'none';
    span.style.fontFamily = fontFamily;
    span.style.fontSize = '64px';
    span.style.lineHeight = '1';
    span.style.whiteSpace = 'nowrap';
    document.body.appendChild(span);
    const width = span.getBoundingClientRect().width;
    span.remove();
    return width;
  } catch (_err) {
    return NaN;
  }
}

export function cleanupSmufl(svg) {
  if (!svg) return;
  svg.querySelectorAll('[data-smufl-glyph]').forEach((el) => el.remove());
  svg.querySelectorAll('[data-smufl-hidden="true"]').forEach((el) => {
    el.style.opacity = '';
    el.removeAttribute('data-smufl-hidden');
  });
}

function warnMissingGlyph(font, glyphName, node, reporter) {
  if (!node || !glyphName) return;
  const memoKey = `${font?.id || 'unknown'}::${glyphName}`;
  if (!warnMissingGlyph.cache) warnMissingGlyph.cache = new Set();
  if (warnMissingGlyph.cache.has(memoKey)) return;
  warnMissingGlyph.cache.add(memoKey);
  getReporter(reporter).warn(`[SMuFL] Missing glyph "${glyphName}" for font ${font?.label || 'unknown'}.`);
}

function findNoteheadName(node, group) {
  if (!node) return null;
  const dataName = node.getAttribute('data-name');
  if (dataName && NOTEHEAD_ALIASES[dataName]) return NOTEHEAD_ALIASES[dataName];
  if (dataName) return dataName;
  const classList = node.getAttribute('class');
  if (classList) {
    const classes = classList.split(/\s+/);
    for (const { classToken, glyph } of NOTEHEAD_DURATION_MAP) {
      if (classes.includes(classToken)) {
        return glyph;
      }
    }
  }
  if (group) {
    const durationClass = Array.from(group.classList || []).find((cls) => cls.startsWith('abcjs-d'));
    if (durationClass) {
      const mapEntry = NOTEHEAD_DURATION_MAP.find(({ classToken }) => classToken === durationClass);
      if (mapEntry) return mapEntry.glyph;
    }
  }
  return 'noteheadBlack';
}

function findAccidentalName(node) {
  if (!node) return null;
  const dataName = node.getAttribute('data-name');
  if (dataName && ACCIDENTAL_ALIASES[dataName]) {
    return ACCIDENTAL_ALIASES[dataName];
  }
  if (dataName) return dataName;
  const textContent = node.textContent || '';
  switch (textContent) {
    case '#': return 'accidentalSharp';
    case '♭': return 'accidentalFlat';
    case '♮': return 'accidentalNatural';
    case '𝄪': return 'accidentalDoubleSharp';
    case '𝄫': return 'accidentalDoubleFlat';
    default: return null;
  }
}

function findAccidentalFallbackName(name) {
  if (!name) return null;
  if (name.includes('sharp')) return 'accidentalSharp';
  if (name.includes('flat')) return 'accidentalFlat';
  if (name.includes('natural')) return 'accidentalNatural';
  return null;
}

function deriveAlignment(node, group) {
  if (!node) return { baseline: 'central', align: 'center' };
  const dataName = node.getAttribute('data-name') || '';
  if (dataName.includes('noteheads.slashed')) {
    return { baseline: 'central', align: 'center' };
  }
  if (group && group.classList.contains('abcjs-voice2')) {
    return { baseline: 'central', align: 'center' };
  }
  return { baseline: 'central', align: 'center' };
}

function ensureGlyphText(font, glyph, original, alignment) {
  const text = document.createElementNS(SVG_NS, 'text');
  text.setAttribute('data-smufl-glyph', glyph.name);
  text.setAttribute('text-anchor', alignment.align === 'center' ? 'middle' : 'start');
  text.setAttribute('dominant-baseline', 'central');
  text.setAttribute('font-family', font.cssStack());
  text.setAttribute('font-size', original.getAttribute('height') || '8');
  text.textContent = glyph.char;
  return text;
}

function safeBBox(node) {
  if (!node || typeof node.getBBox !== 'function') return null;
  try {
    return node.getBBox();
  } catch (_err) {
    return null;
  }
}

function injectGlyph({ font, glyph, sourceEl, group, align, reporter }) {
  const bbox = safeBBox(sourceEl) || safeBBox(group);
  if (!bbox) return false;
  const alignment = deriveAlignment(sourceEl, group);
  const text = ensureGlyphText(font, glyph, sourceEl, alignment);
  const scale = sourceEl.transform?.baseVal?.consolidate?.()?.matrix?.a || 1;
  const fontSize = scale ? bbox.height / scale : bbox.height;
  text.setAttribute('font-size', fontSize);
  const x = bbox.x + bbox.width / 2;
  const y = bbox.y + bbox.height / 2;
  text.setAttribute('x', x);
  text.setAttribute('y', y);
  text.style.fill = sourceEl.getAttribute('fill') || 'currentColor';
  text.style.stroke = sourceEl.getAttribute('stroke') || 'none';
  text.style.pointerEvents = 'none';
  sourceEl.style.opacity = '0';
  sourceEl.setAttribute('data-smufl-hidden', 'true');
  sourceEl.parentNode?.insertBefore(text, sourceEl.nextSibling);
  return true;
}

function processAccidentalElement({ element, font, group, processed, counters, reporter }) {
  if (!element || processed.has(element) || element.dataset.smuflHidden === 'true') return;
  const glyphName = findAccidentalName(element) || findAccidentalFallbackName(element?.getAttribute?.('data-name'));
  if (!glyphName) return;
  const glyph = font.glyph(glyphName) || font.glyph(findAccidentalFallbackName(glyphName));
  if (!glyph) {
    warnMissingGlyph(font, glyphName, element, reporter);
    return;
  }
  if (injectGlyph({ font, glyph, sourceEl: element, group, reporter })) {
    processed.add(element);
    counters.accidentals += 1;
  }
}

export function applySmuflGlyphs(svg, font, reporter) {
  const counters = { noteheads: 0, accidentals: 0 };
  const processed = new WeakSet();
  const noteGroups = svg.querySelectorAll('g.abcjs-note');

  noteGroups.forEach((group) => {
    const noteCandidates = group.querySelectorAll('[data-name], .abcjs-notehead, ellipse[fill]');
    noteCandidates.forEach((node) => {
      if (!node || processed.has(node) || node.dataset.smuflHidden === 'true') return;
      const glyphName = findNoteheadName(node, group);
      if (!glyphName) return;
      const glyph = font.glyph(glyphName);
      if (!glyph) {
        warnMissingGlyph(font, glyphName, node, reporter);
        return;
      }
      if (injectGlyph({
        font,
        glyph,
        sourceEl: node,
        group,
        align: 'center',
        reporter,
      })) {
        processed.add(node);
        counters.noteheads += 1;
      }
    });

    const accidentals = group.querySelectorAll('[data-name*="accidentals"], .abcjs-accidental');
    accidentals.forEach((acc) => {
      processAccidentalElement({
        element: acc,
        font,
        group,
        processed,
        counters,
        reporter,
      });
    });
  });

  const strayAccidentals = svg.querySelectorAll('[data-name*="accidentals"], .abcjs-accidental');
  strayAccidentals.forEach((acc) => {
    processAccidentalElement({
      element: acc,
      font,
      group: acc.parentNode,
      processed,
      counters,
      reporter,
    });
  });

  return counters;
}

export function getFontOptions() {
  return Object.values(FONT_CATALOG).map(({ id, label }) => ({ id, label }));
}

