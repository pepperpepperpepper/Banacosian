/**
 * Music Theory Module - Handles scales, modes, and note calculations
 */
class MusicTheoryModule {
    constructor() {
        // Note frequencies in Hz - Extended range (3rd to 6th octave)
        this.noteFrequencies = {
            // 3rd octave
            'G3': 196.00,
            'G#3': 207.65,
            'A3': 220.00,
            'A#3': 233.08,
            'B3': 246.94,
            // 4th octave
            'C4': 261.63,
            'C#4': 277.18,
            'D4': 293.66,
            'D#4': 311.13,
            'E4': 329.63,
            'F4': 349.23,
            'F#4': 369.99,
            'G4': 392.00,
            'G#4': 415.30,
            'A4': 440.00,
            'A#4': 466.16,
            'B4': 493.88,
            // 5th octave
            'C5': 523.25,
            'C#5': 554.37,
            'D5': 587.33,
            'D#5': 622.25,
            'E5': 659.25,
            'F5': 698.46,
            'F#5': 739.99,
            'G5': 783.99,
            'G#5': 830.61,
            'A5': 880.00,
            'A#5': 932.33,
            'B5': 987.77,
            // 6th octave
            'C6': 1046.50,
            'C#6': 1108.73,
            'D6': 1174.66,
            'D#6': 1244.51,
            'E6': 1318.51,
            'F6': 1396.91
        };

        this.chromaticNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        this.naturalNotes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
        this.availableTonics = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
        this.whiteKeyCount = 14;

        this.modeConfigs = {
            'ionian': { tonic: 'C4' },
            'dorian': { tonic: 'D4' },
            'phrygian': { tonic: 'E4' },
            'lydian': { tonic: 'F4' },
            'mixolydian': { tonic: 'G3' },
            'aeolian': { tonic: 'A3' },
            'locrian': { tonic: 'B3' }
        };

        // Mode patterns (semitone intervals from tonic)
        this.modePatterns = {
            'ionian': [0, 2, 4, 5, 7, 9, 11],      // Major
            'dorian': [0, 2, 3, 5, 7, 9, 10],      // Minor with raised 6th
            'phrygian': [0, 1, 3, 5, 7, 8, 10],    // Minor with lowered 2nd
            'lydian': [0, 2, 4, 6, 7, 9, 11],      // Major with raised 4th
            'mixolydian': [0, 2, 4, 5, 7, 9, 10],  // Major with lowered 7th
            'aeolian': [0, 2, 3, 5, 7, 8, 10],     // Natural minor
            'locrian': [0, 1, 3, 5, 6, 8, 10]      // Diminished
        };

        this.notes = Object.keys(this.noteFrequencies).sort(
            (a, b) => this.noteToSemitone(a) - this.noteToSemitone(b)
        );
        this.modeLayouts = new Map();
        this.modeRanges = new Map();
        this.defaultTonicLetters = {};

        this.initializeModeLayouts();
    }

    /**
     * Generate diatonic notes for the current mode
     * @param {string} mode - The current mode (e.g., 'ionian', 'dorian')
     * @returns {Array} Array of diatonic notes
     */
    generateDiatonicNotes(mode, tonicLetter) {
        const layout = this.getKeyboardLayout(mode, tonicLetter);
        const pattern = this.modePatterns[mode];
        if (!layout || !layout.whiteKeys || layout.whiteKeys.length === 0 || !pattern) {
            return [];
        }

        const diatonicNotes = [];
        const startNote = layout.whiteKeys[0];
        const endNote = layout.whiteKeys[layout.whiteKeys.length - 1];
        const allNotesInRange = this.getAllNotesInRange(startNote, endNote);

        const startNoteName = startNote.slice(0, -1);
        const startNoteIndex = this.chromaticNotes.indexOf(startNoteName);
        if (startNoteIndex === -1) {
            return diatonicNotes;
        }

        allNotesInRange.forEach(note => {
            const noteName = note.slice(0, -1);
            const noteIndex = this.chromaticNotes.indexOf(noteName);
            if (noteIndex === -1) return;

            const intervalFromStart = (noteIndex - startNoteIndex + 12) % 12;
            if (pattern.includes(intervalFromStart)) {
                diatonicNotes.push(note);
            }
        });

        return diatonicNotes;
    }

