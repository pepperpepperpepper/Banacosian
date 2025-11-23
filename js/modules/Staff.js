/**
 * Staff Module - VexFlow-backed musical staff display
 */

let StaffNoteUtils;
let StaffDisplayRuntime;
let StaffInteractionBridge;
let StaffSequenceManager;
let StaffPlaybackController;
let StaffInputBindings;
let StaffFeedbackController;
let StaffSharedUtils;
if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
    try {
        StaffNoteUtils = require('./StaffNoteUtils.js');
        StaffDisplayRuntime = require('./StaffDisplayRuntime.js');
        StaffInteractionBridge = require('./StaffInteractionBridge.js');
        StaffSequenceManager = require('./StaffSequenceManager.js');
        StaffPlaybackController = require('./StaffPlaybackController.js');
        StaffInputBindings = require('./StaffInputBindings.js');
        StaffFeedbackController = require('./StaffFeedbackController.js');
        StaffSharedUtils = require('./StaffSharedUtils.js');
    } catch (error) {
        console.warn('[StaffModule] Unable to require dependencies.', error);
    }
} else if (typeof window !== 'undefined') {
    StaffNoteUtils = window.StaffNoteUtils;
    StaffDisplayRuntime = window.StaffDisplayRuntime;
    StaffInteractionBridge = window.StaffInteractionBridge;
    StaffSequenceManager = window.StaffSequenceManager;
    StaffPlaybackController = window.StaffPlaybackController;
    StaffInputBindings = window.StaffInputBindings;
    StaffFeedbackController = window.StaffFeedbackController;
    StaffSharedUtils = window.StaffSharedUtils;
}

if (!StaffNoteUtils) {
    throw new Error('StaffNoteUtils dependency missing. Load js/modules/StaffNoteUtils.js before Staff.js');
}
if (!StaffDisplayRuntime || typeof StaffDisplayRuntime.attachTo !== 'function') {
    throw new Error('StaffDisplayRuntime dependency missing. Load js/modules/StaffDisplayRuntime.js before Staff.js');
}
if (!StaffInteractionBridge || typeof StaffInteractionBridge.attachTo !== 'function') {
    throw new Error('StaffInteractionBridge dependency missing. Load js/modules/StaffInteractionBridge.js before Staff.js');
}
if (!StaffSequenceManager || typeof StaffSequenceManager.attachTo !== 'function') {
    throw new Error('StaffSequenceManager dependency missing. Load js/modules/StaffSequenceManager.js before Staff.js');
}
if (!StaffPlaybackController || typeof StaffPlaybackController.attachTo !== 'function') {
    throw new Error('StaffPlaybackController dependency missing. Load js/modules/StaffPlaybackController.js before Staff.js');
}
if (!StaffInputBindings || typeof StaffInputBindings.attachTo !== 'function') {
    throw new Error('StaffInputBindings dependency missing. Load js/modules/StaffInputBindings.js before Staff.js');
}
if (!StaffFeedbackController || typeof StaffFeedbackController.attachTo !== 'function') {
    throw new Error('StaffFeedbackController dependency missing. Load js/modules/StaffFeedbackController.js before Staff.js');
}
if (!StaffSharedUtils || typeof StaffSharedUtils.attachTo !== 'function') {
    throw new Error('StaffSharedUtils dependency missing. Load js/modules/StaffSharedUtils.js before Staff.js');
}

class StaffModule {
    constructor() {
        this.noteEntries = [];
        this.staffNotes = [];
        this.keySignature = 'C';
        this.clef = 'treble';
        this.noteSpeller = null; // optional function(note:string)->string for display spelling
        this.dictationMode = 'melodic';
        this.fontPreference = 'bravura';
        this.highlightTimeout = null;
        this.activeReplayToken = null;
        this.displayPromise = null;
        this.renderRuntime = null;
        this.renderRuntimePromise = null;
        this.displayInstance = null;
        const hasDocument = typeof document !== 'undefined';
        this.containerEl = hasDocument ? document.getElementById('staff-vexflow') : null;
        this.statusEl = hasDocument ? document.getElementById('staff-status') : null;
        this.fontIndicatorEl = hasDocument ? document.getElementById('staff-font-indicator') : null;
        this.staffInputState = {
            enabled: false,
            onInput: null,
            boundSvg: null,
            boundTarget: null,
            handlers: [],
            documentHandlers: [],
            originalTouchAction: null,
            helpers: null,
            helpersPromise: null,
            midiMin: 36,
            midiMax: 96,
            activePointers: new Set(),
            pointerNotes: new Map(),
            strategy: 'legacy',
            interactionController: null,
            interactionPromise: null,
            sequenceSnapshot: [],
            suppressInteractionDiff: false,
        };
        if (hasDocument) {
            this.initializeDisplay();
        }
    }

