import { VexflowStaffDisplay } from '/js/vexflow/StaffDisplay.js';
import { readStaffConfigFromDataset } from '/js/vexflow/core/config.js';

const TOTAL_ROUNDS = 20;
const NOTE_TIME_LIMIT_MS = 5000;
const TIMER_UPDATE_MS = 50;
const ROUND_GAP_MS = 400;
const INCORRECT_PAUSE_MS = 1600;

const LEDGER_NOTES = [
  // Treble clef - below
  { clef: 'treble', letter: 'C', octave: 4, region: 'below' },
  { clef: 'treble', letter: 'B', octave: 3, region: 'below' },
  { clef: 'treble', letter: 'A', octave: 3, region: 'below' },
  { clef: 'treble', letter: 'G', octave: 3, region: 'below' },
  // Treble clef - above
  { clef: 'treble', letter: 'A', octave: 5, region: 'above' },
  { clef: 'treble', letter: 'B', octave: 5, region: 'above' },
  { clef: 'treble', letter: 'C', octave: 6, region: 'above' },
  { clef: 'treble', letter: 'D', octave: 6, region: 'above' },
  { clef: 'treble', letter: 'E', octave: 6, region: 'above' },
  // Bass clef - below
  { clef: 'bass', letter: 'E', octave: 2, region: 'below' },
  { clef: 'bass', letter: 'D', octave: 2, region: 'below' },
  { clef: 'bass', letter: 'C', octave: 2, region: 'below' },
  { clef: 'bass', letter: 'B', octave: 1, region: 'below' },
  { clef: 'bass', letter: 'A', octave: 1, region: 'below' },
  // Bass clef - above
  { clef: 'bass', letter: 'C', octave: 4, region: 'above' },
  { clef: 'bass', letter: 'D', octave: 4, region: 'above' },
  { clef: 'bass', letter: 'E', octave: 4, region: 'above' },
  { clef: 'bass', letter: 'F', octave: 4, region: 'above' },
  { clef: 'bass', letter: 'G', octave: 4, region: 'above' },
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
    this.display = null;
    this.displayReady = this.initializeStaffDisplay();
    this.state = {
      active: false,
      awaitingNext: false,
      stats: { correct: 0, total: 0 },
      roundIndex: 0,
    };
    this.currentNote = null;
    this.roundTimers = {
      intervalId: null,
      timeoutId: null,
      deadline: null,
    };

    this.bindEvents();
    this.updateStats();
    this.updateRoundIndicator();
    this.updateTimerDisplay(0);
    this.renderNote(null);
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

  startSession() {
    this.clearRoundTimers();
    this.state.active = true;
    this.state.awaitingNext = false;
    this.state.stats.correct = 0;
    this.state.stats.total = 0;
    this.state.roundIndex = 0;
    this.currentNote = null;
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
    if (this.state.roundIndex >= TOTAL_ROUNDS) {
      this.endSession();
      return;
    }
    this.state.roundIndex += 1;
    this.updateRoundIndicator();
    this.currentNote = pickRandomNote();
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
    if (this.state.stats.total >= TOTAL_ROUNDS) {
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
    const clamped = Math.min(this.state.roundIndex, TOTAL_ROUNDS);
    this.roundEl.textContent = `${clamped} / ${TOTAL_ROUNDS}`;
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
