(() => {
    const globalScope = typeof window !== 'undefined' ? window : globalThis;

    class DictationInputManager {
        constructor(appInstance) {
            this.app = appInstance;
        }

        /**
         * Handle when a note is played on the keyboard or staff
         * @param {string} actualNote - The note that was played
         * @param {object} options - Options like source, operation, phase
         */
        async handleNotePlayed(actualNote, options = {}) {
            const app = this.app;
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
            const staffModeActive = app.inputMode === 'staff';
            const isStaffSource = source === 'staff';
            const hasActiveSequence = app.hasActiveSequence();
            const isDeleteOperation = operation === 'delete';

            if (!actualNote && !isDeleteOperation && phase !== 'end' && phase !== 'cancel') {
                return;
            }

            // 1. Block keyboard input if in staff mode (unless explicitly allowed, which currently isn't)
            if (staffModeActive && !isStaffSource && app.staffInputController) {
                return;
            }

            // 2. Delegate to StaffInputController if source is staff
            if (isStaffSource && app.staffInputController) {
                const controllerPhase = app.staffInputController.getPhase();
                if (controllerPhase !== 'practice') {
                    if (app.audioModule.getIsPlaying() || !hasActiveSequence) {
                        return;
                    }
                }
                const consumed = app.staffInputController.handleStaffInput(actualNote, {
                    operation,
                    phase,
                    staffIndex: staffIndexMeta,
                    insertIndex: insertIndexHint,
                });
                if (consumed) {
                    return;
                }
            }

            // 3. Redundant check? (Was in original code)
            if (staffModeActive && app.staffInputController) {
                return;
            }

            // 4. Handle Idle Practice (no active sequence)
            if (!hasActiveSequence) {
                if (!isDeleteOperation && app.inputMode === 'keyboard' && actualNote) {
                    await this.handleIdleKeyboardPractice(actualNote);
                }
                return;
            }

            // 5. Block if audio is playing
            if (app.audioModule.getIsPlaying()) {
                return;
            }

            // 6. Handle Answer Input
            if (isDeleteOperation) {
                return;
            }

            const answerLimit = app.getAnswerStackLimit();
            if (app.userSequence.length >= answerLimit) {
                return;
            }

            app.staffModule.showNoteOnStaff(actualNote, {});
            app.userSequence.push(actualNote);
            app.uiModule.updateUserSequenceDisplay(app.userSequence, app.currentSequence, { dictationType: app.dictationType });
            app.tryUpdateStaffComparison(app.userSequence);

            if (app.userSequence.length === app.currentSequence.length) {
                await app.checkSequence();
            } else {
                app.uiController.updateFeedback(`Note ${app.userSequence.length} of ${app.currentSequence.length}`);
            }
        }

        async applyInputMode(options = {}) {
            const app = this.app;
            const {
                resetExistingInput = false,
                syncExistingAnswer = true,
            } = options;
            const previousMode = app.lastAppliedInputMode || app.inputMode;
            const modeChanged = previousMode !== app.inputMode;
            if (resetExistingInput && modeChanged) {
                this.resetUserInputForModeSwitch();
            }
            if (typeof app.uiController.setInputModeValue === 'function') {
                app.uiController.setInputModeValue(app.inputMode);
            }
            const staffActive = app.inputMode === 'staff';
            if (typeof app.uiController.setStaffInputActive === 'function') {
                app.uiController.setStaffInputActive(staffActive);
            }
            const hasActiveSequence = app.hasActiveSequence();
            if (staffActive && modeChanged && !hasActiveSequence && Array.isArray(app.practiceSequence) && app.practiceSequence.length > 0) {
                app.practiceSequence = [];
                app.renderPracticePreviewSequence([]);
            }
            if (staffActive && app.staffInputController) {
                const phase = hasActiveSequence ? 'answer' : 'practice';
                await app.staffInputController.setEnabled(true, {
                    midiMin: 36,
                    midiMax: 96,
                    phase,
                });
                if (phase === 'answer') {
                    app.staffInputController.setAnswerLimit(app.getAnswerStackLimit());
                    if (syncExistingAnswer && app.staffBridge && typeof app.staffBridge.syncStaffWithUserSequence === 'function') {
                        await app.staffBridge.syncStaffWithUserSequence();
                    }
                    if (hasActiveSequence && app.currentSequence.length > 0) {
                        const ready = app.userSequence.length >= app.currentSequence.length;
                        app.staffPendingSubmission = ready;
                        if (app.staffBridge) app.staffBridge.updateStaffSubmitState();
                    }
                } else {
                    app.staffInputController.setPracticeLimit(app.getPracticeStackLimit());
                    app.staffPendingSubmission = false;
                    if (app.staffBridge) app.staffBridge.enterPracticePhase();
                }
            } else {
                if (app.staffInputController) {
                    await app.staffInputController.setEnabled(false);
                } else {
                    app.staffModule.setStaffInputMode({ enabled: false });
                }
                app.staffPendingSubmission = false;
                const shouldResetStaffDisplay = !hasActiveSequence || resetExistingInput;
                if (app.staffBridge) {
                    app.staffBridge.clearStaffInputTracking({
                        clearPractice: true,
                        resetStaff: shouldResetStaffDisplay,
                    });
                }
            }
            app.lastAppliedInputMode = app.inputMode;
            if (app.staffBridge) app.staffBridge.updateStaffSubmitState();
        }

        resetUserInputForModeSwitch() {
            const app = this.app;
            if (app.staffBridge && typeof app.staffBridge.resetUserInputForModeSwitch === 'function') {
                app.staffBridge.resetUserInputForModeSwitch();
                return;
            }
            app.userSequence = [];
            app.practiceSequence = [];
            app.staffPendingSubmission = false;
            if (app.staffBridge) app.staffBridge.updateStaffSubmitState();
        }

        async handleInputModeChange(e) {
            const app = this.app;
            const requested = e && e.target && e.target.value === 'staff' ? 'staff' : 'keyboard';
            if (requested === app.inputMode) return;
            app.inputMode = requested;
            const hasActiveSequence = app.hasActiveSequence();
            const shouldReset = !hasActiveSequence
                && app.userSequence.length === 0
                && app.practiceSequence.length === 0;
            await this.applyInputMode({
                resetExistingInput: shouldReset,
                syncExistingAnswer: hasActiveSequence || app.userSequence.length > 0,
            });
            app.persistSettings();
        }

        async handleStaffSubmit() {
            const app = this.app;
            if (app.inputMode !== 'staff') return;
            if (app.audioModule.getIsPlaying()) return;
            const ready = app.currentSequence.length > 0
                && app.userSequence.length === app.currentSequence.length;
            if (!ready) {
                app.uiController.updateFeedback('Enter all notes on the staff before submitting.');
                return;
            }
            app.staffPendingSubmission = false;
            if (app.staffBridge) app.staffBridge.updateStaffSubmitState();
            await app.checkSequence();
        }

        async handleIdleKeyboardPractice(note) {
            const app = this.app;
            if (!note || app.inputMode !== 'keyboard') return;
            const idlePhase = (typeof ROUND_PHASES !== 'undefined' && ROUND_PHASES.IDLE)
                ? ROUND_PHASES.IDLE
                : 'idle';
            const currentPhase = app.getRoundPhase ? app.getRoundPhase() : null;
            if (currentPhase && currentPhase !== idlePhase) {
                return;
            }
            if (app.audioModule && typeof app.audioModule.getIsPlaying === 'function' && app.audioModule.getIsPlaying()) {
                return;
            }
            const limit = app.getPracticeStackLimit();
            if (!Number.isFinite(limit) || limit <= 0) {
                return;
            }
            if (!Array.isArray(app.practiceSequence)) {
                app.practiceSequence = [];
            }
            const sequence = app.practiceSequence.slice();
            if (sequence.length >= limit) {
                sequence.shift();
            }
            sequence.push(note);
            app.practiceSequence = sequence;
            app.renderPracticePreviewSequence(sequence);
            app.uiModule.updateUserSequenceDisplay(sequence, [], { dictationType: app.dictationType });
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = DictationInputManager;
    } else {
        globalScope.DictationInputManager = DictationInputManager;
    }
})();
