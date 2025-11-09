import { createSmuflRenderer } from './font/vendor/smufl-shim.js';
import { readTokens } from '/staff/theme/readTokens.js';
import { getKeySignatureAlteration } from '/js/modules/KeySignatures.js';

const staffContainer = document.getElementById('staff-container');
const keySelect = document.getElementById('key-select');
const statusEl = document.getElementById('staff-status');

let isLoading = false;
let lastSelected = null; // { key, start, end }
let dragState = null; // { key, startChar, endChar, startChrom, accum, lastY, pxPerSemitone, svgGroup, svgRoot, previewDelta, baseTransform, baseHeadX, baseHeadY, baseHeadWidth, baseDiatonic, staffStep, noteOverlay, basePitch, baseDuration }
const smuflRenderer = createSmuflRenderer({ fontKey: 'bravura' });

function waitForABCJS() {
  return new Promise((resolve, reject) => {
    if (window.ABCJS?.renderAbc) {
      resolve(window.ABCJS);
      return;
    }

    const maxAttempts = 20;
    let attempts = 0;
    const interval = window.setInterval(() => {
      attempts += 1;
      if (window.ABCJS?.renderAbc) {
        window.clearInterval(interval);
        resolve(window.ABCJS);
      } else if (attempts >= maxAttempts) {
        window.clearInterval(interval);
        reject(new Error('ABCJS failed to load.'));
      }
    }, 100);
  });
}

const ABC_SNIPPETS = {
  C: `X:1
T:C Major Scale
M:4/4
L:1/4
K:C
C D E F | G A B c |]`,
  G: `X:1
T:G Major Scale
M:4/4
L:1/4
K:G
G A B c | d e f g |]`,
  D: `X:1
T:D Major Scale
M:4/4
L:1/4
K:D
D E F G | A B c d |]`,
  A: `X:1
T:A Major Scale
M:4/4
L:1/4
K:A
A B c d | e f g a |]`,
  F: `X:1
T:F Major Scale
M:4/4
L:1/4
K:F
F G A B | c d e f |]`,
  Bb: `X:1
T:Bb Major Scale
M:4/4
L:1/4
K:Bb
B, C D E | F G A B |]`,
  Eb: `X:1
T:Eb Major Scale
M:4/4
L:1/4
K:Eb
E F G A | B c d e |]`,
};

// Keep an editable copy of the ABC for each key so drags persist
const CURRENT_ABC = new Map(Object.entries(ABC_SNIPPETS));
let activeKey = null;

function findKBodyStart(abc) {
  // Find the end of the last K: line; body starts on the next char
  const regex = /(^|\n)K:[^\n]*\n/g;
  let match = null;
  while (true) {
    const m = regex.exec(abc);
    if (!m) break;
    match = m;
  }
  return match ? match.index + match[0].length : 0;
}

