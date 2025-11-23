(function initStaffInteractionBridge(globalScope) {
    function resolveUtils() {
        let utils = null;
        if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
            try {
                // eslint-disable-next-line global-require
                utils = require('./StaffNoteUtils.js');
            } catch (error) {
                console.warn('[StaffInteractionBridge] Unable to require StaffNoteUtils.', error);
            }
            return utils;
        }
        return globalScope?.StaffNoteUtils || null;
    }

    const StaffNoteUtils = resolveUtils();
    if (!StaffNoteUtils) {
        throw new Error('StaffInteractionBridge requires StaffNoteUtils. Load js/modules/StaffNoteUtils.js first.');
    }

    const { sortNotesAscending, diffSequences } = StaffNoteUtils;

    function ensureInteractionController() {
        if (!this.staffInputState) return null;
        if (this.staffInputState.interactionController) {
            return this.staffInputState.interactionController;
        }
        if (this.staffInputState.interactionPromise) {
            return this.staffInputState.interactionPromise;
        }
        this.staffInputState.interactionPromise = import('/staff/interaction-controller.js')
            .then((module) => {
                const factory = module?.createInteractionController;
                if (typeof factory !== 'function') {
                    throw new Error('createInteractionController missing');
                }
                const controller = factory({
                    statusEl: this.statusEl,
                    renderState: this.getRenderStateSnapshot(),
                    requestRender: () => this.handleInteractionRenderRequest(),
                    handleRenderFailure: (error) => {
                        console.error('[StaffModule] interaction render failed', error);
                    },
                    enabled: false,
                });
                this.staffInputState.interactionController = controller;
                return controller;
            })
            .catch((error) => {
                console.error('[StaffModule] unable to initialize interaction controller', error);
                return null;
            })
            .finally(() => {
                this.staffInputState.interactionPromise = null;
            });
        return this.staffInputState.interactionPromise;
    }

    async function enableInteractionStaffInput() {
        if (!this.staffInputState) return false;
        const display = await this.ensureDisplay();
        if (!display) return false;
        const controller = await this.ensureInteractionController();
        if (!controller) return false;
        controller.updateDependencies({
            statusEl: this.statusEl,
            renderState: display.renderState || this.getRenderStateSnapshot(),
            requestRender: () => this.handleInteractionRenderRequest(),
            handleRenderFailure: (error) => {
                console.error('[StaffModule] interaction render failed', error);
            },
        });
        controller.setEnabled(true);
        if (typeof display.setInteractionRegistrar === 'function') {
            display.setInteractionRegistrar(({ context, voices, baseMessage, scale }) => {
                controller.register(context, voices, baseMessage, scale, this.containerEl);
            });
        }
        this.staffInputState.strategy = 'interaction';
        this.staffInputState.sequenceSnapshot = this.getCurrentNoteSequence();
        this.detachStaffInputListeners();
        return true;
    }

    function disableInteractionStaffInput() {
        if (!this.staffInputState) return;
        this.staffInputState.strategy = 'legacy';
        this.staffInputState.sequenceSnapshot = [];
        const controller = this.staffInputState.interactionController;
        if (controller) {
            controller.setEnabled(false);
        }
        if (this.displayInstance && typeof this.displayInstance.setInteractionRegistrar === 'function') {
            this.displayInstance.setInteractionRegistrar(null);
        }
    }

    function getCurrentNoteSequence() {
        if (this.dictationMode === 'harmonic') {
            const entry = this.noteEntries[0];
            if (!entry || !Array.isArray(entry.notes)) return [];
            return sortNotesAscending(entry.notes.slice());
        }
        return this.noteEntries.map((entry) => entry?.note).filter(Boolean);
    }

    function updateInteractionSnapshotFromEntries() {
        if (!this.staffInputState || this.staffInputState.strategy !== 'interaction') return;
        this.staffInputState.sequenceSnapshot = this.getCurrentNoteSequence();
    }

    async function handleInteractionRenderRequest() {
        if (!this.staffInputState || this.staffInputState.strategy !== 'interaction') {
            return null;
        }
        if (this.staffInputState.suppressInteractionDiff) {
            return this.displayInstance?.render?.() || null;
        }
        const display = await this.ensureDisplay();
        if (!display) return null;
        const renderState = display.renderState || this.getRenderStateSnapshot();
        const nextSequence = this.extractSequenceFromRenderState(renderState);
        const prevSequence = Array.isArray(this.staffInputState.sequenceSnapshot)
            ? this.staffInputState.sequenceSnapshot
            : [];
        const diffs = diffSequences(prevSequence, nextSequence);
        this.staffInputState.sequenceSnapshot = nextSequence.slice();
        if (diffs.length === 0) {
            return display.render?.() || null;
        }
        this.staffInputState.suppressInteractionDiff = true;
        try {
            await this.applyInteractionSequence(nextSequence);
        } finally {
            this.staffInputState.suppressInteractionDiff = false;
        }
        diffs.forEach((diff) => this.emitInteractionDiff(diff));
        return display.render?.() || null;
    }

    function extractSequenceFromRenderState(renderState) {
        if (!renderState || !Array.isArray(renderState.voices) || renderState.voices.length === 0) {
            return [];
        }
        const voice = renderState.voices[0];
        const specs = Array.isArray(voice?.noteSpecs) ? voice.noteSpecs : [];
        if (this.dictationMode === 'harmonic') {
            const collected = [];
            specs.forEach((spec) => {
                if (!spec || spec.isRest) return;
                const notes = this.extractNotesFromSpec(spec);
                if (notes.length > 0) {
                    collected.push(...notes);
                }
            });
            return sortNotesAscending(collected);
        }
        return specs
            .filter((spec) => spec && spec.isRest !== true)
            .map((spec) => this.specToNoteString(spec))
            .filter(Boolean);
    }

    function extractNotesFromSpec(spec) {
        if (!spec) return [];
        const keys = Array.isArray(spec.keys) ? spec.keys : [];
        if (keys.length === 0) {
            const single = this.specToNoteString(spec);
            return single ? [single] : [];
        }
        return keys
            .map((_key, index) => this.specToNoteString(spec, index))
            .filter(Boolean);
    }

    function specToNoteString(spec, keyIndex = 0) {
        if (!spec) return null;
        const keys = Array.isArray(spec.keys) ? spec.keys : [];
        const keyString = keys[keyIndex] || keys[0] || null;
        if (!keyString || typeof keyString !== 'string') return null;
        const match = /^([a-gA-G])([#bx𝄪♯♭]{0,3})?\/(-?\d+)$/.exec(keyString.trim());
        if (!match) return null;
        const letter = match[1].toUpperCase();
        let accidental = match[2] || '';
        accidental = accidental
            .replace(/𝄪/g, '##')
            .replace(/𝄫/g, 'bb')
            .replace(/♯/g, '#')
            .replace(/♭/g, 'b')
            .replace(/x/g, '##');
        const octave = Number.parseInt(match[3], 10);
        const note = `${letter}${accidental}${Number.isFinite(octave) ? octave : 4}`;
        return this.spell(note);
    }

    async function applyInteractionSequence(sequence) {
        if (!Array.isArray(sequence)) return;
        if (this.dictationMode === 'harmonic') {
            const sortedNotes = sortNotesAscending(sequence.map((note) => this.spell(note)).filter(Boolean));
            if (sortedNotes.length === 0) {
                this.noteEntries = [];
                this.staffNotes = [];
            } else {
                const durationInfo = this.computeHarmonicDuration(sortedNotes.length);
                this.noteEntries = [{
                    note: sortedNotes[0],
                    notes: sortedNotes.slice(),
                    duration: durationInfo.duration,
                    dots: durationInfo.dots,
                    state: null,
                }];
                this.staffNotes = [{
                    notes: sortedNotes.slice(),
                    state: null,
                    element: null,
                }];
            }
        } else {
            const entries = sequence.map((note) => {
                const spelled = this.spell(note);
                return {
                    note: spelled,
                    notes: [spelled],
                    stemless: this.shouldStemless(),
                    state: null,
                };
            });
            this.noteEntries = entries;
            this.staffNotes = entries.map((entry, index) => ({
                note: entry.note,
                notes: entry.notes.slice(),
                index,
                state: null,
                element: null,
            }));
        }
        if (this.displayInstance && typeof this.displayInstance.setSequence === 'function') {
            await this.displayInstance.setSequence(this.noteEntries);
        }
    }

    function emitInteractionDiff(diff) {
        if (!diff || typeof this.staffInputState?.onInput !== 'function') return;
        if (diff.type === 'delete') {
            this.staffInputState.onInput(null, {
                source: 'staff',
                operation: 'delete',
                phase: 'delete',
                staffIndex: diff.index,
                skipStaffUpdate: true,
            });
            return;
        }
        if (diff.note == null) return;
        const meta = {
            source: 'staff',
            phase: 'commit',
            staffIndex: diff.index,
            skipStaffUpdate: true,
        };
        if (diff.type === 'insert') {
            meta.insertIndex = diff.index;
        }
        this.staffInputState.onInput(diff.note, meta);
    }

    function attachTo(target) {
        if (!target) return;
        const proto = target.prototype || target;
        if (!proto) return;
        proto.ensureInteractionController = ensureInteractionController;
        proto.enableInteractionStaffInput = enableInteractionStaffInput;
        proto.disableInteractionStaffInput = disableInteractionStaffInput;
        proto.getCurrentNoteSequence = getCurrentNoteSequence;
        proto.updateInteractionSnapshotFromEntries = updateInteractionSnapshotFromEntries;
        proto.handleInteractionRenderRequest = handleInteractionRenderRequest;
        proto.extractSequenceFromRenderState = extractSequenceFromRenderState;
        proto.extractNotesFromSpec = extractNotesFromSpec;
        proto.specToNoteString = specToNoteString;
        proto.applyInteractionSequence = applyInteractionSequence;
        proto.emitInteractionDiff = emitInteractionDiff;
    }

    const api = { attachTo };
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        globalScope.StaffInteractionBridge = api;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
