(function initStaffPlaybackController(globalScope) {
    function resolveStaffNoteUtils() {
        if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
            try {
                // eslint-disable-next-line global-require
                return require('./StaffNoteUtils.js');
            } catch (error) {
                console.warn('[StaffPlaybackController] Unable to require StaffNoteUtils.', error);
                return null;
            }
        }
        return globalScope?.StaffNoteUtils || null;
    }

    const StaffNoteUtils = resolveStaffNoteUtils();
    if (!StaffNoteUtils) {
        throw new Error('StaffPlaybackController requires StaffNoteUtils. Load js/modules/StaffNoteUtils.js first.');
    }

    const { sortNotesAscending } = StaffNoteUtils;

    function getTimeoutFns() {
        const hasWindow = typeof window !== 'undefined';
        const setFn = hasWindow && typeof window.setTimeout === 'function'
            ? window.setTimeout.bind(window)
            : setTimeout;
        const clearFn = hasWindow && typeof window.clearTimeout === 'function'
            ? window.clearTimeout.bind(window)
            : clearTimeout;
        return { setFn, clearFn };
    }

    function highlightNoteOnStaff(note, duration = 600) {
        if (!note) return;
        this.cancelActiveReplay();
        const entry = {
            note,
            state: 'highlight',
            ...(this.shouldStemless() ? { stemless: true } : {}),
        };
        this.enqueue((display) => display.setHighlight(entry));
        const { clearFn, setFn } = getTimeoutFns();
        if (this.highlightTimeout) {
            clearFn(this.highlightTimeout);
            this.highlightTimeout = null;
        }
        this.highlightTimeout = setFn(() => {
            this.highlightTimeout = null;
            this.enqueue((display) => display.clearHighlight());
        }, Math.max(0, duration));
    }

    function clearTonicHighlights() {
        const { clearFn } = getTimeoutFns();
        if (this.highlightTimeout) {
            clearFn(this.highlightTimeout);
            this.highlightTimeout = null;
        }
        this.enqueue((display) => display.clearHighlight());
    }

    function computeHarmonicDuration(noteCount) {
        if (!Number.isInteger(noteCount) || noteCount <= 0) {
            return { duration: 'w', dots: 0 };
        }
        return { duration: 'w', dots: 0 };
    }

    function compareHarmonicSequences(target, attempt) {
        if (!Array.isArray(target) || !Array.isArray(attempt) || target.length !== attempt.length) {
            return false;
        }
        const counts = new Map();
        const normalize = (note) => (typeof note === 'string' ? note.trim().toUpperCase() : String(note));
        target.forEach((note) => {
            const key = normalize(note);
            counts.set(key, (counts.get(key) || 0) + 1);
        });
        for (let i = 0; i < attempt.length; i += 1) {
            const key = normalize(attempt[i]);
            if (!counts.has(key)) {
                return false;
            }
            const remaining = counts.get(key) - 1;
            if (remaining === 0) {
                counts.delete(key);
            } else {
                counts.set(key, remaining);
            }
        }
        return counts.size === 0;
    }

    function cancelActiveReplay() {
        if (this.activeReplayToken === null) return;
        this.activeReplayToken = null;
        this.enqueue(async (display) => {
            await display.clearHighlight();
            await display.setSequence(this.noteEntries);
        });
    }

    async function replayOnStaff(notes, options = {}) {
        return this.replaySequenceOnStaff(notes, options);
    }

    async function replaySequenceOnStaff(notes, options = {}) {
        const sequence = Array.isArray(notes)
            ? notes.filter((note) => typeof note === 'string' && note)
            : [];
        if (sequence.length === 0) {
            return;
        }
        const {
            noteDuration = 700,
            gapDuration = 180,
            useTemporaryLayout = false,
            dictationMode = this.dictationMode,
        } = options;
        const availableEntries = Array.isArray(this.noteEntries) ? this.noteEntries.length : 0;
        const shouldUseTemporary = useTemporaryLayout || availableEntries === 0;
        const limit = shouldUseTemporary ? sequence.length : Math.min(sequence.length, availableEntries);
        if (limit === 0) return;
        const baseEntries = shouldUseTemporary
            ? sequence.map((note) => ({
                note: this.spell(note),
                state: 'reference',
                duration: '8',
                dots: 0,
                stemless: true,
            }))
            : this.noteEntries.map((entry) => ({ ...entry }));
        this.cancelActiveReplay();
        const replayToken = {};
        this.activeReplayToken = replayToken;

        const delay = (ms) => new Promise((resolve) => {
            const { setFn } = getTimeoutFns();
            const timer = setFn(resolve, Math.max(0, ms));
            if (!timer && ms <= 0) {
                resolve();
            }
        });

        if (dictationMode === 'harmonic') {
            const sortedNotes = sortNotesAscending(sequence.map((n) => this.spell(n)));
            const durationInfo = this.computeHarmonicDuration(sortedNotes.length);
            const chordEntry = {
                note: sortedNotes[0],
                notes: sortedNotes,
                state: 'reference',
                duration: durationInfo.duration,
                dots: durationInfo.dots,
            };
            if (shouldUseTemporary) {
                await this.enqueue((display) => display.setSequence([chordEntry]));
            }
            const highlightEntry = {
                ...chordEntry,
                state: 'highlight',
                stemless: true,
            };
            await this.enqueue((display) => {
                if (shouldUseTemporary) {
                    return display.setSequence([highlightEntry]);
                }
                return display.updateEntry(0, () => highlightEntry);
            });
            await delay(noteDuration);
            if (this.activeReplayToken === replayToken) {
                await this.enqueue((display) => {
                    if (shouldUseTemporary) {
                        return display.setSequence([chordEntry]);
                    }
                    const base = baseEntries[0] ? { ...baseEntries[0] } : chordEntry;
                    return display.updateEntry(0, () => base);
                });
                await delay(gapDuration);
                await this.enqueue(async (display) => {
                    await display.setSequence(this.noteEntries);
                    await display.clearHighlight();
                });
                if (this.activeReplayToken === replayToken) {
                    this.activeReplayToken = null;
                }
            }
            return;
        }

        if (shouldUseTemporary) {
            await this.enqueue((display) => display.setSequence(baseEntries));
        }

        for (let i = 0; i < limit; i += 1) {
            if (this.activeReplayToken !== replayToken) break;

            const targetNote = this.spell(sequence[i]);
            const originalEntry = baseEntries[i];
            if (!targetNote || !originalEntry) continue;

            const highlightEntry = {
                ...originalEntry,
                note: targetNote,
                state: 'highlight',
                stemless: true,
            };
            if (shouldUseTemporary) {
                highlightEntry.duration = '8';
                highlightEntry.dots = 0;
            }

            await this.enqueue((display) => display.updateEntry(i, () => highlightEntry));
            await delay(noteDuration);

            if (this.activeReplayToken !== replayToken) break;

            await this.enqueue((display) => display.updateEntry(i, () => ({ ...originalEntry })));

            if (this.activeReplayToken !== replayToken) break;

            if (i < limit - 1) {
                await delay(gapDuration);
            }
        }

        await this.enqueue(async (display) => {
            await display.setSequence(this.noteEntries);
            await display.clearHighlight();
        });

        if (this.activeReplayToken === replayToken) {
            this.activeReplayToken = null;
        }
    }

    function attachTo(target) {
        if (!target) return;
        const proto = target.prototype || target;
        if (!proto) return;
        proto.highlightNoteOnStaff = highlightNoteOnStaff;
        proto.clearTonicHighlights = clearTonicHighlights;
        proto.computeHarmonicDuration = computeHarmonicDuration;
        proto.compareHarmonicSequences = compareHarmonicSequences;
        proto.cancelActiveReplay = cancelActiveReplay;
        proto.replayOnStaff = replayOnStaff;
        proto.replaySequenceOnStaff = replaySequenceOnStaff;
    }

    const api = { attachTo };
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        globalScope.StaffPlaybackController = api;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