function tokenizeAbcByLine(abc) {
  const bodyStart = findKBodyStart(abc);
  const lines = [];
  let lineIndex = 0;
  let i = bodyStart;
  // Initialize first line
  lines[lineIndex] = { start: bodyStart, measures: [[]] };
  let measureIndex = 0;

  while (i < abc.length) {
    const ch = abc[i];
    // Newline → next line, reset measure index
    if (ch === '\n') {
      lineIndex += 1;
      lines[lineIndex] = { start: i + 1, measures: [[]] };
      measureIndex = 0;
      i += 1;
      continue;
    }

    // Skip whitespace
    if (/\s/.test(ch)) { i += 1; continue; }

    // Recognize barline tokens as a single boundary: |, ||, |], [|, |:, :|
    const rest = abc.slice(i);
    const barMatch = rest.match(/^(\|\]|\[\||\|:|:\||\|\||\|)/);
    if (barMatch) {
      measureIndex += 1;
      const line = lines[lineIndex];
      line.measures[measureIndex] = line.measures[measureIndex] || [];
      i += barMatch[0].length;
      continue;
    }

    // Match a simple ABC note token: accidental(s) + letter + octave marks + optional duration
    const noteMatch = rest.match(/^([_=^]*)([A-Ga-g])([',]*)(\d+(?:\/\d+)?)?/);
    if (noteMatch) {
      const text = noteMatch[0];
      const line = lines[lineIndex];
      line.measures[measureIndex].push({
        start: i,
        end: i + text.length,
        text,
        acc: noteMatch[1] || '',
        letter: noteMatch[2],
        oct: noteMatch[3] || '',
        dur: noteMatch[4] || ''
      });
      i += text.length;
      continue;
    }

    // Unrecognized char → advance
    i += 1;
  }

  return { bodyStart, lines };
}

function parseLMMNPFromClasses(classes, fallbackLine = 0, fallbackMeasure = 0, fallbackNote = 0, fallbackP = 0) {
  const str = Array.isArray(classes) ? classes.join(' ') : String(classes || '');
  const lMatch = str.match(/\bl(\d+)\b/);
  const mMatch = str.match(/\bm(\d+)\b/);
  const mmMatch = str.match(/\bmm(\d+)\b/);
  const nMatch = str.match(/\bn(\d+)\b/);
  const pMatch = str.match(/\bp(-?\d+)\b/);
  return {
    l: lMatch ? parseInt(lMatch[1], 10) : fallbackLine,
    m: mMatch ? parseInt(mMatch[1], 10) : fallbackMeasure,
    mm: mmMatch ? parseInt(mmMatch[1], 10) : null,
    n: nMatch ? parseInt(nMatch[1], 10) : fallbackNote,
    p: pMatch ? parseInt(pMatch[1], 10) : fallbackP,
  };
}

function tokenizeAbcGlobalMeasures(abc) {
  const bodyStart = findKBodyStart(abc);
  const measures = [[]];
  let measureIndex = 0;
  let i = bodyStart;
  while (i < abc.length) {
    const rest = abc.slice(i);
    const ch = abc[i];
    if (ch === '\n' || /\s/.test(ch)) { i += 1; continue; }
    const barMatch = rest.match(/^(\|\]|\[\||\|:|:\||\|\||\|)/);
    if (barMatch) {
      measureIndex += 1;
      measures[measureIndex] = measures[measureIndex] || [];
      i += barMatch[0].length;
      continue;
    }
    const noteMatch = rest.match(/^([_=^]*)([A-Ga-g])([',]*)(\d+(?:\/\d+)?)?/);
    if (noteMatch) {
      const text = noteMatch[0];
      measures[measureIndex].push({
        start: i,
        end: i + text.length,
        text,
        acc: noteMatch[1] || '',
        letter: noteMatch[2],
        oct: noteMatch[3] || '',
        dur: noteMatch[4] || ''
      });
      i += text.length;
      continue;
    }
    i += 1;
  }
  return { bodyStart, measures };
}

function computeGlobalMMFromLineMeasure(abc, lineIdx, measureIdx) {
  const { lines } = tokenizeAbcByLine(abc);
  let mm = 0;
  for (let i = 0; i < lines.length; i++) {
    const mcount = (lines[i] && Array.isArray(lines[i].measures)) ? lines[i].measures.length : 0;
    if (i < lineIdx) mm += mcount;
  }
  return mm + (measureIdx || 0);
}

const DIATONIC = ['C','D','E','F','G','A','B'];

// Key signature accidentals resolve via shared helper (returns +1/-1 offsets per letter)
function getKeyAccidental(letter, key) {
  return getKeySignatureAlteration(letter, key);
}
function transposeAbcTokenDiatonic(tokenText, step) {
  // Very simple: ignore accidentals, preserve duration, move letter + octave marks diatonically
  const m = tokenText.match(/^([_=^]*)([A-Ga-g])([',]*)(\d+(?:\/\d+)?)?/);
  if (!m) return tokenText;
  const acc = ''; // drop existing accidentals for now
  const baseLetter = m[2];
  const isLower = (baseLetter >= 'a' && baseLetter <= 'g');
  const baseIndex = DIATONIC.indexOf(baseLetter.toUpperCase());
  let octaveBase = isLower ? 1 : 0; // 0 => uppercase octave, 1 => lowercase, >1 => add apostrophes, <0 => commas
  const octMarks = m[3] || '';
  for (const c of octMarks) {
    if (c === "'") octaveBase += 1;
    else if (c === ',') octaveBase -= 1;
  }
  const diatonicIndex = octaveBase * 7 + baseIndex;
  let newIndex = diatonicIndex + (typeof step === 'number' ? step : 0);
  // Normalize to letter + octaveBase
  let newOct = Math.floor(newIndex / 7);
  let newBase = ((newIndex % 7) + 7) % 7;
  const letter = DIATONIC[newBase];
  let outLetter = newOct >= 1 ? letter.toLowerCase() : letter.toUpperCase();
  let marks = '';
  if (newOct >= 2) marks = "'".repeat(newOct - 1);
  else if (newOct <= -1) marks = ','.repeat(-newOct);
  const dur = m[4] || '';
  return `${acc}${outLetter}${marks}${dur}`;
}

// Map ABCJS class pN (N=0 at middle C) + step to an ABC pitch string
function pitchIndexToAbc(pIndex) {
  const letters = ['C','D','E','F','G','A','B'];
  const idx = pIndex;
  const letterIndex = ((idx % 7) + 7) % 7;
  const octave = Math.floor((idx - letterIndex) / 7);
  const baseUpper = letters[letterIndex];
  if (octave >= 0) {
    const baseLower = baseUpper.toLowerCase();
    const marks = octave === 0 ? '' : "'".repeat(octave);
    return baseLower + marks; // octave 0 => c..b (middle octave)
  } else {
    const marks = (-octave - 1) > 0 ? ",".repeat(-octave - 1) : '';
    return baseUpper + marks; // octave -1 => C..B, -2 => C,..
  }
}

function abcTokenToDiatonicIndex(tokenText) {
  const m = tokenText.match(/^([_=^]*)([A-Ga-g])([',]*)(\d+(?:\/\d+)?)?/);
  if (!m) return 0;
  const baseLetter = m[2];
  const isLower = (baseLetter >= 'a' && baseLetter <= 'g');
  const baseIndex = DIATONIC.indexOf(baseLetter.toUpperCase());
  // ABC: lowercase letters are the middle octave; uppercase is one octave below
  let octaveBase = isLower ? 0 : -1;
  const octMarks = m[3] || '';
  for (const c of octMarks) {
    if (c === "'") octaveBase += 1;
    else if (c === ',') octaveBase -= 1;
  }
  return octaveBase * 7 + baseIndex;
}

// Convert an ABC note token (with optional accidentals and octave marks) to a chromatic index
// relative to the middle octave (lowercase letters)
function abcTokenToChromaticIndex(tokenText, key) {
  const m = tokenText.match(/^([_=^]*)([A-Ga-g])([',]*)(\d+(?:\/\d+)?)?/);
  if (!m) return 0;
  const acc = m[1] || '';
  const letter = m[2].toUpperCase();
  const isLower = /[a-g]/.test(m[2]);
  const octMarks = m[3] || '';
  const baseSemitone = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 }[letter];
  let octaveBase = isLower ? 0 : -1; // lowercase is middle octave, uppercase one below
  for (const c of octMarks) {
    if (c === "'") octaveBase += 1;
    else if (c === ',') octaveBase -= 1;
  }
  // Apply inline accidentals if present, else apply key signature
  let accidental = 0;
  for (let i = 0; i < acc.length; i++) {
    const ch = acc[i];
    if (ch === '^') accidental += 1;
    else if (ch === '_') accidental -= 1;
    // '=' natural contributes 0
  }
  if (accidental === 0 && !acc.includes('=')) {
    accidental = getKeyAccidental(letter, key);
  }
  return octaveBase * 12 + baseSemitone + accidental;
}

function scientificFromMidiPreferFlats(midi) {
  const flats = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1; // MIDI 60 => 4
  return `${flats[pc]}${octave}`;
}

function scientificToAbc(sci) {
  // Convert like 'Db4' -> '_d', 'Gb3' -> '_G', 'C5' -> "c'"
  const m = String(sci).match(/^([A-Ga-g])([#b]{0,2})(-?\d+)$/);
  if (!m) return 'c';
  const letter = m[1].toUpperCase();
  const acc = m[2] || '';
  const octave = parseInt(m[3], 10);
  const flatCount = (acc.match(/b/g) || []).length;
  const sharpCount = (acc.match(/#/g) || []).length;
  const accidental = flatCount ? '_'.repeat(flatCount) : (sharpCount ? '^'.repeat(sharpCount) : '');
  let abcLetter = '';
  if (octave >= 4) {
    abcLetter = letter.toLowerCase() + (octave === 4 ? '' : "'".repeat(octave - 4));
  } else {
    abcLetter = letter + (octave === 3 ? '' : ','.repeat(3 - octave));
  }
  return `${accidental}${abcLetter}`;
}

function findTokenByCharRange(abc, start, end) {
  const { measures } = tokenizeAbcGlobalMeasures(abc);
  // Exact match first
  for (const m of measures) {
    for (const t of m) {
      if (t.start === start && t.end === end) return t;
    }
  }
  // Containing range next
  for (const m of measures) {
    for (const t of m) {
      if (t.start <= start && t.end >= end) return t;
    }
  }
  // Nearest token by start
  let best = null;
  let bestDist = Infinity;
  for (const m of measures) {
    for (const t of m) {
      const d = Math.abs(t.start - start);
      if (d < bestDist) { best = t; bestDist = d; }
    }
  }
  return best;
}

function commitWheelSemitoneDelta(delta) {
  if (!lastSelected || !activeKey) return;
  const key = activeKey;
  const abc = CURRENT_ABC.get(key) || ABC_SNIPPETS[key];
  if (!abc) return;
  const tok = findTokenByCharRange(abc, lastSelected.start, lastSelected.end);
  if (!tok) return;
  const before = abc.slice(0, tok.start);
  const after = abc.slice(tok.end);
  const chromStart = abcTokenToChromaticIndex(tok.text, key);
  const chromTarget = chromStart + delta; // +1 up, -1 down (wheel standard)
  const midiTarget = 60 + chromTarget;
  const sci = scientificFromMidiPreferFlats(midiTarget);
  const abcPitch = scientificToAbc(sci);
  const mTok = tok.text.match(/^(?:[_=^]*)([A-Ga-g])([',]*)(\d+(?:\/\d+)?)?/);
  const dur = mTok && mTok[3] ? mTok[3] : '';
  const replacement = `${abcPitch}${dur}`;
  const updated = `${before}${replacement}${after}`;
  CURRENT_ABC.set(key, updated);
  lastSelected = { key, start: before.length, end: before.length + replacement.length };
  renderSelection(key, { useExisting: true });
}

function commitSemitoneDeltaForMMN(delta) {
  if (!dragState || !activeKey) return;
  const key = activeKey;
  const abc = CURRENT_ABC.get(key) || ABC_SNIPPETS[key];
  if (!abc) return;
  const tok = findTokenByCharRange(abc, dragState.startChar, dragState.endChar);
  if (!tok) return;
  const before = abc.slice(0, tok.start);
  const after = abc.slice(tok.end);
  const chromTarget = dragState.startChrom + delta;
  const midiTarget = 60 + chromTarget;
  const sci = scientificFromMidiPreferFlats(midiTarget);
  const abcPitch = scientificToAbc(sci);
  const mTok = tok.text.match(/^(?:[_=^]*)([A-Ga-g])([',]*)(\d+(?:\/\d+)?)?/);
  const dur = mTok && mTok[3] ? mTok[3] : '';
  const replacement = `${abcPitch}${dur}`;
  const updated = `${before}${replacement}${after}`;
  CURRENT_ABC.set(key, updated);
  lastSelected = { key, start: before.length, end: before.length + replacement.length };
  renderSelection(key, { useExisting: true });
}

async function renderSelection(key, opts = {}) {
  activeKey = key;
  if (isLoading) return;
  isLoading = true;
  statusEl.textContent = 'Rendering…';

  try {
    const ABCJS = await waitForABCJS();
    const snippet = opts.useExisting ? (CURRENT_ABC.get(key) || ABC_SNIPPETS[key]) : (CURRENT_ABC.get(key) || ABC_SNIPPETS[key]);
    if (!snippet) {
      throw new Error(`No ABC snippet defined for key "${key}"`);
    }

    staffContainer.innerHTML = '';
    const tokens = readTokens();
    const svg = ABCJS.renderAbc(
      staffContainer,
      snippet,
      {
        responsive: 'resize',
        add_classes: true,
        staffwidth: window.innerWidth < 640 ? undefined : 720,
        dragging: false,
        selectTypes: ['note'],
        selectionColor: tokens.accent || tokens.selection,
        dragColor: tokens.selection || tokens.accent,
        // clickListener not used for chromatic drag
      },
    );
    // Wheel-to-semitone support and custom chromatic drag
    try {
      const svgs = staffContainer.querySelectorAll('svg');
      const bindPromises = [];
      svgs.forEach(s => {
        bindPromises.push(smuflRenderer.bindSvg(s, { keySignature: key }));
        s.addEventListener('wheel', (ev) => {
          if (!lastSelected) return;
          ev.preventDefault();
          const delta = ev.deltaY < 0 ? +1 : -1; // wheel up = raise, down = lower
          commitWheelSemitoneDelta(delta);
        }, { passive: false });
        // Attach chromatic drag to each note group for reliable class access
        const startDragFromEvent = (ev, groupOverride = null) => {
          if (dragState) return; // already dragging
          const touchPoint = ev.touches && ev.touches[0];
          const pointerY = ev.clientY ?? (touchPoint ? touchPoint.clientY : null);
          if (pointerY == null) return;
          const group = groupOverride || ev.target.closest('g.abcjs-note');
          if (!group) return;
          const abc = CURRENT_ABC.get(key) || ABC_SNIPPETS[key];
          const cls = group.getAttribute('class') || '';
          const parsed = parseLMMNPFromClasses(cls.split(' '));
          let mm = parsed.mm;
          let n = parsed.n;
          if (mm == null) {
            // derive from line + measure indices if available
            mm = computeGlobalMMFromLineMeasure(abc, parsed.l || 0, parsed.m || 0);
          }
          if (mm == null || n == null) return;
          const { measures } = tokenizeAbcGlobalMeasures(abc);
          const measure = measures[Math.max(0, Math.min(mm, measures.length - 1))] || [];
          const tok = measure[Math.max(0, Math.min(n, measure.length - 1))];
          if (!tok) return;
          lastSelected = { key, start: tok.start, end: tok.end };
          const staff = s.querySelector('.abcjs-staff');
          let staffStep = 6;
          if (staff && typeof staff.getBBox === 'function') {
            try {
              const sb = staff.getBBox();
              const gap = sb.height / 4; // distance between adjacent lines
              staffStep = gap / 2; // distance between line and adjacent space
            } catch (bboxErr) { /* ignore, keep fallback */ }
          }
          const headNode = group.querySelector('ellipse[fill]') || group.querySelector('[class*="notehead"], .abcjs-notehead') || group.querySelector('path');
          let headBox;
          try {
            headBox = headNode ? headNode.getBBox() : group.getBBox();
          } catch (bboxErr) {
            headBox = group.getBBox();
          }
          const baseTransform = group.getAttribute('transform') || '';
          const baseHeadX = headBox.x + headBox.width / 2;
          const baseHeadY = headBox.y + headBox.height / 2;
          const baseHeadWidth = headBox.width;
          const noteOverlay = ensureNoteOverlay(s);
          const basePitchText = `${tok.acc || ''}${tok.letter}${tok.oct || ''}`;
          const baseDuration = tok.dur || '';
          const smuflNote = smuflRenderer.getNoteForGroup(group);
          if (smuflNote) {
            smuflNote.beginDrag();
          }
          dragState = {
            key,
            startChar: tok.start,
            endChar: tok.end,
            startChrom: abcTokenToChromaticIndex(tok.text, key),
            accum: 0,
            lastY: pointerY,
            pxPerSemitone: Math.max(2, staffStep * 0.6),
            svgGroup: group,
            svgRoot: s,
            previewDelta: 0,
            pointerId: ev.pointerId != null ? ev.pointerId : null,
            baseTransform,
            baseHeadX: Number.isFinite(baseHeadX) ? baseHeadX : 0,
            baseHeadY: Number.isFinite(baseHeadY) ? baseHeadY : 0,
            baseHeadWidth: Number.isFinite(baseHeadWidth) ? baseHeadWidth : 0,
            baseDiatonic: abcTokenToDiatonicIndex(tok.text),
            staffStep,
            noteOverlay,
            basePitch: basePitchText,
            baseDuration,
            smuflNote
          };
          if (dragState.pointerId != null && typeof group.setPointerCapture === 'function') {
            try { group.setPointerCapture(dragState.pointerId); } catch (captureErr) { /* ignore */ }
          }
          window.addEventListener('pointermove', onDragMove, { passive: false });
          window.addEventListener('pointerup', onDragEnd, { passive: true });
          window.addEventListener('pointercancel', onDragEnd, { passive: true });
          window.addEventListener('touchmove', onDragMove, { passive: false });
          window.addEventListener('touchend', onDragEnd, { passive: true });
          window.addEventListener('touchcancel', onDragEnd, { passive: true });
        };

        const notes = staffContainer.querySelectorAll('g.abcjs-note');
        notes.forEach(g => {
          g.addEventListener('pointerdown', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            startDragFromEvent(ev, g);
          });
          g.addEventListener('touchstart', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            startDragFromEvent(ev, g);
          }, { passive: false });
          g.addEventListener('mousedown', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            startDragFromEvent(ev, g);
          });
        });

        s.addEventListener('pointerdown', (ev) => {
          startDragFromEvent(ev);
        });
        s.addEventListener('touchstart', (ev) => {
          startDragFromEvent(ev);
        }, { passive: false });
        s.addEventListener('mousedown', (ev) => {
          startDragFromEvent(ev);
        });
      });
      await Promise.all(bindPromises);
    } catch (e) { /* ignore */ }
    statusEl.textContent = '';
  } catch (error) {
    console.error(error);
    statusEl.textContent = 'Unable to render staff demo. Check console for details.';
  } finally {
    isLoading = false;
  }
}

const NOTE_GLYPH_CACHE = new Map(); // token -> { innerHTML, headCenter, token }
let noteScratch = null;

function ensureNoteOverlay(svg) {
  if (svg._dragNoteOverlay) return svg._dragNoteOverlay;
  const ns = 'http://www.w3.org/2000/svg';
  const group = document.createElementNS(ns, 'g');
  group.setAttribute('data-name', 'drag-note');
  const tokens = readTokens();
  const overlayColor = tokens.selection || tokens.accent;
  if (overlayColor) {
    group.setAttribute('fill', overlayColor);
    group.setAttribute('stroke', overlayColor);
  }
  group.setAttribute('stroke-width', '0');
  group.style.pointerEvents = 'none';
  group.style.display = 'none';
  group.dataset.token = '';
  svg.appendChild(group);
  svg._dragNoteOverlay = group;
  return group;
}

function hideNoteOverlay(group) {
  if (!group) return;
  group.style.display = 'none';
  group.removeAttribute('transform');
}

function getNoteGlyphMetrics(token, headName) {
  if (NOTE_GLYPH_CACHE.has(token)) return NOTE_GLYPH_CACHE.get(token);
  if (!window.ABCJS) return null;
  if (!noteScratch) {
    noteScratch = document.createElement('div');
    noteScratch.style.position = 'absolute';
    noteScratch.style.left = '-12000px';
    noteScratch.style.top = '0';
    noteScratch.style.width = '0';
    noteScratch.style.height = '0';
    noteScratch.style.overflow = 'hidden';
    noteScratch.style.pointerEvents = 'none';
    noteScratch.style.opacity = '0';
    document.body.appendChild(noteScratch);
  }
  noteScratch.innerHTML = '';
  try {
    window.ABCJS.renderAbc(noteScratch, `X:1\nL:1/4\nK:C\n${token}|\n`, { add_classes: true });
    const noteGroup = noteScratch.querySelector('g.abcjs-note');
    if (!noteGroup) return null;
    const headPath = noteGroup.querySelector(`[data-name="${headName}"]`) || noteGroup.querySelector('[data-name*="noteheads"]') || noteGroup.querySelector('path');
    if (!headPath) return null;
    const headBBox = headPath.getBBox();
    const metrics = {
      innerHTML: noteGroup.innerHTML,
      headCenter: {
        x: headBBox.x + headBBox.width / 2,
        y: headBBox.y + headBBox.height / 2,
      },
      token,
    };
    NOTE_GLYPH_CACHE.set(token, metrics);
    return metrics;
  } catch (err) {
    console.error(err);
    return null;
  } finally {
    noteScratch.innerHTML = '';
  }
}

function positionNoteOverlay(group, metrics, headCenterX, headCenterY) {
  if (!group || !metrics) return;
  if (group.dataset.token !== metrics.token) {
    group.innerHTML = metrics.innerHTML;
    group.dataset.token = metrics.token;
  }
  group.style.display = 'block';
  const translateX = headCenterX - metrics.headCenter.x;
  const translateY = headCenterY - metrics.headCenter.y;
  group.setAttribute('transform', `translate(${translateX}, ${translateY})`);
}

function onDragMove(ev) {
  if (!dragState) return;
  if (ev.cancelable) ev.preventDefault();
  const point = ev.touches && ev.touches[0] ? ev.touches[0] : ev;
  if (point == null || point.clientY == null) return;
  const clientY = point.clientY;
  const dy = dragState.lastY - clientY; // positive when moving up
  dragState.lastY = clientY;
  dragState.accum += dy;
  const pxPer = dragState.pxPerSemitone || 4;
  const preview = Math.round(dragState.accum / pxPer);
  if (preview !== dragState.previewDelta) {
    dragState.previewDelta = preview;
    const semitoneTarget = dragState.startChrom + preview;
    const midiTarget = 60 + semitoneTarget;
    const sci = scientificFromMidiPreferFlats(midiTarget);
    const targetAbc = scientificToAbc(sci);
    const targetDiatonic = abcTokenToDiatonicIndex(targetAbc);
    const diatonicDelta = targetDiatonic - dragState.baseDiatonic;
    if (dragState.smuflNote) {
      dragState.smuflNote.previewDrag({ diatonic: diatonicDelta, semitone: preview });
    }

    const translateY = -diatonicDelta * dragState.staffStep;
    const translate = `translate(0, ${translateY})`;
    const baseTransform = dragState.baseTransform;
    const newTransform = baseTransform ? `${translate} ${baseTransform}`.trim() : translate;
    dragState.svgGroup.setAttribute('transform', newTransform);

    const headCenterY = dragState.baseHeadY - diatonicDelta * dragState.staffStep;
    const headCenterX = dragState.baseHeadX;
    const overlay = dragState.noteOverlay;
    if (preview !== 0) {
      const fullToken = `${targetAbc}${dragState.baseDuration || ''}`;
      const metrics = getNoteGlyphMetrics(fullToken, targetAbc);
      if (metrics && overlay) {
        positionNoteOverlay(overlay, metrics, headCenterX, headCenterY);
        dragState.svgGroup.style.visibility = 'hidden';
      } else {
        if (overlay) hideNoteOverlay(overlay);
        dragState.svgGroup.style.visibility = '';
      }
    } else {
      if (overlay) hideNoteOverlay(overlay);
      dragState.svgGroup.style.visibility = '';
    }
  }
}

function onDragEnd() {
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragEnd);
  window.removeEventListener('pointercancel', onDragEnd);
  window.removeEventListener('touchmove', onDragMove);
  window.removeEventListener('touchend', onDragEnd);
  window.removeEventListener('touchcancel', onDragEnd);
  if (dragState) {
    const delta = dragState.previewDelta || 0;
    if (dragState.smuflNote) {
      if (delta === 0) {
        dragState.smuflNote.cancelDrag();
      } else {
        const semitoneTarget = dragState.startChrom + delta;
        const midiTarget = 60 + semitoneTarget;
        const sci = scientificFromMidiPreferFlats(midiTarget);
        const targetAbc = scientificToAbc(sci);
        const targetDiatonic = abcTokenToDiatonicIndex(targetAbc);
        const diatonicDelta = targetDiatonic - dragState.baseDiatonic;
        dragState.smuflNote.commitDrag({ diatonic: diatonicDelta, semitone: delta });
      }
    }
    // Clean visual artifacts
    if (dragState.svgGroup && dragState.pointerId != null && typeof dragState.svgGroup.releasePointerCapture === 'function') {
      try { dragState.svgGroup.releasePointerCapture(dragState.pointerId); } catch (releaseErr) { /* ignore */ }
    }
    if (dragState.svgGroup && delta === 0) {
      const baseTransform = dragState.baseTransform;
      if (baseTransform) {
        dragState.svgGroup.setAttribute('transform', baseTransform);
      } else {
        dragState.svgGroup.removeAttribute('transform');
      }
    }
    if (dragState.noteOverlay) {
      hideNoteOverlay(dragState.noteOverlay);
    }
    if (dragState.svgGroup) {
      dragState.svgGroup.style.visibility = delta === 0 ? '' : 'hidden';
    }
    if (delta !== 0) {
      commitSemitoneDeltaForMMN(delta);
    } else {
      if (dragState.svgGroup && dragState.baseTransform === '') {
        dragState.svgGroup.removeAttribute('transform');
      }
    }
  }
  dragState = null;
}

keySelect.addEventListener('change', (event) => {
  renderSelection(event.target.value, { useExisting: true });
});

renderSelection(keySelect.value, { useExisting: true });
