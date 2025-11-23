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

        this.settingsHandlers = (typeof DictationSettingsHandlers === 'function')
            ? new DictationSettingsHandlers(this)
            : null;
        this.sequenceController = (typeof DictationSequenceController === 'function')
            ? new DictationSequenceController(this)
            : null;
        this.staffBridge = (typeof DictationStaffBridge === 'function')
            ? new DictationStaffBridge(this)
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

        if (this.staffBridge && typeof this.staffBridge.initialize === 'function') {
            this.staffBridge.initialize();
        } else {
            console.warn('DictationStaffBridge unavailable; staff input controller not initialized.');
        }

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
        if (this.staffBridge && typeof this.staffBridge.getPracticeStackLimit === 'function') {
            return this.staffBridge.getPracticeStackLimit();
        }
        return this.normalizeSequenceLength(this.sequenceLength);
    }

    getAnswerStackLimit() {
        if (this.staffBridge && typeof this.staffBridge.getAnswerStackLimit === 'function') {
            return this.staffBridge.getAnswerStackLimit();
        }
        const activeLength = this.currentSequence && this.currentSequence.length > 0
            ? this.currentSequence.length
            : null;
        if (Number.isInteger(activeLength) && activeLength > 0) {
            return activeLength;
        }
        return this.getPracticeStackLimit();
    }

    tryUpdateStaffComparison(sequence) {
        if (this.staffBridge && typeof this.staffBridge.tryUpdateStaffComparison === 'function') {
            this.staffBridge.tryUpdateStaffComparison(sequence);
            return;
        }
        console.warn('tryUpdateStaffComparison invoked without DictationStaffBridge');
    }

    enterStaffPracticePhase() {
        if (this.staffBridge && typeof this.staffBridge.enterPracticePhase === 'function') {
            this.staffBridge.enterPracticePhase();
            return;
        }
        console.warn('enterStaffPracticePhase invoked without DictationStaffBridge');
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
        if (this.sequenceController && typeof this.sequenceController.maybeReplayCorrectSequence === 'function') {
            await this.sequenceController.maybeReplayCorrectSequence();
            return;
        }
        console.warn('maybeReplayCorrectSequence invoked without DictationSequenceController');
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
        if (this.staffBridge && typeof this.staffBridge.resetUserInputForModeSwitch === 'function') {
            this.staffBridge.resetUserInputForModeSwitch();
            return;
        }
        this.userSequence = [];
        this.practiceSequence = [];
        this.staffPendingSubmission = false;
        this.updateStaffSubmitState();
    }

    clearStaffInputTracking(options = {}) {
        if (this.staffBridge && typeof this.staffBridge.clearStaffInputTracking === 'function') {
            this.staffBridge.clearStaffInputTracking(options);
            return;
        }
        if (options.resetStaff) {
            this.staffModule.clearStaffNotes();
            this.staffModule.clearTonicHighlights();
        }
    }

    updateStaffSubmitState() {
        if (this.staffBridge && typeof this.staffBridge.updateStaffSubmitState === 'function') {
            this.staffBridge.updateStaffSubmitState();
            return;
        }
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
        if (this.sequenceController && typeof this.sequenceController.generateNewSequence === 'function') {
            this.sequenceController.generateNewSequence();
            return;
        }
        console.warn('generateNewSequence invoked without DictationSequenceController');
    }

    /**
     * Build the note pool used for new sequences based on the selected mode/tonic.
     * Falls back gracefully if cached keyboard data or theory helpers are unavailable.
     * @returns {string[]} ordered list of candidate note names
     */
    buildSequenceNotePool() {
        if (this.sequenceController && typeof this.sequenceController.buildSequenceNotePool === 'function') {
            return this.sequenceController.buildSequenceNotePool();
        }
        console.warn('buildSequenceNotePool invoked without DictationSequenceController');
        return [];
    }

    /**
     * Play the current sequence
     */
    async playSequence() {
        if (this.sequenceController && typeof this.sequenceController.playSequence === 'function') {
            await this.sequenceController.playSequence();
            return;
        }
        console.warn('playSequence invoked without DictationSequenceController');
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
        if (this.sequenceController && typeof this.sequenceController.checkSequence === 'function') {
            await this.sequenceController.checkSequence();
            return;
        }
        console.warn('checkSequence invoked without DictationSequenceController');
    }

    /**
     * Complete the current round
     */
    completeRound() {
        if (this.sequenceController && typeof this.sequenceController.completeRound === 'function') {
            this.sequenceController.completeRound();
            return;
        }
        console.warn('completeRound invoked without DictationSequenceController');
    }

    /**
     * Handle difficulty change
     * @param {Event} e - Change event
     */
    handleDifficultyChange(e) {
        if (this.settingsHandlers && typeof this.settingsHandlers.handleDifficultyChange === 'function') {
            this.settingsHandlers.handleDifficultyChange(e);
            return;
        }
        console.warn('handleDifficultyChange invoked without DictationSettingsHandlers');
    }

    /**
     * Handle scale type change
     * @param {Event} e - Change event
     */
    handleScaleTypeChange(e) {
        if (this.settingsHandlers && typeof this.settingsHandlers.handleScaleTypeChange === 'function') {
            this.settingsHandlers.handleScaleTypeChange(e);
            return;
        }
        console.warn('handleScaleTypeChange invoked without DictationSettingsHandlers');
    }

    /**
     * Handle dictation type change
     * @param {Event} e - Change event
     */
    handleDictationTypeChange(e) {
        if (this.settingsHandlers && typeof this.settingsHandlers.handleDictationTypeChange === 'function') {
            this.settingsHandlers.handleDictationTypeChange(e);
            return;
        }
        console.warn('handleDictationTypeChange invoked without DictationSettingsHandlers');
    }

    /**
     * Handle timbre (sound) change
     * @param {Event} e - Change event
     */
    handleTimbreChange(e) {
        if (this.settingsHandlers && typeof this.settingsHandlers.handleTimbreChange === 'function') {
            this.settingsHandlers.handleTimbreChange(e);
            return;
        }
        console.warn('handleTimbreChange invoked without DictationSettingsHandlers');
    }

    /**
     * Handle staff font change
     * @param {Event} e - Change event
     */
    handleStaffFontChange(e) {
        if (this.settingsHandlers && typeof this.settingsHandlers.handleStaffFontChange === 'function') {
            this.settingsHandlers.handleStaffFontChange(e);
            return;
        }
        console.warn('handleStaffFontChange invoked without DictationSettingsHandlers');
    }

    /**
     * Handle disabled key style change
     * @param {Event} e - Change event
     */
    handleDisabledKeysStyleChange(e) {
        if (this.settingsHandlers && typeof this.settingsHandlers.handleDisabledKeysStyleChange === 'function') {
            this.settingsHandlers.handleDisabledKeysStyleChange(e);
            return;
        }
        console.warn('handleDisabledKeysStyleChange invoked without DictationSettingsHandlers');
    }

    /**
     * Handle answer reveal mode change
     * @param {Event} e - Change event
     */
    handleAnswerRevealModeChange(e) {
        if (this.settingsHandlers && typeof this.settingsHandlers.handleAnswerRevealModeChange === 'function') {
            this.settingsHandlers.handleAnswerRevealModeChange(e);
            return;
        }
        console.warn('handleAnswerRevealModeChange invoked without DictationSettingsHandlers');
    }

    /**
     * Handle tonic change
     * @param {Event} e - Change event
     */
    handleTonicChange(e) {
        if (this.settingsHandlers && typeof this.settingsHandlers.handleTonicChange === 'function') {
            this.settingsHandlers.handleTonicChange(e);
            return;
        }
        console.warn('handleTonicChange invoked without DictationSettingsHandlers');
    }

    /**
     * Handle mode change
     * @param {Event} e - Change event
     */
    handleModeChange(e) {
        if (this.settingsHandlers && typeof this.settingsHandlers.handleModeChange === 'function') {
            this.settingsHandlers.handleModeChange(e);
            return;
        }
        console.warn('handleModeChange invoked without DictationSettingsHandlers');
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
