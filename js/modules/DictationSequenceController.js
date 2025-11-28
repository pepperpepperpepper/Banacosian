(() => {
    const globalScope = typeof window !== 'undefined' ? window : globalThis;

    class DictationSequenceController {
        constructor(appInstance) {
            this.app = appInstance;
        }

        generateNewSequence() {
            const app = this.app;
            app.uiController.showStatusArea();
            if (typeof app.staffModule.setDictationMode === 'function') {
                app.staffModule.setDictationMode(app.dictationType);
            }
            app.staffModule.clearStaffNotes();
            app.staffModule.clearTonicHighlights();
            if (app.staffInputController) {
                app.staffInputController.resetPracticeSequence();
                app.staffInputController.resetAnswerSequence();
            } else {
                app.practiceSequence = [];
            }
            app.clearStaffInputTracking({ clearPractice: false });

            app.scoringModule.startNewSequence();
            try { if (typeof app.scoringModule.pauseSequenceTimer === 'function') app.scoringModule.pauseSequenceTimer(); } catch {}

            app.currentSequence = [];
            app.userSequence = [];
            if (app.staffInputController) {
                app.staffInputController.resetPracticeSequence();
                app.staffInputController.resetAnswerSequence();
                if (app.inputMode === 'staff') {
                    app.staffInputController.setPhase('answer');
                    app.staffInputController.setAnswerLimit(app.sequenceLength);
                }
            } else {
                app.practiceSequence = [];
            }
            app.staffPendingSubmission = false;
            app.updateStaffSubmitState();

            const availableNotes = this.buildSequenceNotePool();
            if (!Array.isArray(availableNotes) || availableNotes.length === 0) {
                console.error('Unable to derive note pool for mode/tonic', { mode: app.mode, tonic: app.tonic });
                app.setRoundPhase(ROUND_PHASES.IDLE, {
                    feedback: 'Unable to generate a sequence for this mode/tonic. Please adjust settings.',
                    feedbackClass: 'incorrect',
                });
                app.audioModule.setIsPlaying(false);
                app.uiController.setPlayButtonState(false);
                return;
            }

            // Build a sequence that never repeats the same note back-to-back
            let lastNote = null;
            for (let i = 0; i < app.sequenceLength; i += 1) {
                let candidate = null;
                if (availableNotes.length > 1 && lastNote != null) {
                    // Try random picks until different from lastNote, with a bounded number of attempts
                    let attempts = 0;
                    do {
                        candidate = availableNotes[Math.floor(Math.random() * availableNotes.length)];
                        attempts += 1;
                    } while (candidate === lastNote && attempts < 24);
                    if (candidate === lastNote) {
                        // Deterministic fallback to the first different note in the pool
                        const idx = availableNotes.findIndex((n) => n !== lastNote);
                        candidate = idx >= 0 ? availableNotes[idx] : lastNote;
                    }
                } else {
                    candidate = availableNotes[Math.floor(Math.random() * availableNotes.length)];
                }
                app.currentSequence.push(candidate);
                lastNote = candidate;
            }

            if (app.staffInputController && app.inputMode === 'staff') {
                app.staffInputController.setAnswerLimit(app.currentSequence.length);
                app.staffInputController.setPhase('answer');
            }

            app.uiModule.updateSequenceDisplay(app.currentSequence, { dictationType: app.dictationType });
            const scaleText = app.mode ? ` (${app.mode} mode)` : '';
            app.setRoundPhase(ROUND_PHASES.REFERENCE_PROMPT, {
                feedback: `Listen carefully${scaleText}...`,
            });
            this.playSequence();
            app.uiController.setPlayButtonState(false);
        }

        buildSequenceNotePool() {
            const app = this.app;
            let notes = [];
            try {
                notes = app.musicTheory.generateDiatonicNotes(app.mode, app.tonic) || [];
            } catch (error) {
                console.warn('Failed to generate diatonic notes from theory module:', error);
                notes = [];
            }

            if (Array.isArray(notes) && notes.length > 0) {
                return notes.slice();
            }

            const keyboardNotes = app.keyboardModule.getDiatonicNotes();
            if (Array.isArray(keyboardNotes) && keyboardNotes.length > 0) {
                return keyboardNotes.slice();
            }

            const fallback = app.musicTheory.getNotes();
            return Array.isArray(fallback) ? fallback.slice() : [];
        }

        async playSequence() {
            const app = this.app;
            if (app.audioModule.getIsPlaying()) return;

            app.audioModule.setIsPlaying(true);
            app.uiController.setPlayButtonState(true);
            try { if (typeof app.scoringModule.pauseSequenceTimer === 'function') app.scoringModule.pauseSequenceTimer(); } catch {}

            const currentRange = app.musicTheory.getModeRange(app.mode, app.tonic);
            if (!currentRange || !currentRange.whiteKeys || currentRange.whiteKeys.length === 0) {
                console.error('Invalid mode range for', app.mode);
                return;
            }

            const tonicName = app.musicTheory.getDisplayTonicName(app.mode, app.tonic) || app.tonic || 'C';
            let tonic1 = currentRange.tonicNote || currentRange.whiteKeys[0];
            if (!tonic1 && Array.isArray(currentRange.whiteKeys) && currentRange.whiteKeys.length > 0) {
                tonic1 = currentRange.whiteKeys[0];
            }

            let tonic2;
            const tonicSemitone = app.musicTheory.noteToSemitone(tonic1);
            if (Number.isFinite(tonicSemitone)) {
                const matchingWhiteKey = (currentRange.whiteKeys || []).find((note) => {
                    const midi = app.musicTheory.noteToSemitone(note);
                    return Number.isFinite(midi) && Math.abs((midi - tonicSemitone) - 12) < 0.001;
                });
                if (matchingWhiteKey) {
                    tonic2 = matchingWhiteKey;
                } else {
                    const octaveCandidate = app.musicTheory.transposeNoteBySemitones(tonic1, 12);
                    if (octaveCandidate && app.musicTheory.getNoteFrequency(octaveCandidate)) {
                        tonic2 = octaveCandidate;
                    }
                }
            }

            if (!tonic2) {
                tonic2 = (currentRange.whiteKeys && currentRange.whiteKeys[1]) || tonic1;
            }

            app.setRoundPhase(ROUND_PHASES.REFERENCE_NOTES, {
                feedback: `Playing reference notes (${tonicName})...`,
            });

            const referenceNotes = [tonic1, tonic2, tonic1];
            let referencePreviewPromise = Promise.resolve();
            try {
                referencePreviewPromise = app.staffModule.replaySequenceOnStaff(
                    referenceNotes,
                    {
                        noteDuration: 300,
                        gapDuration: 0,
                        useTemporaryLayout: true,
                        dictationMode: 'melodic',
                    },
                );
            } catch (previewError) {
                console.warn('Unable to start reference staff preview:', previewError);
                referencePreviewPromise = Promise.resolve();
            }

            for (let i = 0; i < referenceNotes.length; i += 1) {
                const refNote = referenceNotes[i];
                await app.audioModule.playTone(app.musicTheory.getNoteFrequency(refNote), 0.6);
                if (i < referenceNotes.length - 1) {
                    await app.delay(300);
                }
            }

            await app.delay(800);
            try {
                await referencePreviewPromise;
            } catch (previewError) {
                console.warn('Reference staff preview failed:', previewError);
            }

            const sequenceLabel = app.dictationType === 'harmonic' ? 'Now the harmony...' : 'Now the sequence...';
            app.setRoundPhase(ROUND_PHASES.SEQUENCE_PLAYBACK, { feedback: sequenceLabel });
            await app.delay(500);

            const melodicNoteDurationSeconds = 0.6;
            const melodicNoteSpacingMs = 700;
            if (app.dictationType === 'harmonic') {
                app.uiModule.highlightChord();
                const frequencies = app.currentSequence
                    .map((note) => app.musicTheory.getNoteFrequency(note))
                    .filter((freq) => typeof freq === 'number' && Number.isFinite(freq));
                if (frequencies.length > 0) {
                    const sequenceLength = app.currentSequence.length;
                    const chordDurationSeconds = melodicNoteDurationSeconds * sequenceLength;
                    const chordSpacingMs = melodicNoteSpacingMs * sequenceLength;
                    await app.audioModule.playChord(frequencies, chordDurationSeconds);
                    await app.delay(chordSpacingMs);
                } else {
                    await app.delay(melodicNoteSpacingMs);
                }
            } else {
                for (let i = 0; i < app.currentSequence.length; i += 1) {
                    const note = app.currentSequence[i];
                    app.uiModule.highlightPlayingNote(i);
                    console.log(
                        'Playing note:',
                        note,
                        'Frequency:',
                        app.musicTheory.getNoteFrequency(note),
                        'Has frequency:',
                        note in app.musicTheory.noteFrequencies,
                    );
                    await app.audioModule.playTone(app.musicTheory.getNoteFrequency(note), melodicNoteDurationSeconds);
                    await app.delay(melodicNoteSpacingMs);
                }
            }

            app.uiModule.removePlayingHighlights();
            app.audioModule.setIsPlaying(false);
            app.uiController.setPlayButtonState(false);
            try { if (typeof app.scoringModule.resumeSequenceTimer === 'function') app.scoringModule.resumeSequenceTimer(); } catch {}

            const awaitMessage = app.inputMode === 'staff'
                ? 'Click the staff to enter your answer.'
                : 'Now play it back on the keyboard!';
            if (app.userSequence.length === 0) {
                app.setRoundPhase(ROUND_PHASES.AWAIT_INPUT, { feedback: awaitMessage });
            } else {
                app.setRoundPhase(ROUND_PHASES.AWAIT_INPUT);
            }
        }

        async maybeReplayCorrectSequence() {
            const app = this.app;
            if (app.answerRevealMode !== 'show') return;
            if (!Array.isArray(app.currentSequence) || app.currentSequence.length === 0) return;
            try {
                await app.staffModule.replaySequenceOnStaff(app.currentSequence, {
                    dictationMode: app.dictationType,
                });
            } catch (error) {
                console.warn('Unable to replay correct sequence on staff:', error);
            }
        }

        async checkSequence() {
            const app = this.app;
            const result = app.scoringModule.checkSequence(
                app.userSequence,
                app.currentSequence,
                { dictationType: app.dictationType },
            );

            if (result.isCorrect) {
                app.setRoundPhase(ROUND_PHASES.RESULT_FEEDBACK, {
                    feedback: `Perfect! Well done! (${result.sequenceTimeFormatted}) 🎉`,
                    feedbackClass: 'correct',
                });
            } else {
                app.setRoundPhase(ROUND_PHASES.RESULT_FEEDBACK, {
                    feedback: `Not quite right. Try again! (${result.sequenceTimeFormatted})`,
                    feedbackClass: 'incorrect',
                });
            }

            app.scoringModule.updateScore();
            app.scoringModule.updateRoundDisplay();

            app.uiModule.showComparison(app.userSequence, app.currentSequence, { dictationType: app.dictationType });
            app.staffModule.updateStaffComparison(app.currentSequence, app.userSequence, {
                dictationMode: app.dictationType,
                isCorrect: result.isCorrect,
            });
            const wasRunning = (typeof app.scoringModule.isTimerRunning === 'function') && app.scoringModule.isTimerRunning();
            if (wasRunning && typeof app.scoringModule.pauseSequenceTimer === 'function') {
                app.scoringModule.pauseSequenceTimer();
            }
            try {
                if (app.answerRevealMode === 'show') {
                    app.staffModule.showAnswerOverlay(app.currentSequence, {
                        dictationMode: app.dictationType,
                        userSequence: app.userSequence,
                    });
                }
            } catch (error) {
                console.warn('Unable to show answer overlay:', error);
            }
            await this.maybeReplayCorrectSequence();
            if (wasRunning && typeof app.scoringModule.resumeSequenceTimer === 'function') {
                app.scoringModule.resumeSequenceTimer();
            }

            app.staffPendingSubmission = false;
            app.updateStaffSubmitState();

            if (app.scoringModule.isRoundComplete()) {
                this.completeRound();
            } else {
                app.beginNextSequenceCountdown(result.isCorrect ? 1 : 4, () => {
                    this.generateNewSequence();
                });
            }
        }

        completeRound() {
            const app = this.app;
            const roundResult = app.scoringModule.completeRound(
                app.scaleType,
                app.mode,
                app.dictationType,
                app.sequenceLength,
            );

            app.storageModule.autoSaveToGoogleDrive(
                app.storageModule.getCurrentSettings(
                    app.sequenceLength,
                    app.scaleType,
                    app.dictationType,
                    app.mode,
                    app.tonic,
                    app.timbre,
                    app.staffFont,
                    app.disabledKeysStyle,
                    app.answerRevealMode,
                    app.inputMode,
                ),
            );

            app.setRoundPhase(ROUND_PHASES.IDLE, {
                feedback: `Round Complete! ${roundResult.accuracy}% accuracy in ${roundResult.duration}. Click "Start" to begin the next round.`,
                feedbackClass: 'correct',
            });

            const timerEl = globalScope.document ? globalScope.document.getElementById('timer') : null;
            if (timerEl) {
                timerEl.textContent = '00:00';
            }
            app.enterStaffPracticePhase();
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = DictationSequenceController;
    } else {
        globalScope.DictationSequenceController = DictationSequenceController;
    }
})();
