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

    const { sortNotesAscending } = StaffNoteUtils;

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
                const isCorrect = user[i] === currentSequence[i];
                this.noteEntries[i] = {
                    ...this.noteEntries[i],
                    state: isCorrect ? 'correct' : 'incorrect'
                };
                if (this.staffNotes[i]) {
                    this.staffNotes[i].state = isCorrect ? 'correct' : 'incorrect';
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
        const userSpelled = Array.isArray(userSeq) && userSeq.length === spelled.length
            ? userSeq.map((n) => this.spell(n))
            : (this.noteEntries.length === spelled.length ? this.noteEntries.map((e) => e?.note || '?') : null);
        const overlay = [];
        const stemless = this.shouldStemless(dictationMode);
        for (let i = 0; i < spelled.length; i += 1) {
            const target = spelled[i];
            const userNote = Array.isArray(userSpelled) ? userSpelled[i] : null;
            if (userNote && userNote === target) {
                overlay.push({
                    isRest: true,
                    duration: 'q',
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
        this._lastOverlayEntries = overlay;
        this.enqueue((display) => display.setOverlay(overlay));
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
