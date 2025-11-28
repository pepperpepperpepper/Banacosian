import { VexflowStaffDisplay } from '/js/vexflow/StaffDisplay.js';
import { readStaffConfigFromDataset } from '/js/vexflow/core/config.js';

const TOTAL_ROUNDS = 20;
const NOTE_TIME_LIMIT_MS = 5000;
const TIMER_UPDATE_MS = 50;
const ROUND_GAP_MS = 400;
const INCORRECT_PAUSE_MS = 1600;

const LEDGER_NOTES = [
  // Treble clef — below (down to space beyond 4th ledger line, not 5th)
  { clef: 'treble', letter: 'C', octave: 4, region: 'below' }, // 1st ledger line
  { clef: 'treble', letter: 'B', octave: 3, region: 'below' }, // space (still 1 ledger line used)
  { clef: 'treble', letter: 'A', octave: 3, region: 'below' }, // 2nd ledger line
  { clef: 'treble', letter: 'G', octave: 3, region: 'below' }, // space
  { clef: 'treble', letter: 'F', octave: 3, region: 'below' }, // 3rd ledger line
  { clef: 'treble', letter: 'E', octave: 3, region: 'below' }, // space
  { clef: 'treble', letter: 'D', octave: 3, region: 'below' }, // 4th ledger line
  { clef: 'treble', letter: 'C', octave: 3, region: 'below' }, // space beyond 4th (exclude B2 = 5th line)
  // Treble clef — above (up to space beyond 4th ledger line, not 5th)
  { clef: 'treble', letter: 'A', octave: 5, region: 'above' }, // 1st ledger line
  { clef: 'treble', letter: 'B', octave: 5, region: 'above' }, // space
  { clef: 'treble', letter: 'C', octave: 6, region: 'above' }, // 2nd ledger line
  { clef: 'treble', letter: 'D', octave: 6, region: 'above' }, // space
  { clef: 'treble', letter: 'E', octave: 6, region: 'above' }, // 3rd ledger line
  { clef: 'treble', letter: 'F', octave: 6, region: 'above' }, // space
  { clef: 'treble', letter: 'G', octave: 6, region: 'above' }, // 4th ledger line
  { clef: 'treble', letter: 'A', octave: 6, region: 'above' }, // space beyond 4th (exclude B6 = 5th line)
  // Bass clef — below (down to space beyond 4th ledger line, not 5th)
  { clef: 'bass', letter: 'E', octave: 2, region: 'below' }, // 1st ledger line
  { clef: 'bass', letter: 'D', octave: 2, region: 'below' }, // space
  { clef: 'bass', letter: 'C', octave: 2, region: 'below' }, // 2nd ledger line
  { clef: 'bass', letter: 'B', octave: 1, region: 'below' }, // space
  { clef: 'bass', letter: 'A', octave: 1, region: 'below' }, // 3rd ledger line
  { clef: 'bass', letter: 'G', octave: 1, region: 'below' }, // space
  { clef: 'bass', letter: 'F', octave: 1, region: 'below' }, // 4th ledger line
  { clef: 'bass', letter: 'E', octave: 1, region: 'below' }, // space beyond 4th (exclude D1 = 5th line)
  // Bass clef — above (up to space beyond 4th ledger line, not 5th)
  { clef: 'bass', letter: 'C', octave: 4, region: 'above' }, // 1st ledger line
  { clef: 'bass', letter: 'D', octave: 4, region: 'above' }, // space
  { clef: 'bass', letter: 'E', octave: 4, region: 'above' }, // 2nd ledger line
  { clef: 'bass', letter: 'F', octave: 4, region: 'above' }, // space
  { clef: 'bass', letter: 'G', octave: 4, region: 'above' }, // 3rd ledger line
  { clef: 'bass', letter: 'A', octave: 4, region: 'above' }, // space
  { clef: 'bass', letter: 'B', octave: 4, region: 'above' }, // 4th ledger line
  { clef: 'bass', letter: 'C', octave: 5, region: 'above' }, // space beyond 4th (exclude D5 = 5th line)
].map((entry) => ({
  ...entry,
  display: `${entry.letter}${entry.octave} (${entry.clef} clef)`,
}));

