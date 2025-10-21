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
        this.boundKeyHandler = null;
        this.onNotePlayedCallback = null;
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
            this.tonicLetter = this.musicTheory.normalizeTonic
                ? this.musicTheory.normalizeTonic(tonicLetter)
                : tonicLetter.toUpperCase();
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
        this.tonicLetter = this.musicTheory.normalizeTonic
            ? this.musicTheory.normalizeTonic(tonicLetter)
            : tonicLetter.toUpperCase();
        this.applyModeLayout();
        this.diatonicNotes = this.musicTheory.generateDiatonicNotes(this.mode, this.tonicLetter);
    }

    /**
     * Render the physical keyboard based on the provided layout
     * @param {Object} layout - Keyboard layout descriptor
     */
    renderKeyboard(layout) {
        this.pianoKeysContainer = this.pianoKeysContainer || document.querySelector('.piano-keys');
        if (!this.pianoKeysContainer) {
            return;
        }

        const container = this.pianoKeysContainer;
        container.innerHTML = '';

        const whiteFragment = document.createDocumentFragment();
        const whiteDetails = (layout && layout.whiteKeyDetails && layout.whiteKeyDetails.length > 0)
            ? layout.whiteKeyDetails
            : (layout && layout.physicalWhiteKeys ? layout.physicalWhiteKeys.map(note => ({ note })) : (layout && layout.whiteKeys ? layout.whiteKeys.map(note => ({ note })) : []));

        whiteDetails.forEach((detail, index) => {
            const keyEl = document.createElement('div');
            keyEl.className = 'white-key';
            keyEl.dataset.note = detail.note || detail.rawNote || '';
            if (typeof detail.midi === 'number') {
                keyEl.dataset.midi = String(detail.midi);
            } else {
                keyEl.removeAttribute('data-midi');
            }
            keyEl.dataset.whiteIndex = String(typeof detail.whiteIndex === 'number' ? detail.whiteIndex : index);
            if (detail.displayLabel) {
                keyEl.dataset.displayLabel = detail.displayLabel;
            } else if (detail.displayName) {
                keyEl.dataset.displayLabel = detail.displayName;
            } else {
                keyEl.removeAttribute('data-display-label');
            }
            whiteFragment.appendChild(keyEl);
        });

        container.appendChild(whiteFragment);

        const blackFragment = document.createDocumentFragment();
        const blackDetails = (layout && layout.blackKeys) ? layout.blackKeys : [];

        blackDetails.forEach(detail => {
            const keyEl = document.createElement('div');
            keyEl.className = 'black-key';
            keyEl.dataset.note = detail.note || detail.rawNote || '';

            if (detail.displayLabel) {
                keyEl.dataset.displayLabel = detail.displayLabel;
            } else if (detail.displayName) {
                keyEl.dataset.displayLabel = detail.displayName;
            } else {
                keyEl.removeAttribute('data-display-label');
            }

            if (typeof detail.precedingIndex === 'number') {
                keyEl.dataset.precedingIndex = String(detail.precedingIndex);
            } else {
                keyEl.dataset.precedingIndex = '';
            }

            if (typeof detail.followingIndex === 'number') {
                keyEl.dataset.followingIndex = String(detail.followingIndex);
            } else {
                keyEl.dataset.followingIndex = '';
            }

            if (detail.edge) {
                keyEl.dataset.edge = detail.edge;
            } else {
                keyEl.removeAttribute('data-edge');
            }

            blackFragment.appendChild(keyEl);
        });

        container.appendChild(blackFragment);

        this.whiteKeyElements = Array.from(container.querySelectorAll('.white-key'));
        this.blackKeyElements = Array.from(container.querySelectorAll('.black-key'));
    }

    /**
     * Update the physical keyboard layout to match the current mode
     */
    applyModeLayout() {
        const layout = this.musicTheory.getKeyboardLayout(this.mode, this.tonicLetter);
        this.currentLayout = layout;
        if (layout && layout.tonicLetter) {
            this.tonicLetter = layout.tonicLetter;
        }
        this.renderKeyboard(layout);
        this.updateKeyboardVisibility();

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
            const rawPreceding = keyEl.dataset.precedingIndex;
            const rawFollowing = keyEl.dataset.followingIndex;
            const edgeHint = keyEl.dataset.edge || '';

            const precedingIndex = (rawPreceding === '' || typeof rawPreceding === 'undefined')
                ? null
                : parseInt(rawPreceding, 10);
            const followingIndex = (rawFollowing === '' || typeof rawFollowing === 'undefined')
                ? null
                : parseInt(rawFollowing, 10);

            const precedingEl = (precedingIndex !== null) ? this.whiteKeyElements[precedingIndex] : null;
            const followingEl = (followingIndex !== null) ? this.whiteKeyElements[followingIndex] : null;

            const precedingVisible = precedingEl && !precedingEl.hasAttribute('hidden');
            const followingVisible = followingEl && !followingEl.hasAttribute('hidden');

            if (!precedingVisible && !followingVisible) {
                keyEl.setAttribute('hidden', '');
                return;
            }

            keyEl.removeAttribute('hidden');
            keyEl.style.display = '';
            keyEl.style.pointerEvents = '';
            keyEl.style.opacity = '';

            const keyWidth = keyEl.offsetWidth || 0;
            let leftPx = null;

            const precedingRect = precedingVisible ? precedingEl.getBoundingClientRect() : null;
            const followingRect = followingVisible ? followingEl.getBoundingClientRect() : null;

            if (precedingRect && followingRect) {
                const midpoint = (precedingRect.right + followingRect.left) / 2;
                leftPx = midpoint - containerRect.left - (keyWidth / 2);
            } else if (precedingRect) {
                leftPx = precedingRect.right - containerRect.left - (keyWidth / 2);
            } else if (followingRect) {
                leftPx = followingRect.left - containerRect.left - (keyWidth / 2);
            }

            if (leftPx === null) {
                keyEl.setAttribute('hidden', '');
                return;
            }

            if (leftPx < 0) {
                leftPx = 0;
            }

            const containerWidth = containerRect.width || this.pianoKeysContainer.offsetWidth || 0;
            if (containerWidth > 0) {
                const maxLeft = containerWidth - keyWidth;
                if (leftPx > maxLeft) {
                    leftPx = maxLeft;
                }
            }

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

            const noteLabel = this.musicTheory.getDisplayNoteName(actualNote, this.mode, this.tonicLetter);
            key.textContent = noteLabel;

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
    async playNote(physicalNote, onNotePlayed = this.onNotePlayedCallback) {
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
        this.onNotePlayedCallback = onNotePlayed;
        this.pianoKeysContainer = this.pianoKeysContainer || document.querySelector('.piano-keys');
        if (!this.pianoKeysContainer) {
            return;
        }

        if (!this.boundKeyHandler) {
            this.boundKeyHandler = (event) => {
                const target = event.target.closest('.white-key, .black-key');
                if (!target || !this.pianoKeysContainer.contains(target)) {
                    return;
                }
                this.playNote(target.dataset.note);
            };
            this.pianoKeysContainer.addEventListener('click', this.boundKeyHandler);
        }
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
