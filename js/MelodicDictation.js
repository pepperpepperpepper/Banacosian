/**
 * Main Melodic Dictation Application Class
 * Uses modular components for better organization
 */
class MelodicDictation {
    constructor() {
        // Initialize modules
        this.audioModule = new AudioModule();
        this.musicTheory = new MusicTheoryModule();
        this.staffModule = new StaffModule();
        this.scoringModule = new ScoringModule();
        this.storageModule = new StorageModule(this.scoringModule);
        this.uiModule = new UIModule();
        this.keyboardModule = new KeyboardModule(this.musicTheory, this.audioModule);

        // Application state
        this.currentSequence = [];
        this.userSequence = [];
        this.sequenceLength = 3;
        this.scaleType = 'diatonic';
        this.mode = 'ionian';
        this.tonic = this.musicTheory.getDefaultTonicLetter(this.mode);
        this.availableTonics = this.musicTheory.getAvailableTonics();
        this.autoPlayNext = false;

        // Initialize keyboard module with current settings
        this.keyboardModule.setScaleType(this.scaleType);
        this.keyboardModule.setMode(this.mode, this.tonic);

        // Initialize the application
        this.initialize();
    }

    /**
     * Initialize the application
     */
    async initialize() {
        try {
            // Initialize audio
            await this.audioModule.initializeAudio();
            
            // Setup event listeners
            this.setupEventListeners();
            this.uiModule.populateTonicOptions(this.availableTonics, this.tonic);
            
            // Update displays
            this.scoringModule.updateScore();
            this.scoringModule.updateRoundDisplay();
            
            // Generate initial diatonic notes
            console.log('=== INITIALIZATION: About to generate initial diatonic notes ===');
            try {
                const diatonicNotes = this.musicTheory.generateDiatonicNotes(this.mode, this.tonic);
                this.keyboardModule.setMode(this.mode, this.tonic); // This will update diatonic notes
                console.log('INITIALIZATION: Successfully generated diatonic notes:', diatonicNotes);
            } catch (error) {
                console.error('Error generating diatonic notes:', error);
                console.error('Error stack:', error.stack);
            }
            
            // Update keyboard visibility
            this.keyboardModule.updateKeyboardVisibility();
            this.keyboardModule.positionBlackKeys();
            
        } catch (error) {
            console.error('Error during initialization:', error);
            this.uiModule.updateFeedback('Error initializing application. Please refresh the page.', 'incorrect');
        }
    }

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // Setup UI event listeners
        this.uiModule.setupEventListeners({
            onNewSequence: () => this.generateNewSequence(),
            onPlaySequence: () => this.playSequence(),
            onShowHistory: () => this.showHistory(),
            onHideHistory: () => this.hideHistory(),
            onSaveData: () => this.saveToGoogleDrive(),
            onLoadData: () => this.loadFromGoogleDrive(),
            onDifficultyChange: (e) => this.handleDifficultyChange(e),
            onTonicChange: (e) => this.handleTonicChange(e),
            onScaleTypeChange: (e) => this.handleScaleTypeChange(e),
            onModeChange: (e) => this.handleModeChange(e)
        });

