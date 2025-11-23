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
        this.uiModule = new UIModule();
        this.uiController = new DictationUIController({ uiModule: this.uiModule });
        this.keyboardModule = new KeyboardModule(this.musicTheory, this.audioModule);
        this.midiModule = (typeof MidiInputModule !== 'undefined')
            ? new MidiInputModule(this.musicTheory, this.keyboardModule)
            : null;
        this.uiController.setNoteLabelFormatter((note) => this.formatNoteLabel(note));

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
        this.roundPhaseController = new RoundPhaseController({ uiModule: this.uiModule });
        this.audioPreview = new AudioPreviewService({
            audioModule: this.audioModule,
            musicTheory: this.musicTheory,
            roundPhaseController: this.roundPhaseController,
        });
        this.staffInputController = null;

        if (typeof this.keyboardModule.setAudioPreviewService === 'function') {
            const idlePhase = (typeof ROUND_PHASES !== 'undefined' && ROUND_PHASES.IDLE) ? ROUND_PHASES.IDLE : 'idle';
            const awaitInputPhase = (typeof ROUND_PHASES !== 'undefined' && ROUND_PHASES.AWAIT_INPUT)
                ? ROUND_PHASES.AWAIT_INPUT
                : 'await_input';
            this.keyboardModule.setAudioPreviewService(this.audioPreview, {
                enableHover: true,
                playOptions: {
                    phaseGuard: { allowed: [idlePhase, awaitInputPhase] },
                    allowWhilePlaying: false,
                },
                hoverOptions: {
                    phaseGuard: { allowed: [idlePhase] },
                    allowWhilePlaying: false,
                    duration: 0.35,
                },
            });
        }

        this.settingsManager = typeof DictationSettings === 'function'
            ? new DictationSettings({
                store: (typeof window !== 'undefined' ? window.SettingsStore : null),
                defaults: {
                    sequenceLength: this.sequenceLength,
                    scaleType: this.scaleType,
                    dictationType: this.dictationType,
                    mode: this.mode,
                    tonic: this.tonic,
                    timbre: this.timbre,
                    staffFont: this.staffFont,
                    disabledKeysStyle: this.disabledKeysStyle,
                    answerRevealMode: this.answerRevealMode,
                    inputMode: this.inputMode,
                },
                minSequenceLength: MIN_SEQUENCE_LENGTH,
                maxSequenceLength: MAX_SEQUENCE_LENGTH,
                defaultSequenceLength: DEFAULT_SEQUENCE_LENGTH,
            })
            : null;

        if (this.settingsManager) {
            const restoredSettings = this.settingsManager.loadInitialSettings();
            this.applyLoadedSettings(restoredSettings);
        }

        this.storageModule = new StorageModule(this.scoringModule, this.settingsManager);

        this.sequenceLength = this.normalizeSequenceLength(this.sequenceLength);
        this.synchronizeTonicOptions({ updateUI: false });

        this.staffModule.setFontPreference(this.staffFont);
        this.keyboardModule.setDisabledKeysStyle(this.disabledKeysStyle);

        // Initialize keyboard module with current settings (possibly restored)
        this.keyboardModule.setScaleType(this.scaleType);
        this.keyboardModule.setMode(this.mode, this.tonic);

        // Ensure staff spelling and key signature reflect current mode/tonic
        this.syncStaffTonality();

        this.initializeStaffInputController();

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
            this.uiController.updateFeedback('Error initializing application. Please refresh the page.', 'incorrect');
        }
    }

    initializeStaffInputController() {
        if (typeof StaffInputController !== 'function') {
            console.warn('StaffInputController unavailable; staff input mode disabled.');
            return;
        }
        this.staffInputController = new StaffInputController({
            staffModule: this.staffModule,
            getPracticeSequence: () => this.practiceSequence,
            setPracticeSequence: (sequence) => {
                this.practiceSequence = sequence;
                return this.practiceSequence;
            },
            getAnswerSequence: () => this.userSequence,
            setAnswerSequence: (sequence) => {
                this.userSequence = sequence;
                return this.userSequence;
            },
            getPracticeLimit: () => this.getPracticeStackLimit(),
            getAnswerLimit: () => this.getAnswerStackLimit(),
            getContext: () => ({
                targetLength: this.currentSequence.length,
                requiresSubmit: this.inputMode === 'staff' && this.currentSequence.length > 0,
            }),
            previewService: this.audioPreview,
            onPracticeChange: (sequence) => {
                this.uiModule.updateUserSequenceDisplay(sequence, [], { dictationType: this.dictationType });
            },
            onAnswerChange: (sequence, meta = {}) => {
                this.uiModule.updateUserSequenceDisplay(sequence, this.currentSequence, { dictationType: this.dictationType });
                if (!meta.requiresSubmit) {
                    this.tryUpdateStaffComparison(sequence);
                }
            },
            onAnswerReady: (info = {}) => this.handleStaffAnswerReady(info),
            onSubmitStateChange: (pending) => {
                this.staffPendingSubmission = pending;
                this.updateStaffSubmitState();
            },
            onComparisonUpdate: (sequence) => this.tryUpdateStaffComparison(sequence),
            onFeedback: (message) => {
                if (message) {
                    this.uiController.updateFeedback(message);
                }
            },
        });
        this.staffInputController.setPracticeLimit(this.getPracticeStackLimit());
    }

    tryUpdateStaffComparison(sequence) {
        if (!Array.isArray(this.currentSequence) || this.currentSequence.length === 0) {
            return;
        }
        if (!Array.isArray(sequence)) {
            sequence = Array.isArray(this.userSequence) ? this.userSequence : [];
        }
        try {
            this.staffModule.updateStaffComparison(this.currentSequence, sequence, { dictationMode: this.dictationType });
        } catch (error) {
            console.warn('Live staff comparison failed:', error);
        }
    }

    async handleStaffAnswerReady(info = {}) {
        if (info.requiresSubmit) {
            this.staffPendingSubmission = true;
            this.updateStaffSubmitState();
            if (info.message) {
                this.uiController.updateFeedback(info.message);
            }
            return;
        }
        await this.checkSequence();
    }

    enterStaffPracticePhase() {
        if (!this.staffInputController || this.inputMode !== 'staff') return;
        this.staffInputController.setPhase('practice');
        this.staffInputController.resetAnswerSequence();
        this.staffInputController.setPracticeLimit(this.getPracticeStackLimit());
        this.staffPendingSubmission = false;
        this.updateStaffSubmitState();
    }

    applyLoadedSettings(settings = {}) {
        if (!settings || typeof settings !== 'object') {
            return;
        }
        if (settings.sequenceLength != null) {
            this.sequenceLength = this.normalizeSequenceLength(settings.sequenceLength);
        }
        if (settings.scaleType) {
            this.scaleType = settings.scaleType;
        }
        if (settings.dictationType) {
            this.dictationType = settings.dictationType === 'harmonic' ? 'harmonic' : 'melodic';
        }
        if (settings.mode) {
            this.mode = settings.mode;
        }
        if (settings.tonic) {
            this.tonic = settings.tonic;
        }
        if (settings.timbre) {
            try {
                const applied = this.audioModule.setTimbre(settings.timbre);
                if (applied) {
                    this.timbre = applied;
                } else {
                    this.timbre = settings.timbre;
                }
            } catch (error) {
                console.warn('Failed to apply saved timbre:', error);
                this.timbre = settings.timbre;
            }
        }
        if (settings.staffFont) {
            this.staffFont = settings.staffFont;
        }
        if (settings.disabledKeysStyle) {
            this.disabledKeysStyle = settings.disabledKeysStyle === 'invisible' ? 'invisible' : 'hatched';
        }
        if (settings.answerRevealMode) {
            this.answerRevealMode = settings.answerRevealMode === 'skip' ? 'skip' : 'show';
        }
        if (settings.inputMode) {
            this.inputMode = settings.inputMode === 'staff' ? 'staff' : 'keyboard';
        }
    }

    normalizeSequenceLength(rawValue) {
        if (this.settingsManager && typeof this.settingsManager.normalizeSequenceLength === 'function') {
            return this.settingsManager.normalizeSequenceLength(rawValue);
        }
        const parsed = Number.parseInt(rawValue, 10);
        if (!Number.isFinite(parsed)) return DEFAULT_SEQUENCE_LENGTH;
        return Math.min(
            Math.max(parsed, MIN_SEQUENCE_LENGTH),
            MAX_SEQUENCE_LENGTH,
        );
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

    setRoundPhase(nextPhase, options = {}) {
        if (this.roundPhaseController && typeof this.roundPhaseController.setPhase === 'function') {
            this.roundPhaseController.setPhase(nextPhase, options);
        }
    }

    getRoundPhase() {
        if (this.roundPhaseController && typeof this.roundPhaseController.getPhase === 'function') {
            return this.roundPhaseController.getPhase();
        }
        return ROUND_PHASES.IDLE;
    }

    beginNextSequenceCountdown(seconds, onComplete) {
        if (this.roundPhaseController && typeof this.roundPhaseController.beginNextSequenceCountdown === 'function') {
            this.roundPhaseController.beginNextSequenceCountdown(seconds, onComplete);
            return;
        }
        if (typeof onComplete === 'function') {
            onComplete();
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
        this.uiController.bindEventHandlers({
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
        if (typeof this.uiController.setInputModeValue === 'function') {
            this.uiController.setInputModeValue(this.inputMode);
        }
        const staffActive = this.inputMode === 'staff';
        if (typeof this.uiController.setStaffInputActive === 'function') {
            this.uiController.setStaffInputActive(staffActive);
        }
        if (staffActive && this.staffInputController) {
            const phase = this.currentSequence.length > 0 ? 'answer' : 'practice';
            await this.staffInputController.setEnabled(true, {
                midiMin: 36,
                midiMax: 96,
                phase,
            });
            if (phase === 'answer') {
                this.staffInputController.setAnswerLimit(this.getAnswerStackLimit());
            } else {
                this.staffInputController.setPracticeLimit(this.getPracticeStackLimit());
            }
        } else {
            if (this.staffInputController) {
                await this.staffInputController.setEnabled(false);
            } else {
                await this.staffModule.setStaffInputMode({ enabled: false });
            }
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
        if (this.staffInputController) {
            this.staffInputController.resetPracticeSequence();
            this.staffInputController.resetAnswerSequence();
        } else {
            this.practiceSequence = [];
        }
        this.clearStaffInputTracking({ clearPractice: false });
        this.staffModule.clearStaffNotes();
        this.staffModule.clearTonicHighlights();
        this.uiModule.updateUserSequenceDisplay([], this.currentSequence, { dictationType: this.dictationType });
        this.staffPendingSubmission = false;
        this.updateStaffSubmitState();
    }

    clearStaffInputTracking(options = {}) {
        const { clearPractice = false, resetStaff = false } = options;
        if (clearPractice) {
            if (this.staffInputController) {
                this.staffInputController.resetPracticeSequence();
            } else {
                this.practiceSequence = [];
            }
        }
        if (resetStaff) {
            this.staffModule.clearStaffNotes();
            this.staffModule.clearTonicHighlights();
            this.uiModule.updateUserSequenceDisplay([], this.currentSequence, { dictationType: this.dictationType });
        }
    }

    updateStaffSubmitState() {
        if (typeof this.uiController.setStaffSubmitEnabled !== 'function') return;
        const shouldEnable = this.inputMode === 'staff'
            && this.staffPendingSubmission
            && this.currentSequence.length > 0;
        this.uiController.setStaffSubmitEnabled(shouldEnable);
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
            this.uiController.updateFeedback('Enter all notes on the staff before submitting.');
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
        this.uiController.showStatusArea();
        
        // Clear previous staff notes and tonic highlights
        if (typeof this.staffModule.setDictationMode === 'function') {
            this.staffModule.setDictationMode(this.dictationType);
        }
        this.staffModule.clearStaffNotes();
        this.staffModule.clearTonicHighlights();
        if (this.staffInputController) {
            this.staffInputController.resetPracticeSequence();
            this.staffInputController.resetAnswerSequence();
        } else {
            this.practiceSequence = [];
        }
        this.clearStaffInputTracking({ clearPractice: false });
        
        // Start new sequence in scoring module
        this.scoringModule.startNewSequence();
        // Pause timer until all example audio/preview is finished
        try { if (typeof this.scoringModule.pauseSequenceTimer === 'function') this.scoringModule.pauseSequenceTimer(); } catch {}
        
        // Clear sequences
        this.currentSequence = [];
        this.userSequence = [];
        if (this.staffInputController) {
            this.staffInputController.resetPracticeSequence();
            this.staffInputController.resetAnswerSequence();
            if (this.inputMode === 'staff') {
                this.staffInputController.setPhase('answer');
                this.staffInputController.setAnswerLimit(this.sequenceLength);
            }
        } else {
            this.practiceSequence = [];
        }
        this.staffPendingSubmission = false;
        this.updateStaffSubmitState();

        // Choose notes based on current mode/tonic (scaleType only affects keyboard visibility)
        const availableNotes = this.buildSequenceNotePool();
        if (!Array.isArray(availableNotes) || availableNotes.length === 0) {
            console.error('Unable to derive note pool for mode/tonic', { mode: this.mode, tonic: this.tonic });
            this.setRoundPhase(ROUND_PHASES.IDLE, {
                feedback: 'Unable to generate a sequence for this mode/tonic. Please adjust settings.',
                feedbackClass: 'incorrect',
            });
            this.audioModule.setIsPlaying(false);
            this.uiController.setPlayButtonState(false);
            return;
        }
        
        for (let i = 0; i < this.sequenceLength; i++) {
            const randomNote = availableNotes[Math.floor(Math.random() * availableNotes.length)];
            this.currentSequence.push(randomNote);
        }

        if (this.staffInputController && this.inputMode === 'staff') {
            this.staffInputController.setAnswerLimit(this.currentSequence.length);
            this.staffInputController.setPhase('answer');
        }
        
        // Update displays
        this.uiModule.updateSequenceDisplay(this.currentSequence, { dictationType: this.dictationType });
        const scaleText = this.mode ? ` (${this.mode} mode)` : '';
        this.setRoundPhase(ROUND_PHASES.REFERENCE_PROMPT, {
            feedback: `Listen carefully${scaleText}...`,
        });
        this.playSequence();
        this.uiController.setPlayButtonState(false);
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
        this.uiController.setPlayButtonState(true);
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
        
        this.setRoundPhase(ROUND_PHASES.REFERENCE_NOTES, {
            feedback: `Playing reference notes (${tonicName})...`,
        });

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
        this.setRoundPhase(ROUND_PHASES.SEQUENCE_PLAYBACK, { feedback: sequenceLabel });
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
        this.uiController.setPlayButtonState(false);
        // Resume timer after playback so user thinking time is measured
        try { if (typeof this.scoringModule.resumeSequenceTimer === 'function') this.scoringModule.resumeSequenceTimer(); } catch {}
        
        const awaitMessage = this.inputMode === 'staff'
            ? 'Click the staff to enter your answer.'
            : 'Now play it back on the keyboard!';
        if (this.userSequence.length === 0) {
            this.setRoundPhase(ROUND_PHASES.AWAIT_INPUT, { feedback: awaitMessage });
        } else {
            this.setRoundPhase(ROUND_PHASES.AWAIT_INPUT);
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
        const staffIndexMeta = Number.isInteger(options && options.staffIndex)
            ? options.staffIndex
            : null;
        const insertIndexHint = Number.isInteger(options && options.insertIndex)
            ? options.insertIndex
            : null;
        const staffModeActive = this.inputMode === 'staff';
        const isStaffSource = source === 'staff';
        const hasActiveSequence = this.currentSequence.length > 0;
        const isDeleteOperation = operation === 'delete';
        if (!actualNote && !isDeleteOperation && phase !== 'end' && phase !== 'cancel') {
            return;
        }
        if (staffModeActive && !isStaffSource && this.staffInputController) {
            return;
        }

        if (isStaffSource && this.staffInputController) {
            const controllerPhase = this.staffInputController.getPhase();
            if (controllerPhase !== 'practice') {
                if (this.audioModule.getIsPlaying() || !hasActiveSequence) {
                    return;
                }
            }
            const consumed = this.staffInputController.handleStaffInput(actualNote, {
                operation,
                phase,
                staffIndex: staffIndexMeta,
                insertIndex: insertIndexHint,
            });
            if (consumed) {
                return;
            }
        }

        if (staffModeActive && this.staffInputController) {
            return;
        }

        if (this.audioModule.getIsPlaying() || !hasActiveSequence) {
            return;
        }

        if (isDeleteOperation) {
            return;
        }

        const answerLimit = this.getAnswerStackLimit();
        if (this.userSequence.length >= answerLimit) {
            return;
        }

        this.staffModule.showNoteOnStaff(actualNote, {});
        this.userSequence.push(actualNote);
        this.uiModule.updateUserSequenceDisplay(this.userSequence, this.currentSequence, { dictationType: this.dictationType });
        this.tryUpdateStaffComparison(this.userSequence);

        if (this.userSequence.length === this.currentSequence.length) {
            await this.checkSequence();
        } else {
            this.uiController.updateFeedback(`Note ${this.userSequence.length} of ${this.currentSequence.length}`);
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
            this.setRoundPhase(ROUND_PHASES.RESULT_FEEDBACK, {
                feedback: `Perfect! Well done! (${result.sequenceTimeFormatted}) 🎉`,
                feedbackClass: 'correct',
            });
        } else {
            this.setRoundPhase(ROUND_PHASES.RESULT_FEEDBACK, {
                feedback: `Not quite right. Try again! (${result.sequenceTimeFormatted})`,
                feedbackClass: 'incorrect',
            });
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
            this.beginNextSequenceCountdown(result.isCorrect ? 1 : 4, () => {
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
        this.setRoundPhase(ROUND_PHASES.IDLE, {
            feedback: `Round Complete! ${roundResult.accuracy}% accuracy in ${roundResult.duration}. Click "Start" to begin the next round.`,
            feedbackClass: 'correct',
        });
        
        // Reset timer display
        document.getElementById('timer').textContent = '00:00';
        this.enterStaffPracticePhase();
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
            if (this.staffInputController) {
                this.staffInputController.setPracticeLimit(this.getPracticeStackLimit());
            }
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
        if (this.staffInputController) {
            this.staffInputController.resetPracticeSequence();
            this.staffInputController.resetAnswerSequence();
            this.staffInputController.setPhase('practice');
            this.staffInputController.setPracticeLimit(this.getPracticeStackLimit());
        } else {
            this.practiceSequence = [];
        }
        this.clearStaffInputTracking({ clearPractice: false, resetStaff: false });
        this.staffPendingSubmission = false;
        this.updateStaffSubmitState();
        this.staffModule.clearStaffNotes();
        this.staffModule.clearTonicHighlights();
        this.uiModule.updateSequenceDisplay([], { dictationType: this.dictationType });
        this.uiModule.updateUserSequenceDisplay([], [], { dictationType: this.dictationType });
        this.uiController.updateFeedback(
            this.dictationType === 'harmonic'
                ? 'Harmonic dictation enabled. Click "Start" to hear the chord.'
                : 'Melodic dictation enabled. Click "Start" to hear the melody.'
        );
        this.enterStaffPracticePhase();
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
                this.uiController.showStatusArea();
                this.uiController.updateFeedback(`Timbre set to ${timbreLabel}. Click "Start" to begin.`, 'feedback');
            }
        } catch (error) {
            console.error('Error changing timbre:', error);
            this.uiController.updateFeedback('Error updating timbre. Please try again.', 'incorrect');
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

            this.uiController.hideStatusArea();
            this.currentSequence = [];
            this.userSequence = [];
            if (this.staffInputController) {
                this.staffInputController.resetPracticeSequence();
                this.staffInputController.resetAnswerSequence();
                this.staffInputController.setPhase('practice');
                this.staffInputController.setPracticeLimit(this.getPracticeStackLimit());
            } else {
                this.practiceSequence = [];
            }
            this.clearStaffInputTracking({ clearPractice: false });
            this.staffPendingSubmission = false;
            this.updateStaffSubmitState();
            this.staffModule.clearStaffNotes();
            this.staffModule.clearTonicHighlights();
            this.uiController.updateFeedback(`Tonic set to ${displayTonic} in ${this.mode} mode. Click "Start" to begin.`);
            this.uiController.setPlayButtonState(true);
            this.enterStaffPracticePhase();
        } catch (error) {
            console.error('Error changing tonic:', error);
            this.uiController.updateFeedback('Error updating tonic. Please try again.', 'incorrect');
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
            this.uiController.hideStatusArea();
            
            // Clear current sequence when mode changes
            this.currentSequence = [];
            this.userSequence = [];
            if (this.staffInputController) {
                this.staffInputController.resetPracticeSequence();
                this.staffInputController.resetAnswerSequence();
                this.staffInputController.setPhase('practice');
                this.staffInputController.setPracticeLimit(this.getPracticeStackLimit());
            } else {
                this.practiceSequence = [];
            }
            this.clearStaffInputTracking({ clearPractice: false });
            this.staffPendingSubmission = false;
            this.updateStaffSubmitState();
            this.staffModule.clearStaffNotes();
            this.staffModule.clearTonicHighlights();
            this.uiController.updateFeedback(`Switched to ${this.mode} mode (tonic ${displayTonic}). Click "Start" to begin.`);
            this.uiController.setPlayButtonState(true);
            this.enterStaffPracticePhase();
        } catch (error) {
            console.error('Error changing mode:', error);
            this.uiController.updateFeedback(`Error switching to ${this.mode} mode. Please try again.`, 'incorrect');
        }
        this.persistSettings();
    }

    /**
     * Persist current settings to localStorage and store a simple hash
     */
    async persistSettings() {
        if (!this.settingsManager) return;
        await this.settingsManager.persist({
            sequenceLength: this.sequenceLength,
            scaleType: this.scaleType,
            dictationType: this.dictationType,
            mode: this.mode,
            tonic: this.tonic,
            timbre: this.timbre,
            staffFont: this.staffFont,
            disabledKeysStyle: this.disabledKeysStyle,
            answerRevealMode: this.answerRevealMode,
            inputMode: this.inputMode,
        });
    }

    /**
     * Show history modal
     */
    showHistory() {
        this.uiController.showHistory(
            this.scoringModule.getRoundHistory(),
            () => this.scoringModule.calculateAverageAccuracy(),
            () => this.scoringModule.getBestRound()
        );
    }

    /**
     * Hide history modal
     */
    hideHistory() {
        this.uiController.hideHistory();
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
            this.uiController.updateFeedback(message, 'correct');
        } catch (error) {
            this.uiController.updateFeedback(error.message, 'incorrect');
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
                
                this.uiController.updateFeedback(result.message, 'correct');
            } else {
                this.uiController.updateFeedback(result.message, 'feedback');
            }
        } catch (error) {
            this.uiController.updateFeedback(error.message, 'incorrect');
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
