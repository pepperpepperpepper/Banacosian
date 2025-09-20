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

        // Mode ranges - each mode gets its specific range
        this.modeRanges = {
            'ionian': { whiteKeys: ['C4','D4','E4','F4','G4','A4','B4','C5','D5','E5','F5','G5','A5','B5'] },
            'dorian': { whiteKeys: ['D4','E4','F4','G4','A4','B4','C5'] },
            'phrygian': { whiteKeys: ['E4','F4','G4','A4','B4','C5','D5'] },
            'lydian': { whiteKeys: ['F4','G4','A4','B4','C5','D5','E5'] },
            'mixolydian': { whiteKeys: ['G3','A3','B3','C4','D4','E4','F4'] },
            'aeolian': { whiteKeys: ['A3','B3','C4','D4','E4','F4','G4'] },
            'locrian': { whiteKeys: ['B3','C4','D4','E4','F4','G4','A4'] }
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

        this.notes = Object.keys(this.noteFrequencies);
    }

    /**
     * Generate diatonic notes for the current mode
     * @param {string} mode - The current mode (e.g., 'ionian', 'dorian')
     * @returns {Array} Array of diatonic notes
     */
    generateDiatonicNotes(mode) {
        const currentRange = this.modeRanges[mode];
        const pattern = this.modePatterns[mode];
        const diatonicNotes = [];
        
        // Get all available notes for this mode's range
        const allNotesInRange = this.getAllNotesInRange(currentRange.whiteKeys[0], currentRange.whiteKeys[currentRange.whiteKeys.length - 1]);
        
        // Filter to only include notes that match the mode pattern
        const chromaticNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const startNoteIndex = chromaticNotes.indexOf(currentRange.whiteKeys[0].slice(0, -1));
        
        allNotesInRange.forEach(note => {
            const noteName = note.slice(0, -1);
            const noteIndex = chromaticNotes.indexOf(noteName);
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
        console.log('getAllNotesInRange called with:', startNote, endNote);
        
        if (!startNote || !endNote || typeof startNote !== 'string' || typeof endNote !== 'string') {
            console.error('Invalid start or end note for range', startNote, endNote);
            return [];
        }
        
        const allNotes = Object.keys(this.noteFrequencies);
        console.log('All available notes (type):', typeof allNotes, 'isArray:', Array.isArray(allNotes));
        console.log('All available notes:', allNotes);
        
        const startIndex = allNotes.indexOf(startNote);
        const endIndex = allNotes.indexOf(endNote);
        
        console.log('Start index:', startIndex, 'End index:', endIndex);
        
        if (startIndex === -1 || endIndex === -1) {
            console.error('Start or end note not found in frequencies', startNote, endNote);
            return [];
        }
        
        const result = allNotes.slice(startIndex, endIndex + 1);
        console.log('Notes in range result (type):', typeof result, 'isArray:', Array.isArray(result));
        console.log('Notes in range result:', result);
        console.log('Result length:', result ? result.length : 'undefined');
        
        // Filter out any undefined or invalid notes
        const filteredResult = result.filter(note => note && typeof note === 'string');
        console.log('Filtered notes in range (type):', typeof filteredResult, 'isArray:', Array.isArray(filteredResult));
        console.log('Filtered notes in range:', filteredResult);
        console.log('Filtered length:', filteredResult ? filteredResult.length : 'undefined');
        
        // Test first few elements
        if (filteredResult && filteredResult.length > 0) {
            console.log('First element:', filteredResult[0], 'type:', typeof filteredResult[0]);
            if (filteredResult.length > 1) {
                console.log('Second element:', filteredResult[1], 'type:', typeof filteredResult[1]);
            }
        }
        
        return filteredResult;
    }

    /**
     * Get the current keyboard mapping for a specific mode
     * @param {string} mode - The current mode
     * @returns {Object} Keyboard mapping object
     */
    getCurrentKeyboardMapping(mode) {
        console.log('=== Starting getCurrentKeyboardMapping ===');
        console.log('Current mode:', mode);
        
        try {
            const currentRange = this.modeRanges[mode];
            console.log('Current range:', currentRange);
            
            if (!currentRange || !currentRange.whiteKeys || !Array.isArray(currentRange.whiteKeys)) {
                console.error('Invalid current range for mode', mode);
                return {};
            }
            
            console.log('White keys for this mode:', currentRange.whiteKeys);
            
            const mapping = {};
            
            // Map the physical white key positions to the current mode's white keys
            const physicalWhiteKeys = ['C4','D4','E4','F4','G4','A4','B4','C5','D5','E5','F5','G5','A5','B5'];
            
            console.log('About to map white keys');
            
            // Only map as many keys as the current mode has
            physicalWhiteKeys.forEach((physicalKey, index) => {
                console.log(`Mapping white key ${index}: ${physicalKey}`);
                
                if (index < currentRange.whiteKeys.length && currentRange.whiteKeys[index]) {
                    const targetNote = currentRange.whiteKeys[index];
                    console.log(`  -> maps to: ${targetNote} (type: ${typeof targetNote})`);
                    mapping[physicalKey] = targetNote;
                } else {
                    console.log(`  -> no mapping (beyond range or undefined)`);
                }
            });
            
            console.log('White key mapping complete. About to map black keys');
            
            // Map black keys based on their positions between active white keys
            const physicalBlackKeys = ['C#4','D#4','F#4','G#4','A#4','C#5','D#5','F#5','G#5','A#5'];
            const blackKeyPositions = [0.5, 1.5, 3.5, 4.5, 5.5, 7.5, 8.5, 10.5, 11.5, 12.5]; // Position between white keys
            
            physicalBlackKeys.forEach((physicalBlackKey, index) => {
                console.log(`Processing black key ${index}: ${physicalBlackKey}`);
                
                try {
                    const position = blackKeyPositions[index];
                    const lowerWhiteIndex = Math.floor(position);
                    const upperWhiteIndex = Math.ceil(position);
                    
                    console.log(`  Position: ${position}, lower: ${lowerWhiteIndex}, upper: ${upperWhiteIndex}`);
                    
                    // Only map black keys if both surrounding white keys are active
                    if (lowerWhiteIndex < currentRange.whiteKeys.length && 
                        upperWhiteIndex < currentRange.whiteKeys.length &&
                        currentRange.whiteKeys[lowerWhiteIndex] && 
                        currentRange.whiteKeys[upperWhiteIndex]) {
                        
                        const lowerNote = currentRange.whiteKeys[lowerWhiteIndex];
                        const upperNote = currentRange.whiteKeys[upperWhiteIndex];
                        
                        console.log(`  Lower note: ${lowerNote} (type: ${typeof lowerNote})`);
                        console.log(`  Upper note: ${upperNote} (type: ${typeof upperNote})`);
                        
                        if (!lowerNote || !upperNote || typeof lowerNote !== 'string' || typeof upperNote !== 'string') {
                            console.log(`  -> Skipping due to invalid notes`);
                            return;
                        }
                        
                        console.log(`  About to slice lowerNote: "${lowerNote}"`);
                        // Calculate what the black key should be
                        const lowerNoteName = lowerNote.slice(0, -1);
                        const lowerOctave = parseInt(lowerNote.slice(-1));
                        console.log(`  Lower note name: ${lowerNoteName}, octave: ${lowerOctave}`);
                        
                        const chromaticNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
                        const lowerIndex = chromaticNotes.indexOf(lowerNoteName);
                        
                        let blackNoteIndex = (lowerIndex + 1) % 12;
                        let blackOctave = lowerOctave;
                        if (lowerIndex === 11) blackOctave++; // B to C# goes up an octave
                        
                        const blackNoteName = chromaticNotes[blackNoteIndex];
                        console.log(`  Calculated black note: ${blackNoteName}${blackOctave}`);
                        
                        if (blackNoteName && blackNoteName.includes('#')) {
                            const blackNote = `${blackNoteName}${blackOctave}`;
                            if (this.noteFrequencies[blackNote]) {
                                console.log(`  -> Mapping ${physicalBlackKey} to ${blackNote}`);
                                mapping[physicalBlackKey] = blackNote;
                            } else {
                                console.log(`  -> ${blackNote} not found in frequencies`);
                            }
                        } else {
                            console.log(`  -> Not a sharp note: ${blackNoteName}`);
                        }
                    } else {
                        console.log(`  -> Skipping, white keys not in range`);
                    }
                } catch (error) {
                    console.error(`Error processing black key ${physicalBlackKey}:`, error);
                }
            });
            
            console.log('Final mapping:', mapping);
            console.log('=== Finished getCurrentKeyboardMapping ===');
            return mapping;
            
        } catch (error) {
            console.error('Error in getCurrentKeyboardMapping:', error);
            console.error('Stack trace:', error.stack);
            return {};
        }
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
     * Get mode ranges
     * @returns {Object} Mode ranges object
     */
    getModeRanges() {
        return this.modeRanges;
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