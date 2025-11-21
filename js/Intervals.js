/* Intervals Game Controller */
(function () {
  const FEEDBACK = {
    idle: '',
    // Round flow now autoplays; avoid instructing user to press Play
    ready: 'Identify the interval…',
    correct: 'Correct!',
    wrong: 'Try again.',
    revealed: 'Shown on staff.',
  };

  const INTERVAL_NAMES = {
    0: 'P1',
    1: 'm2',
    2: 'M2',
    3: 'm3',
    4: 'M3',
    5: 'P4',
    6: 'TT', // tritone (A4/d5)
    7: 'P5',
    8: 'm6',
    9: 'M6',
    10: 'm7',
    11: 'M7',
    12: 'P8',
  };

  const TREBLE_RANGE = { min: 55, max: 90 }; // Defaults (G3..F#6); refined once theory loads
  const PREFERRED_ROOT_RANGE = { min: 55, max: 72 };
  // How long to keep the judged (green/red) answer on staff before next example
  const ANSWER_FEEDBACK_MS = 1360; // previously ~360ms; user requested ~1s longer

  function buildChoiceSet(container, onChoose) {
    // Exclude P1 (0 semitones) from choices
    const order = [1,2,3,4,5,6,7,8,9,10,11,12];
    container.textContent = '';
    order.forEach(n => {
      const btn = document.createElement('button');
      btn.className = 'control-btn ui-pill interval-choice';
      btn.textContent = INTERVAL_NAMES[n];
      btn.dataset.semitones = String(n);
      // ARIA radio semantics
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', 'false');
      btn.setAttribute('aria-pressed', 'false');
      btn.tabIndex = -1; // roving tabindex; set first to 0 after build
      // Ripple feedback
      btn.addEventListener('pointerdown', (e) => {
        try {
          const rect = btn.getBoundingClientRect();
          const size = Math.max(rect.width, rect.height) * 2;
          const ripple = document.createElement('span');
          ripple.className = 'ripple';
          ripple.style.width = ripple.style.height = size + 'px';
          const x = (e.clientX || (rect.left + rect.width/2)) - rect.left - size/2;
          const y = (e.clientY || (rect.top + rect.height/2)) - rect.top - size/2;
          ripple.style.left = x + 'px';
          ripple.style.top = y + 'px';
          btn.appendChild(ripple);
          setTimeout(() => ripple.remove(), 600);
        } catch {}
      });
      btn.addEventListener('click', () => {
        onChoose(n, btn);
      });
      container.appendChild(btn);
    });
    // Initialize roving tabindex: first enabled gets tabindex=0
    const first = container.querySelector('.interval-choice');
    if (first) first.tabIndex = 0;
  }

  function chooseDirection(dir) {
    if (dir === 'up' || dir === 'down') return dir;
    return Math.random() < 0.5 ? 'up' : 'down';
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  function renderFeedback(text, type) {
    const el = document.getElementById('intervalsFeedback');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = '';
    if (type === 'ok') el.style.color = 'var(--app-success, #5bd597)';
    else if (type === 'err') el.style.color = 'var(--app-danger, #ff6a6a)';
    else if (type === 'info') el.style.color = 'var(--app-text-primary, #fff)';
  }

  async function main() {
    const theory = new (window.MusicTheoryModule || function(){})();
    const audio = new (window.AudioModule || function(){})();
    const staff = new (window.StaffModule || function(){})();
    let fonts = window.StaffFonts || null;
    if (!fonts) {
      try {
        const module = await import('/js/modules/StaffFonts.js');
        fonts = module?.default || module || null;
        if (fonts && typeof fonts === 'object') {
          window.StaffFonts = fonts;
        }
      } catch (error) {
        console.warn('[Intervals] Unable to load StaffFonts module.', error);
      }
    }
    const scoring = new (window.ScoringModule || function(){})();

    const midiOf = (note, fallback) => {
      if (theory && typeof theory.noteToSemitone === 'function') {
        try {
          const value = theory.noteToSemitone(note);
          if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
          }
        } catch {}
      }
      return fallback;
    };

    const computedMin = midiOf('G3', TREBLE_RANGE.min);
    const computedMax = midiOf('F#6', TREBLE_RANGE.max);
    TREBLE_RANGE.min = Math.min(computedMin, computedMax);
    TREBLE_RANGE.max = Math.max(computedMin, computedMax);
    PREFERRED_ROOT_RANGE.min = clamp(midiOf('B3', PREFERRED_ROOT_RANGE.min), TREBLE_RANGE.min, TREBLE_RANGE.max);
    PREFERRED_ROOT_RANGE.max = clamp(midiOf('E5', PREFERRED_ROOT_RANGE.max), PREFERRED_ROOT_RANGE.min, TREBLE_RANGE.max);

    // Configure initial staff font stack if helper exists
    if (fonts && typeof fonts.configureVexflowFont === 'function' && window.VexFlow) {
      try { await fonts.configureVexflowFont(window.VexFlow, 'bravura'); } catch {}
    }

    const $start = document.getElementById('intervalStartBtn');
    const $play = document.getElementById('intervalPlayBtn');
    const $reveal = document.getElementById('intervalRevealBtn');
    const $type = document.getElementById('intervalType');
    const $dir = document.getElementById('intervalDirection');
    const $timbre = document.getElementById('intervalTimbre');
    const $choices = document.getElementById('intervalChoices');
    const $settingsToggle = document.getElementById('settingsToggle');
    const $settingsPanel = document.getElementById('intervalSettingsPanel');
    const $showAnswer = document.getElementById('intervalShowAnswer');

    // Populate timbres
    if ($timbre && typeof audio.getAvailableTimbres === 'function') {
      const opts = audio.getAvailableTimbres();
      $timbre.innerHTML = '';
      opts.forEach(({ id, label }) => {
        const o = document.createElement('option');
        o.value = id; o.textContent = label;
        if (id === audio.getCurrentTimbreId()) o.selected = true;
        $timbre.appendChild(o);
      });
      $timbre.addEventListener('change', () => audio.setTimbre($timbre.value));
    }

    // Build interval choice buttons
    buildChoiceSet($choices, handleGuess);

    const state = {
      rootMidi: null,
      otherMidi: null,
      semitones: null,
      direction: 'up',
      type: 'melodic',
      revealed: false,
      hadWrongGuess: false,
      nextTimeout: null,
      showAnswer: true,
    };

    // Settings toggle (collapsible) and options
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

    // Show right answer toggle binds to state
    if ($showAnswer) {
      state.showAnswer = !!$showAnswer.checked;
      $showAnswer.addEventListener('change', () => { state.showAnswer = !!$showAnswer.checked; });
    }

    function getChoiceButtons() {
      const container = document.getElementById('intervalChoices');
      return container ? Array.from(container.querySelectorAll('.interval-choice')) : [];
    }

    function resetChoiceStates() {
      getChoiceButtons().forEach(b => {
        b.disabled = false;
        b.classList.remove('is-selected','is-correct','is-wrong');
        b.setAttribute('aria-pressed','false');
        b.setAttribute('aria-checked','false');
        b.tabIndex = -1;
      });
      const btns = getChoiceButtons();
      if (btns.length) btns[0].tabIndex = 0;
    }

    function disableAllChoices() {
      getChoiceButtons().forEach(b => { b.disabled = true; });
    }

    // Keyboard support for radiogroup navigation and selection
    (function setupChoiceKeyboard() {
      const container = document.getElementById('intervalChoices');
      if (!container) return;
      container.addEventListener('keydown', (e) => {
        const btns = getChoiceButtons().filter(b => !b.disabled);
        if (!btns.length) return;
        const active = document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('interval-choice') ? document.activeElement : null;
        let idx = Math.max(0, btns.indexOf(active));
        let handled = false;
        const move = (delta) => {
          idx = (idx + delta + btns.length) % btns.length;
          btns.forEach(b => b.tabIndex = -1);
          const target = btns[idx];
          target.tabIndex = 0;
          target.focus();
        };
        switch (e.key) {
          case 'ArrowLeft': case 'ArrowUp': move(-1); handled = true; break;
          case 'ArrowRight': case 'ArrowDown': move(1); handled = true; break;
          case 'Home': btns.forEach(b => b.tabIndex = -1); btns[0].tabIndex = 0; btns[0].focus(); handled = true; break;
          case 'End': btns.forEach(b => b.tabIndex = -1); btns[btns.length-1].tabIndex = 0; btns[btns.length-1].focus(); handled = true; break;
          case ' ': case 'Enter':
            if (active) { active.click(); handled = true; }
            break;
        }
        if (handled) e.preventDefault();
      });
    })();

    function resetUI() {
      // Keep Replay and Reveal enabled only when a problem exists
      const hasProblem = state.rootMidi != null;
      $play.disabled = !hasProblem;
      $reveal.disabled = !hasProblem;
    }

    function pickRoot(rangeLo = TREBLE_RANGE.min, rangeHi = TREBLE_RANGE.max) {
      const lo = Math.min(rangeLo, rangeHi);
      const hi = Math.max(rangeLo, rangeHi);
      return Math.floor(lo + Math.random() * (hi - lo + 1));
    }

    function computeOther(rootMidi, semitones, direction, bounds = TREBLE_RANGE) {
      const delta = direction === 'down' ? -semitones : semitones;
      return clamp(rootMidi + delta, bounds.min, bounds.max);
    }

    function toNote(midi) {
      if (!theory || typeof theory.semitoneToNote !== 'function') return '';
      return theory.semitoneToNote(midi);
    }

    function toFreq(note) {
      if (!theory || typeof theory.getNoteFrequency !== 'function') return undefined;
      return theory.getNoteFrequency(note);
    }

    function setStaffMode(type) {
      try {
        staff.dictationMode = type === 'harmonic' ? 'harmonic' : 'melodic';
      } catch {}
    }

    async function playCurrent() {
      const root = toNote(state.rootMidi);
      const other = toNote(state.otherMidi);
      if (!root || !other) return;
      const isValidFrequency = (freq) => typeof freq === 'number' && Number.isFinite(freq);
      const rootFreq = toFreq(root);
      const otherFreq = toFreq(other);
      // Pause timer while the example interval is played
      try { if (scoring && typeof scoring.pauseSequenceTimer === 'function') scoring.pauseSequenceTimer(); } catch {}
      if (state.type === 'harmonic') {
        const f = [rootFreq, otherFreq].filter(isValidFrequency);
        if (f.length) {
          await audio.playChord(f, 0.8);
        }
      } else {
        const seq = [rootFreq, otherFreq].filter(isValidFrequency);
        if (seq.length) {
          if (typeof audio.playToneSequence === 'function') {
            // Slightly tighter melodic gap than the original 140ms
            await audio.playToneSequence(seq, 0.55, 0.12);
          } else {
            // Fallback: preserve previous behavior if sequence helper is unavailable
            if (isValidFrequency(rootFreq)) {
              await audio.playTone(rootFreq, 0.55);
              await new Promise(r => setTimeout(r, 120));
            }
            if (isValidFrequency(otherFreq)) {
              await audio.playTone(otherFreq, 0.55);
            }
          }
        }
      }
      // Optional: show a transient highlight pass
      try {
        await staff.replayOnStaff([root, other], { dictationMode: state.type, useTemporaryLayout: true, noteDuration: 550, gapDuration: 140 });
      } catch {}
      // Resume timer after playback completes
      try { if (scoring && typeof scoring.resumeSequenceTimer === 'function') scoring.resumeSequenceTimer(); } catch {}
    }

    async function reveal(opts = { forfeitClean: true }) {
      const root = toNote(state.rootMidi);
      const other = toNote(state.otherMidi);
      // Pause timer while we show the answer (only resume if it was running)
      const wasRunning = !!(scoring && typeof scoring.isTimerRunning === 'function' && scoring.isTimerRunning());
      if (wasRunning && typeof scoring.pauseSequenceTimer === 'function') scoring.pauseSequenceTimer();
      setStaffMode(state.type);
      try {
        staff.clearStaffNotes();
        if (state.type === 'harmonic') {
          // Show as a chord
          staff.noteEntries = [{ note: root, notes: [root, other].sort((a,b)=> (theory.noteToSemitone(a)-theory.noteToSemitone(b))), state: 'reference' }];
          await staff.enqueue((display) => display.setSequence(staff.noteEntries));
        } else {
          staff.showNoteOnStaff(root);
          staff.showNoteOnStaff(other);
        }
      } catch {}
      renderFeedback(`${INTERVAL_NAMES[state.semitones]} — ${state.direction === 'down' ? 'down' : 'up'}`, 'info');
      // Treat reveal as forfeiting a clean answer, unless explicitly suppressed
      if (!opts || opts.forfeitClean !== false) {
        state.hadWrongGuess = true;
      }
      state.revealed = true;
      // Resume timer if it was running before reveal
      if (wasRunning && typeof scoring.resumeSequenceTimer === 'function') scoring.resumeSequenceTimer();
    }

    async function showJudgementOnStaff(isCorrect) {
      const root = toNote(state.rootMidi);
      const other = toNote(state.otherMidi);
      if (!root || !other) return;
      setStaffMode(state.type);
      try {
        staff.clearStaffNotes();
        const stateLabel = isCorrect ? 'correct' : 'incorrect';
        if (state.type === 'harmonic') {
          const sorted = [root, other].sort((a,b)=> (theory.noteToSemitone(a)-theory.noteToSemitone(b)));
          staff.noteEntries = [{ note: sorted[0], notes: sorted, state: stateLabel }];
          await staff.enqueue((display) => display.setSequence(staff.noteEntries));
        } else {
          staff.noteEntries = [{ note: root, state: stateLabel }, { note: other, state: stateLabel }];
          await staff.enqueue((display) => display.setSequence(staff.noteEntries));
        }
      } catch (e) {
        // Non-fatal: if staff unavailable, continue flow
      }
    }

    async function handleGuess(n, btn) {
      if (state.rootMidi == null) return;
      // Immediate clicked feedback
      btn.classList.add('is-selected');
      btn.setAttribute('aria-pressed', 'true');
      btn.setAttribute('aria-checked', 'true');
      // Update roving tabindex to the chosen button
      getChoiceButtons().forEach(b => b.tabIndex = -1);
      btn.tabIndex = 0;
      const correct = Number(n) === Number(state.semitones);
      state.hadWrongGuess = !correct;

      // Mark selection result and freeze choices
      if (correct) {
        btn.classList.add('is-correct');
        renderFeedback('Correct!', 'ok');
      } else {
        btn.classList.add('is-wrong');
        renderFeedback('Incorrect.', 'err');
      }
      disableAllChoices();

      // Grade immediately using the chosen value
      const target = [String(state.semitones)];
      const user = [String(n)];
      const result = scoring.checkSequence(user, target, { dictationType: 'melodic' });
      scoring.updateScore();
      scoring.updateRoundDisplay();

      // Show judgement on the staff (green/red) without halting the flow
      if (state.showAnswer) {
        await showJudgementOnStaff(correct);
      }

      // Round end or immediate next without countdown
      if (scoring.isRoundComplete()) {
        const round = scoring.completeRound('intervals', 'intervals', 'melodic', 1);
        renderFeedback(`Round complete! ${round.accuracy}% accuracy in ${round.duration}. Click "Start Round" to begin another.`, 'ok');
        const timerEl = document.getElementById('timer');
        if (timerEl) timerEl.textContent = '00:00';
        if ($start) {
          $start.textContent = 'Start Round';
        }
        // Reset current problem state
        state.rootMidi = null; state.otherMidi = null; state.semitones = null; state.revealed = false; state.hadWrongGuess = false;
        resetUI();
        return;
      }

      if (state.nextTimeout) { clearTimeout(state.nextTimeout); clearInterval(state.nextTimeout); }
      // keep the judged answer visible a bit longer before continuing (or shorter if hidden)
      const delay = state.showAnswer ? ANSWER_FEEDBACK_MS : 180;
      state.nextTimeout = setTimeout(() => { newProblem(); }, delay);
    }

    function newProblem() {
      state.type = ($type.value === 'harmonic') ? 'harmonic' : 'melodic';
      state.direction = chooseDirection($dir.value);
      // Pick 1..12 (exclude P1/unison)
      state.semitones = Math.floor(Math.random() * 12) + 1; // 1..12
      state.hadWrongGuess = false;
      // Choose a root that keeps the other note in-bounds without clamping
      const GLOBAL_MIN = TREBLE_RANGE.min;
      const GLOBAL_MAX = TREBLE_RANGE.max;
      const PREF_MIN = PREFERRED_ROOT_RANGE.min;
      const PREF_MAX = PREFERRED_ROOT_RANGE.max;
      let lo = PREF_MIN, hi = PREF_MAX;
      if (state.direction === 'up') {
        hi = Math.min(PREF_MAX, GLOBAL_MAX - state.semitones);
      } else {
        lo = Math.max(PREF_MIN, GLOBAL_MIN + state.semitones);
      }
      if (hi < lo) {
        lo = clamp(GLOBAL_MIN + state.semitones, GLOBAL_MIN, GLOBAL_MAX);
        hi = clamp(GLOBAL_MAX - state.semitones, lo, GLOBAL_MAX);
      }
      state.rootMidi = pickRoot(lo, hi);
      state.otherMidi = computeOther(state.rootMidi, state.semitones, state.direction, TREBLE_RANGE);
      state.revealed = false;
      setStaffMode(state.type);
      try { staff.clearStaffNotes(); } catch {}
      renderFeedback(FEEDBACK.ready, 'info');
      resetChoiceStates();
      $play.disabled = false; $reveal.disabled = false;
      // Start round/sequence timer accounting
      scoring.startNewSequence();
      // Ensure timer is paused until example playback finishes
      try { if (typeof scoring.pauseSequenceTimer === 'function') scoring.pauseSequenceTimer(); } catch {}
      // Autoplay the interval for this problem
      // Yield a tick so UI updates before audio kicks in
      setTimeout(() => { playCurrent(); }, 10);
    }

    function startRound() {
      // Clear any pending next timers from a previous partial flow
      if (state.nextTimeout) { clearInterval(state.nextTimeout); clearTimeout(state.nextTimeout); state.nextTimeout = null; }
      if ($start) {
        $start.textContent = 'Restart Round';
      }
      scoring.startNewRound();
      newProblem(); // will autoplay
    }

    $start.addEventListener('click', startRound);

    $play.addEventListener('click', playCurrent);
    $reveal.addEventListener('click', reveal);

    // Initial
    resetUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
})();