const REGION_LABEL = {
  above: 'Above the staff',
  below: 'Below the staff',
};

function pickRandomNote() {
  return LEDGER_NOTES[Math.floor(Math.random() * LEDGER_NOTES.length)];
}

function noteKey(note) {
  if (!note) return '';
  const letter = (note.letter || '').toUpperCase();
  const octave = Number.isFinite(note.octave) ? note.octave : '';
  return `${note.clef}|${letter}|${octave}`;
}

class LedgerQuiz {
  constructor() {
    this.staffEl = document.getElementById('ledgerStaff');
    if (!this.staffEl) {
      console.warn('[LedgerQuiz] Missing staff container');
      return;
    }
    this.feedbackEl = document.getElementById('ledgerFeedback');
    this.clefLabel = document.getElementById('ledgerClefLabel');
    this.rangeLabel = document.getElementById('ledgerRangeLabel');
    this.correctEl = document.getElementById('ledgerCorrect');
    this.totalEl = document.getElementById('ledgerTotal');
    this.accuracyEl = document.getElementById('ledgerAccuracy');
    this.timerEl = document.getElementById('ledgerTimer');
    this.roundEl = document.getElementById('ledgerRound');
    this.startBtn = document.getElementById('ledgerStartBtn');
    this.nextBtn = document.getElementById('ledgerNextBtn');
    this.noteButtons = Array.from(document.querySelectorAll('[data-ledger-note]'));
    this.summaryEl = document.getElementById('ledgerSummary');
    // Settings elements
    this.settingsToggle = document.getElementById('ledgerSettingsToggle');
    this.settingsPanel = document.getElementById('ledgerSettingsPanel');
    this.noteTogglesEl = document.getElementById('ledgerNoteToggles');
    this.selectAllBtn = document.getElementById('ledgerSelectAllBtn');
    this.clearAllBtn = document.getElementById('ledgerClearAllBtn');
    this.applyBtn = document.getElementById('ledgerApplyBtn');
    this.display = null;
    this.displayReady = this.initializeStaffDisplay();
    this.state = {
      active: false,
      awaitingNext: false,
      stats: { correct: 0, total: 0 },
      roundIndex: 0,
      history: [],
    };
    this.currentNote = null;
    // Unique-note deck per session
    this.noteDeck = [];
    this.deckIndex = 0;
    this.sessionTotalRounds = TOTAL_ROUNDS;
    this.roundStartMs = null;
    // Excluded notes (persisted)
    this.excludedSet = new Set(this.loadExcluded());
    this.roundTimers = {
      intervalId: null,
      timeoutId: null,
      deadline: null,
    };

    this.bindEvents();
    this.initSettingsUI();
    this.updateStats();
    this.updateRoundIndicator();
    this.updateTimerDisplay(0);
    this.renderNote(null);
  }

