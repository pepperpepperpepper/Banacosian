/**
 * UI Module - Handles DOM manipulation and event handling
 */
class UIModule {
    constructor() {
        this.countdownInterval = null;
    }

    /**
     * Setup all event listeners
     * @param {Object} callbacks - Callback functions for various events
     */
    setupEventListeners(callbacks) {
        // Button event listeners
        document.getElementById('newSequenceBtn').addEventListener('click', callbacks.onNewSequence);
        document.getElementById('playSequenceBtn').addEventListener('click', callbacks.onPlaySequence);
        document.getElementById('showHistoryBtn').addEventListener('click', callbacks.onShowHistory);
        document.getElementById('closeHistoryBtn').addEventListener('click', callbacks.onHideHistory);
        document.getElementById('saveDataBtn').addEventListener('click', callbacks.onSaveData);
        document.getElementById('loadDataBtn').addEventListener('click', callbacks.onLoadData);

        const settingsToggle = document.getElementById('settingsToggle');
        const settingsPanel = document.getElementById('settingsPanel');
        if (settingsToggle && settingsPanel) {
            settingsToggle.addEventListener('click', () => {
                const isHidden = settingsPanel.hasAttribute('hidden');
                if (isHidden) {
                    settingsPanel.removeAttribute('hidden');
                } else {
                    settingsPanel.setAttribute('hidden', '');
                }
                settingsToggle.setAttribute('aria-expanded', (!isHidden).toString());
            });
        }
        
        // Settings event listeners
        document.getElementById('difficulty').addEventListener('change', callbacks.onDifficultyChange);
        document.getElementById('tonicSelect').addEventListener('change', callbacks.onTonicChange);
        document.getElementById('scaleType').addEventListener('change', callbacks.onScaleTypeChange);
        document.getElementById('mode').addEventListener('change', callbacks.onModeChange);
    }

    /**
     * Show the status area
     */
    showStatusArea() {
        const statusArea = document.querySelector('.status-area');
        if (statusArea) {
            statusArea.classList.add('visible');
        }
    }

    /**
     * Populate tonic dropdown with options
     * @param {Array<string>} tonics - List of tonic labels
     * @param {string} selectedValue - Currently selected tonic
     */
    populateTonicOptions(tonics, selectedValue) {
        const tonicSelect = document.getElementById('tonicSelect');
        if (!tonicSelect) return;

        tonicSelect.innerHTML = '';
        tonics.forEach(tonic => {
            const option = document.createElement('option');
            option.value = tonic;
            option.textContent = tonic;
            tonicSelect.appendChild(option);
        });

        this.setTonicValue(selectedValue);
    }

    /**
     * Update tonic select current value
     * @param {string} value - Tonic value to set
     */
    setTonicValue(value) {
        const tonicSelect = document.getElementById('tonicSelect');
        if (tonicSelect && value) {
            tonicSelect.value = value;
        }
    }

    /**
     * Hide the status area
     */
    hideStatusArea() {
        const statusArea = document.querySelector('.status-area');
        if (statusArea) {
            statusArea.classList.remove('visible');
        }
    }

    /**
     * Update the sequence display
     * @param {Array} sequence - The sequence to display
     */
    updateSequenceDisplay(sequence) {
        const display = document.getElementById('sequenceDisplay');
        if (!display) return;
        
        display.innerHTML = '';
        
        const title = document.createElement('div');
        title.textContent = 'Target sequence:';
        title.style.marginBottom = '10px';
        title.style.fontSize = '0.9em';
        display.appendChild(title);
        
        sequence.forEach(note => {
            const noteEl = document.createElement('div');
            noteEl.className = 'sequence-note';
            noteEl.textContent = '♪';
            display.appendChild(noteEl);
        });
    }

