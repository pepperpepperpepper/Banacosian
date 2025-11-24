(function initStaffFeedbackController(globalScope) {
    function resolveStaffNoteUtils() {
        if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
            try {
                // eslint-disable-next-line global-require
                return require('./StaffNoteUtils.js');
            } catch (error) {
                console.warn('[StaffFeedbackController] Unable to require StaffNoteUtils.', error);
                return null;
            }
        }
        return globalScope?.StaffNoteUtils || null;
    }

    const StaffNoteUtils = resolveStaffNoteUtils();
    if (!StaffNoteUtils) {
        throw new Error('StaffFeedbackController requires StaffNoteUtils. Load js/modules/StaffNoteUtils.js first.');
    }

    const { sortNotesAscending, estimateMidi } = StaffNoteUtils;

    function normalizeNoteLabel(note) {
        return (typeof note === 'string' && note.trim())
            ? note.trim().toUpperCase()
            : null;
    }

    function updateStaffComparison(currentSequence, userSequence, options = {}) {
        if (!Array.isArray(currentSequence) || currentSequence.length === 0) return;
        const user = Array.isArray(userSequence) ? userSequence : [];
        const mode = options.dictationMode || this.dictationMode;
        if (mode === 'harmonic') {
            if (this.noteEntries.length === 0) return;
            const isCorrect = typeof options.isCorrect === 'boolean'
                ? options.isCorrect
                : this.compareHarmonicSequences(currentSequence, user);

            const normalize = (n) => (typeof n === 'string' ? n.trim().toUpperCase() : String(n).toUpperCase());
            const targetCounts = new Map();
            const targetSpelled = currentSequence.map((n) => this.spell(n));
            targetSpelled.forEach((n) => {
                const key = normalize(n);
                targetCounts.set(key, (targetCounts.get(key) || 0) + 1);
            });
            const existing = this.noteEntries[0] ? { ...this.noteEntries[0] } : null;
            const chordNotes = Array.isArray(existing?.notes) ? existing.notes.slice() : [];
            const perNoteStates = chordNotes.map((n) => {
                const key = normalize(n);
                const remaining = targetCounts.get(key) || 0;
                if (remaining > 0) {
                    targetCounts.set(key, remaining - 1);
                    return 'correct';
                }
                return 'incorrect';
            });

            const entry = {
                ...existing,
                state: isCorrect ? 'correct' : 'incorrect',
                perNoteStates,
            };
            this.noteEntries = [entry];
            this.staffNotes = [{
                notes: chordNotes,
                state: entry.state,
                element: null,
            }];
            this.enqueue((display) => display.setSequence(this.noteEntries));
            return;
        }

        const limit = Math.min(this.noteEntries.length, currentSequence.length);
        for (let i = 0; i < limit; i += 1) {
            if (i < user.length) {
                const entry = this.noteEntries[i];
                if (!entry) continue;
                const isCorrect = user[i] === currentSequence[i];
                const state = isCorrect ? 'correct' : 'incorrect';
                const existingNotes = Array.isArray(entry.notes) && entry.notes.length > 0
                    ? entry.notes.slice(0, 1)
                    : (entry.note ? [entry.note] : []);
                this.noteEntries[i] = {
                    ...entry,
                    state,
                    notes: existingNotes,
                    perNoteStates: existingNotes.length > 0 ? [state] : undefined,
                };
                if (this.staffNotes[i]) {
                    this.staffNotes[i].state = state;
                }
            }
        }
        this.enqueue((display) => display.setSequence(this.noteEntries));
    }

    function showAnswerOverlay(sequence, options = {}) {
        const dictationMode = options.dictationMode || this.dictationMode;
        const userSeq = Array.isArray(options.userSequence) ? options.userSequence : null;
        const notes = Array.isArray(sequence) ? sequence.filter((n) => typeof n === 'string' && n) : [];
        if (notes.length === 0) return;
        if (dictationMode === 'harmonic') {
            const spelledTarget = sortNotesAscending(notes.map((n) => this.spell(n)));
            const userNotes = Array.isArray(this.noteEntries[0]?.notes)
                ? this.noteEntries[0].notes.slice()
                : (Array.isArray(userSeq) ? userSeq.slice() : []);
            const normalize = (n) => (typeof n === 'string' ? this.spell(n).trim().toUpperCase() : String(n).toUpperCase());
            const targetCounts = new Map();
            spelledTarget.forEach((n) => {
                const key = normalize(n);
                targetCounts.set(key, (targetCounts.get(key) || 0) + 1);
            });
            const userCounts = new Map();
            userNotes.map((n) => this.spell(n)).forEach((n) => {
                const key = normalize(n);
                userCounts.set(key, (userCounts.get(key) || 0) + 1);
            });
            const missing = [];
            spelledTarget.forEach((n) => {
                const key = normalize(n);
                const need = targetCounts.get(key) || 0;
                const have = userCounts.get(key) || 0;
                if (have < need) {
                    missing.push(n);
                    userCounts.set(key, have + 1);
                }
            });
            const sorted = sortNotesAscending(missing);
            const durationInfo = this.computeHarmonicDuration(sorted.length);
            const overlay = sorted.length > 0
                ? [{
                    note: sorted[0],
                    notes: sorted,
                    state: 'answer',
                    duration: durationInfo.duration,
                    dots: durationInfo.dots,
                }]
                : [];
            this._lastOverlayEntries = overlay;
            this.enqueue((display) => display.setOverlay(overlay));
            return;
        }
        const spelled = notes.map((n) => this.spell(n));
        const overlay = [];
        const stemless = this.shouldStemless(dictationMode);
        const userEntries = Array.isArray(this.noteEntries) ? this.noteEntries : [];

        for (let i = 0; i < spelled.length; i += 1) {
            const target = spelled[i];
            const normalizedTarget = normalizeNoteLabel(target);
            const entry = userEntries[i];
            const hasUserEntry = Boolean(entry && (entry.note || (Array.isArray(entry.notes) && entry.notes.length > 0)));

            if (entry && hasUserEntry && normalizedTarget) {
                const baseNotes = Array.isArray(entry.notes) && entry.notes.length > 0
                    ? entry.notes.slice()
                    : (entry.note ? [entry.note] : []);
                const perNoteStates = Array.isArray(entry.perNoteStates) && entry.perNoteStates.length === baseNotes.length
                    ? entry.perNoteStates.slice()
                    : baseNotes.map((_, idx) => (idx === 0 ? entry.state || null : entry.state || null));

                const merged = baseNotes.map((note, idx) => {
                    const stateForNote = perNoteStates[idx] || entry.state || null;
                    const isAnswer = String(stateForNote || '').toLowerCase() === 'answer';
                    return {
                        note,
                        normalized: normalizeNoteLabel(note),
                        state: stateForNote,
                        midi: estimateMidi(note),
                        isAnswer,
                    };
                });

                const alreadyHasTarget = merged.some((item) => item.normalized === normalizedTarget);
                if (!alreadyHasTarget && target) {
                    merged.push({
                        note: target,
                        normalized: normalizedTarget,
                        state: 'answer',
                        midi: estimateMidi(target),
                        isAnswer: true,
                    });
                } else if (alreadyHasTarget) {
                    merged.forEach((item) => {
                        if (item.normalized === normalizedTarget) {
                            item.state = 'answer';
                            item.isAnswer = true;
                        }
                    });
                }

                merged.sort((a, b) => {
                    const aAnswer = a.isAnswer ? 1 : 0;
                    const bAnswer = b.isAnswer ? 1 : 0;
                    if (aAnswer !== bAnswer) {
                        return aAnswer - bAnswer; // ensure answer heads draw last (on top)
                    }
                    if (a.midi !== b.midi) {
                        return a.midi - b.midi;
                    }
                    return 0;
                });

                entry.notes = merged.map((item) => item.note);
                entry.note = entry.notes[0] || entry.note;
                entry.perNoteStates = merged.map((item) => item.state || entry.state || null);
                if (stemless) {
                    entry.stemless = true;
                }
                if (Array.isArray(this.staffNotes) && this.staffNotes[i]) {
                    this.staffNotes[i].notes = entry.notes.slice();
                }

                overlay.push({
                    isRest: true,
                    duration: entry.duration || 'q',
                    dots: entry.dots || 0,
                    state: 'answer',
                    style: { fillStyle: 'transparent', strokeStyle: 'transparent' },
                });
            } else {
                overlay.push({
                    note: target,
                    state: 'answer',
                    ...(stemless ? { stemless: true } : {}),
                });
            }
        }

        if (userEntries.length > spelled.length) {
            for (let i = spelled.length; i < userEntries.length; i += 1) {
                overlay.push({
                    isRest: true,
                    duration: userEntries[i]?.duration || 'q',
                    dots: userEntries[i]?.dots || 0,
                    state: 'answer',
                    style: { fillStyle: 'transparent', strokeStyle: 'transparent' },
                });
            }
        }

        this._lastOverlayEntries = overlay;
        this.enqueue(async (display) => {
            if (typeof display.setSequence === 'function') {
                await display.setSequence(this.noteEntries);
            }
            if (typeof display.setOverlay === 'function') {
                await display.setOverlay(overlay);
            }
        });
    }

    function attachTo(target) {
        if (!target) return;
        const proto = target.prototype || target;
        if (!proto) return;
        proto.updateStaffComparison = updateStaffComparison;
        proto.showAnswerOverlay = showAnswerOverlay;
    }

    const api = { attachTo };
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        globalScope.StaffFeedbackController = api;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
