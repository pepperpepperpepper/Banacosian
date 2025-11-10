/**
 * Staff Module - VexFlow-backed musical staff display
 */
class StaffModule {
    constructor() {
        this.noteEntries = [];
        this.staffNotes = [];
        this.keySignature = 'C';
        this.fontPreference = 'bravura';
        this.highlightTimeout = null;
        this.operationQueue = Promise.resolve();
        this.displayPromise = null;
        const hasDocument = typeof document !== 'undefined';
        this.containerEl = hasDocument ? document.getElementById('staff-vexflow') : null;
        this.statusEl = hasDocument ? document.getElementById('staff-status') : null;
        this.fontIndicatorEl = hasDocument ? document.getElementById('staff-font-indicator') : null;
        if (hasDocument) {
            this.initializeDisplay();
        }
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
                const module = await import('/js/vexflow/StaffDisplay.js');
                const DisplayCtor = module?.VexflowStaffDisplay || module?.default;
                if (!DisplayCtor) {
                    throw new Error('VexflowStaffDisplay export missing.');
                }
                const parsePositive = (value) => {
                    if (typeof value !== 'string' || value.trim() === '') return null;
                    const numeric = Number.parseFloat(value);
                    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
                };
                const widthOptions = this.containerEl.dataset
                    ? {
                        minWidth: parsePositive(this.containerEl.dataset.staffMinWidth),
                        maxWidth: parsePositive(this.containerEl.dataset.staffMaxWidth),
                        targetWidth: parsePositive(this.containerEl.dataset.staffTargetWidth),
                        baseHeight: parsePositive(this.containerEl.dataset.staffBaseHeight),
                      }
                    : { minWidth: null, maxWidth: null, targetWidth: null, baseHeight: null };
                const staffScale = this.containerEl.dataset
                    ? parsePositive(this.containerEl.dataset.staffScale)
                    : null;
                if (widthOptions.minWidth && widthOptions.maxWidth && widthOptions.maxWidth < widthOptions.minWidth) {
                    widthOptions.maxWidth = null;
                }
                const display = new DisplayCtor({
                    container: this.containerEl,
                    statusEl: this.statusEl,
                    keySignature: this.keySignature,
                    fontId: this.fontPreference,
                    minWidth: widthOptions.minWidth ?? undefined,
                    maxWidth: widthOptions.maxWidth ?? undefined,
                    targetWidth: widthOptions.targetWidth ?? undefined,
                    baseHeight: widthOptions.baseHeight ?? undefined,
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
        this.operationQueue = this.operationQueue
            .then(() => this.ensureDisplay())
            .then(async (display) => {
                if (!display) return;
                await task(display);
                this.updateFontIndicator(display);
            })
            .catch((error) => console.error('[StaffModule] operation failed', error));
        return this.operationQueue;
    }

    showNoteOnStaff(note) {
        if (!note) return;
        const entry = { note, state: 'user' };
        this.noteEntries.push(entry);
        this.staffNotes.push({
            note,
            index: this.staffNotes.length,
            state: 'user',
            element: null
        });
        this.enqueue((display) => display.setSequence(this.noteEntries));
    }

    clearStaffNotes() {
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

    updateStaffComparison(currentSequence, userSequence) {
        if (!Array.isArray(currentSequence) || currentSequence.length === 0) return;
        const user = Array.isArray(userSequence) ? userSequence : [];
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

    setFontPreference(fontId) {
        if (!fontId || fontId === this.fontPreference) return;
        this.fontPreference = fontId;
        this.enqueue((display) => display.setFont(fontId));
    }
}

// Export the module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StaffModule;
} else {
    window.StaffModule = StaffModule;
}