        // Setup keyboard event listeners
        this.keyboardModule.setupEventListeners((actualNote) => {
            this.handleNotePlayed(actualNote);
        });
    }

    /**
     * Generate a new sequence
     */
    generateNewSequence() {
        // Show the status area when generating a new sequence
        this.uiModule.showStatusArea();
        
        // Clear previous staff notes and tonic highlights
        this.staffModule.clearStaffNotes();
        this.staffModule.clearTonicHighlights();
        
        // Start new sequence in scoring module
        this.scoringModule.startNewSequence();
        
        // Clear sequences
        this.currentSequence = [];
        this.userSequence = [];
        
        // Choose notes based on scale type
        const availableNotes = this.scaleType === 'diatonic' ? 
            this.keyboardModule.getDiatonicNotes() : 
            this.musicTheory.getNotes();
        
        for (let i = 0; i < this.sequenceLength; i++) {
            const randomNote = availableNotes[Math.floor(Math.random() * availableNotes.length)];
            this.currentSequence.push(randomNote);
        }
        
        // Update displays
        this.uiModule.updateSequenceDisplay(this.currentSequence);
        this.playSequence();
        
        const scaleText = this.scaleType === 'diatonic' ? ` (${this.mode} mode)` : '';
        this.uiModule.updateFeedback(`Listen carefully${scaleText}...`);
        this.uiModule.setPlayButtonState(false);
    }

    /**
     * Play the current sequence
     */
    async playSequence() {
        if (this.audioModule.getIsPlaying()) return;
        
        this.audioModule.setIsPlaying(true);
        this.uiModule.setPlayButtonState(true);
        
        // First play the reference: tonic notes of current mode
        const currentRange = this.musicTheory.getModeRange(this.mode, this.tonic);
        if (!currentRange || !currentRange.whiteKeys || currentRange.whiteKeys.length === 0) {
            console.error('Invalid mode range for', this.mode);
            return;
        }

        const tonic1 = currentRange.tonicNote || currentRange.whiteKeys[0];
        if (!tonic1 || typeof tonic1 !== 'string') {
            console.error('No valid tonic found for mode', this.mode);
            return;
        }

        const tonicName = this.musicTheory.getDisplayNoteName(tonic1, this.mode, this.tonic);

        let tonic2 = tonic1;
        const tonicSemitone = this.musicTheory.noteToSemitone
            ? this.musicTheory.noteToSemitone(tonic1)
            : null;
        if (tonicSemitone !== null) {
            const octaveCandidate = this.musicTheory.semitoneToNote
                ? this.musicTheory.semitoneToNote(tonicSemitone + 12)
                : null;
            if (octaveCandidate && this.musicTheory.getNoteFrequency(octaveCandidate)) {
                tonic2 = octaveCandidate;
            }
        }
        
        this.uiModule.updateFeedback(`Playing reference notes (${tonicName})...`);
        
        // Play audio and start visual feedback simultaneously (don't wait for highlight to finish)
        await this.audioModule.playTone(this.musicTheory.getNoteFrequency(tonic1), 0.6);
        this.staffModule.highlightNoteOnStaff(tonic1, 600); // Don't await this
        await this.delay(300);
        await this.audioModule.playTone(this.musicTheory.getNoteFrequency(tonic2), 0.6);
        this.staffModule.highlightNoteOnStaff(tonic2, 600); // Don't await this
        await this.delay(300);
        await this.audioModule.playTone(this.musicTheory.getNoteFrequency(tonic1), 0.6);
        this.staffModule.highlightNoteOnStaff(tonic1, 600); // Don't await this
        await this.delay(800); // Longer pause before sequence
        
        this.uiModule.updateFeedback('Now the sequence...');
        await this.delay(500);
        
        // Then play the actual sequence
        for (let i = 0; i < this.currentSequence.length; i++) {
            const note = this.currentSequence[i];
            
            // Highlight current note
            this.uiModule.highlightPlayingNote(i);
            
            console.log('Playing note:', note, 'Frequency:', this.musicTheory.getNoteFrequency(note), 'Has frequency:', note in this.musicTheory.noteFrequencies);
            await this.audioModule.playTone(this.musicTheory.getNoteFrequency(note), 0.6);
            await this.delay(700); // Gap between notes
        }
        
        // Remove highlight
        this.uiModule.removePlayingHighlights();
        
        this.audioModule.setIsPlaying(false);
        this.uiModule.setPlayButtonState(false);
        
        if (this.userSequence.length === 0) {
            this.uiModule.updateFeedback('Now play it back on the keyboard!');
        }
    }

    /**
     * Handle when a note is played on the keyboard
     * @param {string} actualNote - The note that was played
     */
    async handleNotePlayed(actualNote) {
        if (this.audioModule.getIsPlaying() || this.currentSequence.length === 0) return;
        
        // Show note on staff
        this.staffModule.showNoteOnStaff(actualNote);
        
        this.userSequence.push(actualNote);
        this.uiModule.updateUserSequenceDisplay(this.userSequence, this.currentSequence);
        
        // Check if sequence is complete
        if (this.userSequence.length === this.currentSequence.length) {
            this.checkSequence();
        } else {
            this.uiModule.updateFeedback(
                `Note ${this.userSequence.length} of ${this.currentSequence.length}`
            );
        }
    }

    /**
     * Check if the user's sequence matches the target sequence
     */
    checkSequence() {
        const result = this.scoringModule.checkSequence(this.userSequence, this.currentSequence);
        
        if (result.isCorrect) {
            this.uiModule.updateFeedback(`Perfect! Well done! (${result.sequenceTimeFormatted}) 🎉`, 'correct');
        } else {
            this.uiModule.updateFeedback(`Not quite right. Try again! (${result.sequenceTimeFormatted})`, 'incorrect');
        }
        
        // Update displays
        this.scoringModule.updateScore();
        this.scoringModule.updateRoundDisplay();
        
        // Show comparison
        this.uiModule.showComparison(this.userSequence, this.currentSequence);
        this.staffModule.updateStaffComparison(this.currentSequence, this.userSequence);
        
        // Check if round is complete
        if (this.scoringModule.isRoundComplete()) {
            this.completeRound();
        } else {
            // Start countdown for next sequence
            this.uiModule.startCountdown(result.isCorrect ? 1 : 4, () => {
                this.generateNewSequence();
            });
        }
    }

    /**
     * Complete the current round
     */
    completeRound() {
        const roundResult = this.scoringModule.completeRound(
            this.scaleType, 
            this.mode, 
            this.sequenceLength
        );
        
        // Auto-save to Google Drive
        this.storageModule.autoSaveToGoogleDrive(
            this.storageModule.getCurrentSettings(this.sequenceLength, this.scaleType, this.mode, this.tonic)
        );
        
        // Show completion message
        this.uiModule.updateFeedback(
            `Round Complete! ${roundResult.accuracy}% accuracy in ${roundResult.duration}. Click "New Sequence" to start next round.`,
            'correct'
        );
        
        // Reset timer display
        document.getElementById('timer').textContent = '00:00';
    }

    /**
     * Handle difficulty change
     * @param {Event} e - Change event
     */
    handleDifficultyChange(e) {
        this.sequenceLength = parseInt(e.target.value);
    }

    /**
     * Handle scale type change
     * @param {Event} e - Change event
     */
    handleScaleTypeChange(e) {
        this.scaleType = e.target.value;
        this.keyboardModule.setScaleType(this.scaleType);
        this.keyboardModule.updateKeyboardVisibility();
        this.keyboardModule.positionBlackKeys();
    }

    /**
     * Handle tonic change
     * @param {Event} e - Change event
     */
    handleTonicChange(e) {
        try {
            const requestedTonic = e.target.value;
            this.keyboardModule.setTonic(requestedTonic);
            this.tonic = this.keyboardModule.tonicLetter || requestedTonic;
            const displayTonic = this.musicTheory.getDisplayTonicName(this.mode, this.tonic);
            this.uiModule.setTonicValue(this.tonic);
            this.keyboardModule.updateKeyboardVisibility();
            this.keyboardModule.positionBlackKeys();

            this.uiModule.hideStatusArea();
            this.currentSequence = [];
            this.userSequence = [];
            this.staffModule.clearStaffNotes();
            this.staffModule.clearTonicHighlights();
            this.uiModule.updateFeedback(`Tonic set to ${displayTonic} in ${this.mode} mode. Click "New Sequence" to start.`);
            this.uiModule.setPlayButtonState(true);
        } catch (error) {
            console.error('Error changing tonic:', error);
            this.uiModule.updateFeedback('Error updating tonic. Please try again.', 'incorrect');
        }
    }

    /**
     * Handle mode change
     * @param {Event} e - Change event
     */
    handleModeChange(e) {
        try {
            const selectedMode = e.target.value;
            const previousTonic = this.tonic || this.musicTheory.getDefaultTonicLetter(selectedMode);

            this.mode = selectedMode;
            this.keyboardModule.setMode(this.mode, previousTonic);
            this.tonic = this.keyboardModule.tonicLetter || previousTonic;
            const displayTonic = this.musicTheory.getDisplayTonicName(this.mode, this.tonic);
            this.uiModule.setTonicValue(this.tonic);
            this.keyboardModule.updateKeyboardVisibility();
            this.keyboardModule.positionBlackKeys();
            
            // Hide status area when mode changes
            this.uiModule.hideStatusArea();
            
            // Clear current sequence when mode changes
            this.currentSequence = [];
            this.userSequence = [];
            this.staffModule.clearStaffNotes();
            this.staffModule.clearTonicHighlights();
            this.uiModule.updateFeedback(`Switched to ${this.mode} mode (tonic ${displayTonic}). Click "New Sequence" to start.`);
            this.uiModule.setPlayButtonState(true);
        } catch (error) {
            console.error('Error changing mode:', error);
            this.uiModule.updateFeedback(`Error switching to ${this.mode} mode. Please try again.`, 'incorrect');
        }
    }

    /**
     * Show history modal
     */
    showHistory() {
        this.uiModule.showHistory(
            this.scoringModule.getRoundHistory(),
            () => this.scoringModule.calculateAverageAccuracy(),
            () => this.scoringModule.getBestRound()
        );
    }

    /**
     * Hide history modal
     */
    hideHistory() {
        this.uiModule.hideHistory();
    }

    /**
     * Save data to Google Drive
     */
    async saveToGoogleDrive() {
        try {
            const settings = this.storageModule.getCurrentSettings(
                this.sequenceLength,
                this.scaleType,
                this.mode,
                this.tonic
            );
            const message = await this.storageModule.saveToGoogleDrive(settings);
            this.uiModule.updateFeedback(message, 'correct');
        } catch (error) {
            this.uiModule.updateFeedback(error.message, 'incorrect');
        }
    }

    /**
     * Load data from Google Drive
     */
    async loadFromGoogleDrive() {
        try {
            const result = await this.storageModule.loadFromGoogleDrive();
            if (result.success) {
                // Restore settings
                if (result.data.settings) {
                    this.sequenceLength = result.data.settings.sequenceLength || 3;
                    this.scaleType = result.data.settings.scaleType || 'diatonic';
                    this.mode = result.data.settings.mode || 'ionian';
                    this.tonic = result.data.settings.tonic || this.musicTheory.getDefaultTonicLetter(this.mode);
                    
                    this.uiModule.setFormValues({
                        difficulty: this.sequenceLength,
                        tonic: this.tonic,
                        scaleType: this.scaleType,
                        mode: this.mode
                    });
                    
                    this.keyboardModule.setScaleType(this.scaleType);
                    this.keyboardModule.setMode(this.mode, this.tonic);
                } else {
                    this.uiModule.setTonicValue(this.tonic);
                }
                this.keyboardModule.updateKeyboardVisibility();
                this.keyboardModule.positionBlackKeys();
                
                // Update displays
                this.scoringModule.updateScore();
                this.scoringModule.updateRoundDisplay();
                
                this.uiModule.updateFeedback(result.message, 'correct');
            } else {
                this.uiModule.updateFeedback(result.message, 'feedback');
            }
        } catch (error) {
            this.uiModule.updateFeedback(error.message, 'incorrect');
        }
    }

    /**
     * Utility function to create a delay
     * @param {number} ms - Delay in milliseconds
     * @returns {Promise} Promise that resolves after the delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new MelodicDictation();
});