  // Build a shuffled deck of notes so no note repeats within a session
  buildNoteDeck() {
    const deck = LEDGER_NOTES.filter((n) => !this.excludedSet.has(noteKey(n)));
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = deck[i];
      deck[i] = deck[j];
      deck[j] = t;
    }
    return deck;
  }

  drawNextNote() {
    if (!Array.isArray(this.noteDeck) || this.deckIndex >= this.noteDeck.length) return null;
    const n = this.noteDeck[this.deckIndex];
    this.deckIndex += 1;
    return n;
  }

  async initializeStaffDisplay() {
    if (!this.staffEl) return null;
    try {
      const config = typeof readStaffConfigFromDataset === 'function'
        ? readStaffConfigFromDataset(this.staffEl.dataset || {})
        : null;
      const sizing = config?.sizing || {};
      const display = new VexflowStaffDisplay({
        container: this.staffEl,
        clef: 'treble',
        keySignature: 'C',
        minWidth: sizing.minWidth ?? undefined,
        maxWidth: sizing.maxWidth ?? undefined,
        targetWidth: sizing.targetWidth ?? undefined,
        baseHeight: sizing.baseHeight ?? undefined,
        staffScale: config?.scale ?? undefined,
        staffScaleY: config?.scaleY ?? undefined,
      });
      await display.initialize();
      await display.setSequence([]);
      this.display = display;
      return display;
    } catch (error) {
      console.error('[LedgerQuiz] Failed to initialize staff display.', error);
      this.setFeedback('Unable to load staff.');
      return null;
    }
  }

  bindEvents() {
    this.startBtn?.addEventListener('click', () => this.startSession());
    this.nextBtn?.addEventListener('click', () => this.skipCurrentRound());
    this.noteButtons.forEach((btn) => {
      btn.addEventListener('click', () => this.handleGuess(btn.dataset.ledgerNote));
    });
  }

  initSettingsUI() {
    // Toggle panel visibility
    this.settingsToggle?.addEventListener('click', () => {
      const willShow = this.settingsPanel?.hidden !== false;
      if (this.settingsPanel) this.settingsPanel.hidden = !willShow;
      if (this.settingsToggle) this.settingsToggle.setAttribute('aria-expanded', willShow ? 'true' : 'false');
      if (willShow) this.renderNoteToggles();
    });
    if (this.settingsPanel && this.settingsPanel.hidden === false) {
      this.renderNoteToggles();
    }
    this.selectAllBtn?.addEventListener('click', () => {
      this.excludedSet.clear();
      this.saveExcluded();
      this.renderNoteToggles();
    });
    this.clearAllBtn?.addEventListener('click', () => {
      this.excludedSet = new Set(LEDGER_NOTES.map((n) => noteKey(n)));
      this.saveExcluded();
      this.renderNoteToggles();
    });
    this.applyBtn?.addEventListener('click', () => {
      this.startSession();
    });
  }

  renderNoteToggles() {
    if (!this.noteTogglesEl) return;
    const frag = document.createDocumentFragment();
    LEDGER_NOTES.forEach((n, idx) => {
      const id = `ledger_note_toggle_${idx}`;
      const wrapper = document.createElement('label');
      wrapper.className = 'ledger-note-toggle';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = id;
      input.checked = !this.excludedSet.has(noteKey(n));
      input.addEventListener('change', () => {
        const k = noteKey(n);
        if (input.checked) {
          this.excludedSet.delete(k);
        } else {
          this.excludedSet.add(k);
        }
        this.saveExcluded();
      });
      const span = document.createElement('span');
      const region = REGION_LABEL[n.region] || '';
      span.textContent = `${n.display} — ${region}`;
      wrapper.appendChild(input);
      wrapper.appendChild(span);
      frag.appendChild(wrapper);
    });
    this.noteTogglesEl.innerHTML = '';
    this.noteTogglesEl.appendChild(frag);
  }

  saveExcluded() {
    try {
      const arr = Array.from(this.excludedSet);
      localStorage.setItem('ledger_excluded_notes_v1', JSON.stringify(arr));
    } catch (e) {
      // ignore
    }
  }

  loadExcluded() {
    try {
      const raw = localStorage.getItem('ledger_excluded_notes_v1');
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
    } catch (e) {
      return [];
    }
  }

  startSession() {
    this.clearRoundTimers();
    this.state.active = true;
    this.state.awaitingNext = false;
    this.state.stats.correct = 0;
    this.state.stats.total = 0;
    this.state.roundIndex = 0;
    this.state.history = [];
    this.currentNote = null;
    this.noteDeck = this.buildNoteDeck();
    this.deckIndex = 0;
    this.sessionTotalRounds = Math.min(TOTAL_ROUNDS, this.noteDeck.length);
    this.roundStartMs = null;
    if (this.sessionTotalRounds === 0) {
      this.state.active = false;
      this.enableAnswerButtons(false);
      if (this.nextBtn) this.nextBtn.disabled = true;
      this.updateRoundIndicator();
      this.setFeedback('No notes available — re-enable some in Settings.');
      return;
    }
    this.startBtn.textContent = 'Restart Quiz';
    if (this.nextBtn) {
      this.nextBtn.disabled = false;
    }
    this.resetAnswerButtons();
    this.enableAnswerButtons(true);
    this.updateStats();
    this.updateRoundIndicator();
    this.updateTimerDisplay(0);
    this.setFeedback('Identify the ledger-line pitch.');
    if (this.summaryEl) {
      this.summaryEl.hidden = true;
      this.summaryEl.innerHTML = '';
    }
    this.showRandomNote();
  }

  skipCurrentRound() {
    if (!this.state.active) {
      this.startSession();
      return;
    }
    this.handleTimeout(true);
  }

  async showRandomNote() {
    if (!this.state.active) return;
    if (this.state.roundIndex >= this.sessionTotalRounds) {
      this.endSession();
      return;
    }
    this.state.roundIndex += 1;
    this.updateRoundIndicator();
    const nextNote = this.drawNextNote();
    if (!nextNote) {
      this.endSession();
      return;
    }
    this.currentNote = nextNote;
    this.state.awaitingNext = false;
    await this.renderNote(this.currentNote);
    this.resetAnswerButtons();
    this.enableAnswerButtons(true);
    if (this.clefLabel) {
      this.clefLabel.textContent = this.currentNote.clef === 'treble' ? 'Treble' : 'Bass';
    }
    if (this.rangeLabel) {
      this.rangeLabel.textContent = REGION_LABEL[this.currentNote.region] || '—';
    }
    this.setFeedback('What is this note?');
    this.roundStartMs = performance.now();
    this.startRoundTimer();
  }

  handleGuess(letter) {
    if (!this.state.active || !this.currentNote || this.state.awaitingNext) {
      return;
    }
    const isCorrect = letter === this.currentNote.letter;
    this.flagButtonStates(letter);
    this.enableAnswerButtons(false);
    this.setFeedback(isCorrect ? `Correct! ${this.currentNote.display}.` : `Not quite. That was ${this.currentNote.display}.`);
    const delay = isCorrect ? ROUND_GAP_MS : INCORRECT_PAUSE_MS;
    const elapsed = this.computeElapsedMs();
    this.recordRound({
      outcome: isCorrect ? 'correct' : 'wrong',
      guessed: letter,
      isCorrect,
      timeMs: elapsed,
    });
    this.completeRound(isCorrect, delay);
  }

  handleTimeout(isSkip = false) {
    if (!this.state.active || !this.currentNote || this.state.awaitingNext) {
      return;
    }
    this.flagButtonStates(null);
    this.enableAnswerButtons(false);
    const prefix = isSkip ? 'Skipped' : 'Time up';
    this.setFeedback(`${prefix}. That was ${this.currentNote.display}.`);
    const elapsed = this.computeElapsedMs();
    this.recordRound({
      outcome: isSkip ? 'skip' : 'timeout',
      guessed: null,
      isCorrect: false,
      timeMs: elapsed,
    });
    this.completeRound(false, INCORRECT_PAUSE_MS);
  }

  completeRound(isCorrect, delayOverride = null) {
    this.clearRoundTimers();
    this.state.awaitingNext = true;
    this.state.stats.total += 1;
    if (isCorrect) {
      this.state.stats.correct += 1;
    }
    this.updateStats();
    if (this.state.stats.total >= this.sessionTotalRounds) {
      this.endSession();
      return;
    }
    const delay = Number.isFinite(delayOverride) ? delayOverride : (isCorrect ? ROUND_GAP_MS : INCORRECT_PAUSE_MS);
    window.setTimeout(() => {
      if (!this.state.active) return;
      this.showRandomNote();
    }, delay);
  }

  startRoundTimer() {
    this.clearRoundTimers();
    this.roundTimers.deadline = performance.now() + NOTE_TIME_LIMIT_MS;
    this.updateTimerDisplay(NOTE_TIME_LIMIT_MS);
    this.roundTimers.intervalId = window.setInterval(
      () => this.updateTimerDisplay(),
      TIMER_UPDATE_MS,
    );
    this.roundTimers.timeoutId = window.setTimeout(
      () => this.handleTimeout(false),
      NOTE_TIME_LIMIT_MS,
    );
  }

  clearRoundTimers() {
    if (this.roundTimers.intervalId) {
      window.clearInterval(this.roundTimers.intervalId);
      this.roundTimers.intervalId = null;
    }
    if (this.roundTimers.timeoutId) {
      window.clearTimeout(this.roundTimers.timeoutId);
      this.roundTimers.timeoutId = null;
    }
    this.roundTimers.deadline = null;
  }

  updateTimerDisplay(forceValueMs = null) {
    if (!this.timerEl) return;
    const remaining = (() => {
      if (forceValueMs != null) return forceValueMs;
      if (!this.roundTimers.deadline) return 0;
      return Math.max(0, this.roundTimers.deadline - performance.now());
    })();
    this.timerEl.textContent = `${(remaining / 1000).toFixed(1)}s`;
  }

  updateRoundIndicator() {
    if (!this.roundEl) return;
    const cap = Number.isFinite(this.sessionTotalRounds) ? this.sessionTotalRounds : TOTAL_ROUNDS;
    const clamped = Math.min(this.state.roundIndex, cap);
    this.roundEl.textContent = `${clamped} / ${cap}`;
  }

  endSession() {
    this.clearRoundTimers();
    this.state.active = false;
    this.state.awaitingNext = false;
    this.enableAnswerButtons(false);
    if (this.nextBtn) {
      this.nextBtn.disabled = true;
    }
    this.startBtn.textContent = 'Start Quiz';
    const { correct, total } = this.state.stats;
    const accuracy = total === 0 ? 0 : Math.round((correct / total) * 100);
    this.setFeedback(`Set complete! ${correct}/${total} correct (${accuracy}%).`);
    this.renderSummary();
    this.updateRoundIndicator();
    this.updateTimerDisplay(0);
    this.renderNote(null);
  }

  enableAnswerButtons(enabled) {
    this.noteButtons.forEach((btn) => {
      btn.disabled = !enabled;
    });
  }

  resetAnswerButtons() {
    this.noteButtons.forEach((btn) => {
      btn.classList.remove('is-correct', 'is-wrong');
    });
  }

  flagButtonStates(selectedLetter) {
    this.noteButtons.forEach((btn) => {
      const value = btn.dataset.ledgerNote;
      if (value === this.currentNote?.letter) {
        btn.classList.add('is-correct');
      } else {
        btn.classList.remove('is-correct');
      }
      if (selectedLetter && selectedLetter === value && value !== this.currentNote?.letter) {
        btn.classList.add('is-wrong');
      } else {
        btn.classList.remove('is-wrong');
      }
    });
  }

  updateStats() {
    const { correct, total } = this.state.stats;
    const accuracy = total === 0 ? 0 : Math.round((correct / total) * 100);
    if (this.correctEl) this.correctEl.textContent = correct.toString();
    if (this.totalEl) this.totalEl.textContent = total.toString();
    if (this.accuracyEl) this.accuracyEl.textContent = `${accuracy}%`;
  }

  setFeedback(message) {
    if (this.feedbackEl) {
      this.feedbackEl.textContent = message;
    }
  }

  computeElapsedMs() {
    const now = performance.now();
    const start = Number.isFinite(this.roundStartMs) ? this.roundStartMs : now;
    const raw = Math.max(0, now - start);
    return Math.min(raw, NOTE_TIME_LIMIT_MS);
  }

  recordRound({ outcome, guessed, isCorrect, timeMs }) {
    if (!this.currentNote) return;
    const entry = {
      round: this.state.roundIndex,
      note: { ...this.currentNote },
      display: this.currentNote.display,
      guessed: guessed || null,
      correct: !!isCorrect,
      outcome: outcome || (isCorrect ? 'correct' : 'wrong'),
      timeMs: Number.isFinite(timeMs) ? timeMs : null,
    };
    this.state.history.push(entry);
  }

  renderSummary() {
    if (!this.summaryEl) return;
    const rounds = Array.isArray(this.state.history) ? this.state.history : [];
    const fmt = (ms) => `${(Number(ms || 0) / 1000).toFixed(1)}s`;
    const errors = rounds.filter((r) => !r.correct);
    const errorItems = errors.map((r) => {
      const guess = r.guessed ? r.guessed.toUpperCase() : (r.outcome === 'skip' ? '— (skipped)' : '— (timeout)');
      const region = r.note.region === 'above' ? 'above' : 'below';
      const clef = r.note.clef === 'bass' ? 'bass' : 'treble';
      return `<li>Round ${r.round}: ${r.display} — guessed ${guess} <span class="muted">(${clef}, ${region}, ${fmt(r.timeMs)})</span></li>`;
    }).join('');
    const ranked = rounds.slice().sort((a, b) => {
      const aw = a.correct ? 0 : 1;
      const bw = b.correct ? 0 : 1;
      if (aw !== bw) return bw - aw; // wrong (1) before correct (0)
      const at = Number(a.timeMs || 0);
      const bt = Number(b.timeMs || 0);
      if (at !== bt) return bt - at; // slower first
      return a.round - b.round;
    });
    const allItems = ranked.map((r) => {
      const status = r.correct ? '<span class="ok">✓</span>' : '<span class="bad">✕</span>';
      const label = r.outcome === 'skip' ? 'skip' : (r.outcome === 'timeout' ? 'timeout' : (r.correct ? 'correct' : 'wrong'));
      return `<li>${r.round}: ${r.display} — ${fmt(r.timeMs)} <span class="muted">${label}</span> ${status}</li>`;
    }).join('');
    const errorSection = `
      <div class="summary-section">
        <strong>Errors</strong>
        <ul class="summary-list">${errorItems || '<li class="muted">No errors. Great job!</li>'}</ul>
      </div>`;
    const timeSection = `
      <div class="summary-section">
        <strong>Ranked by Time & Accuracy (Worst → Best)</strong>
        <ul class="summary-list">${allItems || '<li class=\"muted\">No rounds recorded.</li>'}</ul>
      </div>`;
    this.summaryEl.innerHTML = `<h3>Results Detail</h3>${errorSection}${timeSection}`;
    this.summaryEl.hidden = false;
  }

  async renderNote(plan) {
    try {
      await this.displayReady;
      if (!this.display) return;
      const clef = plan?.clef === 'bass' ? 'bass' : 'treble';
      await this.display.setClef(clef);
      if (!plan) {
        await this.display.setSequence([]);
        return;
      }
      const letter = (plan.letter || 'C').toUpperCase();
      const noteLiteral = `${letter}${plan.octave ?? 4}`;
      await this.display.setSequence([
        {
          note: noteLiteral,
          clef,
          duration: 'q',
        },
      ]);
    } catch (error) {
      console.error('[LedgerQuiz] Unable to render note.', error);
      this.setFeedback('Unable to render staff.');
    }
  }
}

function initLedgerQuiz() {
  if (document.getElementById('ledgerStaff')) {
    window.__ledgerQuiz = new LedgerQuiz();
  }
}

document.addEventListener('DOMContentLoaded', initLedgerQuiz);
