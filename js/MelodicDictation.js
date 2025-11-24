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
        this.practicePreviewActive = false;
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
        this.inputManager = (typeof DictationInputManager === 'function')
            ? new DictationInputManager(this)
            : null;

        // Set formatter now that staffBridge is (potentially) available, or will be when called
        this.uiController.setNoteLabelFormatter((note) => 
            this.staffBridge ? this.staffBridge.formatNoteLabel(note) : note
        );

        if (this.settingsManager && this.settingsHandlers) {
            const restoredSettings = this.settingsManager.loadInitialSettings();
            this.settingsHandlers.applyLoadedSettings(restoredSettings);
        }

        this.storageModule = new StorageModule(this.scoringModule, this.settingsManager);

        if (this.settingsHandlers) {
            this.sequenceLength = this.settingsHandlers.normalizeSequenceLength(this.sequenceLength);
        }
        this.synchronizeTonicOptions({ updateUI: false });

        this.staffModule.setFontPreference(this.staffFont);
        this.keyboardModule.setDisabledKeysStyle(this.disabledKeysStyle);

        // Initialize keyboard module with current settings (possibly restored)
        this.keyboardModule.setScaleType(this.scaleType);
        this.keyboardModule.setMode(this.mode, this.tonic);

        // Ensure staff spelling and key signature reflect current mode/tonic
        if (this.staffBridge) {
            this.staffBridge.syncStaffTonality();
        }

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
            if (this.staffBridge) {
                this.staffBridge.syncStaffTonality();
            }
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
            if (this.inputManager) {
                await this.inputManager.applyInputMode({ resetExistingInput: false });
            }
            
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

    hasActiveSequence() {
        return Array.isArray(this.currentSequence) && this.currentSequence.length > 0;
    }

    getPracticeStackLimit() {
        if (this.staffBridge && typeof this.staffBridge.getPracticeStackLimit === 'function') {
            return this.staffBridge.getPracticeStackLimit();
        }
        return this.settingsHandlers ? this.settingsHandlers.normalizeSequenceLength(this.sequenceLength) : 3;
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

    renderPracticePreviewSequence(sequence) {
        const entries = Array.isArray(sequence) ? sequence : [];
        const hasNotes = entries.length > 0;
        if (!this.staffModule) {
            this.practicePreviewActive = hasNotes;
            return;
        }
        if (hasNotes) {
            this.practicePreviewActive = true;
            if (typeof this.staffModule.applyInteractionSequence === 'function') {
                const maybePromise = this.staffModule.applyInteractionSequence(entries.slice());
                if (maybePromise && typeof maybePromise.catch === 'function') {
                    maybePromise.catch((error) => console.warn('Practice preview render failed:', error));
                }
            } else {
                this.staffModule.clearStaffNotes();
                entries.forEach((note) => this.staffModule.showNoteOnStaff(note, { state: null }));
            }
            return;
        }
        if (!this.practicePreviewActive) {
            return;
        }
        this.practicePreviewActive = false;
        if (!this.hasActiveSequence()) {
            this.staffModule.clearStaffNotes();
            this.staffModule.clearTonicHighlights();
        }
    }

    trimPracticeSequenceToLimit(limit) {
        const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0;
        if (!Array.isArray(this.practiceSequence)) {
            this.practiceSequence = [];
        }
        if (cap === 0) {
            if (this.practiceSequence.length > 0) {
                this.practiceSequence = [];
                this.renderPracticePreviewSequence([]);
                this.uiModule.updateUserSequenceDisplay([], [], { dictationType: this.dictationType });
            }
            return;
        }
        if (this.practiceSequence.length > cap) {
            this.practiceSequence = this.practiceSequence.slice(-cap);
            this.renderPracticePreviewSequence(this.practiceSequence);
            this.uiModule.updateUserSequenceDisplay(this.practiceSequence, [], { dictationType: this.dictationType });
        }
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
     * Setup all event listeners
     */
    setupEventListeners() {
        // Global audio unlock to ensure context resumes on first interaction
        const unlockAudio = async () => {
            if (this.audioModule && this.audioModule.audioContext) {
                if (this.audioModule.audioContext.state === 'suspended') {
                    try {
                        this.audioModule.audioContext.resume();
                    } catch (e) {
                        console.warn('Audio resume failed', e);
                    }
                }
                if (this.audioModule.audioContext.state === 'running') {
                    document.removeEventListener('click', unlockAudio);
                    document.removeEventListener('keydown', unlockAudio);
                    document.removeEventListener('touchstart', unlockAudio);
                    document.removeEventListener('mousedown', unlockAudio);
                    // Remove the capture listener as well
                    document.removeEventListener('pointerdown', unlockAudio, { capture: true });
                }
            }
        };
        document.addEventListener('click', unlockAudio);
        document.addEventListener('keydown', unlockAudio);
        document.addEventListener('touchstart', unlockAudio);
        document.addEventListener('mousedown', unlockAudio);
        // Ensure unlock runs before any component prevents default mouse events
        document.addEventListener('pointerdown', unlockAudio, { capture: true });

        // Ensure AudioContext is closed on reload/unload/background to prevent artifacts
        const handleAudioCleanup = () => {
            if (this.audioModule) {
                this.audioModule.reset();
            }
        };
        window.addEventListener('beforeunload', handleAudioCleanup);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                handleAudioCleanup();
                if (this.keyboardModule && typeof this.keyboardModule.reset === 'function') {
                    this.keyboardModule.reset();
                }
            }
        });

        // Setup UI event listeners
        this.uiController.bindEventHandlers({
            onNewSequence: () => this.sequenceController.generateNewSequence(),
            onPlaySequence: () => this.sequenceController.playSequence(),
            onShowHistory: () => this.uiController.showHistory(
                this.scoringModule.getRoundHistory(),
                () => this.scoringModule.calculateAverageAccuracy(),
                () => this.scoringModule.getBestRound()
            ),
            onHideHistory: () => this.uiController.hideHistory(),
            onSaveData: () => this.saveToGoogleDrive(),
            onLoadData: () => this.loadFromGoogleDrive(),
            onDifficultyChange: (e) => this.settingsHandlers.handleDifficultyChange(e),
            onTonicChange: (e) => this.settingsHandlers.handleTonicChange(e),
            onScaleTypeChange: (e) => this.settingsHandlers.handleScaleTypeChange(e),
            onDictationTypeChange: (e) => this.settingsHandlers.handleDictationTypeChange(e),
            onModeChange: (e) => this.settingsHandlers.handleModeChange(e),
            onTimbreChange: (e) => this.settingsHandlers.handleTimbreChange(e),
            onStaffFontChange: (e) => this.settingsHandlers.handleStaffFontChange(e),
            onDisabledKeysStyleChange: (e) => this.settingsHandlers.handleDisabledKeysStyleChange(e),
            onAnswerRevealModeChange: (e) => this.settingsHandlers.handleAnswerRevealModeChange(e),
            onInputModeChange: (e) => this.inputManager.handleInputModeChange(e),
            onStaffSubmit: () => this.inputManager.handleStaffSubmit()
        });

        // Setup keyboard event listeners
        this.keyboardModule.setupEventListeners((actualNote) => {
            if (this.inputManager) {
                this.inputManager.handleNotePlayed(actualNote, { source: 'keyboard' });
            }
        });
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
                if (result.data.settings && this.settingsHandlers) {
                    this.settingsHandlers.applyLoadedSettings(result.data.settings);
                    // Use inputManager for mode apply
                    if (this.inputManager) {
                        await this.inputManager.applyInputMode({ resetExistingInput: false });
                    }
                    
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

// Initialize the app when DOM is ready (handles scripts injected after DOMContentLoaded)
function initializeMelodicDictation() {
    new MelodicDictation();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeMelodicDictation);
} else {
    initializeMelodicDictation();
}
