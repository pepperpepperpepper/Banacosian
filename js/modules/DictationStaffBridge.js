(() => {
    const globalScope = typeof window !== 'undefined' ? window : globalThis;

    class DictationStaffBridge {
        constructor(appInstance) {
            this.app = appInstance;
        }

        initialize() {
            const app = this.app;
            const StaffInputController = globalScope.StaffInputController;
            if (typeof StaffInputController !== 'function') {
                console.warn('StaffInputController unavailable; staff input mode disabled.');
                return;
            }
            app.staffInputController = new StaffInputController({
                staffModule: app.staffModule,
                getPracticeSequence: () => app.practiceSequence,
                setPracticeSequence: (sequence) => {
                    app.practiceSequence = sequence;
                    return app.practiceSequence;
                },
                getAnswerSequence: () => app.userSequence,
                setAnswerSequence: (sequence) => {
                    app.userSequence = sequence;
                    return app.userSequence;
                },
                getPracticeLimit: () => this.getPracticeStackLimit(),
                getAnswerLimit: () => this.getAnswerStackLimit(),
                getContext: () => ({
                    targetLength: app.currentSequence.length,
                    requiresSubmit: app.inputMode === 'staff' && app.currentSequence.length > 0,
                    allowAnswerFifo: !app.hasActiveSequence(),
                    allowAnswerPreview: !app.hasActiveSequence(),
                    allowAnswerComparison: !app.hasActiveSequence(),
                }),
                previewService: app.audioPreview,
                onPracticeChange: (sequence) => {
                    app.uiModule.updateUserSequenceDisplay(sequence, [], { dictationType: app.dictationType });
                },
                onAnswerChange: (sequence, meta = {}) => {
                    app.uiModule.updateUserSequenceDisplay(
                        sequence,
                        app.currentSequence,
                        {
                            dictationType: app.dictationType,
                            allowComparison: Boolean(meta?.allowComparison),
                        },
                    );
                    if (!meta.requiresSubmit) {
                        this.tryUpdateStaffComparison(sequence);
                    }
                },
                onAnswerReady: (info = {}) => this.handleStaffAnswerReady(info),
                onSubmitStateChange: (pending) => {
                    app.staffPendingSubmission = pending;
                    this.updateStaffSubmitState();
                },
                onComparisonUpdate: (sequence) => this.tryUpdateStaffComparison(sequence),
                onFeedback: (message) => {
                    if (message) {
                        app.uiController.updateFeedback(message);
                    }
                },
            });
            app.staffInputController.setPracticeLimit(this.getPracticeStackLimit());
        }

        tryUpdateStaffComparison(sequence) {
            const app = this.app;
            if (!Array.isArray(app.currentSequence) || app.currentSequence.length === 0) {
                return;
            }
            const fallbackSequence = Array.isArray(sequence) ? sequence : (app.userSequence || []);
            try {
                app.staffModule.updateStaffComparison(app.currentSequence, fallbackSequence, {
                    dictationMode: app.dictationType,
                });
            } catch (error) {
                console.warn('Live staff comparison failed:', error);
            }
        }

        async handleStaffAnswerReady(info = {}) {
            const app = this.app;
            if (info.requiresSubmit) {
                app.staffPendingSubmission = true;
                this.updateStaffSubmitState();
                if (info.message) {
                    app.uiController.updateFeedback(info.message);
                }
                return;
            }
            await app.checkSequence();
        }

        enterPracticePhase() {
            const app = this.app;
            if (!app.staffInputController || app.inputMode !== 'staff') return;
            app.staffInputController.setPhase('practice');
            app.staffInputController.resetAnswerSequence();
            app.staffInputController.setPracticeLimit(this.getPracticeStackLimit());
            app.staffPendingSubmission = false;
            this.updateStaffSubmitState();
        }

        getPracticeStackLimit() {
            const app = this.app;
            if (app.settingsHandlers && typeof app.settingsHandlers.normalizeSequenceLength === 'function') {
                return app.settingsHandlers.normalizeSequenceLength(app.sequenceLength);
            }
            return 3; // Fallback
        }

        getAnswerStackLimit() {
            const app = this.app;
            const activeLength = app.currentSequence && app.currentSequence.length > 0
                ? app.currentSequence.length
                : null;
            if (Number.isInteger(activeLength) && activeLength > 0) {
                return activeLength;
            }
            return this.getPracticeStackLimit();
        }

        clearStaffInputTracking(options = {}) {
            const app = this.app;
            const { clearPractice = false, resetStaff = false } = options;
            if (clearPractice) {
                if (app.staffInputController) {
                    app.staffInputController.resetPracticeSequence();
                } else {
                    app.practiceSequence = [];
                    if (typeof app.renderPracticePreviewSequence === 'function') {
                        app.renderPracticePreviewSequence([]);
                    }
                }
            }
            if (resetStaff) {
                app.staffModule.clearStaffNotes();
                app.staffModule.clearTonicHighlights();
                if (typeof app.practicePreviewActive === 'boolean') {
                    app.practicePreviewActive = false;
                }
                app.uiModule.updateUserSequenceDisplay([], app.currentSequence, { dictationType: app.dictationType });
            }
        }

        resetUserInputForModeSwitch() {
            const app = this.app;
            if (app.userSequence.length === 0 && app.practiceSequence.length === 0) {
                app.staffPendingSubmission = false;
                this.updateStaffSubmitState();
                return;
            }
            app.userSequence = [];
            if (app.staffInputController) {
                app.staffInputController.resetPracticeSequence();
                app.staffInputController.resetAnswerSequence();
            } else {
                app.practiceSequence = [];
            }
            this.clearStaffInputTracking({ clearPractice: false });
            app.staffModule.clearStaffNotes();
            app.staffModule.clearTonicHighlights();
            app.uiModule.updateUserSequenceDisplay([], app.currentSequence, { dictationType: app.dictationType });
            app.staffPendingSubmission = false;
            this.updateStaffSubmitState();
        }

        updateStaffSubmitState() {
            const app = this.app;
            if (typeof app.uiController.setStaffSubmitEnabled !== 'function') return;
            const shouldEnable = app.inputMode === 'staff'
                && app.staffPendingSubmission
                && app.currentSequence.length > 0;
            app.uiController.setStaffSubmitEnabled(shouldEnable);
        }

        async syncStaffWithUserSequence(options = {}) {
            const app = this.app;
            if (!app || !app.staffModule) return;
            const sequenceSource = Array.isArray(options.sequence)
                ? options.sequence
                : (Array.isArray(app.userSequence) ? app.userSequence : []);
            const sequence = sequenceSource.slice();
            if (typeof app.staffModule.applyInteractionSequence === 'function') {
                try {
                    await app.staffModule.applyInteractionSequence(sequence);
                } catch (error) {
                    console.warn('Failed to sync staff with user sequence:', error);
                }
            } else {
                app.staffModule.clearStaffNotes();
                sequence.forEach((note) => {
                    app.staffModule.showNoteOnStaff(note, { state: null });
                });
            }
            const shouldUpdateComparison = options.updateComparison !== false;
            if (shouldUpdateComparison) {
                this.tryUpdateStaffComparison(sequence);
            }
        }

        /**
         * Keep the staff's key signature and enharmonic spelling aligned with the current mode/tonic.
         */
        syncStaffTonality() {
            const app = this.app;
            try {
                const spellerMode = app.scaleType === 'chromatic' ? 'chromatic' : app.mode;
                const spellerTonic = app.tonic;
                // Configure a speller that maps any incoming note to the display spelling for the active mode/tonic
                app.staffModule.setNoteSpeller((note) => (
                    app.musicTheory.spellNoteForStaff(
                        note,
                        spellerMode,
                        spellerTonic,
                        { preserveExplicitAccidentals: false },
                    )
                ));

                // Choose the key signature to display on the stave. Use the tonic spelling from MusicTheory.
                const keySigMode = app.scaleType === 'chromatic' ? 'chromatic' : app.mode;
                const keySigPreference = app.musicTheory.getKeySignaturePreference(keySigMode, app.tonic);
                let keySig = app.musicTheory.getDisplayTonicName(keySigMode, app.tonic) || 'C';
                if (app.scaleType === 'chromatic' && (!keySig || !/^[A-G][b#]?$/.test(keySig))) {
                    keySig = keySigPreference === 'flat' ? `${app.tonic}b` : `${app.tonic}#`;
                }
                app.staffModule.setKeySignature(keySig);
                if (typeof app.staffModule.setAccidentalPreference === 'function') {
                    app.staffModule.setAccidentalPreference(
                        keySigPreference === 'flat' ? 'flat' : 'sharp',
                    );
                }
                this.updateStaffPitchQuantizer();
            } catch (e) {
                console.warn('Failed to sync staff tonality:', e);
            }
        }

        updateStaffPitchQuantizer() {
            const app = this.app;
            if (!app.staffModule || typeof app.staffModule.setPitchQuantizer !== 'function') {
                return;
            }

            const midiMin = Number.isFinite(app.staffModule?.staffInputState?.midiMin)
                ? app.staffModule.staffInputState.midiMin
                : 36;
            const midiMax = Number.isFinite(app.staffModule?.staffInputState?.midiMax)
                ? app.staffModule.staffInputState.midiMax
                : 96;

            if (!app.musicTheory) {
                if (typeof app.staffModule.setPitchClassConfig === 'function') {
                    app.staffModule.setPitchClassConfig(null);
                }
                if (typeof window !== 'undefined') {
                    window.__EarStaffQuantizerDebug = {
                        active: false,
                        scaleType: app.scaleType,
                        mode: app.mode,
                        tonic: app.tonic,
                        reason: 'no-music-theory',
                        timestamp: Date.now(),
                    };
                }
                return;
            }

            if (app.scaleType === 'chromatic') {
                const chromaticPitchClasses = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
                if (typeof app.staffModule.setPitchClassConfig === 'function') {
                    app.staffModule.setPitchClassConfig({
                        pitchClasses: chromaticPitchClasses,
                        midiMin,
                        midiMax,
                    });
                }
                if (typeof window !== 'undefined') {
                    window.__EarStaffQuantizerDebug = {
                        active: true,
                        scaleType: app.scaleType,
                        mode: app.mode,
                        tonic: app.tonic,
                        pitchClasses: chromaticPitchClasses,
                        timestamp: Date.now(),
                    };
                }
                return;
            }

            let allowedNotes = [];
            try {
                allowedNotes = app.musicTheory.generateDiatonicNotes(app.mode, app.tonic) || [];
            } catch (error) {
                console.warn('Unable to build diatonic notes for staff quantizer:', error);
                allowedNotes = [];
            }
            if (!Array.isArray(allowedNotes) || allowedNotes.length === 0) {
                app.staffModule.setPitchQuantizer(null);
                return;
            }
            const pitchClasses = new Set();
            allowedNotes.forEach((note) => {
                if (!note || typeof note !== 'string') return;
                try {
                    const midi = app.musicTheory.noteToSemitone(note);
                    if (typeof midi === 'number' && Number.isFinite(midi)) {
                        const normalized = ((Math.round(midi) % 12) + 12) % 12;
                        pitchClasses.add(normalized);
                    }
                } catch (error) {
                    console.warn('Unable to convert note for quantizer:', note, error);
                }
            });
            if (pitchClasses.size === 0) {
                if (typeof window !== 'undefined') {
                    window.__EarStaffQuantizerDebug = {
                        active: false,
                        scaleType: app.scaleType,
                        mode: app.mode,
                        tonic: app.tonic,
                        reason: 'noPitchClasses',
                        timestamp: Date.now(),
                    };
                }
                if (typeof app.staffModule.setPitchClassConfig === 'function') {
                    app.staffModule.setPitchClassConfig(null);
                }
                return;
            }
            const pitchClassList = Array.from(pitchClasses);
            if (typeof app.staffModule.setPitchClassConfig === 'function') {
                app.staffModule.setPitchClassConfig({
                    pitchClasses: pitchClassList,
                    midiMin,
                    midiMax,
                });
            }
            if (typeof window !== 'undefined') {
                window.__EarStaffQuantizerDebug = {
                    active: true,
                    scaleType: app.scaleType,
                    mode: app.mode,
                    tonic: app.tonic,
                    pitchClasses: pitchClassList,
                    timestamp: Date.now(),
                };
            }
        }

        /**
         * Convert an internal note identifier to a display label
         * @param {string} note
         * @returns {string}
         */
        formatNoteLabel(note) {
            const app = this.app;
            if (!note || typeof note !== 'string' || note === '?') {
                return note || '';
            }
            return app.musicTheory.getDisplayNoteName(note, app.mode, app.tonic) || note;
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = DictationStaffBridge;
    } else {
        globalScope.DictationStaffBridge = DictationStaffBridge;
    }
})();