    /**
     * Get all notes within a specified range
     * @param {string} startNote - Starting note (e.g., 'C4')
     * @param {string} endNote - Ending note (e.g., 'C5')
     * @returns {Array} Array of notes in the range
     */
    getAllNotesInRange(startNote, endNote) {
        if (!startNote || !endNote) {
            return [];
        }

        const allNotes = this.notes;
        const startIndex = allNotes.indexOf(startNote);
        const endIndex = allNotes.indexOf(endNote);

        if (startIndex === -1 || endIndex === -1) {
            return [];
        }

        if (startIndex <= endIndex) {
            return allNotes.slice(startIndex, endIndex + 1);
        }

        return allNotes.slice(endIndex, startIndex + 1).reverse();
    }

    /**
     * Initialize cached layouts and ranges for all modes
     */
    initializeModeLayouts() {
        Object.keys(this.modeConfigs).forEach(mode => {
            const config = this.modeConfigs[mode];
            if (!config) return;

            const defaultLetter = this.extractNoteLetter(config.tonic);
            this.defaultTonicLetters[mode] = defaultLetter;

            const layout = this.buildKeyboardLayout(mode, defaultLetter);
            const cacheKey = this.getLayoutCacheKey(mode, defaultLetter);
            this.modeLayouts.set(cacheKey, layout);
            this.modeRanges.set(cacheKey, { whiteKeys: layout.whiteKeys.slice() });
        });
    }

    /**
     * Build the keyboard layout structure for a mode
     * @param {{tonic: string, whiteKeyCount?: number}} config - Mode configuration
     * @returns {{whiteKeys: string[], blackKeys: Array, mapping: Object}}
     */
    buildKeyboardLayout(mode, tonicLetter) {
        const config = this.modeConfigs[mode] || this.modeConfigs['ionian'];
        const defaultTonicNote = config.tonic;
        const whiteKeyCount = config.whiteKeyCount || this.whiteKeyCount;

        const targetLetter = this.normalizeTonic(tonicLetter) || this.extractNoteLetter(defaultTonicNote);
        const tonicNote = this.resolveTonicNote(defaultTonicNote, targetLetter);

        let whiteKeys = this.buildWhiteKeySeries(tonicNote, whiteKeyCount);
        let appliedTonicNote = tonicNote;
        let appliedTonicLetter = targetLetter;

        if (whiteKeys.length < whiteKeyCount) {
            // Fallback to default layout if requested tonic is out of supported range
            whiteKeys = this.buildWhiteKeySeries(defaultTonicNote, whiteKeyCount);
            appliedTonicNote = defaultTonicNote;
            appliedTonicLetter = this.extractNoteLetter(defaultTonicNote);
        }

        const blackKeys = this.buildBlackKeySeries(whiteKeys);

        const mapping = {};
        whiteKeys.forEach(note => {
            mapping[note] = note;
        });
        blackKeys.forEach(key => {
            mapping[key.note] = key.note;
        });

        return {
            tonicNote: appliedTonicNote,
            tonicLetter: appliedTonicLetter,
            whiteKeys,
            blackKeys,
            mapping
        };
    }

    /**
     * Build sequential white keys starting from tonic
     * @param {string} tonic - Starting note (natural)
     * @param {number} count - Number of white keys to generate
     * @returns {string[]} Array of white key note names
     */
    buildWhiteKeySeries(tonic, count) {
        if (!tonic || typeof tonic !== 'string') {
            return [];
        }

        const noteName = tonic.slice(0, -1);
        const octave = parseInt(tonic.slice(-1), 10);
        if (Number.isNaN(octave)) {
            return [];
        }

        const startIndex = this.naturalNotes.indexOf(noteName);
        if (startIndex === -1) {
            return [];
        }

        const whiteKeys = [];
        let currentIndex = startIndex;
        let currentOctave = octave;

        for (let i = 0; i < count; i++) {
            const naturalNote = this.naturalNotes[currentIndex];
            const noteKey = `${naturalNote}${currentOctave}`;
            if (!this.noteFrequencies[noteKey]) {
                break;
            }
            whiteKeys.push(noteKey);

            currentIndex = (currentIndex + 1) % this.naturalNotes.length;
            if (currentIndex === 0) {
                currentOctave += 1;
            }
        }

        return whiteKeys;
    }