    /**
     * Update the user sequence display
     * @param {Array} userSequence - User's sequence
     * @param {Array} currentSequence - Target sequence (for comparison)
     */
    updateUserSequenceDisplay(userSequence, currentSequence) {
        const userDisplay = document.getElementById('userSequenceDisplay');
        if (!userDisplay) return;
        
        if (userSequence.length === 0) {
            userDisplay.innerHTML = '';
            return;
        }
        
        userDisplay.innerHTML = '';
        
        const title = document.createElement('div');
        title.textContent = 'Your sequence:';
        title.style.marginBottom = '10px';
        title.style.fontSize = '0.9em';
        userDisplay.appendChild(title);
        
        userSequence.forEach((note, index) => {
            const noteEl = document.createElement('div');
            noteEl.className = 'sequence-note user';
            noteEl.textContent = note;
            
            // Add comparison styling if we have a target sequence
            if (currentSequence && index < currentSequence.length) {
                if (note === currentSequence[index]) {
                    noteEl.classList.add('correct');
                } else {
                    noteEl.classList.add('incorrect');
                }
            }
            
            userDisplay.appendChild(noteEl);
        });
    }

    /**
     * Show comparison between user sequence and target sequence
     * @param {Array} userSequence - User's sequence
     * @param {Array} currentSequence - Target sequence
     */
    showComparison(userSequence, currentSequence) {
        const userDisplay = document.getElementById('userSequenceDisplay');
        if (!userDisplay) return;
        
        userDisplay.innerHTML = '';
        
        const title = document.createElement('div');
        title.textContent = 'Your sequence:';
        title.style.marginBottom = '10px';
        title.style.fontSize = '0.9em';
        userDisplay.appendChild(title);
        
        for (let i = 0; i < currentSequence.length; i++) {
            const noteEl = document.createElement('div');
            noteEl.className = 'sequence-note user';
            noteEl.textContent = userSequence[i] || '?';
            
            if (i < userSequence.length) {
                if (userSequence[i] === currentSequence[i]) {
                    noteEl.classList.add('correct');
                } else {
                    noteEl.classList.add('incorrect');
                }
            }
            
            userDisplay.appendChild(noteEl);
        }
    }

    /**
     * Update feedback message
     * @param {string} message - Feedback message
     * @param {string} className - CSS class for styling ('feedback', 'correct', 'incorrect')
     */
    updateFeedback(message, className = 'feedback') {
        const feedbackElement = document.getElementById('feedback');
        if (feedbackElement) {
            feedbackElement.textContent = message;
            feedbackElement.className = className;
        }
    }

    /**
     * Set play button state
     * @param {boolean} disabled - Whether to disable the button
     */
    setPlayButtonState(disabled) {
        const playButton = document.getElementById('playSequenceBtn');
        if (playButton) {
            playButton.disabled = disabled;
        }
    }

    /**
     * Start countdown for next sequence
     * @param {number} seconds - Countdown duration in seconds
     * @param {Function} onComplete - Callback when countdown completes
     */
    startCountdown(seconds = 4, onComplete) {
        let countdown = seconds;
        
        if (seconds === 1) {
            // For correct answers - just a brief pause
            this.updateFeedback('Next sequence...');
            
            setTimeout(() => {
                if (onComplete) onComplete();
            }, 1000);
        } else {
            // For incorrect answers - longer countdown
            this.updateFeedback(`Next sequence in ${countdown}...`);
            
            this.countdownInterval = setInterval(() => {
                countdown--;
                if (countdown > 0) {
                    this.updateFeedback(`Next sequence in ${countdown}...`);
                } else {
                    clearInterval(this.countdownInterval);
                    this.countdownInterval = null;
                    if (onComplete) onComplete();
                }
            }, 1000);
        }
    }

