/**
 * UI Module - Handles DOM manipulation and event handling
 */
class UIModule {
    constructor() {
        this.countdownInterval = null;
        this.noteLabelFormatter = null;
    }

    normalizeNoteKey(note) {
        if (note === null || note === undefined) return '';
        if (typeof note === 'string') return note.trim().toUpperCase();
        return String(note).toUpperCase();
    }

    buildNoteCounts(sequence) {
        const counts = new Map();
        if (!Array.isArray(sequence)) return counts;
        sequence.forEach((note) => {
            const key = this.normalizeNoteKey(note);
            if (!key) return;
            counts.set(key, (counts.get(key) || 0) + 1);
        });
        return counts;
    }

    /**
     * Set a formatter used to display note labels
     * @param {Function|null} formatter - Function that receives note string and returns formatted label
     */
    setNoteLabelFormatter(formatter) {
        if (typeof formatter === 'function' || formatter === null) {
            this.noteLabelFormatter = formatter;
        }
    }

    /**
     * Setup all event listeners
     * @param {Object} callbacks - Callback functions for various events
     */
    setupEventListeners(callbacks) {
        // Button event listeners (guard against optional/missing controls)
        const newSequenceBtn = document.getElementById('newSequenceBtn');
        if (newSequenceBtn && typeof callbacks.onNewSequence === 'function') {
            newSequenceBtn.addEventListener('click', callbacks.onNewSequence);
        }

        const playSequenceBtn = document.getElementById('playSequenceBtn');
        if (playSequenceBtn && typeof callbacks.onPlaySequence === 'function') {
            playSequenceBtn.addEventListener('click', callbacks.onPlaySequence);
        }

        const staffSubmitBtn = document.getElementById('staffSubmitBtn');
        if (staffSubmitBtn && typeof callbacks.onStaffSubmit === 'function') {
            staffSubmitBtn.addEventListener('click', callbacks.onStaffSubmit);
        }

        const showHistoryBtn = document.getElementById('showHistoryBtn');
        if (showHistoryBtn && typeof callbacks.onShowHistory === 'function') {
            showHistoryBtn.addEventListener('click', callbacks.onShowHistory);
        }

        const closeHistoryBtn = document.getElementById('closeHistoryBtn');
        if (closeHistoryBtn && typeof callbacks.onHideHistory === 'function') {
            closeHistoryBtn.addEventListener('click', callbacks.onHideHistory);
        }

        const saveDataBtn = document.getElementById('saveDataBtn');
        if (saveDataBtn && typeof callbacks.onSaveData === 'function') {
            saveDataBtn.addEventListener('click', callbacks.onSaveData);
        }

        const loadDataBtn = document.getElementById('loadDataBtn');
        if (loadDataBtn && typeof callbacks.onLoadData === 'function') {
            loadDataBtn.addEventListener('click', callbacks.onLoadData);
        }

        const settingsToggle = document.getElementById('settingsToggle');
        const settingsPanel = document.getElementById('settingsPanel');
        if (settingsToggle && settingsPanel) {
            // Toggle panel visibility and keep aria-expanded in sync
            settingsToggle.addEventListener('click', () => {
                const wasHidden = settingsPanel.hasAttribute('hidden');
                if (wasHidden) {
                    settingsPanel.removeAttribute('hidden');
                } else {
                    settingsPanel.setAttribute('hidden', '');
                }
                // When it was hidden, we just opened it => expanded=true; when visible, we just closed => expanded=false
                settingsToggle.setAttribute('aria-expanded', String(wasHidden));
            });

            // Provide immediate "pressed" feedback while clicking/pressing
            const setPressed = (pressed) => {
                if (pressed) settingsToggle.setAttribute('data-pressed', 'true');
                else settingsToggle.removeAttribute('data-pressed');
            };
            settingsToggle.addEventListener('pointerdown', () => setPressed(true));
            settingsToggle.addEventListener('pointerup', () => setPressed(false));
            settingsToggle.addEventListener('pointercancel', () => setPressed(false));
            settingsToggle.addEventListener('blur', () => setPressed(false));
        }
        
        // Settings event listeners
        document.getElementById('difficulty').addEventListener('change', callbacks.onDifficultyChange);
        document.getElementById('tonicSelect').addEventListener('change', callbacks.onTonicChange);
        document.getElementById('scaleType').addEventListener('change', callbacks.onScaleTypeChange);
        const dictationTypeSelect = document.getElementById('dictationType');
        if (dictationTypeSelect && typeof callbacks.onDictationTypeChange === 'function') {
            dictationTypeSelect.addEventListener('change', callbacks.onDictationTypeChange);
        }
        const inputModeSelect = document.getElementById('inputMode');
        if (inputModeSelect && typeof callbacks.onInputModeChange === 'function') {
            inputModeSelect.addEventListener('change', callbacks.onInputModeChange);
        }
        document.getElementById('mode').addEventListener('change', callbacks.onModeChange);

        const timbreSelect = document.getElementById('timbreSelect');
        if (timbreSelect && typeof callbacks.onTimbreChange === 'function') {
            timbreSelect.addEventListener('change', callbacks.onTimbreChange);
        }

        const staffFontSelect = document.getElementById('staffFont');
        if (staffFontSelect && typeof callbacks.onStaffFontChange === 'function') {
            staffFontSelect.addEventListener('change', callbacks.onStaffFontChange);
        }

        const disabledKeysStyleSelect = document.getElementById('disabledKeysStyle');
        if (disabledKeysStyleSelect && typeof callbacks.onDisabledKeysStyleChange === 'function') {
            disabledKeysStyleSelect.addEventListener('change', callbacks.onDisabledKeysStyleChange);
        }

        const answerRevealModeSelect = document.getElementById('answerRevealMode');
        if (answerRevealModeSelect && typeof callbacks.onAnswerRevealModeChange === 'function') {
            answerRevealModeSelect.addEventListener('change', callbacks.onAnswerRevealModeChange);
        }
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
     * Populate timbre dropdown with available options
     * @param {Array<{id:string,label:string}>} timbres
     * @param {string} selectedValue
     */
    populateTimbreOptions(timbres, selectedValue) {
        const timbreSelect = document.getElementById('timbreSelect');
        if (!timbreSelect) return;

        timbreSelect.innerHTML = '';
        timbres.forEach(timbre => {
            const option = document.createElement('option');
            option.value = timbre.id;
            option.textContent = timbre.label;
            timbreSelect.appendChild(option);
        });

        this.setTimbreValue(selectedValue);
    }

    /**
     * Update the current timbre selection
     * @param {string} value
     */
    setTimbreValue(value) {
        const timbreSelect = document.getElementById('timbreSelect');
        if (timbreSelect && value) {
            timbreSelect.value = value;
        }
    }

    /**
     * Populate staff font options in settings panel
     * @param {Array<{id:string,label:string}>} fonts
     * @param {string} selectedValue
     */
    populateStaffFontOptions(fonts, selectedValue) {
        const fontSelect = document.getElementById('staffFont');
        if (!fontSelect) return;
        fontSelect.innerHTML = '';
        fonts.forEach(font => {
            const option = document.createElement('option');
            option.value = font.id;
            option.textContent = font.label || font.id;
            fontSelect.appendChild(option);
        });
        this.setStaffFontValue(selectedValue);
    }

    /**
     * Update the current staff font selection
     * @param {string} value
     */
    setStaffFontValue(value) {
        const fontSelect = document.getElementById('staffFont');
        if (fontSelect && value) {
            fontSelect.value = value;
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
    updateSequenceDisplay(sequence, options = {}) {
        const display = document.getElementById('sequenceDisplay');
        if (!display) return;
        const userDisplay = document.getElementById('userSequenceDisplay');

        const hasSequence = Array.isArray(sequence) && sequence.length > 0;
        if (!hasSequence) {
            display.innerHTML = '';
            display.style.display = 'none';
            if (userDisplay && userDisplay.childElementCount === 0) {
                userDisplay.style.display = 'none';
            }
            return;
        }

        display.innerHTML = '';

        const dictationType = options.dictationType === 'harmonic' ? 'harmonic' : 'melodic';

        const title = document.createElement('div');
        title.textContent = dictationType === 'harmonic' ? 'Target chord:' : 'Target sequence:';
        title.style.marginBottom = '10px';
        title.style.fontSize = '0.9em';
        display.appendChild(title);

        sequence.forEach(() => {
            const noteEl = document.createElement('div');
            noteEl.className = 'sequence-note';
            noteEl.textContent = '♪';
            display.appendChild(noteEl);
        });

        display.style.display = 'flex';
        if (userDisplay) {
            userDisplay.style.display = 'none';
        }
    }

    /**
     * Update the user sequence display
     * @param {Array} userSequence - User's sequence
     * @param {Array} currentSequence - Target sequence (for comparison)
     */
    updateUserSequenceDisplay(userSequence, currentSequence, options = {}) {
        const userDisplay = document.getElementById('userSequenceDisplay');
        const targetDisplay = document.getElementById('sequenceDisplay');
        if (!userDisplay) return;
        
        const expectedLength = Number.isInteger(options.expectedLength)
            ? Math.max(options.expectedLength, userSequence.length)
            : userSequence.length;

        const hasUserContent = userSequence.length > 0 || expectedLength > 0;

        if (!hasUserContent) {
            userDisplay.innerHTML = '';
            userDisplay.style.display = 'none';
            if (targetDisplay && targetDisplay.childElementCount > 0) {
                targetDisplay.style.display = 'flex';
            }
            return;
        }

        if (targetDisplay) {
            targetDisplay.style.display = 'none';
        }

        userDisplay.innerHTML = '';

        const title = document.createElement('div');
        const dictationType = options.dictationType === 'harmonic' ? 'harmonic' : 'melodic';
        title.textContent = dictationType === 'harmonic' ? 'Your chord:' : 'Your sequence:';
        title.style.marginBottom = '10px';
        title.style.fontSize = '0.9em';
        userDisplay.appendChild(title);

        const counts = dictationType === 'harmonic'
            ? this.buildNoteCounts(currentSequence)
            : null;

        for (let index = 0; index < expectedLength; index += 1) {
            const hasUserNote = index < userSequence.length;
            const note = hasUserNote ? userSequence[index] : '?';
            const noteEl = document.createElement('div');
            noteEl.className = 'sequence-note user';
            const displayLabel = hasUserNote && this.noteLabelFormatter
                ? this.noteLabelFormatter(note, index)
                : (hasUserNote ? note : '?');
            noteEl.textContent = displayLabel;
            
            // Add comparison styling if we have a target sequence
            if (currentSequence && dictationType === 'melodic' && hasUserNote && index < currentSequence.length) {
                if (note === currentSequence[index]) {
                    noteEl.classList.add('correct');
                } else {
                    noteEl.classList.add('incorrect');
                }
            } else if (currentSequence && dictationType === 'harmonic' && hasUserNote) {
                const key = this.normalizeNoteKey(note);
                const remaining = counts ? counts.get(key) || 0 : 0;
                if (remaining > 0) {
                    noteEl.classList.add('correct');
                    counts.set(key, remaining - 1);
                } else {
                    noteEl.classList.add('incorrect');
                }
            }
            
            userDisplay.appendChild(noteEl);
        }

        userDisplay.style.display = 'flex';
    }

    /**
     * Show comparison between user sequence and target sequence
     * @param {Array} userSequence - User's sequence
     * @param {Array} currentSequence - Target sequence
     */
    showComparison(userSequence, currentSequence, options = {}) {
        const expectedLength = Array.isArray(currentSequence) ? currentSequence.length : userSequence.length;
        this.updateUserSequenceDisplay(userSequence, currentSequence, {
            ...options,
            expectedLength
        });
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

    highlightChord() {
        const noteElements = document.querySelectorAll('#sequenceDisplay .sequence-note');
        noteElements.forEach((el) => el.classList.add('playing'));
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
            dictationType: document.getElementById('dictationType')
                ? document.getElementById('dictationType').value
                : undefined,
            mode: document.getElementById('mode').value,
            timbre: document.getElementById('timbreSelect') ? document.getElementById('timbreSelect').value : undefined,
            staffFont: document.getElementById('staffFont') ? document.getElementById('staffFont').value : undefined,
            disabledKeysStyle: document.getElementById('disabledKeysStyle')
                ? document.getElementById('disabledKeysStyle').value
                : undefined,
            answerRevealMode: document.getElementById('answerRevealMode')
                ? document.getElementById('answerRevealMode').value
                : undefined,
            inputMode: document.getElementById('inputMode')
                ? document.getElementById('inputMode').value
                : undefined
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
        if (values.dictationType !== undefined) {
            this.setDictationTypeValue(values.dictationType);
        }
        if (values.mode !== undefined) {
            document.getElementById('mode').value = values.mode;
        }
        if (values.timbre !== undefined) {
            this.setTimbreValue(values.timbre);
        }
        if (values.staffFont !== undefined) {
            this.setStaffFontValue(values.staffFont);
        }
        if (values.disabledKeysStyle !== undefined) {
            this.setDisabledKeysStyleValue(values.disabledKeysStyle);
        }
        if (values.answerRevealMode !== undefined) {
            this.setAnswerRevealModeValue(values.answerRevealMode);
        }
        if (values.inputMode !== undefined) {
            this.setInputModeValue(values.inputMode);
        }
    }
}

UIModule.prototype.setDisabledKeysStyleValue = function setDisabledKeysStyleValue(value) {
    const select = document.getElementById('disabledKeysStyle');
    if (select && value) {
        select.value = value;
    }
};

UIModule.prototype.setDictationTypeValue = function setDictationTypeValue(value) {
    const select = document.getElementById('dictationType');
    if (select && value) {
        select.value = value;
    }
};

UIModule.prototype.setAnswerRevealModeValue = function setAnswerRevealModeValue(value) {
    const select = document.getElementById('answerRevealMode');
    if (select && value) {
        select.value = value;
    }
};

UIModule.prototype.setInputModeValue = function setInputModeValue(value) {
    const select = document.getElementById('inputMode');
    if (select && value) {
        select.value = value;
    }
};

UIModule.prototype.setStaffInputActive = function setStaffInputActive(active) {
    const controls = document.getElementById('staffInputControls');
    const piano = document.getElementById('pianoContainer');
    if (controls) {
        if (active) controls.removeAttribute('hidden');
        else controls.setAttribute('hidden', '');
    }
    if (piano) {
        if (active) piano.setAttribute('hidden', '');
        else piano.removeAttribute('hidden');
    }
};

UIModule.prototype.setStaffSubmitEnabled = function setStaffSubmitEnabled(enabled) {
    const submitBtn = document.getElementById('staffSubmitBtn');
    if (!submitBtn) return;
    if (enabled) {
        submitBtn.removeAttribute('disabled');
    } else {
        submitBtn.setAttribute('disabled', '');
    }
};

// Export the module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIModule;
} else {
    window.UIModule = UIModule;
}
