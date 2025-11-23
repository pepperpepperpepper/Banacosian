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
                }),
                previewService: app.audioPreview,
                onPracticeChange: (sequence) => {
                    app.uiModule.updateUserSequenceDisplay(sequence, [], { dictationType: app.dictationType });
                },
                onAnswerChange: (sequence, meta = {}) => {
                    app.uiModule.updateUserSequenceDisplay(
                        sequence,
                        app.currentSequence,
                        { dictationType: app.dictationType },
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
            return app.normalizeSequenceLength(app.sequenceLength);
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
                }
            }
            if (resetStaff) {
                app.staffModule.clearStaffNotes();
                app.staffModule.clearTonicHighlights();
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
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = DictationStaffBridge;
    } else {
        globalScope.DictationStaffBridge = DictationStaffBridge;
    }
})();