    /**
     * Show history modal
     * @param {Array} roundHistory - Array of round history data
     * @param {Function} calculateAverageAccuracy - Function to calculate average accuracy
     * @param {Function} getBestRound - Function to get best round
     */
    showHistory(roundHistory, calculateAverageAccuracy, getBestRound) {
        const modal = document.getElementById('historyModal');
        const content = document.getElementById('historyContent');
        
        if (!modal || !content) return;
        
        if (roundHistory.length === 0) {
            content.innerHTML = '<p style="text-align: center; font-size: 1.2em;">No completed rounds yet. Finish a round of 10 sequences to see your history!</p>';
        } else {
            let html = `
                <div style="margin-bottom: 20px;">
                    <h3>Session Summary</h3>
                    <p>Total Rounds: ${roundHistory.length}</p>
                    <p>Average Accuracy: ${calculateAverageAccuracy()}%</p>
                    <p>Best Round: ${getBestRound()}%</p>
                </div>
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; background: rgba(255,255,255,0.1); border-radius: 10px; overflow: hidden;">
                        <thead>
                            <tr style="background: rgba(255,255,255,0.2);">
                                <th style="padding: 12px; text-align: left;">Date</th>
                                <th style="padding: 12px; text-align: left;">Time</th>
                                <th style="padding: 12px; text-align: center;">Score</th>
                                <th style="padding: 12px; text-align: center;">Accuracy</th>
                                <th style="padding: 12px; text-align: center;">Avg Time</th>
                                <th style="padding: 12px; text-align: center;">Settings</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            roundHistory.slice().reverse().forEach((round, index) => {
                html += `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
                        <td style="padding: 10px;">${round.date}</td>
                        <td style="padding: 10px;">${round.time}</td>
                        <td style="padding: 10px; text-align: center;">${round.correct}/${round.total}</td>
                        <td style="padding: 10px; text-align: center; font-weight: bold; color: ${round.accuracy >= 80 ? '#4CAF50' : round.accuracy >= 60 ? '#FFC107' : '#f44336'};">${round.accuracy}%</td>
                        <td style="padding: 10px; text-align: center;">${round.avgSequenceTime || 'N/A'}</td>
                        <td style="padding: 10px; text-align: center; font-size: 0.9em;">${round.sequenceLength} notes, ${round.scaleType}${round.mode ? ` (${round.mode})` : ''}</td>
                    </tr>
                `;
            });
            
            html += '</tbody></table></div>';
            content.innerHTML = html;
        }
        
        modal.style.display = 'block';
    }

    /**
     * Hide history modal
     */
    hideHistory() {
        const modal = document.getElementById('historyModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    /**
     * Highlight playing note in sequence display
     * @param {number} index - Index of the note to highlight
     */
    highlightPlayingNote(index) {
        const noteElements = document.querySelectorAll('#sequenceDisplay .sequence-note');
        noteElements.forEach(el => el.classList.remove('playing'));
        if (noteElements[index]) {
            noteElements[index].classList.add('playing');
        }
    }

    /**
     * Remove all playing note highlights
     */
    removePlayingHighlights() {
        document.querySelectorAll('#sequenceDisplay .sequence-note').forEach(el => 
            el.classList.remove('playing'));
    }

    /**
     * Clear countdown interval
     */
    clearCountdown() {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }
    }

    /**
     * Get current form values
     * @returns {Object} Current form values
     */
    getFormValues() {
        return {
            difficulty: document.getElementById('difficulty').value,
            tonic: document.getElementById('tonicSelect').value,
            scaleType: document.getElementById('scaleType').value,
            mode: document.getElementById('mode').value
        };
    }

    /**
     * Set form values
     * @param {Object} values - Form values to set
     */
    setFormValues(values) {
        if (values.difficulty !== undefined) {
            document.getElementById('difficulty').value = values.difficulty;
        }
        if (values.tonic !== undefined) {
            this.setTonicValue(values.tonic);
        }
        if (values.scaleType !== undefined) {
            document.getElementById('scaleType').value = values.scaleType;
        }
        if (values.mode !== undefined) {
            document.getElementById('mode').value = values.mode;
        }
    }
}

// Export the module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIModule;
} else {
    window.UIModule = UIModule;
}
