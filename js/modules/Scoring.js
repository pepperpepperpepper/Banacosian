/**
 * Scoring Module - Handles score tracking and round management
 */
class ScoringModule {
  constructor() {
        // Overall score tracking
        this.score = { correct: 0, total: 0 };
        
        // Round-based scoring
        this.currentRound = { correct: 0, total: 0, startTime: null };
        this.roundHistory = [];
        this.timerInterval = null;
        this.sequenceStartTime = null;
        // Pause accounting for per-sequence timer
        this.sequencePauseStart = null; // timestamp when pause began
        this.sequencePausedTotal = 0;   // total ms spent paused in this sequence
        this.isPaused = false;
    }

    /**
     * Explicitly start a new round.
     * Resets round counters and timer display, but leaves overall score untouched.
     */
    startNewRound() {
        // Clear any ticking timer and per-sequence timer reference
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        this.sequenceStartTime = null;
        this.sequencePauseStart = null;
        this.sequencePausedTotal = 0;
        this.isPaused = false;
        this.currentRound = { correct: 0, total: 0, startTime: null };
        // Reset timer + current accuracy UI
        const timerEl = typeof document !== 'undefined' ? document.getElementById('timer') : null;
        if (timerEl) timerEl.textContent = '00:00';
        const accEl = typeof document !== 'undefined' ? document.getElementById('currentAccuracy') : null;
        if (accEl) accEl.textContent = '0%';
    }

    /**
     * Initialize a new sequence
     */
    startNewSequence() {
        // Clear previous timer
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        // Start fresh timer for this sequence
        this.sequenceStartTime = Date.now();
        this.sequencePausedTotal = 0;
        this.sequencePauseStart = null;
        this.isPaused = false;
        this.startSequenceTimer();
        
        // Track round start if this is the first sequence
        if (this.currentRound.total === 0 && !this.currentRound.startTime) {
            this.currentRound.startTime = Date.now();
        }
    }

    /**
     * Check if the user's sequence matches the target sequence
     * @param {Array} userSequence - User's sequence
     * @param {Array} currentSequence - Target sequence
     * @returns {Object} Result object with correctness and timing info
     */
    checkSequence(userSequence, currentSequence, options = {}) {
        // Stop the sequence timer
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        // Calculate sequence completion time (exclude paused time)
        const sequenceTime = this.getElapsedMs();
        
        this.score.total++;
        this.currentRound.total++;
        
        const dictationType = options.dictationType === 'harmonic' ? 'harmonic' : 'melodic';
        const isCorrect = dictationType === 'harmonic'
            ? this.multisetEqual(userSequence, currentSequence)
            : this.arraysEqual(userSequence, currentSequence);
        
        if (isCorrect) {
            this.score.correct++;
            this.currentRound.correct++;
        }
        
        // Store sequence result with timing
        if (!this.currentRound.sequences) {
            this.currentRound.sequences = [];
        }
        
        this.currentRound.sequences.push({
            sequence: [...currentSequence],
            userResponse: [...userSequence],
            correct: isCorrect,
            dictationType,
            timeMs: sequenceTime,
            timeFormatted: this.formatDuration(sequenceTime)
        });
        
        return {
            isCorrect,
            sequenceTime,
            sequenceTimeFormatted: this.formatDuration(sequenceTime)
        };
    }

    /**
     * Check if the current round is complete
     * @returns {boolean} True if round is complete (10 sequences)
     */
    isRoundComplete() {
        return this.currentRound.total >= 10;
    }

    /**
     * Complete the current round and save to history
     * @param {string} scaleType - Current scale type
     * @param {string} mode - Current mode
     * @param {number} sequenceLength - Current sequence length
     * @returns {Object} Round completion data
     */
    completeRound(scaleType, mode, dictationType, sequenceLength) {
        // Stop timer
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        // Calculate round stats
        const endTime = Date.now();
        const duration = endTime - this.currentRound.startTime;
        const accuracy = Math.round((this.currentRound.correct / this.currentRound.total) * 100);
        
        // Save round to history
        const roundData = {
            date: new Date().toLocaleDateString(),
            time: new Date().toLocaleTimeString(),
            accuracy: accuracy,
            correct: this.currentRound.correct,
            total: this.currentRound.total,
            duration: this.formatDuration(duration),
            durationMs: duration,
            scaleType: scaleType,
            dictationType: dictationType,
            mode: mode,
            sequenceLength: sequenceLength
        };
        
        this.roundHistory.push(roundData);
        
        // Reset for next round
        const completedRound = { ...this.currentRound };
        this.currentRound = { correct: 0, total: 0, startTime: null };
        
        return {
            roundData,
            completedRound,
            accuracy,
            duration: this.formatDuration(duration)
        };
    }

    /**
     * Start the sequence timer
     */
    startSequenceTimer() {
        // Clear any existing timer first
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
        if (this.sequenceStartTime && !this.isPaused) {
            this.timerInterval = setInterval(() => {
                this.updateTimer();
            }, 1000);
        }
    }

