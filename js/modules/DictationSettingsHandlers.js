(() => {
    const globalScope = typeof window !== 'undefined' ? window : globalThis;

    class DictationSettingsHandlers {
        constructor(appInstance) {
            this.app = appInstance;
        }

        handleDifficultyChange(event) {
            const app = this.app;
            const normalized = app.normalizeSequenceLength(
                event && event.target ? event.target.value : app.sequenceLength,
            );
            app.sequenceLength = normalized;
            if (event && event.target) {
                event.target.value = `${normalized}`;
            }
            if (app.inputMode === 'staff' && app.currentSequence.length === 0 && app.staffInputController) {
                app.staffInputController.setPracticeLimit(app.getPracticeStackLimit());
            } else if (typeof app.trimPracticeSequenceToLimit === 'function' && app.currentSequence.length === 0) {
                app.trimPracticeSequenceToLimit(app.getPracticeStackLimit());
            }
            app.persistSettings();
        }

        handleScaleTypeChange(event) {
            const app = this.app;
            app.scaleType = event && event.target ? event.target.value : app.scaleType;
            app.keyboardModule.setScaleType(app.scaleType);
            app.keyboardModule.updateKeyboardVisibility();
            app.keyboardModule.positionBlackKeys();
            if (typeof app.updateStaffPitchQuantizer === 'function') {
                app.updateStaffPitchQuantizer();
            }
            app.persistSettings();
        }

        handleDictationTypeChange(event) {
            const app = this.app;
            const requestedType = event && event.target ? event.target.value : null;
            app.dictationType = requestedType === 'harmonic' ? 'harmonic' : 'melodic';

            if (typeof app.uiModule.setDictationTypeValue === 'function') {
                app.uiModule.setDictationTypeValue(app.dictationType);
            }
            if (typeof app.staffModule.setDictationMode === 'function') {
                app.staffModule.setDictationMode(app.dictationType);
            }

            app.currentSequence = [];
            app.userSequence = [];
            if (app.staffInputController) {
                app.staffInputController.resetPracticeSequence();
                app.staffInputController.resetAnswerSequence();
                app.staffInputController.setPhase('practice');
                app.staffInputController.setPracticeLimit(app.getPracticeStackLimit());
            } else {
                app.practiceSequence = [];
            }

            app.clearStaffInputTracking({ clearPractice: false, resetStaff: false });
            app.staffPendingSubmission = false;
            app.updateStaffSubmitState();
            app.staffModule.clearStaffNotes();
            app.staffModule.clearTonicHighlights();
            app.uiModule.updateSequenceDisplay([], { dictationType: app.dictationType });
            app.uiModule.updateUserSequenceDisplay([], [], { dictationType: app.dictationType });

            const message = app.dictationType === 'harmonic'
                ? 'Harmonic dictation enabled. Click "Start" to hear the chord.'
                : 'Melodic dictation enabled. Click "Start" to hear the melody.';
            app.uiController.updateFeedback(message);
            app.enterStaffPracticePhase();
            app.persistSettings();
        }

        handleTimbreChange(event) {
            const app = this.app;
            try {
                const requestedTimbre = event && event.target ? event.target.value : null;
                const appliedTimbre = app.audioModule.setTimbre(requestedTimbre);
                app.timbre = appliedTimbre;
                app.uiModule.setTimbreValue(appliedTimbre);

                const timbreLabel = app.audioModule.getTimbreLabel(appliedTimbre);
                if (!app.audioModule.getIsPlaying()) {
                    app.uiController.showStatusArea();
                    app.uiController.updateFeedback(
                        `Timbre set to ${timbreLabel}. Click "Start" to begin.`,
                        'feedback',
                    );
                }
            } catch (error) {
                console.error('Error changing timbre:', error);
                app.uiController.updateFeedback('Error updating timbre. Please try again.', 'incorrect');
            }
            app.persistSettings();
        }

        handleStaffFontChange(event) {
            const app = this.app;
            const selectedFont = event && event.target ? event.target.value : null;
            if (!selectedFont) return;
            app.staffFont = selectedFont;
            app.staffModule.setFontPreference(app.staffFont);
            app.persistSettings();
        }

        handleDisabledKeysStyleChange(event) {
            const app = this.app;
            const requestedStyle = event && event.target ? event.target.value : null;
            app.disabledKeysStyle = requestedStyle === 'invisible' ? 'invisible' : 'hatched';
            app.keyboardModule.setDisabledKeysStyle(app.disabledKeysStyle);
            app.keyboardModule.updateKeyboardVisibility();
            app.persistSettings();
        }

        handleAnswerRevealModeChange(event) {
            const app = this.app;
            const requestedMode = event && event.target ? event.target.value : null;
            app.answerRevealMode = requestedMode === 'skip' ? 'skip' : 'show';
            app.uiModule.setAnswerRevealModeValue(app.answerRevealMode);
            app.persistSettings();
        }

        handleTonicChange(event) {
            const app = this.app;
            try {
                const requestedTonic = event && event.target ? event.target.value : null;
                const canonical = (typeof app.musicTheory.normalizeTonicForMode === 'function')
                    ? app.musicTheory.normalizeTonicForMode(app.mode, requestedTonic)
                    : app.musicTheory.normalizeTonic(requestedTonic);
                app.keyboardModule.setTonic(canonical);
                app.tonic = app.keyboardModule.tonicLetter || canonical || requestedTonic;
                if (!app.availableTonics.includes(app.tonic)) {
                    app.synchronizeTonicOptions();
                }
                const displayTonic = app.musicTheory.getDisplayTonicName(app.mode, app.tonic);
                app.uiModule.setTonicValue(app.tonic);
                app.keyboardModule.updateKeyboardVisibility();
                app.keyboardModule.positionBlackKeys();
                app.syncStaffTonality();

                app.uiController.hideStatusArea();
                app.currentSequence = [];
                app.userSequence = [];
                if (app.staffInputController) {
                    app.staffInputController.resetPracticeSequence();
                    app.staffInputController.resetAnswerSequence();
                    app.staffInputController.setPhase('practice');
                    app.staffInputController.setPracticeLimit(app.getPracticeStackLimit());
                } else {
                    app.practiceSequence = [];
                }
                app.clearStaffInputTracking({ clearPractice: false });
                app.staffPendingSubmission = false;
                app.updateStaffSubmitState();
                app.staffModule.clearStaffNotes();
                app.staffModule.clearTonicHighlights();
                app.uiController.updateFeedback(
                    `Tonic set to ${displayTonic} in ${app.mode} mode. Click "Start" to begin.`,
                );
                app.uiController.setPlayButtonState(true);
                app.enterStaffPracticePhase();
            } catch (error) {
                console.error('Error changing tonic:', error);
                app.uiController.updateFeedback('Error updating tonic. Please try again.', 'incorrect');
            }
            app.persistSettings();
        }

        handleModeChange(event) {
            const app = this.app;
            try {
                const selectedMode = event && event.target ? event.target.value : app.mode;
                app.mode = selectedMode;
                app.synchronizeTonicOptions();
                app.keyboardModule.setMode(app.mode, app.tonic);
                app.tonic = app.keyboardModule.tonicLetter || app.tonic;
                const displayTonic = app.musicTheory.getDisplayTonicName(app.mode, app.tonic);
                app.uiModule.setTonicValue(app.tonic);
                app.keyboardModule.updateKeyboardVisibility();
                app.keyboardModule.positionBlackKeys();
                app.syncStaffTonality();

                app.uiController.hideStatusArea();
                app.currentSequence = [];
                app.userSequence = [];
                if (app.staffInputController) {
                    app.staffInputController.resetPracticeSequence();
                    app.staffInputController.resetAnswerSequence();
                    app.staffInputController.setPhase('practice');
                    app.staffInputController.setPracticeLimit(app.getPracticeStackLimit());
                } else {
                    app.practiceSequence = [];
                }
                app.clearStaffInputTracking({ clearPractice: false });
                app.staffPendingSubmission = false;
                app.updateStaffSubmitState();
                app.staffModule.clearStaffNotes();
                app.staffModule.clearTonicHighlights();
                app.uiController.updateFeedback(
                    `Switched to ${app.mode} mode (tonic ${displayTonic}). Click "Start" to begin.`,
                );
                app.uiController.setPlayButtonState(true);
                app.enterStaffPracticePhase();
            } catch (error) {
                console.error('Error changing mode:', error);
                app.uiController.updateFeedback(`Error switching to ${app.mode} mode. Please try again.`, 'incorrect');
            }
            app.persistSettings();
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = DictationSettingsHandlers;
    } else {
        globalScope.DictationSettingsHandlers = DictationSettingsHandlers;
    }
})();
