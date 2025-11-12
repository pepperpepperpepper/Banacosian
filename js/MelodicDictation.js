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
        this.dictationType = 'melodic';
        this.mode = 'ionian';
        this.tonic = this.musicTheory.getDefaultTonicLetter(this.mode);
        this.staffFont = 'bravura';
        this.disabledKeysStyle = 'hatched';
        this.answerRevealMode = 'show';
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
                    if (saved.dictationType) {
                        this.dictationType = saved.dictationType === 'harmonic' ? 'harmonic' : 'melodic';
                    }
                    if (saved.mode) this.mode = saved.mode;
                    if (saved.tonic) this.tonic = saved.tonic;
                    if (saved.timbre) this.timbre = this.audioModule.setTimbre(saved.timbre);
                    if (saved.staffFont) this.staffFont = saved.staffFont;
                    if (saved.disabledKeysStyle) {
                        this.disabledKeysStyle = saved.disabledKeysStyle === 'invisible' ? 'invisible' : 'hatched';
                    }
                    if (saved.answerRevealMode) {
                        this.answerRevealMode = saved.answerRevealMode === 'skip' ? 'skip' : 'show';
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

        // Ensure staff spelling and key signature reflect current mode/tonic
        this.syncStaffTonality();

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
            // Re-sync staff tonality after fonts/options load
            this.syncStaffTonality();
            // Reflect restored settings in the UI controls
            this.uiModule.setFormValues({
                difficulty: this.sequenceLength,
                tonic: this.tonic,
                scaleType: this.scaleType,
                dictationType: this.dictationType,
                mode: this.mode,
                timbre: this.timbre,
                staffFont: this.staffFont,
                disabledKeysStyle: this.disabledKeysStyle,
                answerRevealMode: this.answerRevealMode
            });
            if (typeof this.staffModule.setDictationMode === 'function') {
                this.staffModule.setDictationMode(this.dictationType);
            }
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
     * Optionally replay the correct sequence on the staff
     */
    async maybeReplayCorrectSequence() {
        if (this.answerRevealMode !== 'show') return;
        if (!Array.isArray(this.currentSequence) || this.currentSequence.length === 0) return;
        try {
            await this.staffModule.replaySequenceOnStaff(this.currentSequence, {
                dictationMode: this.dictationType
            });
        } catch (error) {
            console.warn('Unable to replay correct sequence on staff:', error);
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
     * Keep the staff's key signature and enharmonic spelling aligned with the current mode/tonic.
     */
    syncStaffTonality() {
        try {
            // Configure a speller that maps any incoming note to the display spelling for the active mode/tonic
            this.staffModule.setNoteSpeller((note) => (
                this.musicTheory.getDisplayNoteLabel(note, this.mode, this.tonic, { includeOctave: true })
            ));

            // Choose the key signature to display on the stave. Use the tonic spelling from MusicTheory.
            const keySig = this.musicTheory.getDisplayTonicName(this.mode, this.tonic) || 'C';
            this.staffModule.setKeySignature(keySig);
        } catch (e) {
            console.warn('Failed to sync staff tonality:', e);
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
            onDictationTypeChange: (e) => this.handleDictationTypeChange(e),
            onModeChange: (e) => this.handleModeChange(e),
            onTimbreChange: (e) => this.handleTimbreChange(e),
            onStaffFontChange: (e) => this.handleStaffFontChange(e),
            onDisabledKeysStyleChange: (e) => this.handleDisabledKeysStyleChange(e),
            onAnswerRevealModeChange: (e) => this.handleAnswerRevealModeChange(e)
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
        if (typeof this.staffModule.setDictationMode === 'function') {
            this.staffModule.setDictationMode(this.dictationType);
        }
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
        this.uiModule.updateSequenceDisplay(this.currentSequence, { dictationType: this.dictationType });
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

        const referenceNotes = [tonic1, tonic2, tonic1];
        let referencePreviewPromise = Promise.resolve();
        try {
            referencePreviewPromise = this.staffModule.replaySequenceOnStaff(
                referenceNotes,
                {
                    noteDuration: 300,
                    gapDuration: 0,
                    useTemporaryLayout: true,
                    dictationMode: 'melodic'
                }
            );
        } catch (previewError) {
            console.warn('Unable to start reference staff preview:', previewError);
            referencePreviewPromise = Promise.resolve();
        }
        for (let i = 0; i < referenceNotes.length; i += 1) {
            const refNote = referenceNotes[i];
            await this.audioModule.playTone(this.musicTheory.getNoteFrequency(refNote), 0.6);
            if (i < referenceNotes.length - 1) {
                await this.delay(300);
            }
        }

        await this.delay(800); // Longer pause before sequence
        try {
            await referencePreviewPromise;
        } catch (previewError) {
            console.warn('Reference staff preview failed:', previewError);
        }
        
        const sequenceLabel = this.dictationType === 'harmonic' ? 'Now the harmony...' : 'Now the sequence...';
        this.uiModule.updateFeedback(sequenceLabel);
        await this.delay(500);
        
        // Then play the actual sequence
        const melodicNoteDurationSeconds = 0.6;
        const melodicNoteSpacingMs = 700;
        if (this.dictationType === 'harmonic') {
            this.uiModule.highlightChord();
            const frequencies = this.currentSequence
                .map((note) => this.musicTheory.getNoteFrequency(note))
                .filter((freq) => typeof freq === 'number' && Number.isFinite(freq));
            if (frequencies.length > 0) {
                const sequenceLength = this.currentSequence.length;
                const chordDurationSeconds = melodicNoteDurationSeconds * sequenceLength;
                const chordSpacingMs = melodicNoteSpacingMs * sequenceLength;
                await this.audioModule.playChord(frequencies, chordDurationSeconds);
                await this.delay(chordSpacingMs);
            } else {
                await this.delay(melodicNoteSpacingMs);
            }
        } else {
            for (let i = 0; i < this.currentSequence.length; i++) {
                const note = this.currentSequence[i];
                
                // Highlight current note
                this.uiModule.highlightPlayingNote(i);
                
                console.log('Playing note:', note, 'Frequency:', this.musicTheory.getNoteFrequency(note), 'Has frequency:', note in this.musicTheory.noteFrequencies);
                await this.audioModule.playTone(this.musicTheory.getNoteFrequency(note), melodicNoteDurationSeconds);
                await this.delay(melodicNoteSpacingMs); // Gap between notes
            }
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
        this.uiModule.updateUserSequenceDisplay(this.userSequence, this.currentSequence, { dictationType: this.dictationType });
        
        // Check if sequence is complete
        if (this.userSequence.length === this.currentSequence.length) {
            await this.checkSequence();
        } else {
            this.uiModule.updateFeedback(
                `Note ${this.userSequence.length} of ${this.currentSequence.length}`
            );
        }
    }

    /**
     * Check if the user's sequence matches the target sequence
     */
    async checkSequence() {
        const result = this.scoringModule.checkSequence(
            this.userSequence,
            this.currentSequence,
            { dictationType: this.dictationType }
        );
        
        if (result.isCorrect) {
            this.uiModule.updateFeedback(`Perfect! Well done! (${result.sequenceTimeFormatted}) 🎉`, 'correct');
        } else {
            this.uiModule.updateFeedback(`Not quite right. Try again! (${result.sequenceTimeFormatted})`, 'incorrect');
        }
        
        // Update displays
        this.scoringModule.updateScore();
        this.scoringModule.updateRoundDisplay();
        
        // Show comparison
        this.uiModule.showComparison(this.userSequence, this.currentSequence, { dictationType: this.dictationType });
        this.staffModule.updateStaffComparison(this.currentSequence, this.userSequence, {
            dictationMode: this.dictationType,
            isCorrect: result.isCorrect
        });

        await this.maybeReplayCorrectSequence();
        
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
            this.dictationType,
            this.sequenceLength
        );
        
        // Auto-save to Google Drive
        this.storageModule.autoSaveToGoogleDrive(
            this.storageModule.getCurrentSettings(
                this.sequenceLength,
                this.scaleType,
                this.dictationType,
                this.mode,
                this.tonic,
                this.timbre,
                this.staffFont,
                this.disabledKeysStyle,
                this.answerRevealMode
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
     * Handle dictation type change
     * @param {Event} e - Change event
     */
    handleDictationTypeChange(e) {
        const requestedType = e && e.target ? e.target.value : null;
        this.dictationType = requestedType === 'harmonic' ? 'harmonic' : 'melodic';
        if (typeof this.uiModule.setDictationTypeValue === 'function') {
            this.uiModule.setDictationTypeValue(this.dictationType);
        }
        if (typeof this.staffModule.setDictationMode === 'function') {
            this.staffModule.setDictationMode(this.dictationType);
        }
        this.currentSequence = [];
        this.userSequence = [];
        this.staffModule.clearStaffNotes();
        this.staffModule.clearTonicHighlights();
        this.uiModule.updateSequenceDisplay([], { dictationType: this.dictationType });
        this.uiModule.updateUserSequenceDisplay([], [], { dictationType: this.dictationType });
        this.uiModule.updateFeedback(
            this.dictationType === 'harmonic'
                ? 'Harmonic dictation enabled. Click "Start" to hear the chord.'
                : 'Melodic dictation enabled. Click "Start" to hear the melody.'
        );
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
     * Handle answer reveal mode change
     * @param {Event} e - Change event
     */
    handleAnswerRevealModeChange(e) {
        const requestedMode = e && e.target ? e.target.value : null;
        this.answerRevealMode = requestedMode === 'skip' ? 'skip' : 'show';
        this.uiModule.setAnswerRevealModeValue(this.answerRevealMode);
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

            // Update staff spelling and key signature for new tonic
            this.syncStaffTonality();

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
            // Update staff spelling and key signature when mode changes
            this.syncStaffTonality();
            
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
                dictationType: this.dictationType,
                mode: this.mode,
                tonic: this.tonic,
                timbre: this.timbre,
                staffFont: this.staffFont,
                disabledKeysStyle: this.disabledKeysStyle,
                answerRevealMode: this.answerRevealMode
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
                this.dictationType,
                this.mode,
                this.tonic,
                this.timbre,
                this.staffFont,
                this.disabledKeysStyle,
                this.answerRevealMode
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
                    if (result.data.settings.dictationType) {
                        this.dictationType = result.data.settings.dictationType === 'harmonic' ? 'harmonic' : 'melodic';
                    } else {
                        this.dictationType = 'melodic';
                    }
                    if (result.data.settings.disabledKeysStyle) {
                        this.disabledKeysStyle = result.data.settings.disabledKeysStyle === 'invisible' ? 'invisible' : 'hatched';
                    } else {
                        this.disabledKeysStyle = 'hatched';
                    }
                    if (result.data.settings.answerRevealMode) {
                        this.answerRevealMode = result.data.settings.answerRevealMode === 'skip' ? 'skip' : 'show';
                    } else {
                        this.answerRevealMode = 'show';
                    }
                    
                    this.uiModule.setFormValues({
                        difficulty: this.sequenceLength,
                        tonic: this.tonic,
                        scaleType: this.scaleType,
                        dictationType: this.dictationType,
                        mode: this.mode,
                        timbre: this.timbre,
                        staffFont: this.staffFont,
                        disabledKeysStyle: this.disabledKeysStyle,
                        answerRevealMode: this.answerRevealMode
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
                if (typeof this.staffModule.setDictationMode === 'function') {
                    this.staffModule.setDictationMode(this.dictationType);
                }
                
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
