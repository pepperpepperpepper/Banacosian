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
        this.midiModule = (typeof MidiInputModule !== 'undefined')
            ? new MidiInputModule(this.musicTheory, this.keyboardModule)
            : null;
        this.uiModule.setNoteLabelFormatter((note) => this.formatNoteLabel(note));

        // Application state
        this.currentSequence = [];
        this.userSequence = [];
        this.sequenceLength = 3;
        this.scaleType = 'diatonic';
        this.mode = 'ionian';
        this.tonic = this.musicTheory.getDefaultTonicLetter(this.mode);
        this.staffFont = 'bravura';
        this.disabledKeysStyle = 'hatched';
        this.availableTonics = this.musicTheory.getAvailableTonics();
        this.availableTimbres = this.audioModule.getAvailableTimbres();
        this.timbre = this.audioModule.getCurrentTimbreId();
        this.autoPlayNext = false;

        // Load saved settings (if any) before configuring modules
        try {
            if (window.SettingsStore && typeof window.SettingsStore.load === 'function') {
                const saved = window.SettingsStore.load();
                if (saved) {
                    if (saved.sequenceLength != null) this.sequenceLength = parseInt(saved.sequenceLength);
                    if (saved.scaleType) this.scaleType = saved.scaleType;
                    if (saved.mode) this.mode = saved.mode;
                    if (saved.tonic) this.tonic = saved.tonic;
                    if (saved.timbre) this.timbre = this.audioModule.setTimbre(saved.timbre);
                    if (saved.staffFont) this.staffFont = saved.staffFont;
                    if (saved.disabledKeysStyle) {
                        this.disabledKeysStyle = saved.disabledKeysStyle === 'invisible' ? 'invisible' : 'hatched';
                    }
                }
            }
        } catch (e) {
            console.warn('Failed to load saved settings:', e);
        }

        this.staffModule.setFontPreference(this.staffFont);
        this.keyboardModule.setDisabledKeysStyle(this.disabledKeysStyle);

        // Initialize keyboard module with current settings (possibly restored)
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
            this.uiModule.populateTimbreOptions(this.availableTimbres, this.timbre);
            let staffFontOptions = [];
            try {
                const fontsModule = await import('/js/modules/StaffFonts.js');
                if (typeof fontsModule.listFontOptions === 'function') {
                    staffFontOptions = fontsModule.listFontOptions();
                }
                if ((!this.staffFont || this.staffFont === '') && fontsModule.DEFAULT_FONT_ID) {
                    this.staffFont = fontsModule.DEFAULT_FONT_ID;
                }
            } catch (fontError) {
                console.warn('Unable to load staff font options:', fontError);
            }
            if (staffFontOptions.length > 0) {
                this.uiModule.populateStaffFontOptions(staffFontOptions, this.staffFont);
            } else {
                this.uiModule.setStaffFontValue(this.staffFont);
            }
            this.staffModule.setFontPreference(this.staffFont);
            // Reflect restored settings in the UI controls
            this.uiModule.setFormValues({
                difficulty: this.sequenceLength,
                tonic: this.tonic,
                scaleType: this.scaleType,
                mode: this.mode,
                timbre: this.timbre,
                staffFont: this.staffFont,
                disabledKeysStyle: this.disabledKeysStyle
            });
            this.audioModule.setTimbre(this.timbre);
            
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
            
            // Start MIDI input if available
            if (this.midiModule) {
                const midiInfo = await this.midiModule.start();
                if (midiInfo && midiInfo.supported) {
                    console.log('[MIDI] Ready', this.midiModule.listInputs());
                }
            }

        } catch (error) {
            console.error('Error during initialization:', error);
            this.uiModule.updateFeedback('Error initializing application. Please refresh the page.', 'incorrect');
        }
    }

    /**
     * Convert an internal note identifier to a display label
     * @param {string} note
     * @returns {string}
     */
    formatNoteLabel(note) {
        if (!note || typeof note !== 'string' || note === '?') {
            return note || '';
        }
        return this.musicTheory.getDisplayNoteName(note, this.mode, this.tonic) || note;
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
            onModeChange: (e) => this.handleModeChange(e),
            onTimbreChange: (e) => this.handleTimbreChange(e),
            onStaffFontChange: (e) => this.handleStaffFontChange(e),
            onDisabledKeysStyleChange: (e) => this.handleDisabledKeysStyleChange(e)
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
            this.storageModule.getCurrentSettings(
                this.sequenceLength,
                this.scaleType,
                this.mode,
                this.tonic,
                this.timbre,
                this.staffFont,
                this.disabledKeysStyle
            )
        );
        
        // Show completion message
        this.uiModule.updateFeedback(
            `Round Complete! ${roundResult.accuracy}% accuracy in ${roundResult.duration}. Click "Start" to begin the next round.`,
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
        this.persistSettings();
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
        this.persistSettings();
    }

    /**
     * Handle timbre (sound) change
     * @param {Event} e - Change event
     */
    handleTimbreChange(e) {
        try {
            const requestedTimbre = e && e.target ? e.target.value : null;
            const appliedTimbre = this.audioModule.setTimbre(requestedTimbre);
            this.timbre = appliedTimbre;
            this.uiModule.setTimbreValue(appliedTimbre);

            const timbreLabel = this.audioModule.getTimbreLabel(appliedTimbre);
            if (!this.audioModule.getIsPlaying()) {
                this.uiModule.showStatusArea();
                this.uiModule.updateFeedback(`Timbre set to ${timbreLabel}. Click "Start" to begin.`, 'feedback');
            }
        } catch (error) {
            console.error('Error changing timbre:', error);
            this.uiModule.updateFeedback('Error updating timbre. Please try again.', 'incorrect');
        }
        this.persistSettings();
    }

    /**
     * Handle staff font change
     * @param {Event} e - Change event
     */
    handleStaffFontChange(e) {
        const selectedFont = e && e.target ? e.target.value : null;
        if (!selectedFont) return;
        this.staffFont = selectedFont;
        this.staffModule.setFontPreference(this.staffFont);
        this.persistSettings();
    }

    /**
     * Handle disabled key style change
     * @param {Event} e - Change event
     */
    handleDisabledKeysStyleChange(e) {
        const requestedStyle = e && e.target ? e.target.value : null;
        this.disabledKeysStyle = requestedStyle === 'invisible' ? 'invisible' : 'hatched';
        this.keyboardModule.setDisabledKeysStyle(this.disabledKeysStyle);
        this.keyboardModule.updateKeyboardVisibility();
        this.persistSettings();
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
            this.uiModule.updateFeedback(`Tonic set to ${displayTonic} in ${this.mode} mode. Click "Start" to begin.`);
            this.uiModule.setPlayButtonState(true);
        } catch (error) {
            console.error('Error changing tonic:', error);
            this.uiModule.updateFeedback('Error updating tonic. Please try again.', 'incorrect');
        }
        this.persistSettings();
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
            this.uiModule.updateFeedback(`Switched to ${this.mode} mode (tonic ${displayTonic}). Click "Start" to begin.`);
            this.uiModule.setPlayButtonState(true);
        } catch (error) {
            console.error('Error changing mode:', error);
            this.uiModule.updateFeedback(`Error switching to ${this.mode} mode. Please try again.`, 'incorrect');
        }
        this.persistSettings();
    }

    /**
     * Persist current settings to localStorage and store a simple hash
     */
    async persistSettings() {
        try {
            const settings = {
                sequenceLength: this.sequenceLength,
                scaleType: this.scaleType,
                mode: this.mode,
                tonic: this.tonic,
                timbre: this.timbre,
                staffFont: this.staffFont,
                disabledKeysStyle: this.disabledKeysStyle
            };
            if (window.SettingsStore && typeof window.SettingsStore.save === 'function') {
                window.SettingsStore.save(settings);
                if (typeof window.SettingsStore.sha256Hex === 'function') {
                    const hex = await window.SettingsStore.sha256Hex(JSON.stringify(settings));
                    if (hex) window.SettingsStore.setHash(hex);
                }
            }
        } catch (err) {
            console.warn('Persist settings failed:', err);
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
                this.tonic,
                this.timbre,
                this.staffFont,
                this.disabledKeysStyle
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
                    this.timbre = result.data.settings.timbre || this.audioModule.getCurrentTimbreId();
                    this.staffFont = result.data.settings.staffFont || this.staffFont || 'bravura';
                    if (result.data.settings.disabledKeysStyle) {
                        this.disabledKeysStyle = result.data.settings.disabledKeysStyle === 'invisible' ? 'invisible' : 'hatched';
                    } else {
                        this.disabledKeysStyle = 'hatched';
                    }
                    
                    this.uiModule.setFormValues({
                        difficulty: this.sequenceLength,
                        tonic: this.tonic,
                        scaleType: this.scaleType,
                        mode: this.mode,
                        timbre: this.timbre,
                        staffFont: this.staffFont,
                        disabledKeysStyle: this.disabledKeysStyle
                    });
                    
                    this.keyboardModule.setScaleType(this.scaleType);
                    this.keyboardModule.setMode(this.mode, this.tonic);
                } else {
                    this.uiModule.setTonicValue(this.tonic);
                }
                this.keyboardModule.setDisabledKeysStyle(this.disabledKeysStyle);
                this.keyboardModule.updateKeyboardVisibility();
                this.keyboardModule.positionBlackKeys();
                this.audioModule.setTimbre(this.timbre);
                this.staffModule.setFontPreference(this.staffFont);
                
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
