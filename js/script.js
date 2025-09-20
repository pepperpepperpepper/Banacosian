class MelodicDictation {
    constructor() {
        this.audioContext = null;
        this.currentSequence = [];
        this.userSequence = [];
        this.sequenceLength = 3;
        this.scaleType = 'diatonic';
        this.mode = 'ionian';
        this.isPlaying = false;
        this.score = { correct: 0, total: 0 };
        
        // Round-based scoring
        this.currentRound = { correct: 0, total: 0, startTime: null };
        this.roundHistory = [];
        this.timerInterval = null;
        this.sequenceStartTime = null;
        this.staffNotes = []; // Track notes on staff
        this.countdownInterval = null;
        this.autoPlayNext = false;
        
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
        
        this.notes = Object.keys(this.noteFrequencies);
        
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
        
        // Current diatonic notes (will be updated based on mode)
        this.diatonicNotes = [];
        
        this.initializeAudio();
        this.setupEventListeners();
        this.updateScore();
        
        // Generate initial diatonic notes after mode patterns are set
        console.log('=== INITIALIZATION: About to generate initial diatonic notes ===');
        try {
            this.diatonicNotes = this.generateDiatonicNotes();
            console.log('INITIALIZATION: Successfully generated diatonic notes:', this.diatonicNotes);
        } catch (error) {
            console.error('Error generating diatonic notes:', error);
            console.error('Error stack:', error.stack);
            this.diatonicNotes = []; // Fallback to empty array
        }
        
        this.updateKeyboardVisibility();
        this.updateRoundDisplay();
    }

    generateDiatonicNotes() {
        const currentRange = this.modeRanges[this.mode];
        const pattern = this.modePatterns[this.mode];
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

    getCurrentKeyboardMapping() {
        console.log('=== Starting getCurrentKeyboardMapping ===');
        console.log('Current mode:', this.mode);
        
        try {
            const currentRange = this.modeRanges[this.mode];
            console.log('Current range:', currentRange);
            
            if (!currentRange || !currentRange.whiteKeys || !Array.isArray(currentRange.whiteKeys)) {
                console.error('Invalid current range for mode', this.mode);
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

    async initializeAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (error) {
            console.error('Web Audio API not supported:', error);
            alert('Your browser does not support the Web Audio API. Please use a modern browser.');
        }
    }

    setupEventListeners() {
        document.getElementById('newSequenceBtn').addEventListener('click', () => this.generateNewSequence());
        document.getElementById('playSequenceBtn').addEventListener('click', () => this.playSequence());
        document.getElementById('showHistoryBtn').addEventListener('click', () => this.showHistory());
        document.getElementById('closeHistoryBtn').addEventListener('click', () => this.hideHistory());
        document.getElementById('saveDataBtn').addEventListener('click', () => this.saveToGoogleDrive());
        document.getElementById('loadDataBtn').addEventListener('click', () => this.loadFromGoogleDrive());
        
        document.getElementById('difficulty').addEventListener('change', (e) => {
            this.sequenceLength = parseInt(e.target.value);
        });
        
document.getElementById('scaleType').addEventListener('change', (e) => {
            this.scaleType = e.target.value;
            this.updateKeyboardVisibility();
});
        
        document.getElementById('mode').addEventListener('change', (e) => {            try {
                this.mode = e.target.value;
                this.diatonicNotes = this.generateDiatonicNotes();
                this.updateKeyboardVisibility();
                
                // Clear current sequence when mode changes
                this.currentSequence = [];
                this.userSequence = [];
                this.clearStaffNotes();
                document.getElementById('feedback').textContent = `Switched to ${this.mode} mode. Click "New Sequence" to start.`;
                document.getElementById('feedback').className = 'feedback';
                document.getElementById('playSequenceBtn').disabled = true;
            } catch (error) {
                console.error('Error changing mode:', error);
                document.getElementById('feedback').textContent = `Error switching to ${this.mode} mode. Please try again.`;
                document.getElementById('feedback').className = 'feedback incorrect';
            }
        });
        
document.querySelectorAll('.white-key, .black-key').forEach(key => {
            key.addEventListener('click', (e) => this.playNote(e.target.dataset.note));
        });
    }

    async playTone(frequency, duration = 0.5) {
        if (!this.audioContext) {
            await this.initializeAudio();
        }

        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        console.log('Frequency value:', frequency, 'Type:', typeof frequency, 'Is finite:', isFinite(frequency));
        oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, this.audioContext.currentTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + duration);
    }

    generateNewSequence() {
        // Clear previous staff notes
        this.clearStaffNotes();
        
        // Start fresh timer for this sequence
        this.sequenceStartTime = Date.now();
        this.startSequenceTimer();
        
        // Track round start if this is the first sequence
        if (this.currentRound.total === 0 && !this.currentRound.startTime) {
            this.currentRound.startTime = Date.now();
        }
        
        this.currentSequence = [];
        this.userSequence = [];
        
        // Choose notes based on scale type
        const availableNotes = this.scaleType === 'diatonic' ? this.diatonicNotes : this.notes;
        
        for (let i = 0; i < this.sequenceLength; i++) {
            const randomNote = availableNotes[Math.floor(Math.random() * availableNotes.length)];
            this.currentSequence.push(randomNote);
        }
        
        this.updateDisplay();
        this.playSequence();
        
        const scaleText = this.scaleType === 'diatonic' ? ` (${this.mode} mode)` : '';
        document.getElementById('feedback').textContent = `Listen carefully${scaleText}...`;
        document.getElementById('feedback').className = 'feedback';
        document.getElementById('playSequenceBtn').disabled = false;
    }

    async playSequence() {
        if (this.isPlaying) return;
        
        this.isPlaying = true;
        document.getElementById('playSequenceBtn').disabled = true;
        
        // First play the reference: tonic notes of current mode
        const currentRange = this.modeRanges[this.mode];
        if (!currentRange || !currentRange.whiteKeys || currentRange.whiteKeys.length === 0) {
            console.error('Invalid mode range for', this.mode);
            return;
        }
        
        const tonic1 = currentRange.whiteKeys[0]; // First tonic
        if (!tonic1 || typeof tonic1 !== 'string') {
            console.error('No valid tonic found for mode', this.mode);
            return;
        }
        
        const tonicName = tonic1.slice(0, -1); // Remove octave number
        
        // For modes with enough range, play octave; otherwise just repeat the tonic
        let tonic2 = tonic1;
        if (currentRange.whiteKeys.length >= 8) {
            tonic2 = currentRange.whiteKeys[7]; // Tonic one octave up if available
        }
        
        document.getElementById('feedback').textContent = `Playing reference notes (${tonicName})...`;
        await this.playTone(this.noteFrequencies[tonic1], 0.6);
        await this.delay(300);
        await this.playTone(this.noteFrequencies[tonic2], 0.6);
        await this.delay(300);
        await this.playTone(this.noteFrequencies[tonic1], 0.6);
        await this.delay(800); // Longer pause before sequence
        
        document.getElementById('feedback').textContent = 'Now the sequence...';
        await this.delay(500);
        
        // Then play the actual sequence
        for (let i = 0; i < this.currentSequence.length; i++) {
            const note = this.currentSequence[i];
            
            // Highlight current note
            const noteElements = document.querySelectorAll('#sequenceDisplay .sequence-note');
            noteElements.forEach(el => el.classList.remove('playing'));
            if (noteElements[i]) {
                noteElements[i].classList.add('playing');
            }
            
            console.log('Playing note:', note, 'Frequency:', this.noteFrequencies[note], 'Has frequency:', note in this.noteFrequencies);
            await this.playTone(this.noteFrequencies[note], 0.6);
            await this.delay(700); // Gap between notes
        }
        
        // Remove highlight
        document.querySelectorAll('#sequenceDisplay .sequence-note').forEach(el => 
            el.classList.remove('playing'));
        
        this.isPlaying = false;
        document.getElementById('playSequenceBtn').disabled = false;
        
        if (this.userSequence.length === 0) {
            document.getElementById('feedback').textContent = 'Now play it back on the keyboard!';
        }
    }

async playNote(physicalNote) {
        if (this.isPlaying || this.currentSequence.length === 0) return;
        
        let actualNote;
        
        if (this.scaleType === 'chromatic') {
            // In chromatic mode, use the physical note directly
            actualNote = physicalNote;
        } else {
            // In diatonic mode, get the mapped note for the current mode
            const keyboardMapping = this.getCurrentKeyboardMapping();
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
        
        // Show note on staff
        this.showNoteOnStaff(actualNote);
        
        await this.playTone(this.noteFrequencies[actualNote], 0.5);
        
        this.userSequence.push(actualNote);
        this.updateUserDisplay();
        
        // Check if sequence is complete
        if (this.userSequence.length === this.currentSequence.length) {
            this.checkSequence();
        } else {
            document.getElementById('feedback').textContent = 
                `Note ${this.userSequence.length} of ${this.currentSequence.length}`;
        }
    }
    checkSequence() {
        // Stop the sequence timer
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        // Calculate sequence completion time
        const sequenceTime = this.sequenceStartTime ? Date.now() - this.sequenceStartTime : 0;
        
        this.score.total++;
        this.currentRound.total++;
        
        const isCorrect = this.arraysEqual(this.userSequence, this.currentSequence);
        
        if (isCorrect) {
            this.score.correct++;
            this.currentRound.correct++;
            document.getElementById('feedback').textContent = `Perfect! Well done! (${this.formatDuration(sequenceTime)}) 🎉`;
            document.getElementById('feedback').className = 'feedback correct';
        } else {
            document.getElementById('feedback').textContent = `Not quite right. Try again! (${this.formatDuration(sequenceTime)})`;
            document.getElementById('feedback').className = 'feedback incorrect';
        }
        
        // Store sequence result with timing
        if (!this.currentRound.sequences) {
            this.currentRound.sequences = [];
        }
        
        this.currentRound.sequences.push({
            sequence: [...this.currentSequence],
            userResponse: [...this.userSequence],
            correct: isCorrect,
            timeMs: sequenceTime,
            timeFormatted: this.formatDuration(sequenceTime)
        });
        
        this.updateScore();
        this.updateRoundDisplay();
        this.showComparison();
        
        // Check if round is complete (10 sequences)
        if (this.currentRound.total >= 10) {
            this.completeRound();
        } else {
            // Start countdown for next sequence - different timing based on correctness
            if (isCorrect) {
                this.startCountdown(1); // 1 second for correct answers
            } else {
                this.startCountdown(4); // 4 seconds for incorrect answers
            }
        }
    }

    showComparison() {
        const userDisplay = document.getElementById('userSequenceDisplay');
        userDisplay.innerHTML = '';
        
        const title = document.createElement('div');
        title.textContent = 'Your sequence:';
        title.style.marginBottom = '10px';
        title.style.fontSize = '0.9em';
        userDisplay.appendChild(title);
        
        // Update staff notes with comparison colors
        for (let i = 0; i < this.currentSequence.length; i++) {
            const noteEl = document.createElement('div');
            noteEl.className = 'sequence-note user';
            noteEl.textContent = this.userSequence[i] || '?';
            
            if (i < this.userSequence.length) {
                if (this.userSequence[i] === this.currentSequence[i]) {
                    noteEl.classList.add('correct');
                    // Update staff note to green
                    if (this.staffNotes[i]) {
                        this.staffNotes[i].element.classList.remove('user', 'incorrect');
                        this.staffNotes[i].element.classList.add('correct');
                    }
                } else {
                    noteEl.classList.add('incorrect');
                    // Update staff note to red
                    if (this.staffNotes[i]) {
                        this.staffNotes[i].element.classList.remove('user', 'correct');
                        this.staffNotes[i].element.classList.add('incorrect');
                    }
                }
            }
            
            userDisplay.appendChild(noteEl);
        }
    }

    showNoteOnStaff(note) {
        console.log('=== showNoteOnStaff called with:', note, 'type:', typeof note);
        
        if (!note) {
            console.warn('showNoteOnStaff: note is falsy');
            return; // Safety check
        }
        
        console.log('About to query staff note with selector:', `.staff .note.${note}`);
        
        // Flash the note briefly, then make it persistent
        const staffNote = document.querySelector(`.staff .note.${note}`);
        if (staffNote) {
            // Position the note for the sequence
            const noteIndex = this.staffNotes.length;
            const spacing = 45; // Horizontal spacing between notes
            const startX = 90; // Start position after treble clef
            
            staffNote.style.left = `${startX + (noteIndex * spacing)}px`;
            staffNote.classList.add('visible');
            
            // Add to our tracking array
            this.staffNotes.push({
                note: note,
                element: staffNote,
                index: noteIndex
            });
            
            // Show accidental if it's a sharp
            if (note.includes('#')) {
                const accidental = document.querySelector(`.staff .accidental[data-sharp="${note}"]`);
                if (accidental) {
                    accidental.style.left = `${startX + (noteIndex * spacing) - 15}px`;
                    accidental.classList.add('visible');
                }
            }
            
            // After flash animation, make it persistent with user color
            setTimeout(() => {
                staffNote.classList.remove('visible');
                staffNote.classList.add('persistent', 'user');
            }, 500);
        }
    }

    startCountdown(seconds = 4) {
        let countdown = seconds;
        
        if (seconds === 1) {
            // For correct answers - just a brief pause
            document.getElementById('feedback').textContent = `Next sequence...`;
            document.getElementById('feedback').className = 'feedback';
            
            setTimeout(() => {
                this.generateNewSequence();
            }, 1000);
        } else {
            // For incorrect answers - longer countdown
            document.getElementById('feedback').textContent = `Next sequence in ${countdown}...`;
            document.getElementById('feedback').className = 'feedback';
            
            this.countdownInterval = setInterval(() => {
                countdown--;
                if (countdown > 0) {
                    document.getElementById('feedback').textContent = `Next sequence in ${countdown}...`;
                } else {
                    clearInterval(this.countdownInterval);
                    this.countdownInterval = null;
                    this.generateNewSequence();
                }
            }, 1000);
        }
    }

    clearStaffNotes() {
        // Clear all notes and accidentals from staff
        document.querySelectorAll('.staff .note').forEach(n => {
            n.classList.remove('visible', 'persistent');
            n.style.left = '50%'; // Reset to center
        });
        document.querySelectorAll('.staff .accidental').forEach(a => {
            a.classList.remove('visible');
            a.style.left = '35%'; // Reset to default
        });
        
        // Reset tracking array
        this.staffNotes = [];
    }

    updateDisplay() {
        const display = document.getElementById('sequenceDisplay');
        display.innerHTML = '';
        
        const title = document.createElement('div');
        title.textContent = 'Target sequence:';
        title.style.marginBottom = '10px';
        title.style.fontSize = '0.9em';
        display.appendChild(title);
        
        this.currentSequence.forEach(note => {
            const noteEl = document.createElement('div');
            noteEl.className = 'sequence-note';
            noteEl.textContent = '♪';
            display.appendChild(noteEl);
        });
    }

    updateUserDisplay() {
        const userDisplay = document.getElementById('userSequenceDisplay');
        
        if (this.userSequence.length === 0) {
            userDisplay.innerHTML = '';
            return;
        }
        
        userDisplay.innerHTML = '';
        
        const title = document.createElement('div');
        title.textContent = 'Your sequence:';
        title.style.marginBottom = '10px';
        title.style.fontSize = '0.9em';
        userDisplay.appendChild(title);
        
        this.userSequence.forEach(note => {
            const noteEl = document.createElement('div');
            noteEl.className = 'sequence-note user';
            noteEl.textContent = note;
            userDisplay.appendChild(noteEl);
        });
    }

    updateScore() {
        document.getElementById('correct').textContent = this.score.correct;
        document.getElementById('total').textContent = this.score.total;
        
        const percentage = this.score.total > 0 ? 
            Math.round((this.score.correct / this.score.total) * 100) : 0;
        document.getElementById('percentage').textContent = percentage;
    }

    arraysEqual(a, b) {
        return a.length === b.length && a.every((val, i) => val === b[i]);
    }

updateKeyboardVisibility() {
        const showAllNotes = this.scaleType === 'chromatic';
        
        let keyboardMapping;
        if (!showAllNotes) {
            try {
                keyboardMapping = this.getCurrentKeyboardMapping();
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
    startSequenceTimer() {
        // Clear any existing timer first
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
        
        this.timerInterval = setInterval(() => {
            this.updateTimer();
        }, 1000);
    }

    updateTimer() {
        if (!this.sequenceStartTime) return;
        
        const elapsed = Date.now() - this.sequenceStartTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        
        document.getElementById('timer').textContent = 
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    startRoundTimer() {
        this.currentRound.startTime = Date.now();
        this.timerInterval = setInterval(() => {
            this.updateTimer();
        }, 1000);
    }

    updateRoundDisplay() {
        document.getElementById('roundProgress').textContent = `${this.currentRound.total}/10`;
        
        const accuracy = this.currentRound.total > 0 ? 
            Math.round((this.currentRound.correct / this.currentRound.total) * 100) : 0;
        document.getElementById('currentAccuracy').textContent = `${accuracy}%`;
    }

    completeRound() {
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
            scaleType: this.scaleType,
            mode: this.mode,
            sequenceLength: this.sequenceLength
        };
        
        this.roundHistory.push(roundData);
        
        // Show completion message
        document.getElementById('feedback').textContent = 
            `Round Complete! ${accuracy}% accuracy in ${this.formatDuration(duration)}. Click "New Sequence" to start next round.`;
        document.getElementById('feedback').className = 'feedback correct';
        
        // Reset for next round
        this.currentRound = { correct: 0, total: 0, startTime: null };
        this.updateRoundDisplay();
        document.getElementById('timer').textContent = '00:00';
    }

    formatDuration(ms) {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    showHistory() {
        const modal = document.getElementById('historyModal');
        const content = document.getElementById('historyContent');
        
        if (this.roundHistory.length === 0) {
            content.innerHTML = '<p style="text-align: center; font-size: 1.2em;">No completed rounds yet. Finish a round of 10 sequences to see your history!</p>';
        } else {
            let html = `
                <div style="margin-bottom: 20px;">
                    <h3>Session Summary</h3>
                    <p>Total Rounds: ${this.roundHistory.length}</p>
                    <p>Average Accuracy: ${this.calculateAverageAccuracy()}%</p>
                    <p>Best Round: ${this.getBestRound()}%</p>
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
            
            this.roundHistory.slice().reverse().forEach((round, index) => {
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

    hideHistory() {
        document.getElementById('historyModal').style.display = 'none';
    }

    calculateAverageAccuracy() {
        if (this.roundHistory.length === 0) return 0;
        const total = this.roundHistory.reduce((sum, round) => sum + round.accuracy, 0);
        return Math.round(total / this.roundHistory.length);
    }

    getBestRound() {
        if (this.roundHistory.length === 0) return 0;
        return Math.max(...this.roundHistory.map(round => round.accuracy));
    }

    async autoSaveToGoogleDrive() {
        try {
            // Auto-save after each round completion
            const saveData = {
                version: '1.0',
                savedAt: new Date().toISOString(),
                sessionStats: {
                    totalRounds: this.roundHistory.length,
                    averageAccuracy: this.calculateAverageAccuracy(),
                    bestRound: this.getBestRound()
                },
                currentRound: this.currentRound,
                overallScore: this.score,
                roundHistory: this.roundHistory,
                settings: {
                    sequenceLength: this.sequenceLength,
                    scaleType: this.scaleType,
                    mode: this.mode
                }
            };

            // Use a consistent filename for auto-saves
            const filename = 'melodic-dictation-autosave.json';
            await window.fs.writeFile(filename, JSON.stringify(saveData, null, 2));
            
        } catch (error) {
            console.error('Auto-save failed:', error);
            // Don't show error to user for auto-save failures
        }
    }

    async saveToGoogleDrive() {
        try {
            // Prepare data for saving
            const saveData = {
                version: '1.0',
                savedAt: new Date().toISOString(),
                sessionStats: {
                    totalRounds: this.roundHistory.length,
                    averageAccuracy: this.calculateAverageAccuracy(),
                    bestRound: this.getBestRound()
                },
                currentRound: this.currentRound,
                overallScore: this.score,
                roundHistory: this.roundHistory,
                settings: {
                    sequenceLength: this.sequenceLength,
                    scaleType: this.scaleType,
                    mode: this.mode
                }
            };

            // Create filename with timestamp
            const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
            const filename = `melodic-dictation-data-${timestamp}.json`;

            // Save to Google Drive using the fs API
            await window.fs.writeFile(filename, JSON.stringify(saveData, null, 2));
            
            document.getElementById('feedback').textContent = `✅ Data saved to Google Drive as ${filename}`;
            document.getElementById('feedback').className = 'feedback correct';
            
        } catch (error) {
            console.error('Error saving to Google Drive:', error);
            document.getElementById('feedback').textContent = '❌ Error saving to Google Drive. Please try again.';
            document.getElementById('feedback').className = 'feedback incorrect';
        }
    }

    async loadFromGoogleDrive() {
        try {
            // First try to load the auto-save file
            let fileContent;
            let filename;
            
            try {
                fileContent = await window.fs.readFile('melodic-dictation-autosave.json', { encoding: 'utf8' });
                filename = 'melodic-dictation-autosave.json';
            } catch (autoSaveError) {
                // If auto-save doesn't exist, look for manual saves
                const files = await window.fs.list();
                const dataFiles = files.filter(f => f.name.includes('melodic-dictation-data') && f.name.endsWith('.json'));
                
                if (dataFiles.length === 0) {
                    document.getElementById('feedback').textContent = '📂 No saved data files found in Google Drive.';
                    document.getElementById('feedback').className = 'feedback';
                    return;
                }

                // Get the most recent manual save
                const mostRecentFile = dataFiles.sort((a, b) => new Date(b.modified) - new Date(a.modified))[0];
                fileContent = await window.fs.readFile(mostRecentFile.name, { encoding: 'utf8' });
                filename = mostRecentFile.name;
            }
            
            const loadedData = JSON.parse(fileContent);

            // Validate the data structure
            if (!loadedData.roundHistory || !loadedData.version) {
                throw new Error('Invalid data format');
            }

            // Restore the data
            this.roundHistory = loadedData.roundHistory || [];
            this.score = loadedData.overallScore || { correct: 0, total: 0 };
            
            // Restore current round if it exists and is incomplete
            if (loadedData.currentRound && loadedData.currentRound.total < 10) {
                this.currentRound = loadedData.currentRound;
                if (this.currentRound.startTime && this.currentRound.total > 0) {
                    // Resume timer if round was in progress
                    this.startRoundTimer();
                }
            }

            // Restore settings
            if (loadedData.settings) {
                this.sequenceLength = loadedData.settings.sequenceLength || 3;
                this.scaleType = loadedData.settings.scaleType || 'diatonic';
                this.mode = loadedData.settings.mode || 'ionian';
                document.getElementById('difficulty').value = this.sequenceLength;
                document.getElementById('scaleType').value = this.scaleType;
                document.getElementById('mode').value = this.mode;
                this.diatonicNotes = this.generateDiatonicNotes();
                this.updateKeyboardVisibility();
            }

            // Update displays
            this.updateScore();
            this.updateRoundDisplay();

            const savedDate = new Date(loadedData.savedAt).toLocaleString();
            document.getElementById('feedback').textContent = 
                `✅ Data loaded from ${filename} (saved ${savedDate}). ${this.roundHistory.length} rounds restored.`;
            document.getElementById('feedback').className = 'feedback correct';

        } catch (error) {
            console.error('Error loading from Google Drive:', error);
            document.getElementById('feedback').textContent = '❌ Error loading data from Google Drive. Please check the file format.';
            document.getElementById('feedback').className = 'feedback incorrect';
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    new MelodicDictation();
});
