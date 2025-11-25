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
        this.naturalPitchClassMap = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
        this.majorScaleSemitoneSteps = [0, 2, 4, 5, 7, 9, 11];
        this.modeDegreeIndex = {
            'ionian': 0,
            'dorian': 1,
            'phrygian': 2,
            'lydian': 3,
            'mixolydian': 4,
            'aeolian': 5,
            'locrian': 6,
            'melodic-minor': 5,
            'dorian-b2': 1,
            'lydian-augmented': 3,
            'lydian-dominant': 3,
            'mixolydian-b6': 4,
            'locrian-sharp2': 6,
            'altered': 6,
            'harmonic-minor': 5,
            'locrian-sharp6': 6,
            'ionian-sharp5': 0,
            'dorian-sharp4': 1,
            'phrygian-dominant': 2,
            'lydian-sharp2': 3,
            'super-locrian-bb7': 6
        };
        this.majorKeySpellings = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
        this.majorPitchTraversal = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
        this.modeTonicOptionCache = new Map();
        this.majorScaleCache = new Map();
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
            'whole-tone': { tonic: 'C4' },
            'melodic-minor': { tonic: 'C4' },
            'dorian-b2': { tonic: 'C4' },
            'lydian-augmented': { tonic: 'C4' },
            'lydian-dominant': { tonic: 'C4' },
            'mixolydian-b6': { tonic: 'C4' },
            'locrian-sharp2': { tonic: 'C4' },
            'altered': { tonic: 'C4' },
            'harmonic-minor': { tonic: 'C4' },
            'locrian-sharp6': { tonic: 'C4' },
            'ionian-sharp5': { tonic: 'C4' },
            'dorian-sharp4': { tonic: 'C4' },
            'phrygian-dominant': { tonic: 'C4' },
            'lydian-sharp2': { tonic: 'C4' },
            'super-locrian-bb7': { tonic: 'C4' }
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
            'whole-tone': [0, 2, 4, 6, 8, 10],
            'melodic-minor': [0, 2, 3, 5, 7, 9, 11],
            'dorian-b2': [0, 1, 3, 5, 7, 9, 10],
            'lydian-augmented': [0, 2, 4, 6, 8, 9, 11],
            'lydian-dominant': [0, 2, 4, 6, 7, 9, 10],
            'mixolydian-b6': [0, 2, 4, 5, 7, 8, 10],
            'locrian-sharp2': [0, 2, 3, 5, 6, 8, 10],
            'altered': [0, 1, 3, 4, 6, 8, 10],
            'harmonic-minor': [0, 2, 3, 5, 7, 8, 11],
            'locrian-sharp6': [0, 1, 3, 5, 6, 9, 10],
            'ionian-sharp5': [0, 2, 4, 5, 8, 9, 11],
            'dorian-sharp4': [0, 2, 3, 6, 7, 9, 10],
            'phrygian-dominant': [0, 1, 4, 5, 7, 8, 10],
            'lydian-sharp2': [0, 3, 4, 6, 7, 9, 11],
            'super-locrian-bb7': [0, 1, 3, 4, 6, 8, 9]
        };

        this.minorLikeModes = new Set(['melodic-minor', 'harmonic-minor']);

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
     * Merge a preferred display spelling with the octave from a raw note.
     * Ensures the resulting note preserves the original pitch (MIDI value).
     * @param {string} rawNote - Source note including octave (e.g., 'Db4')
     * @param {string} displayName - Preferred spelling without octave (e.g., 'C#')
     * @returns {string} Note string using the preferred spelling when feasible
     */
    applyDisplaySpelling(rawNote, displayName) {
        if (!rawNote || typeof rawNote !== 'string') {
            return rawNote;
        }
        const octaveMatch = rawNote.match(/(-?\d+)$/);
        if (!octaveMatch) {
            return rawNote;
        }
        const preferred = this.standardizeNoteName(displayName);
        if (!preferred) {
            return rawNote;
        }
        const octave = octaveMatch[1];
        const candidate = `${preferred}${octave}`;
        const rawMidi = this.noteToSemitone ? this.noteToSemitone(rawNote) : null;
        const candidateMidi = this.noteToSemitone ? this.noteToSemitone(candidate) : null;
        if (rawMidi === null || candidateMidi === null) {
            return candidate;
        }
        return rawMidi === candidateMidi ? candidate : rawNote;
    }

    /**
     * Normalize a full note spelling (letter, accidentals, octave) without altering pitch.
     * @param {string} note - Raw note string (e.g., ' c♯4 ')
     * @returns {string} Normalized note (e.g., 'C#4')
     */
    normalizeNoteSpelling(note) {
        if (!note || typeof note !== 'string') {
            return '';
        }
        const match = /^\s*([A-Ga-g])([#x𝄪♯b♭𝄫n♮]{0,4})(-?\d+)\s*$/.exec(note);
        if (!match) {
            return note.trim();
        }
        const letter = match[1].toUpperCase();
        let accidental = match[2] || '';
        accidental = accidental
            .replace(/♯/g, '#')
            .replace(/𝄪/g, '##')
            .replace(/x/g, '##')
            .replace(/♭/g, 'b')
            .replace(/𝄫/g, 'bb')
            .replace(/♮/g, '')
            .replace(/n/g, '');
        if (accidental.length > 3) {
            accidental = accidental.slice(0, 3);
        }
        const octave = match[3];
        return `${letter}${accidental}${octave}`;
    }

    /**
     * Determine whether a note string includes an explicit accidental mark.
     * @param {string} note
     * @returns {boolean}
     */
    noteHasExplicitAccidental(note) {
        if (!note || typeof note !== 'string') {
            return false;
        }
        return /[#x𝄪♯b♭𝄫]/.test(note);
    }

    /**
     * Spell a note for staff rendering while respecting mode/tonic preference.
     * Optionally re-spells explicit accidentals so staff notation matches the active key signature.
     * @param {string} note
     * @param {string} mode
     * @param {string} tonic
     * @param {{preserveExplicitAccidentals?: boolean}} [options]
     * @returns {string}
     */
    spellNoteForStaff(note, mode, tonic, options = {}) {
        const { preserveExplicitAccidentals = true } = options || {};
        if (!note || typeof note !== 'string') {
            return note;
        }
        const normalized = this.normalizeNoteSpelling(note);
        const midi = this.noteToSemitone(normalized);
        if (midi === null) {
            return normalized;
        }
        if (preserveExplicitAccidentals && this.noteHasExplicitAccidental(normalized)) {
            return normalized;
        }
        const displayName = this.getDisplayNoteName(normalized, mode, tonic);
        if (!displayName && (mode || '').toLowerCase() === 'chromatic') {
            const pref = this.getKeySignaturePreference('chromatic', tonic);
            const chromaticName = this.getChromaticDisplayName(normalized, pref);
            const octaveMatch = normalized.match(/(-?\d+)$/);
            const octave = octaveMatch ? octaveMatch[1] : '';
            return `${chromaticName}${octave}`;
        }
        const spelledName = this.standardizeNoteName(displayName);
        if (!spelledName) {
            return normalized;
        }
        const normalizedName = this.standardizeNoteName(normalized);
        if (normalizedName && normalizedName.toUpperCase() === spelledName.toUpperCase()) {
            return normalized;
        }
        const pitchClass = this.noteNameToChromaticIndex(spelledName);
        if (pitchClass === null || !Number.isFinite(pitchClass)) {
            return normalized;
        }
        const match = /^\s*([A-G])([#b]{0,3})(-?\d+)\s*$/i.exec(normalized);
        const originalOctave = match ? Number.parseInt(match[3], 10) : null;
        if (Number.isInteger(originalOctave)) {
            for (let delta = -2; delta <= 2; delta += 1) {
                const candidateOctave = originalOctave + delta;
                if (!Number.isInteger(candidateOctave)) continue;
                const candidate = `${spelledName}${candidateOctave}`;
                if (this.noteToSemitone(candidate) === midi) {
                    return candidate;
                }
            }
        }
        const roughOctave = Math.round((midi - pitchClass) / 12) - 1;
        const fallback = `${spelledName}${roughOctave}`;
        if (this.noteToSemitone(fallback) === midi) {
            return fallback;
        }
        return normalized;
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
     * Build a major scale spelling when Tonal data is unavailable.
     * Uses basic interval math to derive accidentals for each degree.
     * @param {string} tonic - Canonical tonic (e.g., 'Db')
     * @returns {Array<string>|null} list of degree spellings without octave
     */
    buildMajorScaleFallback(tonic) {
        const normalized = this.standardizeNoteName(tonic);
        if (!normalized) return null;
        const tonicIndex = this.noteNameToChromaticIndex(normalized);
        if (tonicIndex === null) return null;
        const tonicLetter = normalized.charAt(0);
        const naturalIndex = this.naturalNotes.indexOf(tonicLetter);
        if (naturalIndex === -1) return null;
        const notes = [];
        for (let degree = 0; degree < this.majorScaleSemitoneSteps.length; degree += 1) {
            const targetPitch = (tonicIndex + this.majorScaleSemitoneSteps[degree]) % 12;
            const letterIndex = (naturalIndex + degree) % this.naturalNotes.length;
            const letter = this.naturalNotes[letterIndex];
            const naturalPitch = this.naturalPitchClassMap[letter];
            let delta = targetPitch - naturalPitch;
            if (delta > 6) delta -= 12;
            if (delta < -6) delta += 12;
            let accidental = '';
            if (delta > 0) {
                accidental = '#'.repeat(delta);
            } else if (delta < 0) {
                accidental = 'b'.repeat(-delta);
            }
            notes.push(`${letter}${accidental}`);
        }
        return notes;
    }

    /**
     * Retrieve (and cache) canonical major scale spellings for a tonic.
     * @param {string} tonic
     * @returns {Array<string>|null}
     */
    getMajorScaleNotes(tonic) {
        const normalized = this.standardizeNoteName(tonic);
        if (!normalized) return null;
        if (this.majorScaleCache.has(normalized)) {
            const cached = this.majorScaleCache.get(normalized);
            return cached ? cached.slice() : null;
        }
        let notes = null;
        if (this.tonalScale && typeof this.tonalScale.get === 'function') {
            try {
                const scale = this.tonalScale.get(`${normalized} major`);
                if (scale && Array.isArray(scale.notes) && scale.notes.length >= 7) {
                    notes = scale.notes.map((note) => this.standardizeNoteName(note));
                }
            } catch (error) {
                // Ignore Tonal failure and fall back to our builder
                notes = null;
            }
        }
        if (!notes) {
            notes = this.buildMajorScaleFallback(normalized);
        }
        if (!notes) {
            return null;
        }
        this.majorScaleCache.set(normalized, notes);
        return notes.slice();
    }

    /**
     * Derive canonical spelling + key preference for a mode given a pitch class.
     * @param {string} mode - normalized mode name
     * @param {number} pitchClass - 0-11 chromatic index for the mode's tonic
     * @returns {{preference:string, displayTonic:string, majorTonic:string}|null}
     */
    deriveModeSignatureForPitchClass(mode, pitchClass) {
        const degreeIndex = this.modeDegreeIndex[mode];
        if (!Number.isInteger(degreeIndex)) {
            return null;
        }
        const normalizedPitch = ((pitchClass % 12) + 12) % 12;
        const stepFromMajor = this.majorScaleSemitoneSteps[degreeIndex] || 0;
        const majorPitchClass = (normalizedPitch - stepFromMajor + 12) % 12;
        const majorLabel = this.majorKeySpellings[majorPitchClass] || this.sharpNoteNames[majorPitchClass];
        const scaleNotes = this.getMajorScaleNotes(majorLabel);
        const displayTonic = (scaleNotes && scaleNotes[degreeIndex])
            ? this.standardizeNoteName(scaleNotes[degreeIndex])
            : this.sharpNoteNames[normalizedPitch];
        const preference = this.getPreferenceForTonic(majorLabel);
        return {
            preference,
            displayTonic,
            majorTonic: majorLabel,
            majorPitchClass,
            modePitchClass: normalizedPitch
        };
    }

    determineKeySignatureSpec(mode, displayTonic, tonic, resolvedSignature = null) {
        const normalizedMode = (mode || 'ionian').toLowerCase();
        const normalizedDisplay = this.standardizeNoteName(displayTonic);
        const normalizedTonic = this.standardizeNoteName(tonic) || normalizedDisplay;
        const resolvedMajor = (resolvedSignature && resolvedSignature.majorTonic)
            ? this.standardizeNoteName(resolvedSignature.majorTonic)
            : null;

        if (normalizedMode === 'chromatic') {
            return 'C';
        }

        if (normalizedMode === 'ionian') {
            return normalizedDisplay || normalizedTonic || 'C';
        }

        if (normalizedMode === 'aeolian') {
            return resolvedMajor || normalizedDisplay || normalizedTonic || 'C';
        }

        if (this.minorLikeModes && this.minorLikeModes.has(normalizedMode)) {
            return resolvedMajor || normalizedDisplay || normalizedTonic || 'C';
        }

        if (resolvedMajor) {
            return resolvedMajor;
        }

        return normalizedDisplay || normalizedTonic || 'C';
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
        const tonicIndex = this.noteNameToChromaticIndex(normalizedTonic);
        let resolvedSignature = null;
        if (tonicIndex !== null) {
            resolvedSignature = this.deriveModeSignatureForPitchClass(normalizedMode, tonicIndex);
        }

        let preference;
        let displayTonic;
        if (resolvedSignature) {
            preference = resolvedSignature.preference;
            displayTonic = resolvedSignature.displayTonic;
        } else {
            preference = this.getPreferenceForTonic(normalizedTonic);
            if (tonicIndex !== null) {
                if (preference === 'flat') {
                    displayTonic = this.flatNoteNames[tonicIndex];
                } else {
                    displayTonic = this.sharpNoteNames[tonicIndex];
                }
            } else {
                displayTonic = normalizedTonic;
            }
        }

        const chromaDisplayMap = this.computeChromaDisplayMap(normalizedMode, displayTonic || normalizedTonic);

        const keySignatureSpec = this.determineKeySignatureSpec(
            normalizedMode,
            displayTonic,
            normalizedTonic,
            resolvedSignature,
        );

        const context = { preference, displayTonic, chromaDisplayMap, keySignatureSpec };
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
        const normalizedMode = (mode || '').toLowerCase();
        const context = this.getKeySignatureContext(mode, tonic);
        const { preference, chromaDisplayMap } = context;

        if (normalizedMode !== 'chromatic'
            && Array.isArray(chromaDisplayMap)
            && chromaDisplayMap[index]) {
            return chromaDisplayMap[index];
        }

        if (normalizedMode === 'chromatic') {
            const effectivePreference = preference === 'flat' ? 'flat' : 'sharp';
            return effectivePreference === 'flat'
                ? this.flatNoteNames[index]
                : this.sharpNoteNames[index];
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

    getChromaticDisplayName(note, preference = 'sharp') {
        if (!note || typeof note !== 'string') {
            return '';
        }
        const midi = this.noteToSemitone(note);
        if (midi === null) {
            const fallback = note.replace(/[0-9]/g, '');
            return this.standardizeNoteName(fallback) || fallback;
        }
        const chroma = ((midi % 12) + 12) % 12;
        const normalizedPref = (typeof preference === 'string') ? preference.toLowerCase() : 'sharp';
        if (normalizedPref === 'flat') {
            return this.flatNoteNames[chroma];
        }
        return this.sharpNoteNames[chroma];
    }

    getChromaticDisplayLabel(note, preference = 'sharp', options = {}) {
        const { includeOctave = false } = options;
        const name = this.getChromaticDisplayName(note, preference);
        if (!includeOctave) {
            return name;
        }
        if (!note || typeof note !== 'string') {
            return name;
        }
        const match = note.match(/(-?\d+)$/);
        const octave = match ? match[1] : '';
        return `${name}${octave}`;
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
            'whole-tone': ['whole tone', 'whole-tone'],
            'melodic-minor': ['melodic minor', 'jazz minor'],
            'dorian-b2': ['dorian b2', 'dorian b9'],
            'lydian-augmented': ['lydian augmented', 'lydian #5'],
            'lydian-dominant': ['lydian dominant', 'overtone scale'],
            'mixolydian-b6': ['mixolydian b6', 'hindu scale'],
            'locrian-sharp2': ['locrian #2', 'locrian sharp 2'],
            'altered': ['altered', 'super locrian'],
            'harmonic-minor': ['harmonic minor'],
            'locrian-sharp6': ['locrian #6', 'locrian sharp 6'],
            'ionian-sharp5': ['ionian #5', 'ionian augmented'],
            'dorian-sharp4': ['dorian #4', 'dorian sharp 4'],
            'phrygian-dominant': ['phrygian dominant', 'spanish gypsy'],
            'lydian-sharp2': ['lydian #2', 'lydian sharp 2'],
            'super-locrian-bb7': ['super locrian bb7', 'ultra locrian']
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

            const defaultLetter = this.getDefaultTonicLetter(mode);

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
    buildKeyboardLayout(mode, tonicLetter, options = {}) {
        const normalizedMode = (mode || 'ionian').toLowerCase();
        const config = this.modeConfigs[normalizedMode] || this.modeConfigs['ionian'];
        const defaultTonicNote = config.tonic;

        const normalizedTarget = this.normalizeTonic(tonicLetter) || this.extractNoteLetter(defaultTonicNote);
        const fallbackLetter = this.extractNoteLetter(defaultTonicNote);
        const displayOverride = options && typeof options.displayTonicOverride === 'string'
            ? this.standardizeNoteName(options.displayTonicOverride)
            : null;
        const normalizedPreference = (options && typeof options.chromaticPreference === 'string')
            ? options.chromaticPreference.toLowerCase()
            : null;
        const chromaticPreference = (normalizedMode === 'chromatic'
            && (normalizedPreference === 'flat' || normalizedPreference === 'sharp'))
            ? normalizedPreference
            : null;

        const displaySeed = displayOverride || normalizedTarget || fallbackLetter;
        const { displayTonic } = this.getKeySignatureContext(normalizedMode, displaySeed || fallbackLetter);
        const fallbackDisplayBase = this.standardizeNoteName(displaySeed) || fallbackLetter;
        const displayContextTonic = displayTonic || fallbackDisplayBase;

        const resolvedTonicCandidate = this.resolveChromaticTonicNote(defaultTonicNote, normalizedTarget)
            || this.resolveChromaticTonicNote(defaultTonicNote, fallbackLetter)
            || defaultTonicNote;

        const tonicOctaveMatch = resolvedTonicCandidate.match(/(-?\d+)$/);
        const tonicOctave = tonicOctaveMatch
            ? parseInt(tonicOctaveMatch[1], 10)
            : parseInt(defaultTonicNote.slice(-1), 10) || 4;

        const preferenceDisplayBase = chromaticPreference === 'flat'
            ? 'Cb'
            : (chromaticPreference === 'sharp' ? 'C#' : null);
        const tonicDisplayBase = preferenceDisplayBase || displayContextTonic || fallbackDisplayBase || fallbackLetter;
        const tonicNote = `${tonicDisplayBase}${tonicOctave}`;

        const startMidiCandidate = this.noteToSemitone(resolvedTonicCandidate);
        const tonicMidiCandidate = this.noteToSemitone(tonicNote);
        let effectiveStartMidi = Number.isFinite(startMidiCandidate)
            ? startMidiCandidate
            : (Number.isFinite(tonicMidiCandidate) ? tonicMidiCandidate : this.baseStartMidi);
        // Optional octave/start overrides for callers that want to shift the visible range
        if (options && typeof options.startMidi === 'number' && Number.isFinite(options.startMidi)) {
            effectiveStartMidi = options.startMidi;
        } else if (options && Number.isFinite(options.octaveOffset)) {
            effectiveStartMidi += Math.trunc(options.octaveOffset) * 12;
        }

        const labelContextTonic = displayContextTonic || fallbackDisplayBase || fallbackLetter;

        const primaryKeys = this.whiteKeyOffsets.map(offset => {
            const midi = effectiveStartMidi + offset;
            const rawNote = this.semitoneToNote(midi);
            let label;
            let displayName;
            if (chromaticPreference) {
                label = this.getChromaticDisplayLabel(rawNote, chromaticPreference, { includeOctave: true });
                displayName = this.getChromaticDisplayName(rawNote, chromaticPreference);
            } else {
                label = this.getDisplayNoteLabel(rawNote, normalizedMode, labelContextTonic, { includeOctave: true });
                displayName = this.getDisplayNoteName(rawNote, normalizedMode, labelContextTonic);
            }
            const spelledNote = this.applyDisplaySpelling(rawNote, displayName);
            return {
                midi,
                rawNote,
                note: spelledNote,
                displayLabel: label,
                displayName
            };
        });

        const orderedKeys = [];
        for (let step = 0; step <= this.baseMidiSpan; step += 1) {
            const midi = effectiveStartMidi + step;
            const rawNote = this.semitoneToNote(midi);
            let label;
            let displayName;
            if (chromaticPreference) {
                label = this.getChromaticDisplayLabel(rawNote, chromaticPreference, { includeOctave: true });
                displayName = this.getChromaticDisplayName(rawNote, chromaticPreference);
            } else {
                label = this.getDisplayNoteLabel(rawNote, normalizedMode, labelContextTonic, { includeOctave: true });
                displayName = this.getDisplayNoteName(rawNote, normalizedMode, labelContextTonic);
            }
            const spelledNote = this.applyDisplaySpelling(rawNote, displayName);
            const chroma = ((midi % 12) + 12) % 12;
            const isWhite = this.naturalChromas.has(chroma);
            orderedKeys.push({
                midi,
                rawNote,
                note: spelledNote,
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
                    note: entry.note,
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
                note: entry.note,
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
            if (entry.note) {
                mapping[entry.note] = entry.note;
            }
            if (entry.rawNote && entry.rawNote !== entry.note) {
                mapping[entry.rawNote] = entry.note;
            }
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
            const keyId = entry && (entry.note || entry.rawNote);
            if (!entry || !keyId || seenDiatonic.has(keyId)) {
                return;
            }
            seenDiatonic.add(keyId);
            diatonicKeys.push(entry.note || entry.rawNote);
            diatonicKeyDetails.push({
                midi: entry.midi,
                rawNote: entry.rawNote,
                note: entry.note || entry.rawNote,
                displayName: entry.displayName,
                displayLabel: entry.displayLabel,
                orderedIndex: entry.orderedIndex,
                isWhite: entry.isWhite
            });
        });

        if (diatonicKeys.length === 0) {
            primaryKeys.forEach((key) => {
                if (!key || !key.note) {
                    return;
                }
                const seenKey = key.note || key.rawNote;
                if (seenDiatonic.has(seenKey)) {
                    return;
                }
                const matchingEntry = orderedKeys.find((entry) => (
                    entry.note === key.note
                    || entry.rawNote === key.note
                    || (key.rawNote && entry.rawNote === key.rawNote)
                ));
                const detail = matchingEntry || {
                    midi: key.midi,
                    rawNote: key.rawNote,
                    note: key.note,
                    displayName: key.displayName,
                    displayLabel: key.displayLabel,
                    orderedIndex: matchingEntry ? matchingEntry.orderedIndex : null,
                    isWhite: matchingEntry ? matchingEntry.isWhite : true
                };
                seenDiatonic.add(seenKey);
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
     * Normalize tonic for a specific mode, returning the canonical spelling for that pitch class.
     * @param {string} mode
     * @param {string} tonic
     * @returns {string}
     */
    normalizeTonicForMode(mode, tonic) {
        const normalizedMode = (mode || 'ionian').toLowerCase();
        const standardized = this.standardizeNoteName(tonic);
        const pitchClass = standardized ? this.noteNameToChromaticIndex(standardized) : null;
        if (pitchClass === null) {
            return standardized || this.getDefaultTonicLetter(normalizedMode);
        }
        const signature = this.deriveModeSignatureForPitchClass(normalizedMode, pitchClass);
        if (signature && signature.displayTonic) {
            return signature.displayTonic;
        }
        return standardized || this.getDefaultTonicLetter(normalizedMode);
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
     * Robust to enharmonics that cross octave boundaries (B#, E#, Cb, Fb, double-accidentals).
     * @param {string} note - Note (e.g., 'C#4', 'B#5', 'Cb4', 'E##5')
     * @returns {number|null} Semitone index or null if invalid
     */
    noteToSemitone(note) {
        if (!note || typeof note !== 'string') return null;

        // Prefer Tonal when available (authoritative and already handles enharmonics correctly)
        if (this.tonalNote && typeof this.tonalNote.get === 'function') {
            const data = this.tonalNote.get(note);
            if (data && typeof data.midi === 'number') return data.midi;
        }

        // Fallback parser: LETTER + optional accidentals + integer octave
        const m = /^\s*([A-Ga-g])([#x𝄪♯b♭]{0,3})(-?\d+)\s*$/.exec(note);
        if (!m) return null;
        const letter = m[1].toLowerCase();
        let acc = (m[2] || '');
        const octave = parseInt(m[3], 10);
        if (!Number.isFinite(octave)) return null;

        // Normalize accidentals to canonical forms: '#', '##', '###', 'b', 'bb', 'bbb'
        acc = acc
            .replace(/♯/g, '#')
            .replace(/x/g, '##')
            .replace(/𝄪/g, '##')
            .replace(/♭/g, 'b');

        const LETTER_TO_SEMITONE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
        const ACCIDENTAL_OFFSETS = { '': 0, '#': 1, '##': 2, '###': 3, 'b': -1, 'bb': -2, 'bbb': -3 };
        if (!(letter in LETTER_TO_SEMITONE)) return null;
        if (!(acc in ACCIDENTAL_OFFSETS)) return null;

        const base = LETTER_TO_SEMITONE[letter];
        const offset = ACCIDENTAL_OFFSETS[acc];
        // MIDI formula (C4 = 60): 12 * (octave + 1) + semitone
        return 12 * (octave + 1) + base + offset;
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
     * Robust across the full MIDI range we use (C3..C7) and all enharmonics.
     * Falls back to equal-temperament formula if lookup/tonal are unavailable.
     * @param {string} note - Note name (e.g., 'C4')
     * @returns {number|undefined} Frequency in Hz
     */
    getNoteFrequency(note) {
        if (!note) return undefined;

        // 1) Fast table path for a subset of notes (common range)
        if (Object.prototype.hasOwnProperty.call(this.noteFrequencies, note)) {
            return this.noteFrequencies[note];
        }

        // 2) Tonal if present
        if (this.tonalNote && typeof this.tonalNote.freq === 'function') {
            const frequency = this.tonalNote.freq(note);
            if (typeof frequency === 'number' && Number.isFinite(frequency)) {
                return frequency;
            }
        }

        // 3) Formula fallback: derive MIDI from the note and compute frequency
        // A4 (MIDI 69) = 440Hz; f = 440 * 2^((midi-69)/12)
        try {
            const midi = this.noteToSemitone(note);
            if (typeof midi === 'number' && Number.isFinite(midi)) {
                const freq = 440 * Math.pow(2, (midi - 69) / 12);
                return freq;
            }
        } catch (e) {
            // swallow and continue to final undefined
        }

        // No reliable mapping available
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
        if (this.defaultTonicLetters[normalizedMode]) {
            return this.defaultTonicLetters[normalizedMode];
        }
        const options = this.getAvailableTonicsForMode(normalizedMode);
        const fallback = options.length > 0 ? options[0] : 'C';
        this.defaultTonicLetters[normalizedMode] = fallback;
        return fallback;
    }

    /**
     * Compute (or retrieve cached) tonic options for a mode.
     * @param {string} mode
     * @returns {Array<string>}
     */
    getAvailableTonicsForMode(mode) {
        const normalizedMode = (mode || 'ionian').toLowerCase();
        if (this.modeTonicOptionCache.has(normalizedMode)) {
            return this.modeTonicOptionCache.get(normalizedMode).slice();
        }
        const degreeIndex = this.modeDegreeIndex[normalizedMode];
        const options = [];
        const seen = new Set();
        if (Number.isInteger(degreeIndex)) {
            this.majorPitchTraversal.forEach((majorPitch) => {
                const modePitch = (majorPitch + (this.majorScaleSemitoneSteps[degreeIndex] || 0)) % 12;
                const signature = this.deriveModeSignatureForPitchClass(normalizedMode, modePitch);
                if (signature && signature.displayTonic && !seen.has(signature.displayTonic)) {
                    options.push(signature.displayTonic);
                    seen.add(signature.displayTonic);
                }
            });
        }
        if (options.length === 0) {
            this.availableTonics.forEach((tonic) => {
                if (!seen.has(tonic)) {
                    options.push(tonic);
                    seen.add(tonic);
                }
            });
        }
        this.modeTonicOptionCache.set(normalizedMode, options);
        return options.slice();
    }

    /**
     * Backwards-compatible access to tonic options (defaults to Ionian).
     * @returns {Array<string>}
     */
    getAvailableTonics() {
        return this.getAvailableTonicsForMode('ionian');
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
