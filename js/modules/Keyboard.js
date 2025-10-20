/**
 * Keyboard Module - Handles piano keyboard management and interaction
 */
class KeyboardModule {
    constructor(musicTheory, audioModule) {
        this.musicTheory = musicTheory;
        this.audioModule = audioModule;
        this.scaleType = 'diatonic';
        this.mode = 'ionian';
        this.diatonicNotes = [];
        this.tonicLetter = this.musicTheory.getDefaultTonicLetter(this.mode);
        this.whiteKeyElements = Array.from(document.querySelectorAll('.white-key'));
        this.blackKeyElements = Array.from(document.querySelectorAll('.black-key'));
        this.pianoKeysContainer = document.querySelector('.piano-keys');
        this.currentLayout = null;
        this.handleResize = this.handleResize.bind(this);

        if (typeof window !== 'undefined') {
            window.addEventListener('resize', this.handleResize);
        }
    }

    /**
     * Set the current scale type
     * @param {string} scaleType - 'diatonic' or 'chromatic'
     */
    setScaleType(scaleType) {
        this.scaleType = scaleType;
    }

    /**
     * Set the current mode
     * @param {string} mode - Mode name (e.g., 'ionian', 'dorian')
     */
    setMode(mode, tonicLetter) {
        this.mode = mode;
        if (tonicLetter) {
            this.tonicLetter = tonicLetter.toUpperCase();
        } else {
            this.tonicLetter = this.musicTheory.getDefaultTonicLetter(this.mode);
        }
        this.applyModeLayout();
        this.diatonicNotes = this.musicTheory.generateDiatonicNotes(this.mode, this.tonicLetter);
    }

    /**
     * Set the tonic for the current mode
     * @param {string} tonicLetter - New tonic letter
     */
    setTonic(tonicLetter) {
        if (!tonicLetter) return;
        this.tonicLetter = tonicLetter.toUpperCase();
        this.applyModeLayout();
        this.diatonicNotes = this.musicTheory.generateDiatonicNotes(this.mode, this.tonicLetter);
    }

    /**
     * Update the physical keyboard layout to match the current mode
     */
    applyModeLayout() {
        if (!this.whiteKeyElements || this.whiteKeyElements.length === 0) {
            this.whiteKeyElements = Array.from(document.querySelectorAll('.white-key'));
        }

        if (!this.blackKeyElements || this.blackKeyElements.length === 0) {
            this.blackKeyElements = Array.from(document.querySelectorAll('.black-key'));
        }

        this.pianoKeysContainer = this.pianoKeysContainer || document.querySelector('.piano-keys');
        if (!this.pianoKeysContainer) {
            return;
        }

        const layout = this.musicTheory.getKeyboardLayout(this.mode, this.tonicLetter);
        this.currentLayout = layout;

        this.whiteKeyElements.forEach((keyEl, index) => {
            const note = layout.whiteKeys[index];
            if (note) {
                keyEl.dataset.note = note;
                keyEl.removeAttribute('hidden');
            } else {
                keyEl.dataset.note = '';
                keyEl.setAttribute('hidden', '');
            }
        });

        this.blackKeyElements.forEach((keyEl, index) => {
            const descriptor = layout.blackKeys[index];
            if (descriptor) {
                keyEl.dataset.note = descriptor.note;
                keyEl.dataset.precedingIndex = descriptor.precedingIndex;
                keyEl.dataset.followingIndex = descriptor.followingIndex;
                keyEl.removeAttribute('hidden');
            } else {
                keyEl.dataset.note = '';
                keyEl.removeAttribute('data-preceding-index');
                keyEl.removeAttribute('data-following-index');
                keyEl.setAttribute('hidden', '');
            }
        });

        if (typeof window !== 'undefined') {
            window.requestAnimationFrame(() => this.positionBlackKeys());
        } else {
            this.positionBlackKeys();
        }
    }

