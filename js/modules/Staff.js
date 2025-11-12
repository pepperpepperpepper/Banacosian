/**
 * Staff Module - VexFlow-backed musical staff display
 */

const NOTE_MATCH = /^([A-Ga-g])([#♯bx𝄪♭b𝄫]{0,2})(-?\d)$/;
const LETTER_TO_SEMITONE = {
    c: 0,
    d: 2,
    e: 4,
    f: 5,
    g: 7,
    a: 9,
    b: 11,
};

function accidentalOffset(symbol) {
    if (!symbol) return 0;
    switch (symbol) {
        case '#':
        case '♯':
            return 1;
        case '##':
        case 'x':
        case '𝄪':
            return 2;
        case 'b':
        case '♭':
            return -1;
        case 'bb':
        case '𝄫':
            return -2;
        default:
            return 0;
    }
}

function estimateMidi(note) {
    if (!note || typeof note !== 'string') return Number.NEGATIVE_INFINITY;
    const match = NOTE_MATCH.exec(note.trim());
    if (!match) return Number.NEGATIVE_INFINITY;
    const letter = match[1].toLowerCase();
    const accidental = accidentalOffset(match[2]);
    const octave = Number.parseInt(match[3], 10);
    if (!Number.isInteger(octave) || !(letter in LETTER_TO_SEMITONE)) {
        return Number.NEGATIVE_INFINITY;
    }
    return (octave + 1) * 12 + LETTER_TO_SEMITONE[letter] + accidental;
}

function sortNotesAscending(notes) {
    return Array.isArray(notes)
        ? notes.slice().sort((a, b) => estimateMidi(a) - estimateMidi(b))
        : [];
}

class StaffModule {
    constructor() {
        this.noteEntries = [];
        this.staffNotes = [];
        this.keySignature = 'C';
        this.noteSpeller = null; // optional function(note:string)->string for display spelling
        this.dictationMode = 'melodic';
        this.fontPreference = 'bravura';
        this.highlightTimeout = null;
        this.activeReplayToken = null;
        this.displayPromise = null;
        this.renderRuntime = null;
        this.renderRuntimePromise = null;
        const hasDocument = typeof document !== 'undefined';
        this.containerEl = hasDocument ? document.getElementById('staff-vexflow') : null;
        this.statusEl = hasDocument ? document.getElementById('staff-status') : null;
        this.fontIndicatorEl = hasDocument ? document.getElementById('staff-font-indicator') : null;
        if (hasDocument) {
            this.initializeDisplay();
        }
    }

    // Allow external modules to control enharmonic spelling for displayed notes
    setNoteSpeller(spellerFn) {
        if (typeof spellerFn === 'function') {
            this.noteSpeller = spellerFn;
        } else {
            this.noteSpeller = null;
        }
    }

    spell(note) {
        if (!note) return note;
        try {
            if (typeof this.noteSpeller === 'function') {
                const out = this.noteSpeller(note);
                return typeof out === 'string' && out ? out : note;
            }
        } catch (e) {
            // Non-fatal: fall back to original note if speller throws
        }
        return note;
    }

    ensureRenderRuntime() {
        if (this.renderRuntime) {
            this.renderRuntime.update({ keySig: this.keySignature });
            return Promise.resolve(this.renderRuntime);
        }
        if (this.renderRuntimePromise) {
            return this.renderRuntimePromise.then((runtime) => {
                if (runtime) runtime.update({ keySig: this.keySignature });
                return runtime;
            });
        }
        this.renderRuntimePromise = import('/js/vexflow/core/seeds.js')
            .then((module) => {
                const factory = module?.createRenderRuntime;
                if (typeof factory !== 'function') {
                    throw new Error('createRenderRuntime export missing.');
                }
                const runtime = factory({
                    initialState: {
                        interactionEnabled: false,
                        keySig: this.keySignature,
                    },
                });
                this.renderRuntime = runtime;
                return runtime;
            })
            .catch((error) => {
                console.error('[StaffModule] failed to load render runtime.', error);
                this.renderRuntimePromise = null;
                return null;
            });
        return this.renderRuntimePromise.then((runtime) => {
            if (runtime) runtime.update({ keySig: this.keySignature });
            return runtime;
        });
    }

    initializeDisplay() {
        if (this.displayPromise) return this.displayPromise;
        this.displayPromise = (async () => {
            if (typeof window === 'undefined') {
                return null;
            }
            if (!this.containerEl) {
                console.warn('[StaffModule] staff container not found.');
                if (this.statusEl) this.statusEl.textContent = 'Staff unavailable.';
                return null;
            }
            try {
                const [displayModule, configModule, runtime] = await Promise.all([
                    import('/js/vexflow/StaffDisplay.js'),
                    import('/js/vexflow/core/config.js'),
                    this.ensureRenderRuntime(),
                ]);
                const DisplayCtor = displayModule?.VexflowStaffDisplay || displayModule?.default;
                if (!DisplayCtor) {
                    throw new Error('VexflowStaffDisplay export missing.');
                }
                const { readStaffConfigFromDataset } = configModule || {};
                const dataset = this.containerEl.dataset || null;
                const config = typeof readStaffConfigFromDataset === 'function'
                    ? readStaffConfigFromDataset(dataset)
                    : { sizing: { minWidth: null, maxWidth: null, targetWidth: null, baseHeight: null }, scale: null };
                const sizing = config?.sizing || { minWidth: null, maxWidth: null, targetWidth: null, baseHeight: null };
                const staffScale = config?.scale ?? null;
                const staffPack = config?.pack ?? null;
                if (runtime) {
                    runtime.update({
                        keySig: this.keySignature,
                        minWidth: sizing.minWidth,
                        maxWidth: sizing.maxWidth,
                        targetWidth: sizing.targetWidth,
                        baseHeight: sizing.baseHeight,
                        staffScale: staffScale ?? runtime.state.staffScale,
                        staffPack: staffPack ?? runtime.state.staffPack,
                    });
                }
                const display = new DisplayCtor({
                    container: this.containerEl,
                    statusEl: this.statusEl,
                    keySignature: this.keySignature,
                    fontId: this.fontPreference,
                    minWidth: sizing.minWidth ?? undefined,
                    maxWidth: sizing.maxWidth ?? undefined,
                    targetWidth: sizing.targetWidth ?? undefined,
                    baseHeight: sizing.baseHeight ?? undefined,
                    staffScale: staffScale ?? undefined,
                });
                await display.initialize();
                this.updateFontIndicator(display);
                if (this.noteEntries.length > 0) {
                    await display.setSequence(this.noteEntries);
                }
                return display;
            } catch (error) {
                console.error('[StaffModule] failed to initialize staff.', error);
                if (this.statusEl) this.statusEl.textContent = 'Unable to load staff.';
                return null;
            }
        })();
        return this.displayPromise;
    }

    async ensureDisplay() {
        return this.displayPromise || this.initializeDisplay();
    }

    updateFontIndicator(display) {
        if (!this.fontIndicatorEl || !display) return;
        const label = display.getFontLabel();
        this.fontIndicatorEl.textContent = label ? `Font: ${label}` : '';
    }

    enqueue(task) {
        return this.ensureRenderRuntime()
            .then((runtime) => {
                if (!runtime) return null;
                return runtime.enqueue(async () => {
                    const display = await this.ensureDisplay();
                    if (!display) return;
                    await task(display, runtime.state);
                    this.updateFontIndicator(display);
                });
            })
            .catch((error) => {
                console.error('[StaffModule] operation failed', error);
                return null;
            });
    }

    showNoteOnStaff(note) {
        if (!note) return;
        this.cancelActiveReplay();
        if (this.dictationMode === 'harmonic') {
            const existing = this.noteEntries[0] ? { ...this.noteEntries[0] } : null;
            const existingNotes = Array.isArray(existing?.notes) ? existing.notes.slice() : [];
            existingNotes.push(this.spell(note));
            const sortedNotes = sortNotesAscending(existingNotes);
            const durationInfo = this.computeHarmonicDuration(sortedNotes.length);
            const chordEntry = {
                note: sortedNotes[0],
                notes: sortedNotes,
                state: 'user',
                duration: durationInfo.duration,
                dots: durationInfo.dots,
            };
            this.noteEntries = [chordEntry];
            this.staffNotes = [{
                notes: sortedNotes.slice(),
                state: 'user',
                element: null,
            }];
            this.enqueue((display) => display.setSequence(this.noteEntries));
            return;
        }
        const entry = { note: this.spell(note), state: 'user' };
        this.noteEntries.push(entry);
        this.staffNotes.push({
            note: entry.note,
            index: this.staffNotes.length,
            state: 'user',
            element: null
        });
        this.enqueue((display) => display.setSequence(this.noteEntries));
    }

    clearStaffNotes() {
        this.cancelActiveReplay();
        this.noteEntries = [];
        this.staffNotes = [];
        if (this.highlightTimeout) {
            const clearFn = typeof window !== 'undefined' ? window.clearTimeout : clearTimeout;
            clearFn(this.highlightTimeout);
            this.highlightTimeout = null;
        }
        this.enqueue(async (display) => {
            await display.clearHighlight();
            await display.setSequence([]);
        });
    }

    updateStaffComparison(currentSequence, userSequence, options = {}) {
        if (!Array.isArray(currentSequence) || currentSequence.length === 0) return;
        const user = Array.isArray(userSequence) ? userSequence : [];
        const mode = options.dictationMode || this.dictationMode;
        if (mode === 'harmonic') {
            if (this.noteEntries.length === 0) return;
            const isCorrect = typeof options.isCorrect === 'boolean'
                ? options.isCorrect
                : this.compareHarmonicSequences(currentSequence, user);
            const entry = {
                ...this.noteEntries[0],
                state: isCorrect ? 'correct' : 'incorrect',
            };
            this.noteEntries = [entry];
            this.staffNotes = [{
                notes: Array.isArray(entry.notes) ? entry.notes.slice() : [],
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

    getStaffNotes() {
        return this.staffNotes;
    }

    getStaffNotesCount() {
        return this.staffNotes.length;
    }

    highlightNoteOnStaff(note, duration = 600) {
        if (!note) return;
        this.cancelActiveReplay();
        const entry = { note, state: 'highlight' };
        this.enqueue((display) => display.setHighlight(entry));
        if (this.highlightTimeout) {
            const clearFn = typeof window !== 'undefined' ? window.clearTimeout : clearTimeout;
            clearFn(this.highlightTimeout);
            this.highlightTimeout = null;
        }
        const scheduleTimeout = typeof window !== 'undefined' ? window.setTimeout : setTimeout;
        this.highlightTimeout = scheduleTimeout(() => {
            this.highlightTimeout = null;
            this.enqueue((display) => display.clearHighlight());
        }, Math.max(0, duration));
    }

    clearTonicHighlights() {
        if (this.highlightTimeout) {
            const clearFn = typeof window !== 'undefined' ? window.clearTimeout : clearTimeout;
            clearFn(this.highlightTimeout);
            this.highlightTimeout = null;
        }
        this.enqueue((display) => display.clearHighlight());
    }

    setKeySignature(keySig) {
        this.keySignature = keySig || this.keySignature;
        this.enqueue((display) => display.setKeySignature(this.keySignature));
    }

    setDictationMode(mode) {
        const normalized = mode === 'harmonic' ? 'harmonic' : 'melodic';
        if (this.dictationMode === normalized) return;
        this.dictationMode = normalized;
        this.clearStaffNotes();
    }

    computeHarmonicDuration(noteCount) {
        if (!Number.isInteger(noteCount) || noteCount <= 0) {
            return { duration: 'w', dots: 0 };
        }
        return { duration: 'w', dots: 0 };
    }

    compareHarmonicSequences(target, attempt) {
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

    setFontPreference(fontId) {
        if (!fontId || fontId === this.fontPreference) return;
        this.fontPreference = fontId;
        this.enqueue((display) => display.setFont(fontId));
    }

    cancelActiveReplay() {
        if (this.activeReplayToken === null) return;
        this.activeReplayToken = null;
        this.enqueue(async (display) => {
            await display.clearHighlight();
            await display.setSequence(this.noteEntries);
        });
    }

    async replaySequenceOnStaff(notes, options = {}) {
        const sequence = Array.isArray(notes) ? notes.filter((note) => typeof note === 'string' && note) : [];
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
            }))
            : this.noteEntries.map((entry) => ({ ...entry }));
        this.cancelActiveReplay();
        const replayToken = {};
        this.activeReplayToken = replayToken;

        const delay = (ms) => new Promise((resolve) => {
            const timer = (typeof window !== 'undefined' && window.setTimeout)
                ? window.setTimeout(resolve, Math.max(0, ms))
                : setTimeout(resolve, Math.max(0, ms));
            if (!timer && ms <= 0) resolve();
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
}

// Export the module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StaffModule;
} else {
    window.StaffModule = StaffModule;
}