    shouldStemless(mode = this.dictationMode) {
        const resolvedMode = mode || this.dictationMode;
        return resolvedMode === 'melodic';
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

    getRenderStateSnapshot() {
        if (this.displayInstance && this.displayInstance.renderState) {
            return this.displayInstance.renderState;
        }
        if (this.renderRuntime && this.renderRuntime.state) {
            return this.renderRuntime.state;
        }
        return null;
    }

    /**
     * Update the active clef and trigger a re-render.
     * @param {('treble'|'bass'|'alto'|'tenor')} clef
     */
    setClef(clef) {
        const next = (clef || '').toString().toLowerCase();
        if (!next || next === this.clef) return;
        this.clef = next;
        this.enqueue(async (display) => {
            if (typeof display.setClef === 'function') {
                await display.setClef(next);
            } else {
                display.clef = next;
                await display.render?.();
            }
        });
    }

    async setStaffInputMode(options = {}) {
        if (!this.staffInputState) return;
        const onInput = typeof options.onInput === 'function' ? options.onInput : null;
        const enabled = Boolean(options.enabled) && Boolean(onInput);
        this.staffInputState.onInput = onInput;
        this.staffInputState.midiMin = Number.isFinite(options.midiMin) ? options.midiMin : 36;
        this.staffInputState.midiMax = Number.isFinite(options.midiMax) ? options.midiMax : 96;
        this.staffInputState.enabled = enabled;
        if (!enabled) {
            this.detachStaffInputListeners();
            await this.disableInteractionStaffInput();
            return;
        }
        await this.ensureDisplay();
        const interactionsReady = await this.enableInteractionStaffInput();
        if (interactionsReady) {
            await this.forceInteractionRegistration();
            return;
        }
        const helpers = await this.ensureStaffInputHelpers();
        if (!helpers) {
            this.staffInputState.enabled = false;
            return;
        }
        await this.refreshStaffInputBindings();
    }

    async forceInteractionRegistration() {
        if (this.displayInstance && typeof this.displayInstance.render === 'function') {
            await this.displayInstance.render();
            return;
        }
        if (this.renderRuntime && typeof this.renderRuntime.render === 'function') {
            await this.renderRuntime.render();
            return;
        }
        await this.enqueue(async (display) => {
            if (display && typeof display.render === 'function') {
                await display.render();
            }
        });
    }

    setKeySignature(keySig) {
        this.keySignature = keySig || this.keySignature;
        this.enqueue(async (display) => {
            await display.setKeySignature(this.keySignature);
            // Keep overlay consistent with new key signature
            if (Array.isArray(this._lastOverlayEntries) && this._lastOverlayEntries.length > 0) {
                await display.setOverlay(this._lastOverlayEntries);
            }
        });
    }

    setDictationMode(mode) {
        const normalized = mode === 'harmonic' ? 'harmonic' : 'melodic';
        if (this.dictationMode === normalized) return;
        this.dictationMode = normalized;
        this.clearStaffNotes();
    }

    setFontPreference(fontId) {
        if (!fontId || fontId === this.fontPreference) return;
        this.fontPreference = fontId;
        this.enqueue((display) => display.setFont(fontId));
    }

}

StaffDisplayRuntime.attachTo(StaffModule);
StaffInteractionBridge.attachTo(StaffModule);
StaffSequenceManager.attachTo(StaffModule);
StaffPlaybackController.attachTo(StaffModule);
StaffInputBindings.attachTo(StaffModule);
StaffFeedbackController.attachTo(StaffModule);
StaffSharedUtils.attachTo(StaffModule);

// Export the module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StaffModule;
} else {
    window.StaffModule = StaffModule;
}