    /**
     * Build black key definitions between white keys
     * @param {string[]} whiteKeys - Ordered white keys
     * @returns {Array<{note: string, precedingIndex: number, followingIndex: number}>}
     */
    buildBlackKeySeries(whiteKeys) {
        const blackKeys = [];
        for (let i = 0; i < whiteKeys.length - 1; i++) {
            const lower = whiteKeys[i];
            const upper = whiteKeys[i + 1];

            const lowerValue = this.noteToSemitone(lower);
            const upperValue = this.noteToSemitone(upper);
            if (lowerValue === null || upperValue === null) continue;

            if (upperValue - lowerValue === 2) {
                const sharpValue = lowerValue + 1;
                const sharpNote = this.semitoneToNote(sharpValue);
                if (this.noteFrequencies[sharpNote]) {
                    blackKeys.push({
                        note: sharpNote,
                        precedingIndex: i,
                        followingIndex: i + 1
                    });
                }
            }
        }

        return blackKeys;
    }

    /**
     * Extract the letter portion of a note (without octave)
     * @param {string} note - Note string (e.g., 'C4')
     * @returns {string} Note letter (e.g., 'C')
     */
    extractNoteLetter(note) {
        if (!note || typeof note !== 'string') {
            return '';
        }
        return note.replace(/[0-9]/g, '');
    }

    /**
     * Normalize tonic input
     * @param {string} tonic - Raw tonic string
     * @returns {string} Normalized tonic
     */
    normalizeTonic(tonic) {
        if (!tonic || typeof tonic !== 'string') {
            return '';
        }
        return tonic.trim().toUpperCase();
    }

    /**
     * Build a cache key for mode layouts
     * @param {string} mode - Mode name
     * @param {string} tonicLetter - Tonic letter
     * @returns {string} Cache key
     */
    getLayoutCacheKey(mode, tonicLetter) {
        const safeMode = mode || 'ionian';
        const safeTonic = tonicLetter || this.getDefaultTonicLetter(safeMode);
        return `${safeMode}:${safeTonic}`;
    }

    /**
     * Clone a layout object to avoid external mutation
     * @param {Object} layout - Layout to clone
     * @returns {Object} Cloned layout
     */
    cloneLayout(layout) {
        if (!layout) {
            return { whiteKeys: [], blackKeys: [], mapping: {} };
        }
        return {
            tonicNote: layout.tonicNote,
            tonicLetter: layout.tonicLetter,
            whiteKeys: layout.whiteKeys ? layout.whiteKeys.slice() : [],
            blackKeys: layout.blackKeys ? layout.blackKeys.map(key => ({ ...key })) : [],
            mapping: layout.mapping ? { ...layout.mapping } : {}
        };
    }

    /**
     * Resolve the tonic note closest to the default for a given letter
     * @param {string} defaultNote - Default tonic note (e.g., 'C4')
     * @param {string} tonicLetter - Requested tonic letter (e.g., 'D')
     * @returns {string} Resolved tonic note
     */
    resolveTonicNote(defaultNote, tonicLetter) {
        if (!tonicLetter) {
            return defaultNote;
        }

        const defaultLetter = this.extractNoteLetter(defaultNote);
        if (defaultLetter === tonicLetter) {
            return defaultNote;
        }

        const baseIndex = this.notes.indexOf(defaultNote);
        if (baseIndex === -1) {
            return defaultNote;
        }

        const candidates = [];
        const upward = this.findNearestNaturalNote(baseIndex, tonicLetter, 1);
        if (upward) candidates.push(upward);
        const downward = this.findNearestNaturalNote(baseIndex, tonicLetter, -1);
        if (downward) candidates.push(downward);

        const whiteKeyTarget = this.whiteKeyCount;
        const validCandidates = candidates.filter(note => (
            this.buildWhiteKeySeries(note, whiteKeyTarget).length === whiteKeyTarget
        ));

        if (validCandidates.length === 0) {
            return defaultNote;
        }

        const defaultValue = this.noteToSemitone(defaultNote);
        let best = validCandidates[0];
        let bestDiff = Math.abs(this.noteToSemitone(best) - defaultValue);

        for (let i = 1; i < validCandidates.length; i++) {
            const candidate = validCandidates[i];
            const diff = Math.abs(this.noteToSemitone(candidate) - defaultValue);

            if (diff < bestDiff) {
                best = candidate;
                bestDiff = diff;
            } else if (diff === bestDiff) {
                const candidateValue = this.noteToSemitone(candidate);
                const bestValue = this.noteToSemitone(best);
                // Prefer candidates that stay at or above the default register
                if (candidateValue >= defaultValue && bestValue < defaultValue) {
                    best = candidate;
                }
            }
        }

        return best || defaultNote;
    }

