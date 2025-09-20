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
    checkSequence(userSequence, currentSequence) {
        // Stop the sequence timer
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        // Calculate sequence completion time
        const sequenceTime = this.sequenceStartTime ? Date.now() - this.sequenceStartTime : 0;
        
        this.score.total++;
        this.currentRound.total++;
        
        const isCorrect = this.arraysEqual(userSequence, currentSequence);
        
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
    completeRound(scaleType, mode, sequenceLength) {
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
        
        this.timerInterval = setInterval(() => {
            this.updateTimer();
        }, 1000);
    }

    /**
     * Update the timer display
     */
    updateTimer() {
        if (!this.sequenceStartTime) return;
        
        const elapsed = Date.now() - this.sequenceStartTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        
        const timerElement = document.getElementById('timer');
        if (timerElement) {
            timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
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
        const roundProgressElement = document.getElementById('roundProgress');
        const currentAccuracyElement = document.getElementById('currentAccuracy');
        
        if (roundProgressElement) {
            roundProgressElement.textContent = `${this.currentRound.total}/10`;
        }
        
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