    /**
     * Reposition black keys based on the current white key layout
     */
    positionBlackKeys() {
        if (!this.pianoKeysContainer || !this.currentLayout) {
            return;
        }

        const containerRect = this.pianoKeysContainer.getBoundingClientRect();

        this.blackKeyElements.forEach((keyEl) => {
            if (keyEl.hasAttribute('hidden')) {
                return;
            }

            const precedingIndex = parseInt(keyEl.dataset.precedingIndex, 10);
            const followingIndex = parseInt(keyEl.dataset.followingIndex, 10);

            if (Number.isNaN(precedingIndex) || Number.isNaN(followingIndex)) {
                keyEl.setAttribute('hidden', '');
                return;
            }

            const precedingEl = this.whiteKeyElements[precedingIndex];
            const followingEl = this.whiteKeyElements[followingIndex];

            if (!precedingEl || !followingEl || precedingEl.hasAttribute('hidden') || followingEl.hasAttribute('hidden')) {
                keyEl.setAttribute('hidden', '');
                return;
            }

            const precedingRect = precedingEl.getBoundingClientRect();
            const followingRect = followingEl.getBoundingClientRect();
            const midpoint = (precedingRect.right + followingRect.left) / 2;
            const keyWidth = keyEl.offsetWidth || 0;
            const leftPx = midpoint - containerRect.left - (keyWidth / 2);

            keyEl.style.left = `${leftPx}px`;
        });
    }

    /**
     * Handle resize events so the black keys stay aligned
     */
    handleResize() {
        this.positionBlackKeys();
    }

    /**
     * Update keyboard visibility and labels based on current mode
     */
    updateKeyboardVisibility() {
        const showAllNotes = this.scaleType === 'chromatic';
        if (!showAllNotes) {
            this.diatonicNotes = this.musicTheory.generateDiatonicNotes(this.mode, this.tonicLetter);
        }
        const activeNotes = new Set(this.diatonicNotes);

        const keys = document.querySelectorAll('.white-key, .black-key');

        keys.forEach(key => {
            const actualNote = key.dataset.note;
            if (key.hasAttribute('hidden') || !actualNote) {
                key.textContent = '';
                key.classList.add('disabled');
                return;
            }

            const noteName = actualNote.slice(0, -1);
            key.textContent = noteName;

            if (showAllNotes) {
                key.classList.remove('disabled');
            } else {
                if (activeNotes.has(actualNote)) {
                    key.classList.remove('disabled');
                } else {
                    key.classList.add('disabled');
                }
            }
        });
        
        // Add visual indication for diatonic mode
        const piano = document.querySelector('.piano');
        if (this.scaleType === 'diatonic') {
            piano.style.background = '#2d4a2b'; // Slightly green tint for diatonic
        } else {
            piano.style.background = '#333'; // Normal color for chromatic
        }
    }

    /**
     * Handle note play event
     * @param {string} physicalNote - The physical note that was clicked
     * @param {Function} onNotePlayed - Callback function when note is played
     */
    async playNote(physicalNote, onNotePlayed) {
        if (this.audioModule.getIsPlaying()) return;
        
        let actualNote;
        
        actualNote = physicalNote;
        if (!actualNote) return;

        if (this.scaleType !== 'chromatic') {
            if (!this.diatonicNotes || this.diatonicNotes.length === 0) {
                this.diatonicNotes = this.musicTheory.generateDiatonicNotes(this.mode, this.tonicLetter);
            }
            if (!this.diatonicNotes.includes(actualNote)) {
                return;
            }
        }
        
        // Visual feedback on key press
        const key = document.querySelector(`.white-key[data-note="${actualNote}"], .black-key[data-note="${actualNote}"]`);
        if (!key || key.classList.contains('disabled')) {
            return;
        }
        key.classList.add('pressed');
        setTimeout(() => key.classList.remove('pressed'), 150);
        
        // Play the note
        const frequency = this.musicTheory.getNoteFrequency(actualNote);
        if (!frequency) {
            return;
        }
        await this.audioModule.playTone(frequency, 0.5);
        
        // Call the callback with the actual note played
        if (onNotePlayed) {
            onNotePlayed(actualNote);
        }
    }

    /**
     * Setup keyboard event listeners
     * @param {Function} onNotePlayed - Callback function when note is played
     */
    setupEventListeners(onNotePlayed) {
        document.querySelectorAll('.white-key, .black-key').forEach(key => {
            key.addEventListener('click', (e) => {
                this.playNote(e.target.dataset.note, onNotePlayed);
            });
        });
    }

    /**
     * Get current diatonic notes
     * @returns {Array} Array of diatonic notes
     */
    getDiatonicNotes() {
        return this.diatonicNotes;
    }

    /**
     * Get current scale type
     * @returns {string} Current scale type
     */
    getScaleType() {
        return this.scaleType;
    }

    /**
     * Get current mode
     * @returns {string} Current mode
     */
    getMode() {
        return this.mode;
    }
}

// Export the module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = KeyboardModule;
} else {
    window.KeyboardModule = KeyboardModule;
}
