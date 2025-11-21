(() => {
  // /keyboard page controller
  const $ = (sel) => document.querySelector(sel);
  const FALLBACK_KEY_SIGNATURES = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];

  const state = {
    layout: null,
    viewLeftUnits: 0,
    viewSpanUnits: 0,
    whiteUnit: 1,
    minLeft: 0,
    maxRight: 0,
    viewportWhiteKeys: 14, // default visible white keys
    octaveOffset: 0,
    keySignature: 'C',
    chromaticPreference: 'sharp',
  };

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  function buildViewLayout(baseLayout) {
    if (!baseLayout) return null;
    // Produce a shallow clone with adjusted windowing
    return {
      ...baseLayout,
      unitMinLeft: state.viewLeftUnits,
      unitSpan: state.viewSpanUnits,
    };
  }

  function computeVisibleRangeLabel(layout) {
    if (!layout || !Array.isArray(layout.whiteKeyDetails)) return '—';
    const viewLeft = state.viewLeftUnits;
    const viewRight = state.viewLeftUnits + state.viewSpanUnits;
    const whites = layout.whiteKeyDetails;
    let first = null;
    let last = null;
    for (let i = 0; i < whites.length; i += 1) {
      const k = whites[i];
      const kLeft = k.leftUnits;
      const kRight = k.leftUnits + k.widthUnits;
      const overlap = (kRight > viewLeft) && (kLeft < viewRight);
      if (overlap) {
        if (!first) first = k;
        last = k;
      }
    }
    if (!first || !last) return '—';
    const a = first.displayLabel || first.note || first.rawNote || '?';
    const b = last.displayLabel || last.note || last.rawNote || '?';
    return `${a} – ${b}`;
  }

  function computeVisibleMidiRange(layout) {
    if (!layout || !Array.isArray(layout.whiteKeyDetails)) return null;
    const viewLeft = state.viewLeftUnits;
    const viewRight = state.viewLeftUnits + state.viewSpanUnits;
    const whites = layout.whiteKeyDetails;
    let first = null;
    let last = null;
    for (let i = 0; i < whites.length; i += 1) {
      const k = whites[i];
      const kLeft = k.leftUnits;
      const kRight = k.leftUnits + k.widthUnits;
      const overlap = (kRight > viewLeft) && (kLeft < viewRight);
      if (overlap) {
        if (!first) first = k;
        last = k;
      }
    }
    if (!first || !last) return null;
    return { low: first.midi, high: last.midi };
  }

  function chooseClefForRange(lowMidi, highMidi) {
    if (!Number.isFinite(lowMidi) || !Number.isFinite(highMidi)) return 'treble';
    const mid = (lowMidi + highMidi) / 2;
    // Simple center-based thresholds so C‑clefs actually appear:
    //  - mid < G3 (55) → bass
    //  - G3..C4 (55..60) → tenor
    //  - C4..F4 (60..65) → alto
    //  - ≥ F4 (65+) → treble
    if (mid < 55) return 'bass';
    if (mid < 60) return 'tenor';
    if (mid < 65) return 'alto';
    return 'treble';
  }

  async function main() {
    const noteReadout = $('#noteReadout');
    const rangeLabel = $('#rangeLabel');
    const btnLeft = $('#rangeLeft');
    const btnRight = $('#rangeRight');
    const btnClear = $('#clearStaff');
    const $settingsToggle = $('#keyboardSettingsToggle');
    const $settingsPanel = $('#keyboardSettingsPanel');
    const $timbre = $('#keyboardTimbre');
    const $keySignature = $('#keyboardKeySignature');
    const $chromaticPref = $('#keyboardChromaticPref');

    const audio = new (window.AudioModule || function(){})();
    const theory = new (window.MusicTheoryModule || function(){})();
    const KeyboardCtor = (window.KeyboardModule || function(){});
    const keyboard = new KeyboardCtor(theory, audio);
    keyboard.setLabelIncludesOctave?.(true);
    keyboard.setAllowOverlap?.(true);
    const staff = new (window.StaffModule || function(){})();
    const baseChromaticTonic = theory.getDefaultTonicLetter('chromatic') || 'C';

    const keySignatureModule = await import('/js/modules/KeySignatures.js').catch(() => null);
    const canonicalizeKeySignature = keySignatureModule?.canonicalizeKeySignature;
    const supportedKeySignatures = Array.isArray(keySignatureModule?.SUPPORTED_KEY_SIGNATURES)
      && keySignatureModule.SUPPORTED_KEY_SIGNATURES.length > 0
      ? keySignatureModule.SUPPORTED_KEY_SIGNATURES.slice()
      : FALLBACK_KEY_SIGNATURES.slice();

    if (!state.keySignature || (state.keySignature !== null && !supportedKeySignatures.includes(state.keySignature))) {
      state.keySignature = supportedKeySignatures.includes('C')
        ? 'C'
        : (supportedKeySignatures[0] || null);
    }

    const canonicalizeKeyValue = (value) => {
      if (!value) {
        return null;
      }
      if (typeof canonicalizeKeySignature === 'function') {
        try {
          const normalized = canonicalizeKeySignature(value);
          if (normalized) {
            return normalized;
          }
        } catch (error) {
          console.warn('Failed to canonicalize key signature:', error);
        }
      }
      if (theory && typeof theory.standardizeNoteName === 'function') {
        return theory.standardizeNoteName(value);
      }
      return value;
    };

    state.keySignature = canonicalizeKeyValue(state.keySignature);

    // Staff defaults (melodic = stemless entries by default)
    staff.dictationMode = 'melodic';
    await staff.initializeDisplay?.();
    const shouldUseChromaticPreference = () => !state.keySignature;

    const getDisplayOverrideTonic = () => {
      if (state.keySignature) {
        return state.keySignature;
      }
      return state.chromaticPreference === 'flat' ? 'Cb' : 'C#';
    };

    const getLayoutOptions = () => ({
      octaveOffset: state.octaveOffset,
      displayTonicOverride: getDisplayOverrideTonic(),
      chromaticPreference: shouldUseChromaticPreference() ? state.chromaticPreference : null,
    });

    const applyStaffTonality = () => {
      const spellerTonic = state.keySignature
        ? state.keySignature
        : (state.chromaticPreference === 'flat' ? 'Cb' : 'C#');
      const keySig = state.keySignature || 'C';
      try {
        staff.setKeySignature?.(keySig);
      } catch (error) {
        console.warn('Failed to set staff key signature:', error);
      }
      if (typeof staff.setNoteSpeller === 'function'
        && theory
        && typeof theory.spellNoteForStaff === 'function'
        && spellerTonic) {
        const mode = state.keySignature ? 'ionian' : 'chromatic';
        staff.setNoteSpeller((note) => theory.spellNoteForStaff(note, mode, spellerTonic));
      }
    };

    const updateKeyboardTonalityHooks = () => {
      if (typeof keyboard.setDisplayTonicForLabels === 'function') {
        keyboard.setDisplayTonicForLabels(state.keySignature || null);
      }
      if (typeof keyboard.setChromaticPreference === 'function') {
        keyboard.setChromaticPreference(shouldUseChromaticPreference() ? state.chromaticPreference : null);
      }
    };

    const recomputeLayout = ({ resetViewport = false } = {}) => {
      const layout = theory.buildKeyboardLayout('chromatic', baseChromaticTonic, getLayoutOptions());
      state.layout = layout;
      state.minLeft = layout.unitMinLeft || 0;
      state.maxRight = layout.unitMaxRight || (layout.unitMinLeft + layout.unitSpan);
      const firstWhite = layout.whiteKeyDetails?.[0];
      state.whiteUnit = (firstWhite && typeof firstWhite.widthUnits === 'number' && firstWhite.widthUnits > 0)
        ? firstWhite.widthUnits
        : 1;
      state.viewSpanUnits = state.viewportWhiteKeys * state.whiteUnit;
      const maxLeftBound = Math.max(state.minLeft, state.maxRight - state.viewSpanUnits);
      if (resetViewport || !Number.isFinite(state.viewLeftUnits)) {
        state.viewLeftUnits = clamp(state.minLeft, state.minLeft, maxLeftBound);
      } else {
        state.viewLeftUnits = clamp(state.viewLeftUnits, state.minLeft, maxLeftBound);
      }
      keyboard.renderKeyboard(buildViewLayout(layout));
      keyboard.updateKeyboardVisibility();
      updateRangeUI();
    };

    const applyTonalitySettings = ({ resetViewport = false } = {}) => {
      applyStaffTonality();
      updateKeyboardTonalityHooks();
      recomputeLayout({ resetViewport });
    };

    const populateKeySignatureOptions = () => {
      if (!$keySignature) {
        return;
      }
      $keySignature.innerHTML = '';
      const chromaticOption = document.createElement('option');
      chromaticOption.value = '';
      chromaticOption.textContent = 'Chromatic (no key signature)';
      $keySignature.appendChild(chromaticOption);
      supportedKeySignatures.forEach((key) => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = key;
        $keySignature.appendChild(option);
      });
      $keySignature.value = state.keySignature || '';
    };

    // Keyboard in chromatic mode, but use a robust unit-based layout so we can window it
    keyboard.setScaleType('chromatic');
    keyboard.setMode('chromatic', baseChromaticTonic);
    const MAX_VISIBLE = 10;
    const CHORD_WINDOW_MS = 70; // gather near-simultaneous presses into a chord
    const chordBuffer = new Set();
    let chordTimer = null;

    function flushChord() {
      const notes = Array.from(chordBuffer);
      chordBuffer.clear();
      chordTimer = null;
      if (notes.length === 0) return;
      try {
        if (notes.length > 1 && typeof staff.showChordOnStaffWithLimit === 'function') {
          staff.showChordOnStaffWithLimit(notes, MAX_VISIBLE);
        } else if (typeof staff.showNoteOnStaffWithLimit === 'function') {
          staff.showNoteOnStaffWithLimit(notes[0] || '', MAX_VISIBLE);
        } else {
          (notes.length > 1 ? staff.showNoteOnStaff(notes[0]) : staff.showNoteOnStaff(notes[0]));
        }
      } catch (e) { /* ignore */ }
      if (noteReadout) {
        noteReadout.textContent = `Played: ${notes.join(' + ')}`;
      }
    }

    keyboard.setupEventListeners(async (actualNote) => {
      // Buffer notes briefly to form chords
      if (actualNote) {
        chordBuffer.add(actualNote);
        if (!chordTimer) {
          chordTimer = setTimeout(flushChord, CHORD_WINDOW_MS);
        }
      }
    });

    // Settings: populate timbre/key-signature selects and toggle
    (function setupSettings() {
      // Restore saved timbre if present
      try {
        const savedId = localStorage.getItem('keyboard:timbre');
        if (savedId) audio.setTimbre(savedId);
      } catch {}

      if ($timbre && typeof audio.getAvailableTimbres === 'function') {
        const opts = audio.getAvailableTimbres();
        $timbre.innerHTML = '';
        opts.forEach(({ id, label }) => {
          const o = document.createElement('option');
          o.value = id; o.textContent = label;
          if (id === audio.getCurrentTimbreId()) o.selected = true;
          $timbre.appendChild(o);
        });
        $timbre.addEventListener('change', () => {
          const id = $timbre.value;
          audio.setTimbre(id);
          try { localStorage.setItem('keyboard:timbre', id); } catch {}
        });
      }

      if ($keySignature) {
        populateKeySignatureOptions();
        $keySignature.addEventListener('change', () => {
          const raw = $keySignature.value;
          const canonical = raw ? canonicalizeKeyValue(raw) : null;
          if (canonical !== state.keySignature) {
            state.keySignature = canonical;
            applyTonalitySettings({ resetViewport: false });
          }
        });
      }

      if ($chromaticPref) {
        $chromaticPref.value = state.chromaticPreference;
        $chromaticPref.addEventListener('change', () => {
          const next = $chromaticPref.value === 'flat' ? 'flat' : 'sharp';
          if (state.chromaticPreference !== next) {
            state.chromaticPreference = next;
            applyTonalitySettings({ resetViewport: false });
          }
        });
      }

      if ($settingsToggle && $settingsPanel) {
        const clearPressed = () => $settingsToggle.removeAttribute('data-pressed');
        $settingsToggle.addEventListener('pointerdown', () => $settingsToggle.setAttribute('data-pressed','true'));
        $settingsToggle.addEventListener('pointerup', clearPressed);
        $settingsToggle.addEventListener('pointercancel', clearPressed);
        $settingsToggle.addEventListener('blur', clearPressed);
        $settingsToggle.addEventListener('click', () => {
          const expanded = $settingsToggle.getAttribute('aria-expanded') === 'true';
          $settingsToggle.setAttribute('aria-expanded', String(!expanded));
          $settingsPanel.hidden = expanded;
        });
      }
    })();

    // Render initial keyboard view with the configured tonality
    applyTonalitySettings({ resetViewport: true });

    // Range label
    let currentClef = 'treble';
    const applyAutoClef = () => {
      const rng = computeVisibleMidiRange(state.layout);
      if (!rng) return;
      const next = chooseClefForRange(rng.low, rng.high);
      if (next && next !== currentClef) {
        currentClef = next;
        try { staff.setClef?.(next); } catch {}
      }
    };

    const updateRangeUI = () => {
      if (rangeLabel) {
        rangeLabel.textContent = `Range: ${computeVisibleRangeLabel(state.layout)}`;
      }
      applyAutoClef();
    };
    updateRangeUI();

    // Shift view helpers
    const rebuildForOffset = () => {
      recomputeLayout({ resetViewport: true });
    };

    const shiftByWhites = (count) => {
      // Legacy nudge (hardware arrow keys)
      const delta = count * state.whiteUnit;
      const maxLeftBound = Math.max(state.minLeft, state.maxRight - state.viewSpanUnits);
      state.viewLeftUnits = clamp(state.viewLeftUnits + delta, state.minLeft, maxLeftBound);
      keyboard.renderKeyboard(buildViewLayout(state.layout));
      keyboard.updateKeyboardVisibility();
      updateRangeUI();
    };

    // On-screen arrows shift by an octave (≈ 7 white keys)
    btnLeft?.addEventListener('click', () => { state.octaveOffset -= 1; rebuildForOffset(); });
    btnRight?.addEventListener('click', () => { state.octaveOffset += 1; rebuildForOffset(); });

    // Keyboard arrows support
    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); shiftByWhites(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); shiftByWhites(+1); }
      if (e.key === 'PageUp') { e.preventDefault(); shiftByWhites(-7); }
      if (e.key === 'PageDown') { e.preventDefault(); shiftByWhites(+7); }
    });

    // Clear button
    btnClear?.addEventListener('click', () => {
      staff.clearStaffNotes();
      if (noteReadout) noteReadout.textContent = 'Cleared.';
    });

    // Allow normal left-click behavior on this page. Right-click (context menu)
    // is globally disabled via /js/shared/blockContextMenu.js per product request.
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
})();
