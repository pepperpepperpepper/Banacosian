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
    setMode(mode) {
        this.mode = mode;
        this.diatonicNotes = this.musicTheory.generateDiatonicNotes(mode);
    }

    /**
     * Update keyboard visibility and labels based on current mode
     */
    updateKeyboardVisibility() {
        const showAllNotes = this.scaleType === 'chromatic';
        
        let keyboardMapping;
        if (!showAllNotes) {
            try {
                keyboardMapping = this.musicTheory.getCurrentKeyboardMapping(this.mode);
            } catch (error) {
                console.error('Error getting keyboard mapping:', error);
                keyboardMapping = {}; // Fallback to empty mapping
            }
        }
        
        // Update key states and labels based on current mode mapping
        const keys = document.querySelectorAll('.white-key, .black-key');
        
        keys.forEach(key => {
            const physicalNote = key.dataset.note;
            
            if (showAllNotes) {
                // Chromatic mode: all keys enabled, show physical note names
                const noteName = physicalNote.slice(0, -1); // Remove octave number
                key.textContent = noteName;
                key.classList.remove('disabled');
            } else {
                // Diatonic mode: use keyboard mapping
                const actualNote = keyboardMapping[physicalNote];
                
                if (actualNote && typeof actualNote === 'string') {
                    // Update the key label to show the actual note
                    const noteName = actualNote.slice(0, -1); // Remove octave number
                    key.textContent = noteName;
                    
                    const isInDiatonicScale = this.diatonicNotes && this.diatonicNotes.includes(actualNote);
                    
                    // Diatonic mode: disable non-diatonic notes
                    if (isInDiatonicScale) {
                        key.classList.remove('disabled');
                    } else {
                        key.classList.add('disabled');
                    }
                } else {
                    // Key not mapped in current mode
                    key.textContent = '';
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
        
        if (this.scaleType === 'chromatic') {
            // In chromatic mode, use the physical note directly
            actualNote = physicalNote;
        } else {
            // In diatonic mode, get the mapped note for the current mode
            const keyboardMapping = this.musicTheory.getCurrentKeyboardMapping(this.mode);
            actualNote = keyboardMapping[physicalNote];
            
            if (!actualNote) return; // Key not mapped in current mode
            
            // Check if this note is allowed in diatonic mode
            const isAllowed = this.diatonicNotes.includes(actualNote);
            if (!isAllowed) return;
        }
        
        // Visual feedback on key press
        const key = document.querySelector(`[data-note="${physicalNote}"]`);
        key.classList.add('pressed');
        setTimeout(() => key.classList.remove('pressed'), 150);
        
        // Play the note
        await this.audioModule.playTone(this.musicTheory.getNoteFrequency(actualNote), 0.5);
        
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