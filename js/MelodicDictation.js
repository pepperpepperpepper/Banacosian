/**
 * Main Melodic Dictation Application Class
 * Uses modular components for better organization
 */
const MIN_SEQUENCE_LENGTH = 2;
const MAX_SEQUENCE_LENGTH = 5;
const DEFAULT_SEQUENCE_LENGTH = 3;

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
        this.sequenceLength = DEFAULT_SEQUENCE_LENGTH;
        this.scaleType = 'diatonic';
        this.dictationType = 'melodic';
        this.mode = 'ionian';
        this.tonic = this.musicTheory.getDefaultTonicLetter(this.mode);
        this.staffFont = 'bravura';
        this.disabledKeysStyle = 'hatched';
        this.answerRevealMode = 'show';
        this.inputMode = 'keyboard';
        this.availableTonics = this.musicTheory.getAvailableTonicsForMode
            ? this.musicTheory.getAvailableTonicsForMode(this.mode)
            : this.musicTheory.getAvailableTonics();
        this.availableTimbres = this.audioModule.getAvailableTimbres();
        this.timbre = this.audioModule.getCurrentTimbreId();
        this.autoPlayNext = false;
        this.staffPendingSubmission = false;
        this.lastAppliedInputMode = null;
        this.practiceSequence = [];
        this.activeStaffPointers = new Map();

        // Load saved settings (if any) before configuring modules
        try {
            if (window.SettingsStore && typeof window.SettingsStore.load === 'function') {
                const saved = window.SettingsStore.load();
                if (saved) {
                    if (saved.sequenceLength != null) {
                        this.sequenceLength = this.normalizeSequenceLength(saved.sequenceLength);
                    }
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
                    if (saved.inputMode) {
                        this.inputMode = saved.inputMode === 'staff' ? 'staff' : 'keyboard';
                    }
                }
            }
        } catch (e) {
            console.warn('Failed to load saved settings:', e);
        }

        this.sequenceLength = this.normalizeSequenceLength(this.sequenceLength);
        this.synchronizeTonicOptions({ updateUI: false });

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
            this.synchronizeTonicOptions();
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
                answerRevealMode: this.answerRevealMode,
                inputMode: this.inputMode
            });
            if (typeof this.staffModule.setDictationMode === 'function') {
                this.staffModule.setDictationMode(this.dictationType);
            }
            this.audioModule.setTimbre(this.timbre);
            await this.applyInputMode({ resetExistingInput: false });
            
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

    updateStaffPointerNote(pointerKey, nextNote) {
        if (!pointerKey || !nextNote) return;
        const pointerState = this.activeStaffPointers.get(pointerKey);
        if (!pointerState) return;
        const targetArray = pointerState.array === 'practice'
            ? this.practiceSequence
            : this.userSequence;
        if (!Array.isArray(targetArray)) return;
        if (pointerState.index < 0 || pointerState.index >= targetArray.length) return;
        const existing = targetArray[pointerState.index];
        if (existing === nextNote) return;
        targetArray[pointerState.index] = nextNote;
        if (typeof this.staffModule.updateUserNoteAt === 'function') {
            this.staffModule.updateUserNoteAt(pointerState.staffIndex, nextNote);
        }
        if (pointerState.array === 'practice') {
            this.uiModule.updateUserSequenceDisplay(this.practiceSequence, [], { dictationType: this.dictationType });
        } else {
            this.uiModule.updateUserSequenceDisplay(this.userSequence, this.currentSequence, { dictationType: this.dictationType });
            if (this.inputMode !== 'staff') {
                try {
                    this.staffModule.updateStaffComparison(this.currentSequence, this.userSequence, { dictationMode: this.dictationType });
                } catch (error) {
                    console.warn('Live staff comparison (drag update) failed:', error);
                }
            }
        }
    }

    clampInsertIndex(hint, length) {
        if (!Number.isInteger(hint)) return length;
        if (hint < 0) return 0;
        if (hint > length) return length;
        return hint;
    }

    normalizeSequenceLength(rawValue) {
        const parsed = Number.parseInt(rawValue, 10);
        if (!Number.isFinite(parsed)) return DEFAULT_SEQUENCE_LENGTH;
        return Math.min(
            Math.max(parsed, MIN_SEQUENCE_LENGTH),
            MAX_SEQUENCE_LENGTH,
        );
    }

    shiftPointerTracking(arrayName, startIndex, delta) {
        if (!this.activeStaffPointers || this.activeStaffPointers.size === 0) return;
        this.activeStaffPointers.forEach((state) => {
            if (!state || state.array !== arrayName) return;
            if (Number.isInteger(state.index) && state.index >= startIndex) {
                state.index += delta;
            }
            if (Number.isInteger(state.staffIndex) && state.staffIndex >= startIndex) {
                state.staffIndex += delta;
            }
        });
    }

    getPracticeStackLimit() {
        return this.normalizeSequenceLength(this.sequenceLength);
    }

    getAnswerStackLimit() {
        const activeLength = this.currentSequence && this.currentSequence.length > 0
            ? this.currentSequence.length
            : null;
        if (Number.isInteger(activeLength) && activeLength > 0) {
            return activeLength;
        }
        return this.getPracticeStackLimit();
    }

    trimPracticeSequenceToLimit(limit) {
        if (!Number.isFinite(limit) || limit <= 0) {
            if (this.practiceSequence.length > 0) {
                this.practiceSequence = [];
                if (typeof this.staffModule.clearStaffNotes === 'function') {
                    this.staffModule.clearStaffNotes();
                }
                this.uiModule.updateUserSequenceDisplay([], [], { dictationType: this.dictationType });
            }
            return;
        }
        let trimmed = false;
        while (this.practiceSequence.length > limit) {
            const removeIndex = this.practiceSequence.length - 1;
            this.practiceSequence.pop();
            this.shiftPointerTracking('practice', removeIndex, -1);
            if (typeof this.staffModule.removeNoteAt === 'function') {
                this.staffModule.removeNoteAt(removeIndex);
            }
            trimmed = true;
        }
        if (trimmed) {
            this.uiModule.updateUserSequenceDisplay(this.practiceSequence, [], { dictationType: this.dictationType });
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
     * Ensure tonic options + current selection align with the active mode.
     * @param {{updateUI?:boolean}} options
     */
    synchronizeTonicOptions(options = {}) {
        const { updateUI = true } = options;
        if (typeof this.musicTheory.getAvailableTonicsForMode === 'function') {
            this.availableTonics = this.musicTheory.getAvailableTonicsForMode(this.mode);
        } else {
            this.availableTonics = this.musicTheory.getAvailableTonics();
        }
        const canonical = (typeof this.musicTheory.normalizeTonicForMode === 'function')
            ? this.musicTheory.normalizeTonicForMode(this.mode, this.tonic)
            : this.musicTheory.normalizeTonic(this.tonic);
        this.tonic = canonical || this.tonic || this.musicTheory.getDefaultTonicLetter(this.mode);
        if (!this.availableTonics.includes(this.tonic) && this.availableTonics.length > 0) {
            this.tonic = this.availableTonics[0];
        }
        if (updateUI && this.uiModule && typeof this.uiModule.populateTonicOptions === 'function') {
            this.uiModule.populateTonicOptions(this.availableTonics, this.tonic);
        }
    }

    /**
     * Keep the staff's key signature and enharmonic spelling aligned with the current mode/tonic.
     */
    syncStaffTonality() {
        try {
            // Configure a speller that maps any incoming note to the display spelling for the active mode/tonic
            this.staffModule.setNoteSpeller((note) => (
                this.musicTheory.spellNoteForStaff(note, this.mode, this.tonic)
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
            onAnswerRevealModeChange: (e) => this.handleAnswerRevealModeChange(e),
            onInputModeChange: (e) => this.handleInputModeChange(e),
            onStaffSubmit: () => this.handleStaffSubmit()
        });

        // Setup keyboard event listeners
        this.keyboardModule.setupEventListeners((actualNote) => {
            this.handleNotePlayed(actualNote, { source: 'keyboard' });
        });
    }

    async applyInputMode(options = {}) {
        const { resetExistingInput = false } = options;
        const previousMode = this.lastAppliedInputMode || this.inputMode;
        const modeChanged = previousMode !== this.inputMode;
        if (resetExistingInput && modeChanged) {
            this.resetUserInputForModeSwitch();
        }
        if (typeof this.uiModule.setInputModeValue === 'function') {
            this.uiModule.setInputModeValue(this.inputMode);
        }
        const staffActive = this.inputMode === 'staff';
        if (typeof this.uiModule.setStaffInputActive === 'function') {
            this.uiModule.setStaffInputActive(staffActive);
        }
        if (staffActive) {
            await this.staffModule.setStaffInputMode({
                enabled: true,
                onInput: (note, meta = {}) => this.handleNotePlayed(note, {
                    source: 'staff',
                    phase: meta.phase,
                    pointerId: meta.pointerId,
                    staffIndex: meta.staffIndex,
                    insertIndex: meta.insertIndex,
                    operation: meta.operation,
                    skipStaffUpdate: meta.skipStaffUpdate,
                }),
            });
        } else {
            await this.staffModule.setStaffInputMode({ enabled: false });
            this.staffPendingSubmission = false;
            this.clearStaffInputTracking({ clearPractice: true, resetStaff: true });
        }
        this.lastAppliedInputMode = this.inputMode;
        this.updateStaffSubmitState();
    }

    resetUserInputForModeSwitch() {
        if (this.userSequence.length === 0 && this.practiceSequence.length === 0) {
            this.staffPendingSubmission = false;
            this.updateStaffSubmitState();
            return;
        }
        this.userSequence = [];
        this.practiceSequence = [];
        this.clearStaffInputTracking({ clearPractice: false });
        this.staffModule.clearStaffNotes();
        this.staffModule.clearTonicHighlights();
        this.uiModule.updateUserSequenceDisplay([], this.currentSequence, { dictationType: this.dictationType });
        this.staffPendingSubmission = false;
        this.updateStaffSubmitState();
    }

    clearStaffInputTracking(options = {}) {
        const { clearPractice = false, resetStaff = false } = options;
        if (this.activeStaffPointers && typeof this.activeStaffPointers.clear === 'function') {
            this.activeStaffPointers.clear();
        }
        if (clearPractice) {
            this.practiceSequence = [];
        }
        if (resetStaff) {
            this.staffModule.clearStaffNotes();
            this.staffModule.clearTonicHighlights();
            this.uiModule.updateUserSequenceDisplay([], this.currentSequence, { dictationType: this.dictationType });
        }
    }

    updateStaffSubmitState() {
        if (typeof this.uiModule.setStaffSubmitEnabled !== 'function') return;
        const shouldEnable = this.inputMode === 'staff'
            && this.staffPendingSubmission
            && this.currentSequence.length > 0;
        this.uiModule.setStaffSubmitEnabled(shouldEnable);
    }

    async handleInputModeChange(e) {
        const requested = e && e.target && e.target.value === 'staff' ? 'staff' : 'keyboard';
        if (requested === this.inputMode) return;
        this.inputMode = requested;
        await this.applyInputMode({ resetExistingInput: true });
        this.persistSettings();
    }

    async handleStaffSubmit() {
        if (this.inputMode !== 'staff') return;
        if (this.audioModule.getIsPlaying()) return;
        const ready = this.currentSequence.length > 0
            && this.userSequence.length === this.currentSequence.length;
        if (!ready) {
            this.uiModule.updateFeedback('Enter all notes on the staff before submitting.');
            return;
        }
        this.staffPendingSubmission = false;
        this.updateStaffSubmitState();
        await this.checkSequence();
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
        this.practiceSequence = [];
        this.clearStaffInputTracking();
        
        // Start new sequence in scoring module
        this.scoringModule.startNewSequence();
        // Pause timer until all example audio/preview is finished
        try { if (typeof this.scoringModule.pauseSequenceTimer === 'function') this.scoringModule.pauseSequenceTimer(); } catch {}
        
        // Clear sequences
        this.currentSequence = [];
        this.userSequence = [];
        this.practiceSequence = [];
        this.staffPendingSubmission = false;
        this.updateStaffSubmitState();

        // Choose notes based on current mode/tonic (scaleType only affects keyboard visibility)
        const availableNotes = this.buildSequenceNotePool();
        if (!Array.isArray(availableNotes) || availableNotes.length === 0) {
            console.error('Unable to derive note pool for mode/tonic', { mode: this.mode, tonic: this.tonic });
            this.uiModule.updateFeedback('Unable to generate a sequence for this mode/tonic. Please adjust settings.', 'incorrect');
            this.audioModule.setIsPlaying(false);
            this.uiModule.setPlayButtonState(false);
            return;
        }
        
        for (let i = 0; i < this.sequenceLength; i++) {
            const randomNote = availableNotes[Math.floor(Math.random() * availableNotes.length)];
            this.currentSequence.push(randomNote);
        }
        
        // Update displays
        this.uiModule.updateSequenceDisplay(this.currentSequence, { dictationType: this.dictationType });
        this.playSequence();
        
        const scaleText = this.mode ? ` (${this.mode} mode)` : '';
        this.uiModule.updateFeedback(`Listen carefully${scaleText}...`);
        this.uiModule.setPlayButtonState(false);
    }

    /**
     * Build the note pool used for new sequences based on the selected mode/tonic.
     * Falls back gracefully if cached keyboard data or theory helpers are unavailable.
     * @returns {string[]} ordered list of candidate note names
     */
    buildSequenceNotePool() {
        let notes = [];
        try {
            notes = this.musicTheory.generateDiatonicNotes(this.mode, this.tonic) || [];
        } catch (error) {
            console.warn('Failed to generate diatonic notes from theory module:', error);
            notes = [];
        }

        if (Array.isArray(notes) && notes.length > 0) {
            return notes.slice();
        }

        const keyboardNotes = this.keyboardModule.getDiatonicNotes();
        if (Array.isArray(keyboardNotes) && keyboardNotes.length > 0) {
            return keyboardNotes.slice();
        }

        const fallback = this.musicTheory.getNotes();
        return Array.isArray(fallback) ? fallback.slice() : [];
    }

    /**
     * Play the current sequence
     */
    async playSequence() {
        if (this.audioModule.getIsPlaying()) return;
        
        this.audioModule.setIsPlaying(true);
        this.uiModule.setPlayButtonState(true);
        // Ensure timer is paused while examples play
        try { if (typeof this.scoringModule.pauseSequenceTimer === 'function') this.scoringModule.pauseSequenceTimer(); } catch {}
        
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
        // Resume timer after playback so user thinking time is measured
        try { if (typeof this.scoringModule.resumeSequenceTimer === 'function') this.scoringModule.resumeSequenceTimer(); } catch {}
        
        if (this.userSequence.length === 0) {
            this.uiModule.updateFeedback('Now play it back on the keyboard!');
        }
    }

    /**
     * Handle when a note is played on the keyboard
     * @param {string} actualNote - The note that was played
     */
    async handleNotePlayed(actualNote, options = {}) {
        const source = options && options.source ? options.source : 'keyboard';
        const operation = options && options.operation ? options.operation : null;
        const phase = operation === 'delete'
            ? 'delete'
            : (options && options.phase ? options.phase : 'commit');
        const skipStaffUpdate = Boolean(options && options.skipStaffUpdate);
        const pointerId = options && options.pointerId != null ? options.pointerId : null;
        const pointerKey = (pointerId != null) ? `ptr-${pointerId}` : null;
        const staffIndexMeta = Number.isInteger(options && options.staffIndex)
            ? options.staffIndex
            : null;
        const insertIndexHint = Number.isInteger(options && options.insertIndex)
            ? options.insertIndex
            : null;
        const staffModeActive = this.inputMode === 'staff';
        const isStaffSource = source === 'staff';
        const hasActiveSequence = this.currentSequence.length > 0;
        const isPracticePhase = staffModeActive && isStaffSource && !hasActiveSequence;

        if (staffModeActive && !isStaffSource && !isPracticePhase) {
            return;
        }

        if (!isPracticePhase && (this.audioModule.getIsPlaying() || !hasActiveSequence)) {
            return;
        }

        const isDeleteOperation = operation === 'delete';
        if (!actualNote && !isDeleteOperation && phase !== 'end' && phase !== 'cancel') {
            return;
        }

        if (isStaffSource && pointerKey) {
            if (phase === 'move') {
                this.updateStaffPointerNote(pointerKey, actualNote);
                return;
            }
            if (phase === 'end' || phase === 'cancel') {
                this.activeStaffPointers.delete(pointerKey);
                return;
            }
        }

        if (isPracticePhase) {
            const practiceLimit = this.getPracticeStackLimit();
            this.trimPracticeSequenceToLimit(practiceLimit);
            if (isDeleteOperation && staffIndexMeta != null && staffIndexMeta >= 0 && staffIndexMeta < this.practiceSequence.length) {
                this.practiceSequence.splice(staffIndexMeta, 1);
                this.shiftPointerTracking('practice', staffIndexMeta, -1);
                if (!skipStaffUpdate && typeof this.staffModule.removeNoteAt === 'function') {
                    this.staffModule.removeNoteAt(staffIndexMeta);
                }
                this.uiModule.updateUserSequenceDisplay(this.practiceSequence, [], { dictationType: this.dictationType });
                return;
            }
            if (staffIndexMeta != null && staffIndexMeta >= 0 && staffIndexMeta < this.practiceSequence.length) {
                this.practiceSequence[staffIndexMeta] = actualNote;
                if (!skipStaffUpdate && typeof this.staffModule.updateUserNoteAt === 'function') {
                    this.staffModule.updateUserNoteAt(staffIndexMeta, actualNote);
                }
                this.uiModule.updateUserSequenceDisplay(this.practiceSequence, [], { dictationType: this.dictationType });
                if (pointerKey) {
                    this.activeStaffPointers.set(pointerKey, {
                        array: 'practice',
                        index: staffIndexMeta,
                        staffIndex: staffIndexMeta,
                    });
                }
                return;
            }
            const capacityReached = this.practiceSequence.length >= practiceLimit;
            const targetIndex = this.clampInsertIndex(insertIndexHint, this.practiceSequence.length);
            if (capacityReached) {
                const boundedIndex = Math.min(
                    Number.isInteger(insertIndexHint) ? insertIndexHint : this.practiceSequence.length - 1,
                    practiceLimit - 1,
                );
                const targetSlot = Math.max(0, boundedIndex);
                this.practiceSequence[targetSlot] = actualNote;
                if (!skipStaffUpdate && typeof this.staffModule.updateUserNoteAt === 'function') {
                    this.staffModule.updateUserNoteAt(targetSlot, actualNote);
                }
                this.uiModule.updateUserSequenceDisplay(this.practiceSequence, [], { dictationType: this.dictationType });
                if (pointerKey) {
                    this.activeStaffPointers.set(pointerKey, {
                        array: 'practice',
                        index: targetSlot,
                        staffIndex: targetSlot,
                    });
                }
                return;
            }
            this.shiftPointerTracking('practice', targetIndex, 1);
            this.practiceSequence.splice(targetIndex, 0, actualNote);
            if (!skipStaffUpdate) {
                this.staffModule.showNoteOnStaff(actualNote, { index: targetIndex, isDraft: true, state: null });
            }
            this.uiModule.updateUserSequenceDisplay(this.practiceSequence, [], { dictationType: this.dictationType });
            if (pointerKey) {
                this.activeStaffPointers.set(pointerKey, {
                    array: 'practice',
                    index: targetIndex,
                    staffIndex: targetIndex,
                });
            }
            return;
        }

        const requiresSubmit = staffModeActive && hasActiveSequence;
        const editingExistingAnswer = staffModeActive
            && isStaffSource
            && staffIndexMeta != null
            && staffIndexMeta >= 0
            && staffIndexMeta < this.userSequence.length;
        const allowStackOverride = staffModeActive && isStaffSource;
        const answerLimit = this.getAnswerStackLimit();
        if (isDeleteOperation) {
            if (!staffModeActive || staffIndexMeta == null || staffIndexMeta < 0 || staffIndexMeta >= this.userSequence.length) {
                return;
            }
            this.userSequence.splice(staffIndexMeta, 1);
            this.shiftPointerTracking('answer', staffIndexMeta, -1);
            if (!skipStaffUpdate && typeof this.staffModule.removeNoteAt === 'function') {
                this.staffModule.removeNoteAt(staffIndexMeta);
            }
            this.uiModule.updateUserSequenceDisplay(this.userSequence, this.currentSequence, { dictationType: this.dictationType });
            if (!requiresSubmit) {
                try {
                    this.staffModule.updateStaffComparison(this.currentSequence, this.userSequence, { dictationMode: this.dictationType });
                } catch (error) {
                    console.warn('Live staff comparison (delete) failed:', error);
                }
            }
            return;
        }

        if (editingExistingAnswer) {
            this.userSequence[staffIndexMeta] = actualNote;
            if (!skipStaffUpdate && typeof this.staffModule.updateUserNoteAt === 'function') {
                this.staffModule.updateUserNoteAt(staffIndexMeta, actualNote);
            }
            this.uiModule.updateUserSequenceDisplay(this.userSequence, this.currentSequence, { dictationType: this.dictationType });
            if (!requiresSubmit) {
                try {
                    this.staffModule.updateStaffComparison(this.currentSequence, this.userSequence, { dictationMode: this.dictationType });
                } catch (error) {
                    console.warn('Live staff comparison failed:', error);
                }
            }
            if (pointerKey) {
                this.activeStaffPointers.set(pointerKey, {
                    array: 'answer',
                    index: staffIndexMeta,
                    staffIndex: staffIndexMeta,
                });
            }
            return;
        }

        if (allowStackOverride && this.userSequence.length >= answerLimit) {
            const preferredIndex = Number.isInteger(insertIndexHint)
                ? insertIndexHint
                : (Number.isInteger(staffIndexMeta) ? staffIndexMeta : answerLimit - 1);
            const boundedIndex = Math.min(
                Math.max(0, preferredIndex),
                Math.max(0, answerLimit - 1),
            );
            this.userSequence[boundedIndex] = actualNote;
            if (!skipStaffUpdate && typeof this.staffModule.updateUserNoteAt === 'function') {
                this.staffModule.updateUserNoteAt(boundedIndex, actualNote);
            }
            this.uiModule.updateUserSequenceDisplay(this.userSequence, this.currentSequence, { dictationType: this.dictationType });
            if (!requiresSubmit) {
                try {
                    this.staffModule.updateStaffComparison(this.currentSequence, this.userSequence, { dictationMode: this.dictationType });
                } catch (error) {
                    console.warn('Live staff comparison (override) failed:', error);
                }
            } else {
                this.staffPendingSubmission = true;
                this.updateStaffSubmitState();
                this.uiModule.updateFeedback('Ready to submit your answer.');
            }
            if (pointerKey) {
                this.activeStaffPointers.set(pointerKey, {
                    array: 'answer',
                    index: boundedIndex,
                    staffIndex: boundedIndex,
                });
            }
            return;
        }

        if (requiresSubmit
            && !allowStackOverride
            && this.staffPendingSubmission
            && this.userSequence.length >= answerLimit) {
            this.uiModule.updateFeedback('Submit or clear your answer before adding more notes.');
            return;
        }

        // Show note on staff
        const noteDisplayOptions = {};
        if (staffModeActive) {
            noteDisplayOptions.state = null;
        }
        if (!skipStaffUpdate) {
            this.staffModule.showNoteOnStaff(actualNote, noteDisplayOptions);
        }

        const userIndex = this.userSequence.length;
        this.userSequence.push(actualNote);
        this.uiModule.updateUserSequenceDisplay(this.userSequence, this.currentSequence, { dictationType: this.dictationType });
        // Provide immediate correctness feedback on the staff for the notes entered so far
        if (!requiresSubmit) {
            try {
                this.staffModule.updateStaffComparison(this.currentSequence, this.userSequence, { dictationMode: this.dictationType });
            } catch (e) {
                // Non-fatal: if comparison rendering fails, keep interaction responsive
                console.warn('Live staff comparison failed:', e);
            }
        }

        if (pointerKey && isStaffSource) {
            this.activeStaffPointers.set(pointerKey, {
                array: 'answer',
                index: userIndex,
                staffIndex: userIndex,
            });
        }
        
        if (this.userSequence.length === this.currentSequence.length) {
            if (requiresSubmit) {
                this.staffPendingSubmission = true;
                this.updateStaffSubmitState();
                this.uiModule.updateFeedback('Ready to submit your answer.');
            } else {
                await this.checkSequence();
            }
        } else {
            const progressMessage = `Note ${this.userSequence.length} of ${this.currentSequence.length}`;
            if (requiresSubmit) {
                this.staffPendingSubmission = false;
                this.updateStaffSubmitState();
                this.uiModule.updateFeedback(progressMessage);
            } else {
                this.uiModule.updateFeedback(progressMessage);
            }
        }
    }

    /**
     * Check if the user's sequence matches the target sequence
     */
    async checkSequence() {
        // Stop and record timer immediately at grading
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
        
        // Show comparison (timer is already stopped)
        this.uiModule.showComparison(this.userSequence, this.currentSequence, { dictationType: this.dictationType });
        this.staffModule.updateStaffComparison(this.currentSequence, this.userSequence, {
            dictationMode: this.dictationType,
            isCorrect: result.isCorrect
        });
        // Persistently show the correct answer on the staff in answer color
        // Pause timer while revealing answer, then resume only if it was running (it shouldn't be now).
        const wasRunning = (typeof this.scoringModule.isTimerRunning === 'function') && this.scoringModule.isTimerRunning();
        if (wasRunning && typeof this.scoringModule.pauseSequenceTimer === 'function') {
            this.scoringModule.pauseSequenceTimer();
        }
        try {
            if (this.answerRevealMode === 'show') {
                this.staffModule.showAnswerOverlay(this.currentSequence, { dictationMode: this.dictationType, userSequence: this.userSequence });
            }
        } catch (e) {
            console.warn('Unable to show answer overlay:', e);
        }
        await this.maybeReplayCorrectSequence();
        if (wasRunning && typeof this.scoringModule.resumeSequenceTimer === 'function') {
            this.scoringModule.resumeSequenceTimer();
        }

        this.staffPendingSubmission = false;
        this.updateStaffSubmitState();

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
                this.answerRevealMode,
                this.inputMode
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
        const normalized = this.normalizeSequenceLength(e && e.target ? e.target.value : this.sequenceLength);
        this.sequenceLength = normalized;
        if (e && e.target) {
            e.target.value = `${normalized}`;
        }
        if (this.inputMode === 'staff' && this.currentSequence.length === 0) {
            this.trimPracticeSequenceToLimit(this.getPracticeStackLimit());
        }
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
        this.practiceSequence = [];
        this.clearStaffInputTracking();
        this.staffPendingSubmission = false;
        this.updateStaffSubmitState();
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
            const canonical = (typeof this.musicTheory.normalizeTonicForMode === 'function')
                ? this.musicTheory.normalizeTonicForMode(this.mode, requestedTonic)
                : this.musicTheory.normalizeTonic(requestedTonic);
            this.keyboardModule.setTonic(canonical);
            this.tonic = this.keyboardModule.tonicLetter || canonical || requestedTonic;
            if (!this.availableTonics.includes(this.tonic)) {
                this.synchronizeTonicOptions();
            }
            const displayTonic = this.musicTheory.getDisplayTonicName(this.mode, this.tonic);
            this.uiModule.setTonicValue(this.tonic);
            this.keyboardModule.updateKeyboardVisibility();
            this.keyboardModule.positionBlackKeys();

            // Update staff spelling and key signature for new tonic
            this.syncStaffTonality();

            this.uiModule.hideStatusArea();
            this.currentSequence = [];
            this.userSequence = [];
            this.practiceSequence = [];
            this.clearStaffInputTracking();
            this.staffPendingSubmission = false;
            this.updateStaffSubmitState();
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
            this.mode = selectedMode;
            this.synchronizeTonicOptions();
            this.keyboardModule.setMode(this.mode, this.tonic);
            this.tonic = this.keyboardModule.tonicLetter || this.tonic;
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
            this.practiceSequence = [];
            this.clearStaffInputTracking();
            this.staffPendingSubmission = false;
            this.updateStaffSubmitState();
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
                answerRevealMode: this.answerRevealMode,
                inputMode: this.inputMode
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
                this.answerRevealMode,
                this.inputMode
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
                    this.sequenceLength = this.normalizeSequenceLength(
                        result.data.settings.sequenceLength != null
                            ? result.data.settings.sequenceLength
                            : this.sequenceLength,
                    );
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
                    if (result.data.settings.inputMode) {
                        this.inputMode = result.data.settings.inputMode === 'staff' ? 'staff' : 'keyboard';
                    } else {
                        this.inputMode = 'keyboard';
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
                        answerRevealMode: this.answerRevealMode,
                        inputMode: this.inputMode
                    });
                    await this.applyInputMode({ resetExistingInput: false });
                    
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
