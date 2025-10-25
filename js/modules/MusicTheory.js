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

        this.sharpNoteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        this.flatNoteNames = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
        this.noteNameToIndex = new Map();
        this.sharpNoteNames.forEach((name, index) => {
            this.noteNameToIndex.set(name, index);
        });
        this.flatNoteNames.forEach((name, index) => {
            this.noteNameToIndex.set(name, index);
        });

        this.chromaticNotes = this.sharpNoteNames.slice();
        this.naturalNotes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
        this.availableTonics = [
            'C', 'C#', 'Db', 'D', 'D#', 'Eb',
            'E', 'F', 'F#', 'Gb', 'G', 'G#',
            'Ab', 'A', 'A#', 'Bb', 'B'
        ];
        this.whiteKeyCount = 14;
        this.whiteKeyUnitWidth = 1;
        this.blackKeyUnitWidth = 0.64;

        this.baseWhiteKeys = [
            'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4',
            'C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5'
        ];
        this.naturalChromas = new Set([0, 2, 4, 5, 7, 9, 11]);

        const baseStartMidiCandidate = this.noteToSemitone(this.baseWhiteKeys[0]);
        const baseEndMidiCandidate = this.noteToSemitone(this.baseWhiteKeys[this.baseWhiteKeys.length - 1]);
        this.baseStartMidi = (typeof baseStartMidiCandidate === 'number') ? baseStartMidiCandidate : 60;
        this.baseEndMidi = (typeof baseEndMidiCandidate === 'number') ? baseEndMidiCandidate : this.baseStartMidi + 23;
        this.baseMidiSpan = this.baseEndMidi - this.baseStartMidi;
        this.whiteKeyOffsets = this.baseWhiteKeys.map(note => {
            const midi = this.noteToSemitone(note);
            if (typeof midi !== 'number') {
                return 0;
            }
            return midi - this.baseStartMidi;
        });

        this.tonal = (typeof Tonal !== 'undefined') ? Tonal : null;
        if (!this.tonal) {
            try {
                // eslint-disable-next-line global-require, import/no-extraneous-dependencies
                this.tonal = require('tonal');
            } catch (error) {
                this.tonal = null;
            }
        }
        this.tonalNote = this.tonal ? this.tonal.Note : null;
        this.tonalInterval = this.tonal ? this.tonal.Interval : null;
        this.tonalKey = this.tonal ? this.tonal.Key : null;
        this.tonalScale = this.tonal ? this.tonal.Scale : null;
        this.keySignatureCache = new Map();

        this.modeConfigs = {
            'ionian': { tonic: 'C4' },
            'dorian': { tonic: 'D4' },
            'phrygian': { tonic: 'E4' },
            'lydian': { tonic: 'F4' },
            'mixolydian': { tonic: 'G3' },
            'aeolian': { tonic: 'A3' },
            'locrian': { tonic: 'B3' },
            'chromatic': { tonic: 'C4' },
            'half-whole': { tonic: 'C4' },
            'whole-half': { tonic: 'C4' },
            'whole-tone': { tonic: 'C4' }
        };

        // Mode patterns (semitone intervals from tonic)
        this.modePatterns = {
            'ionian': [0, 2, 4, 5, 7, 9, 11],      // Major
            'dorian': [0, 2, 3, 5, 7, 9, 10],      // Minor with raised 6th
            'phrygian': [0, 1, 3, 5, 7, 8, 10],    // Minor with lowered 2nd
            'lydian': [0, 2, 4, 6, 7, 9, 11],      // Major with raised 4th
            'mixolydian': [0, 2, 4, 5, 7, 9, 10],  // Major with lowered 7th
            'aeolian': [0, 2, 3, 5, 7, 8, 10],     // Natural minor
            'locrian': [0, 1, 3, 5, 6, 8, 10],     // Diminished
            'chromatic': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
            'half-whole': [0, 1, 3, 4, 6, 7, 9, 10],
            'whole-half': [0, 2, 3, 5, 6, 8, 9, 11],
            'whole-tone': [0, 2, 4, 6, 8, 10]
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
     * Normalize a note name (without octave) to standard letter plus accidental
     * @param {string} noteName - e.g., 'db', 'C#'
     * @returns {string} Standardized note name (e.g., 'Db', 'C#')
     */
    standardizeNoteName(noteName) {
        if (!noteName || typeof noteName !== 'string') {
            return '';
        }
        const trimmed = noteName.trim();
        if (trimmed.length === 0) {
            return '';
        }

        const match = trimmed.match(/^([A-Ga-g])([#b♯♭]?)/);
        if (!match) {
            return '';
        }

        const letter = match[1].toUpperCase();
        let accidental = match[2] || '';
        if (accidental === '♯') accidental = '#';
        if (accidental === '♭' || accidental === 'B') accidental = 'b';
        if (accidental !== '#' && accidental !== 'b') accidental = '';

        return `${letter}${accidental}`;
    }

    /**
     * Convert a note name (without octave) to chromatic index (0-11)
     * @param {string} noteName - Standardized note name
     * @returns {number|null} Chromatic index or null if invalid
     */
    noteNameToChromaticIndex(noteName) {
        const standardized = this.standardizeNoteName(noteName);
        if (!standardized) {
            return null;
        }
        if (this.noteNameToIndex.has(standardized)) {
            return this.noteNameToIndex.get(standardized);
        }
        if (this.tonalNote) {
            const data = this.tonalNote.get(standardized);
            if (data && typeof data.chroma === 'number') {
                return ((data.chroma % 12) + 12) % 12;
            }
        }
        return null;
    }

    /**
     * Determine accidental preference for a tonic based purely on its spelling
     * @param {string} tonic - Tonic note name (without octave)
     * @returns {'sharp'|'flat'|'natural'} Preference hint
     */
    getPreferenceForTonic(tonic) {
        const normalized = this.standardizeNoteName(tonic);
        if (!normalized) {
            return 'natural';
        }
        if (normalized.includes('b')) {
            return 'flat';
        }
        if (normalized.includes('#')) {
            return 'sharp';
        }
        const naturalPreferences = {
            'C': 'natural',
            'D': 'sharp',
            'E': 'sharp',
            'F': 'flat',
            'G': 'sharp',
            'A': 'sharp',
            'B': 'sharp'
        };
        return naturalPreferences[normalized] || 'natural';
    }

    /**
     * Transpose a note by a number of semitones
     * @param {string} note - Base note (e.g., 'F#4')
     * @param {number} semitones - Semitone offset (can be negative)
     * @returns {string} Transposed note with octave
     */
    transposeNoteBySemitones(note, semitones) {
        if (!note || typeof note !== 'string' || typeof semitones !== 'number' || semitones === 0) {
            return note;
        }

        if (this.tonalNote && this.tonalInterval) {
            const interval = this.tonalInterval.fromSemitones(semitones);
            const result = this.tonalNote.transpose(note, interval);
            if (result && typeof result === 'string') {
                return result;
            }
        }

        const baseValue = this.noteToSemitone(note);
        if (baseValue === null) {
            return note;
        }
        const targetValue = baseValue + semitones;
        return this.semitoneToNote(targetValue);
    }

    /**
     * Resolve key signature metadata for a mode/tonic combination
     * @param {string} mode - Mode name
     * @param {string} tonic - Tonic name
     * @returns {{preference: string, displayTonic: string}} Key signature context
     */
    getKeySignatureContext(mode, tonic) {
        const cacheKey = `${mode || 'ionian'}:${tonic || ''}`;
        if (this.keySignatureCache.has(cacheKey)) {
            return this.keySignatureCache.get(cacheKey);
        }

        const normalizedMode = (mode || 'ionian').toLowerCase();
        const normalizedTonic = this.standardizeNoteName(tonic) || this.getDefaultTonicLetter(normalizedMode);
        const preference = this.getPreferenceForTonic(normalizedTonic);
        const tonicIndex = this.noteNameToChromaticIndex(normalizedTonic);
        let displayTonic = normalizedTonic;
        if (tonicIndex !== null) {
            if (preference === 'flat') {
                displayTonic = this.flatNoteNames[tonicIndex];
            } else if (preference === 'sharp') {
                displayTonic = this.sharpNoteNames[tonicIndex];
            } else if (this.naturalNotes.includes(this.sharpNoteNames[tonicIndex])) {
                displayTonic = this.sharpNoteNames[tonicIndex];
            } else {
                displayTonic = this.sharpNoteNames[tonicIndex];
            }
        }

        const chromaDisplayMap = this.computeChromaDisplayMap(normalizedMode, displayTonic || normalizedTonic);

        const context = { preference, displayTonic, chromaDisplayMap };
        this.keySignatureCache.set(cacheKey, context);
        return context;
    }

    /**
     * Determine the key signature preference for a given mode/tonic combination
     * @param {string} mode - Mode name
     * @param {string} tonic - Tonic letter (without octave)
     * @returns {'sharp'|'flat'|'natural'} Preferred accidental style
     */
    getKeySignaturePreference(mode, tonic) {
        return this.getKeySignatureContext(mode, tonic).preference;
    }

    /**
     * Format a note for display according to current key signature preference
     * @param {string} note - Note with octave (e.g., 'C#4')
     * @param {string} mode - Current mode
     * @param {string} tonic - Current tonic letter
     * @returns {string} Display note name without octave (e.g., 'Db')
     */
    getDisplayNoteName(note, mode, tonic) {
        if (!note || typeof note !== 'string') {
            return '';
        }

        const value = this.noteToSemitone(note);
        if (value === null) {
            return note.replace(/[0-9]/g, '');
        }

        const index = ((value % 12) + 12) % 12;
        const context = this.getKeySignatureContext(mode, tonic);
        const { preference, chromaDisplayMap } = context;

        if (Array.isArray(chromaDisplayMap) && chromaDisplayMap[index]) {
            return chromaDisplayMap[index];
        }

        if (preference === 'flat') {
            return this.flatNoteNames[index];
        }
        if (preference === 'sharp') {
            return this.sharpNoteNames[index];
        }

        const sharpName = this.sharpNoteNames[index];
        if (this.naturalNotes.includes(sharpName)) {
            return sharpName;
        }
        return this.sharpNoteNames[index];
    }

    /**
     * Format a note for display (optionally including octave)
     * @param {string} note - Note with octave (e.g., 'C#4')
     * @param {string} mode - Mode name
     * @param {string} tonic - Tonic letter
     * @param {{includeOctave?: boolean}} options - Display options
     * @returns {string} Display-formatted note label
     */
    getDisplayNoteLabel(note, mode, tonic, options = {}) {
        const { includeOctave = false } = options;
        const displayName = this.getDisplayNoteName(note, mode, tonic);
        if (!includeOctave) {
            return displayName;
        }
        if (!note || typeof note !== 'string') {
            return displayName;
        }
        const match = note.match(/(-?\d+)$/);
        const octave = match ? match[1] : '';
        return `${displayName}${octave}`;
    }

    /**
     * Get the display name for the current tonic based on key signature preference
     * @param {string} mode - Mode name
     * @param {string} tonic - Tonic letter
     * @returns {string} Display tonic name (e.g., 'Db')
     */
    getDisplayTonicName(mode, tonic) {
        return this.getKeySignatureContext(mode, tonic).displayTonic || this.standardizeNoteName(tonic) || '';
    }

    /**
     * Compute ordered semitone offsets for the diatonic collection of a mode within the keyboard span
     * @param {string} mode - Mode name (lowercase)
     * @returns {Array<number>} Sorted offsets from tonic
     */
    computeDiatonicOffsets(mode) {
        const normalizedMode = (mode || 'ionian').toLowerCase();
        const fallbackPattern = this.modePatterns['ionian'] || [];
        const rawPattern = this.modePatterns[normalizedMode] || fallbackPattern;

        if (!Array.isArray(rawPattern) || rawPattern.length === 0) {
            return [];
        }

        const sanitized = Array.from(new Set(
            rawPattern
                .map((value) => {
                    if (typeof value !== 'number' || !Number.isFinite(value)) {
                        return null;
                    }
                    const rounded = Math.round(value);
                    return ((rounded % 12) + 12) % 12;
                })
                .filter((value) => value !== null)
        )).sort((a, b) => a - b);

        if (sanitized.length === 0) {
            return [];
        }

        const maxSpan = this.baseMidiSpan;
        const highestStep = sanitized[sanitized.length - 1];
        const offsets = [];

        for (let octaveShift = 0; octaveShift <= maxSpan; octaveShift += 12) {
            sanitized.forEach((step) => {
                const candidate = step + octaveShift;
                if (candidate <= maxSpan) {
                    offsets.push(candidate);
                }
            });
            if (highestStep + octaveShift >= maxSpan) {
                break;
            }
        }

        return offsets;
    }

    /**
     * Build a chroma -> display-name map for the given mode and tonic using Tonal
     * @param {string} mode
     * @param {string} tonic
     * @returns {Array<string|null>} Array indexed by chroma
     */
    computeChromaDisplayMap(mode, tonic) {
        const chromaDisplay = new Array(12).fill(null);
        if (!this.tonalScale || typeof this.tonalScale.get !== 'function') {
            return chromaDisplay;
        }

        const sanitizedTonic = this.standardizeNoteName(tonic);
        if (!sanitizedTonic) {
            return chromaDisplay;
        }

        const aliases = this.getModeScaleAliases(mode);
        for (let idx = 0; idx < aliases.length; idx += 1) {
            const alias = aliases[idx];
            if (!alias || typeof alias !== 'string') {
                continue;
            }
            const query = `${sanitizedTonic} ${alias}`.trim();
            try {
                const scale = this.tonalScale.get ? this.tonalScale.get(query) : null;
                if (!scale || !Array.isArray(scale.notes) || scale.notes.length === 0) {
                    continue;
                }

                scale.notes.forEach((noteName) => {
                    const normalized = this.standardizeNoteName(noteName);
                    const chroma = this.noteNameToChromaticIndex(normalized);
                    if (chroma !== null && chromaDisplay[chroma] === null) {
                        chromaDisplay[chroma] = normalized;
                    }
                });

                // Stop after first successful alias to avoid overriding spellings
                break;
            } catch (error) {
                // Ignore and try next alias
                console.warn(`Failed to derive scale for query "${query}":`, error);
            }
        }

        return chromaDisplay;
    }

    /**
     * Provide Tonal scale name aliases for supported modes
     * @param {string} mode
     * @returns {Array<string>} Alias list
     */
    getModeScaleAliases(mode) {
        const normalized = (mode || 'ionian').toLowerCase();
        const aliasMap = {
            'ionian': ['ionian', 'major'],
            'dorian': ['dorian'],
            'phrygian': ['phrygian'],
            'lydian': ['lydian'],
            'mixolydian': ['mixolydian'],
            'aeolian': ['aeolian', 'minor', 'natural minor'],
            'locrian': ['locrian'],
            'chromatic': ['chromatic'],
            'half-whole': ['dominant diminished', 'diminished whole tone'],
            'whole-half': ['diminished', 'whole-half diminished'],
            'whole-tone': ['whole tone', 'whole-tone']
        };

        return aliasMap[normalized] ? aliasMap[normalized].slice() : [normalized];
    }

    /**
     * Generate diatonic notes for the current mode
     * @param {string} mode - The current mode (e.g., 'ionian', 'dorian')
     * @returns {Array} Array of diatonic notes
     */
    generateDiatonicNotes(mode, tonicLetter) {
        const layout = this.getKeyboardLayout(mode, tonicLetter);
        if (!layout) {
            return [];
        }
        if (layout.diatonicKeys && layout.diatonicKeys.length > 0) {
            return layout.diatonicKeys.slice();
        }
        if (layout.whiteKeys && layout.whiteKeys.length > 0) {
            return layout.whiteKeys.slice();
        }
        return [];
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
            this.modeRanges.set(cacheKey, {
                tonicNote: layout.tonicNote,
                tonicLetter: layout.tonicLetter,
                whiteKeys: layout.whiteKeys.slice(),
                diatonicKeys: layout.diatonicKeys ? layout.diatonicKeys.slice() : layout.whiteKeys.slice(),
                diatonicKeyDetails: layout.diatonicKeyDetails ? layout.diatonicKeyDetails.map(key => ({ ...key })) : [],
                physicalWhiteKeys: layout.physicalWhiteKeys ? layout.physicalWhiteKeys.slice() : []
            });
        });
    }

    /**
     * Build the keyboard layout structure for a mode
     * @param {{tonic: string, whiteKeyCount?: number}} config - Mode configuration
     * @returns {{whiteKeys: string[], blackKeys: Array, mapping: Object}}
     */
    buildKeyboardLayout(mode, tonicLetter) {
        const normalizedMode = (mode || 'ionian').toLowerCase();
        const config = this.modeConfigs[normalizedMode] || this.modeConfigs['ionian'];
        const defaultTonicNote = config.tonic;

        const normalizedTarget = this.normalizeTonic(tonicLetter) || this.extractNoteLetter(defaultTonicNote);
        const fallbackLetter = this.extractNoteLetter(defaultTonicNote);
        const { displayTonic } = this.getKeySignatureContext(normalizedMode, normalizedTarget || fallbackLetter);

        const resolvedTonicCandidate = this.resolveChromaticTonicNote(defaultTonicNote, normalizedTarget) ||
            this.resolveChromaticTonicNote(defaultTonicNote, fallbackLetter) ||
            defaultTonicNote;

        const tonicOctaveMatch = resolvedTonicCandidate.match(/(-?\d+)$/);
        const tonicOctave = tonicOctaveMatch ? parseInt(tonicOctaveMatch[1], 10) : parseInt(defaultTonicNote.slice(-1), 10) || 4;
        const tonicDisplayBase = displayTonic || this.standardizeNoteName(normalizedTarget) || fallbackLetter;
        const tonicNote = `${tonicDisplayBase}${tonicOctave}`;

        const tonicMidiCandidate = this.noteToSemitone(tonicNote);
        const fallbackMidi = this.noteToSemitone(resolvedTonicCandidate);
        const effectiveStartMidi = typeof tonicMidiCandidate === 'number'
            ? tonicMidiCandidate
            : (typeof fallbackMidi === 'number' ? fallbackMidi : this.baseStartMidi);

        const primaryKeys = this.whiteKeyOffsets.map(offset => {
            const midi = effectiveStartMidi + offset;
            const rawNote = this.semitoneToNote(midi);
            const label = this.getDisplayNoteLabel(rawNote, normalizedMode, normalizedTarget, { includeOctave: true });
            const displayName = this.getDisplayNoteName(rawNote, normalizedMode, normalizedTarget);
            return {
                midi,
                rawNote,
                note: rawNote,
                displayLabel: label,
                displayName
            };
        });

        const orderedKeys = [];
        for (let step = 0; step <= this.baseMidiSpan; step += 1) {
            const midi = effectiveStartMidi + step;
            const rawNote = this.semitoneToNote(midi);
            const label = this.getDisplayNoteLabel(rawNote, normalizedMode, normalizedTarget, { includeOctave: true });
            const displayName = this.getDisplayNoteName(rawNote, normalizedMode, normalizedTarget);
            const chroma = ((midi % 12) + 12) % 12;
            const isWhite = this.naturalChromas.has(chroma);
            orderedKeys.push({
                midi,
                rawNote,
                note: rawNote,
                displayLabel: label,
                displayName,
                isWhite,
                orderedIndex: step
            });
        }

        const whiteKeyDetails = [];
        let runningWhiteUnit = 0;
        orderedKeys.forEach((entry) => {
            if (entry.isWhite) {
                const whiteIndex = whiteKeyDetails.length;
                entry.whiteIndex = whiteIndex;
                entry.leftUnits = runningWhiteUnit;
                entry.widthUnits = this.whiteKeyUnitWidth;
                whiteKeyDetails.push({
                    midi: entry.midi,
                    rawNote: entry.rawNote,
                    note: entry.rawNote,
                    displayName: entry.displayName,
                    displayLabel: entry.displayLabel,
                    orderedIndex: entry.orderedIndex,
                    whiteIndex,
                    leftUnits: entry.leftUnits,
                    widthUnits: entry.widthUnits
                });
                runningWhiteUnit += this.whiteKeyUnitWidth;
            }
        });

        const blackKeyDetails = [];
        orderedKeys.forEach((entry, orderedIndex) => {
            if (entry.isWhite) {
                return;
            }

            let precedingIndex = null;
            for (let i = orderedIndex - 1; i >= 0; i -= 1) {
                if (typeof orderedKeys[i].whiteIndex === 'number') {
                    precedingIndex = orderedKeys[i].whiteIndex;
                    break;
                }
            }

            let followingIndex = null;
            for (let i = orderedIndex + 1; i < orderedKeys.length; i += 1) {
                if (typeof orderedKeys[i].whiteIndex === 'number') {
                    followingIndex = orderedKeys[i].whiteIndex;
                    break;
                }
            }

            const edge = (precedingIndex === null && followingIndex === null)
                ? null
                : (precedingIndex === null ? 'left' : (followingIndex === null ? 'right' : null));

            let leftUnits = null;
            if (precedingIndex !== null || followingIndex !== null) {
                const precedingLeftUnits = (precedingIndex !== null)
                    ? whiteKeyDetails[precedingIndex].leftUnits
                    : (followingIndex !== null
                        ? whiteKeyDetails[followingIndex].leftUnits - this.whiteKeyUnitWidth
                        : null);
                if (typeof precedingLeftUnits === 'number') {
                    leftUnits = precedingLeftUnits + this.whiteKeyUnitWidth - (this.blackKeyUnitWidth / 2);
                }
            }

            entry.leftUnits = leftUnits;
            entry.widthUnits = this.blackKeyUnitWidth;

            blackKeyDetails.push({
                midi: entry.midi,
                rawNote: entry.rawNote,
                note: entry.rawNote,
                displayName: entry.displayName,
                displayLabel: entry.displayLabel,
                precedingIndex,
                followingIndex,
                edge,
                leftUnits,
                widthUnits: this.blackKeyUnitWidth
            });
        });

        const mapping = {};
        orderedKeys.forEach((entry) => {
            mapping[entry.note] = entry.note;
        });

        if (!mapping[tonicNote]) {
            mapping[tonicNote] = tonicNote;
        }

        const unitKeyMetrics = [...whiteKeyDetails, ...blackKeyDetails].filter(key => typeof key.leftUnits === 'number');
        let unitMinLeft = 0;
        let unitMaxRight = this.whiteKeyCount * this.whiteKeyUnitWidth;
        if (unitKeyMetrics.length > 0) {
            unitMinLeft = Math.min(...unitKeyMetrics.map(key => key.leftUnits));
            unitMaxRight = Math.max(...unitKeyMetrics.map(key => key.leftUnits + (key.widthUnits || 0)));
        }
        const unitSpan = unitMaxRight - unitMinLeft;
        const hasLeadingBlack = blackKeyDetails.some(detail => detail.edge === 'left');
        const hasTrailingBlack = blackKeyDetails.some(detail => detail.edge === 'right');

        const diatonicOffsets = this.computeDiatonicOffsets(normalizedMode);
        const diatonicKeyDetails = [];
        const diatonicKeys = [];
        const seenDiatonic = new Set();

        diatonicOffsets.forEach((offset) => {
            if (offset < 0 || offset >= orderedKeys.length) {
                return;
            }
            const entry = orderedKeys[offset];
            if (!entry || !entry.rawNote || seenDiatonic.has(entry.rawNote)) {
                return;
            }
            seenDiatonic.add(entry.rawNote);
            diatonicKeys.push(entry.rawNote);
            diatonicKeyDetails.push({
                midi: entry.midi,
                rawNote: entry.rawNote,
                note: entry.rawNote,
                displayName: entry.displayName,
                displayLabel: entry.displayLabel,
                orderedIndex: entry.orderedIndex,
                isWhite: entry.isWhite
            });
        });

        if (diatonicKeys.length === 0) {
            primaryKeys.forEach((key) => {
                if (!key || !key.note || seenDiatonic.has(key.note)) {
                    return;
                }
                const matchingEntry = orderedKeys.find((entry) => entry.rawNote === key.note);
                const detail = matchingEntry || {
                    midi: key.midi,
                    rawNote: key.rawNote,
                    note: key.note,
                    displayName: key.displayName,
                    displayLabel: key.displayLabel,
                    orderedIndex: matchingEntry ? matchingEntry.orderedIndex : null,
                    isWhite: matchingEntry ? matchingEntry.isWhite : true
                };
                seenDiatonic.add(detail.note);
                diatonicKeys.push(detail.note);
                diatonicKeyDetails.push({
                    midi: detail.midi,
                    rawNote: detail.rawNote,
                    note: detail.note,
                    displayName: detail.displayName,
                    displayLabel: detail.displayLabel,
                    orderedIndex: detail.orderedIndex,
                    isWhite: detail.isWhite
                });
            });
        }

        const physicalWhiteKeys = primaryKeys.map(key => key.note);

        return {
            tonicNote,
            tonicLetter: tonicDisplayBase,
            whiteKeys: diatonicKeys.slice(),
            diatonicKeys: diatonicKeys.slice(),
            diatonicKeyDetails: diatonicKeyDetails.map(key => ({ ...key })),
            physicalWhiteKeys,
            whiteKeyDetails,
            blackKeys: blackKeyDetails,
            blackKeyDetails,
            orderedKeys,
            mapping,
            unitMinLeft,
            unitMaxRight,
            unitSpan,
            hasLeadingBlack,
            hasTrailingBlack
        };
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
     * Get the natural note letter that precedes the provided one (cyclically)
     * @param {string} letter - Natural note letter (A-G)
     * @returns {string} Previous natural letter
     */
    /**
     * Normalize tonic input
     * @param {string} tonic - Raw tonic string
     * @returns {string} Normalized tonic
     */
    normalizeTonic(tonic) {
        return this.standardizeNoteName(tonic);
    }

    /**
     * Build a cache key for mode layouts
     * @param {string} mode - Mode name
     * @param {string} tonicLetter - Tonic letter
     * @returns {string} Cache key
     */
    getLayoutCacheKey(mode, tonicLetter) {
        const safeMode = (mode || 'ionian').toLowerCase();
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
            diatonicKeys: layout.diatonicKeys ? layout.diatonicKeys.slice() : (layout.whiteKeys ? layout.whiteKeys.slice() : []),
            diatonicKeyDetails: layout.diatonicKeyDetails ? layout.diatonicKeyDetails.map(key => ({ ...key })) : [],
            physicalWhiteKeys: layout.physicalWhiteKeys ? layout.physicalWhiteKeys.slice() : [],
            whiteKeyDetails: layout.whiteKeyDetails ? layout.whiteKeyDetails.map(key => ({ ...key })) : [],
            blackKeys: layout.blackKeys ? layout.blackKeys.map(key => ({ ...key })) : [],
            blackKeyDetails: layout.blackKeyDetails ? layout.blackKeyDetails.map(key => ({ ...key })) : [],
            orderedKeys: layout.orderedKeys ? layout.orderedKeys.map(key => ({ ...key })) : [],
            mapping: layout.mapping ? { ...layout.mapping } : {},
            unitMinLeft: layout.unitMinLeft,
            unitMaxRight: layout.unitMaxRight,
            unitSpan: layout.unitSpan,
            hasLeadingBlack: layout.hasLeadingBlack,
            hasTrailingBlack: layout.hasTrailingBlack
        };
    }

    /**
     * Resolve a chromatic tonic note (including sharps) near the default
     * @param {string} defaultNote - Default tonic note (e.g., 'C4')
     * @param {string} tonicLetter - Requested tonic letter (e.g., 'C#')
     * @returns {string} Resolved tonic note (e.g., 'C#4')
     */
    resolveChromaticTonicNote(defaultNote, tonicLetter) {
        const target = this.standardizeNoteName(tonicLetter);
        if (!target) {
            return defaultNote;
        }

        const defaultValue = this.noteToSemitone(defaultNote);
        if (defaultValue === null) {
            return defaultNote;
        }

        const candidates = [];
        for (let octave = 1; octave <= 7; octave++) {
            const candidateNote = `${target}${octave}`;
            const midi = this.noteToSemitone(candidateNote);
            if (midi !== null) {
                candidates.push({ note: candidateNote, midi });
            }
        }

        if (candidates.length === 0) {
            return defaultNote;
        }

        let best = candidates[0];
        let bestDiff = Math.abs(best.midi - defaultValue);

        for (let i = 1; i < candidates.length; i++) {
            const current = candidates[i];
            const diff = Math.abs(current.midi - defaultValue);
            if (diff < bestDiff) {
                best = current;
                bestDiff = diff;
            } else if (diff === bestDiff && current.midi >= defaultValue && best.midi < defaultValue) {
                best = current;
                bestDiff = diff;
            }
        }

        return best.note || defaultNote;
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

        if (this.tonalNote) {
            const data = this.tonalNote.get(note);
            if (data && typeof data.midi === 'number') {
                return data.midi;
            }
        }

        const octave = parseInt(note.slice(-1), 10);
        if (Number.isNaN(octave)) {
            return null;
        }

        const noteName = note.slice(0, -1);
        const chromaticIndex = this.noteNameToChromaticIndex(noteName);
        if (chromaticIndex === null) {
            return null;
        }

        return (octave + 1) * 12 + chromaticIndex;
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

        if (this.tonalNote && typeof this.tonalNote.fromMidi === 'function') {
            const note = this.tonalNote.fromMidi(value);
            if (note) {
                return note;
            }
        }

        const octave = Math.floor(value / 12) - 1;
        const noteIndex = ((value % 12) + 12) % 12;
        const noteName = this.sharpNoteNames[noteIndex];
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
        const normalizedMode = (mode || 'ionian').toLowerCase();
        const targetLetter = this.normalizeTonic(tonicLetter) || this.getDefaultTonicLetter(normalizedMode);
        const cacheKey = this.getLayoutCacheKey(normalizedMode, targetLetter);

        if (!this.modeLayouts.has(cacheKey)) {
            const layout = this.buildKeyboardLayout(normalizedMode, targetLetter);
            this.modeLayouts.set(cacheKey, layout);
            this.modeRanges.set(cacheKey, {
                tonicNote: layout.tonicNote,
                tonicLetter: layout.tonicLetter,
                whiteKeys: layout.whiteKeys.slice(),
                diatonicKeys: layout.diatonicKeys ? layout.diatonicKeys.slice() : layout.whiteKeys.slice(),
                diatonicKeyDetails: layout.diatonicKeyDetails ? layout.diatonicKeyDetails.map(key => ({ ...key })) : [],
                physicalWhiteKeys: layout.physicalWhiteKeys ? layout.physicalWhiteKeys.slice() : []
            });
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
        if (!note) {
            return undefined;
        }

        if (Object.prototype.hasOwnProperty.call(this.noteFrequencies, note)) {
            return this.noteFrequencies[note];
        }

        if (this.tonalNote && typeof this.tonalNote.freq === 'function') {
            const frequency = this.tonalNote.freq(note);
            if (typeof frequency === 'number' && Number.isFinite(frequency)) {
                return frequency;
            }
        }

        const enharmonic = note.replace('b', '#');
        if (Object.prototype.hasOwnProperty.call(this.noteFrequencies, enharmonic)) {
            return this.noteFrequencies[enharmonic];
        }

        return undefined;
    }

    /**
     * Get the white-key range for a mode/tonic combination
     * @param {string} mode - Mode name
     * @param {string} tonicLetter - Tonic letter
     * @returns {{whiteKeys: string[]}} Range descriptor
     */
    getModeRange(mode, tonicLetter) {
        const layout = this.getKeyboardLayout(mode, tonicLetter);
        const diatonicKeys = (layout.diatonicKeys && layout.diatonicKeys.length > 0)
            ? layout.diatonicKeys.slice()
            : (layout.whiteKeys ? layout.whiteKeys.slice() : []);
        return {
            tonicNote: layout.tonicNote,
            tonicLetter: layout.tonicLetter,
            whiteKeys: diatonicKeys,
            diatonicKeys,
            diatonicKeyDetails: layout.diatonicKeyDetails ? layout.diatonicKeyDetails.map(key => ({ ...key })) : []
        };
    }

    /**
     * Get the default tonic letter for a mode
     * @param {string} mode - Mode name
     * @returns {string} Default tonic letter
     */
    getDefaultTonicLetter(mode) {
        const normalizedMode = (mode || 'ionian').toLowerCase();
        return this.defaultTonicLetters[normalizedMode] || 'C';
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