    /**
     * Find nearest natural note with given letter from base index
     * @param {number} startIndex - Starting index in notes array
     * @param {string} targetLetter - Target note letter
     * @param {number} direction - 1 for upward, -1 for downward
     * @returns {string|null} Note string if found
     */
    findNearestNaturalNote(startIndex, targetLetter, direction = 1) {
        if (direction >= 0) {
            for (let i = startIndex; i < this.notes.length; i++) {
                const note = this.notes[i];
                if (!note.includes('#') && this.extractNoteLetter(note) === targetLetter) {
                    return note;
                }
            }
        } else {
            for (let i = startIndex; i >= 0; i--) {
                const note = this.notes[i];
                if (!note.includes('#') && this.extractNoteLetter(note) === targetLetter) {
                    return note;
                }
            }
        }
        return null;
    }

    /**
     * Convert note string to semitone index
     * @param {string} note - Note (e.g., 'C#4')
     * @returns {number|null} Semitone index or null if invalid
     */
    noteToSemitone(note) {
        if (!note || typeof note !== 'string') {
            return null;
        }

        const octave = parseInt(note.slice(-1), 10);
        if (Number.isNaN(octave)) {
            return null;
        }

        const noteName = note.slice(0, -1);
        const chromaticIndex = this.chromaticNotes.indexOf(noteName);
        if (chromaticIndex === -1) {
            return null;
        }

        return octave * 12 + chromaticIndex;
    }

    /**
     * Convert semitone index back to note string
     * @param {number} value - Semitone index
     * @returns {string} Note string
     */
    semitoneToNote(value) {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            return '';
        }

        const octave = Math.floor(value / 12);
        const noteIndex = ((value % 12) + 12) % 12;
        const noteName = this.chromaticNotes[noteIndex];
        return `${noteName}${octave}`;
    }

    /**
     * Get the current keyboard mapping for a specific mode
     * @param {string} mode - The current mode
     * @returns {Object} Keyboard mapping object
     */
    getCurrentKeyboardMapping(mode, tonicLetter) {
        const layout = this.getKeyboardLayout(mode, tonicLetter);
        if (!layout) {
            return {};
        }

        return { ...layout.mapping };
    }

    /**
     * Get or compute the keyboard layout for a mode
     * @param {string} mode - Mode name
     * @returns {{whiteKeys: string[], blackKeys: Array, mapping: Object}}
     */
    getKeyboardLayout(mode, tonicLetter) {
        const normalizedMode = mode || 'ionian';
        const targetLetter = this.normalizeTonic(tonicLetter) || this.getDefaultTonicLetter(normalizedMode);
        const cacheKey = this.getLayoutCacheKey(normalizedMode, targetLetter);

        if (!this.modeLayouts.has(cacheKey)) {
            const layout = this.buildKeyboardLayout(normalizedMode, targetLetter);
            this.modeLayouts.set(cacheKey, layout);
            this.modeRanges.set(cacheKey, { whiteKeys: layout.whiteKeys.slice() });
        }

        const cachedLayout = this.modeLayouts.get(cacheKey);
        if (!cachedLayout) {
            return { whiteKeys: [], blackKeys: [], mapping: {} };
        }

        return this.cloneLayout(cachedLayout);
    }

    /**
     * Get all available notes
     * @returns {Array} Array of all note names
     */
    getNotes() {
        return this.notes;
    }

    /**
     * Get note frequency
     * @param {string} note - Note name (e.g., 'C4')
     * @returns {number} Frequency in Hz
     */
    getNoteFrequency(note) {
        return this.noteFrequencies[note];
    }

    /**
     * Get the white-key range for a mode/tonic combination
     * @param {string} mode - Mode name
     * @param {string} tonicLetter - Tonic letter
     * @returns {{whiteKeys: string[]}} Range descriptor
     */
    getModeRange(mode, tonicLetter) {
        const layout = this.getKeyboardLayout(mode, tonicLetter);
        return { whiteKeys: layout.whiteKeys.slice() };
    }

    /**
     * Get the default tonic letter for a mode
     * @param {string} mode - Mode name
     * @returns {string} Default tonic letter
     */
    getDefaultTonicLetter(mode) {
        return this.defaultTonicLetters[mode] || 'C';
    }

    /**
     * Get available tonic options
     * @returns {Array<string>} tonics
     */
    getAvailableTonics() {
        return this.availableTonics.slice();
    }

    /**
     * Get mode patterns
     * @returns {Object} Mode patterns object
     */
    getModePatterns() {
        return this.modePatterns;
    }
}

// Export the module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MusicTheoryModule;
} else {
    window.MusicTheoryModule = MusicTheoryModule;
}