    /**
     * Update the timer display
     */
    updateTimer() {
        if (!this.sequenceStartTime) return;
        const elapsed = this.getElapsedMs();
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        
        const timerElement = document.getElementById('timer');
        if (timerElement) {
            timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
    }

    /** Pause the current sequence timer (idempotent). */
    pauseSequenceTimer() {
        if (!this.sequenceStartTime || this.isPaused) return;
        this.isPaused = true;
        this.sequencePauseStart = Date.now();
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        // Update once to freeze display at current value
        this.updateTimer();
    }

    /** Resume the current sequence timer if paused. */
    resumeSequenceTimer() {
        if (!this.sequenceStartTime || !this.isPaused) return;
        const now = Date.now();
        if (this.sequencePauseStart) {
            this.sequencePausedTotal += (now - this.sequencePauseStart);
        }
        this.sequencePauseStart = null;
        this.isPaused = false;
        this.startSequenceTimer();
        this.updateTimer();
    }

    /** Returns true if the per-sequence timer is actively running. */
    isTimerRunning() {
        return !!(this.sequenceStartTime && !this.isPaused && this.timerInterval);
    }

    /** Compute elapsed ms for current sequence excluding paused time. */
    getElapsedMs() {
        if (!this.sequenceStartTime) return 0;
        const base = Date.now() - this.sequenceStartTime;
        const paused = this.sequencePausedTotal + (this.isPaused && this.sequencePauseStart ? (Date.now() - this.sequencePauseStart) : 0);
        return Math.max(0, base - paused);
    }

    /**
     * Update the score display
     */
    updateScore() {
        const correctElement = document.getElementById('correct');
        const totalElement = document.getElementById('total');
        const percentageElement = document.getElementById('percentage');
        
        if (correctElement) correctElement.textContent = this.score.correct;
        if (totalElement) totalElement.textContent = this.score.total;
        
        const percentage = this.score.total > 0 ? 
            Math.round((this.score.correct / this.score.total) * 100) : 0;
        if (percentageElement) percentageElement.textContent = percentage;
    }

    /**
     * Update the round display
     */
    updateRoundDisplay() {
        const currentAccuracyElement = document.getElementById('currentAccuracy');
        
        const accuracy = this.currentRound.total > 0 ? 
            Math.round((this.currentRound.correct / this.currentRound.total) * 100) : 0;
        if (currentAccuracyElement) {
            currentAccuracyElement.textContent = `${accuracy}%`;
        }
    }

    /**
     * Calculate average accuracy across all rounds
     * @returns {number} Average accuracy percentage
     */
    calculateAverageAccuracy() {
        if (this.roundHistory.length === 0) return 0;
        const total = this.roundHistory.reduce((sum, round) => sum + round.accuracy, 0);
        return Math.round(total / this.roundHistory.length);
    }

    /**
     * Get the best round accuracy
     * @returns {number} Best accuracy percentage
     */
    getBestRound() {
        if (this.roundHistory.length === 0) return 0;
        return Math.max(...this.roundHistory.map(round => round.accuracy));
    }

    /**
     * Format duration in milliseconds to readable format
     * @param {number} ms - Duration in milliseconds
     * @returns {string} Formatted duration (e.g., "1:23")
     */
    formatDuration(ms) {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    /**
     * Check if two arrays are equal
     * @param {Array} a - First array
     * @param {Array} b - Second array
     * @returns {boolean} True if arrays are equal
     */
    arraysEqual(a, b) {
        return a.length === b.length && a.every((val, i) => val === b[i]);
    }

    multisetEqual(a, b) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
            return false;
        }
        const counts = new Map();
        const normalize = (note) => (typeof note === 'string' ? note.trim().toUpperCase() : String(note));
        a.forEach((note) => {
            const key = normalize(note);
            counts.set(key, (counts.get(key) || 0) + 1);
        });
        for (let i = 0; i < b.length; i += 1) {
            const key = normalize(b[i]);
            if (!counts.has(key)) {
                return false;
            }
            const remaining = counts.get(key) - 1;
            if (remaining === 0) {
                counts.delete(key);
            } else {
                counts.set(key, remaining);
            }
        }
        return counts.size === 0;
    }

    /**
     * Get the current score
     * @returns {Object} Current score object
     */
    getScore() {
        return this.score;
    }

    /**
     * Get the current round
     * @returns {Object} Current round object
     */
    getCurrentRound() {
        return this.currentRound;
    }

    /**
     * Get the round history
     * @returns {Array} Array of round history objects
     */
    getRoundHistory() {
        return this.roundHistory;
    }

    /**
     * Load score data from saved state
     * @param {Object} data - Saved score data
     */
    loadScoreData(data) {
        if (data.score) {
            this.score = data.score;
        }
        if (data.roundHistory) {
            this.roundHistory = data.roundHistory;
        }
        if (data.currentRound && data.currentRound.total < 10) {
            this.currentRound = data.currentRound;
            if (this.currentRound.startTime && this.currentRound.total > 0) {
                // Resume timer if round was in progress
                this.startSequenceTimer();
            }
        }
    }
}

// Export the module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ScoringModule;
} else {
    window.ScoringModule = ScoringModule;
}
