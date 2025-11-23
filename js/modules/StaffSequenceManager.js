(function initStaffSequenceManager(globalScope) {
    function resolveNoteUtils() {
        if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
            try {
                // eslint-disable-next-line global-require
                return require('./StaffNoteUtils.js');
            } catch (error) {
                console.warn('[StaffSequenceManager] Unable to require StaffNoteUtils.', error);
                return null;
            }
        }
        return globalScope?.StaffNoteUtils || null;
    }

    const StaffNoteUtils = resolveNoteUtils();
    if (!StaffNoteUtils) {
        throw new Error('StaffSequenceManager requires StaffNoteUtils. Load js/modules/StaffNoteUtils.js first.');
    }

    const { sortNotesAscending } = StaffNoteUtils;

    function insertNoteEntry(note, options = {}) {
        if (!note) return null;
        const isDraft = Boolean(options.isDraft);
        const hasStateOverride = Object.prototype.hasOwnProperty.call(options, 'state');
        const resolvedState = hasStateOverride
            ? options.state
            : (isDraft ? 'draft' : 'user');
        if (this.dictationMode === 'harmonic') {
            const existing = this.noteEntries[0] ? { ...this.noteEntries[0] } : null;
            const existingNotes = Array.isArray(existing?.notes) ? existing.notes.slice() : [];
            existingNotes.push(this.spell(note));
            const sortedNotes = sortNotesAscending(existingNotes);
            const durationInfo = this.computeHarmonicDuration(sortedNotes.length);
            const chordEntry = {
                note: sortedNotes[0],
                notes: sortedNotes,
                ...(resolvedState != null ? { state: resolvedState } : {}),
                duration: durationInfo.duration,
                dots: durationInfo.dots,
            };
            this.noteEntries = [chordEntry];
            this.staffNotes = [{
                notes: sortedNotes.slice(),
                state: resolvedState ?? null,
                element: null,
            }];
            return 0;
        }
        const spelled = this.spell(note);
        const entry = {
            note: spelled,
            notes: [spelled],
            ...(resolvedState != null ? { state: resolvedState } : {}),
            ...(this.shouldStemless() ? { stemless: true } : {}),
        };
        const targetIndex = this.normalizeInsertIndex(options.index);
        this.noteEntries.splice(targetIndex, 0, entry);
        this.staffNotes.splice(targetIndex, 0, {
            note: spelled,
            notes: [spelled],
            index: targetIndex,
            state: resolvedState ?? null,
            element: null,
        });
        this.reindexStaffNotes(targetIndex + 1);
        this.updateInteractionSnapshotFromEntries();
        return targetIndex;
    }

    function showNoteOnStaff(note, options = {}) {
        if (!note) return;
        this.cancelActiveReplay?.();
        this.insertNoteEntry(note, options);
        this.enqueue((display) => display.setSequence(this.noteEntries));
    }

    function showNoteOnStaffWithLimit(note, maxVisible = 10, options = {}) {
        if (!note) return;
        this.cancelActiveReplay?.();
        if (this.dictationMode === 'harmonic') {
            this.insertNoteEntry(note, options);
        } else if (Array.isArray(note)) {
            const spelled = note.map((n) => this.spell(n)).filter(Boolean);
            if (spelled.length === 0) return;
            const targetIndex = this.normalizeInsertIndex(options.index);
            const hasStateOverride = Object.prototype.hasOwnProperty.call(options, 'state');
            const resolvedState = hasStateOverride
                ? options.state
                : (options.isDraft ? 'draft' : 'user');
            const entry = {
                note: spelled[0],
                notes: spelled,
                ...(resolvedState != null ? { state: resolvedState } : {}),
                ...(this.shouldStemless() ? { stemless: true } : {}),
            };
            this.noteEntries.splice(targetIndex, 0, entry);
            this.staffNotes.splice(targetIndex, 0, {
                notes: spelled.slice(),
                state: resolvedState ?? null,
                element: null,
                index: targetIndex,
            });
            this.reindexStaffNotes(targetIndex + 1);
            this.updateInteractionSnapshotFromEntries();
        } else {
            this.insertNoteEntry(note, options);
        }
        const limit = Math.max(1, Number(maxVisible) || 10);
        if (this.noteEntries.length > limit) {
            const drop = this.noteEntries.length - limit;
            this.noteEntries.splice(0, drop);
            this.staffNotes.splice(0, drop);
            this.reindexStaffNotes();
            this.updateInteractionSnapshotFromEntries();
        }
        this.enqueue((display) => display.setSequence(this.noteEntries));
    }

    function showChordOnStaffWithLimit(notes, maxVisible = 10) {
        if (!Array.isArray(notes) || notes.length === 0) return;
        this.showNoteOnStaffWithLimit(notes, maxVisible);
    }

    function clearStaffNotes() {
        this.cancelActiveReplay?.();
        this.noteEntries = [];
        this.staffNotes = [];
        this.updateInteractionSnapshotFromEntries();
        if (this.highlightTimeout) {
            const clearFn = typeof window !== 'undefined' ? window.clearTimeout : clearTimeout;
            clearFn(this.highlightTimeout);
            this.highlightTimeout = null;
        }
        this.enqueue(async (display) => {
            await display.clearHighlight();
            await display.clearOverlay?.();
            await display.setSequence([]);
        });
    }

    function updateUserNoteAt(index, nextNote) {
        if (!Number.isInteger(index) || index < 0) return;
        if (!nextNote) return;
        const entry = this.noteEntries[index];
        if (!entry) return;
        const spelled = this.spell(nextNote);
        if (this.dictationMode === 'harmonic') {
            if (!entry.notes || entry.notes.length === 0) {
                entry.notes = [spelled];
                entry.note = spelled;
            } else {
                entry.notes[entry.notes.length - 1] = spelled;
                entry.note = entry.notes[0];
            }
            if (this.staffNotes[0]) {
                this.staffNotes[0].notes = Array.isArray(entry.notes) ? entry.notes.slice() : [spelled];
            }
        } else {
            entry.note = spelled;
            entry.notes = [spelled];
            if (this.shouldStemless()) {
                entry.stemless = true;
            }
            if (this.staffNotes[index]) {
                this.staffNotes[index].note = spelled;
                this.staffNotes[index].notes = [spelled];
            }
        }
        this.updateInteractionSnapshotFromEntries();
        this.enqueue((display) => display.setSequence(this.noteEntries));
    }

    function removeNoteAt(index) {
        if (!Number.isInteger(index) || index < 0) return;
        if (this.dictationMode === 'harmonic') {
            const entry = this.noteEntries[0];
            if (!entry || !Array.isArray(entry.notes) || entry.notes.length === 0) return;
            const targetIndex = Math.min(index, entry.notes.length - 1);
            entry.notes.splice(targetIndex, 1);
            if (entry.notes.length === 0) {
                this.noteEntries = [];
                this.staffNotes = [];
            } else {
                entry.note = entry.notes[0];
                const durationInfo = this.computeHarmonicDuration(entry.notes.length);
                entry.duration = durationInfo.duration;
                entry.dots = durationInfo.dots;
                if (this.staffNotes[0]) {
                    this.staffNotes[0].notes = entry.notes.slice();
                }
            }
        } else {
            if (index >= this.noteEntries.length) return;
            this.noteEntries.splice(index, 1);
            if (Array.isArray(this.staffNotes) && index < this.staffNotes.length) {
                this.staffNotes.splice(index, 1);
            }
            this.reindexStaffNotes(index);
        }
        this.updateInteractionSnapshotFromEntries();
        this.enqueue((display) => display.setSequence(this.noteEntries));
    }

    function attachTo(target) {
        if (!target) return;
        const proto = target.prototype || target;
        if (!proto) return;
        proto.insertNoteEntry = insertNoteEntry;
        proto.showNoteOnStaff = showNoteOnStaff;
        proto.showNoteOnStaffWithLimit = showNoteOnStaffWithLimit;
        proto.showChordOnStaffWithLimit = showChordOnStaffWithLimit;
        proto.clearStaffNotes = clearStaffNotes;
        proto.updateUserNoteAt = updateUserNoteAt;
        proto.removeNoteAt = removeNoteAt;
    }

    const api = { attachTo };
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        globalScope.StaffSequenceManager = api;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
