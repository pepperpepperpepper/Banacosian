/**
 * Staff Module - VexFlow-backed musical staff display
 */

let StaffNoteUtils;
let StaffDisplayRuntime;
if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
    try {
        StaffNoteUtils = require('./StaffNoteUtils.js');
        StaffDisplayRuntime = require('./StaffDisplayRuntime.js');
    } catch (error) {
        console.warn('[StaffModule] Unable to require dependencies.', error);
    }
} else if (typeof window !== 'undefined') {
    StaffNoteUtils = window.StaffNoteUtils;
    StaffDisplayRuntime = window.StaffDisplayRuntime;
}

if (!StaffNoteUtils) {
    throw new Error('StaffNoteUtils dependency missing. Load js/modules/StaffNoteUtils.js before Staff.js');
}
if (!StaffDisplayRuntime || typeof StaffDisplayRuntime.attachTo !== 'function') {
    throw new Error('StaffDisplayRuntime dependency missing. Load js/modules/StaffDisplayRuntime.js before Staff.js');
}

const { sortNotesAscending, formatSpecToNote, diffSequences } = StaffNoteUtils;

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

    async ensureInteractionController() {
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

    async enableInteractionStaffInput() {
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

    async disableInteractionStaffInput() {
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

    getCurrentNoteSequence() {
        if (this.dictationMode === 'harmonic') {
            const entry = this.noteEntries[0];
            if (!entry || !Array.isArray(entry.notes)) return [];
            return sortNotesAscending(entry.notes.slice());
        }
        return this.noteEntries.map((entry) => entry?.note).filter(Boolean);
    }

    updateInteractionSnapshotFromEntries() {
        if (!this.staffInputState || this.staffInputState.strategy !== 'interaction') return;
        this.staffInputState.sequenceSnapshot = this.getCurrentNoteSequence();
    }

    async handleInteractionRenderRequest() {
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

    extractSequenceFromRenderState(renderState) {
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

    extractNotesFromSpec(spec) {
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

    specToNoteString(spec, keyIndex = 0) {
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

    async applyInteractionSequence(sequence) {
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

    emitInteractionDiff(diff) {
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

    tagStaffNoteElements() {
        if (!this.containerEl) return;
        const svg = this.containerEl.querySelector('svg');
        if (!svg) return;
        const noteEls = svg.querySelectorAll ? svg.querySelectorAll('.vf-stavenote') : [];
        if (!noteEls || noteEls.length === 0) return;
        let assigned = 0;
        noteEls.forEach((el) => {
            if (!el || typeof el.setAttribute !== 'function') return;
            if (assigned < this.noteEntries.length) {
                el.setAttribute('data-staff-index', `${assigned}`);
                assigned += 1;
            } else {
                el.removeAttribute?.('data-staff-index');
            }
        });
    }

    reindexStaffNotes(startIndex = 0) {
        if (!Array.isArray(this.staffNotes) || this.staffNotes.length === 0) return;
        for (let i = Math.max(0, startIndex); i < this.staffNotes.length; i += 1) {
            if (this.staffNotes[i]) {
                this.staffNotes[i].index = i;
            }
        }
    }

    normalizeInsertIndex(index) {
        const length = this.noteEntries.length;
        if (!Number.isInteger(index)) return length;
        if (index < 0) return 0;
        if (index > length) return length;
        return index;
    }

    async ensureStaffInputHelpers() {
        if (!this.staffInputState) return null;
        if (this.staffInputState.strategy === 'interaction') return null;
        if (this.staffInputState.helpers) return this.staffInputState.helpers;
        if (this.staffInputState.helpersPromise) return this.staffInputState.helpersPromise;
        this.staffInputState.helpersPromise = Promise.all([
            import('/staff/interaction-dom.js').catch((error) => {
                console.warn('[StaffModule] unable to load interaction DOM helpers', error);
                return {};
            }),
            import('/js/vexflow/core/helpers/pitch.js').catch((error) => {
                console.warn('[StaffModule] unable to load pitch helpers', error);
                return {};
            }),
        ]).then(([domHelpers, pitchHelpers]) => {
            const helpers = {
                HAS_POINTER_EVENTS: Boolean(domHelpers?.HAS_POINTER_EVENTS),
                normalizePointerEvent: typeof domHelpers?.normalizePointerEvent === 'function'
                    ? domHelpers.normalizePointerEvent
                    : ((event) => event),
                convertToSvgCoords: domHelpers?.convertToSvgCoords,
                findClosestPitchForY: pitchHelpers?.findClosestPitchForY,
            };
            if (typeof helpers.convertToSvgCoords !== 'function' || typeof helpers.findClosestPitchForY !== 'function') {
                console.warn('[StaffModule] staff input helpers incomplete');
                return null;
            }
            this.staffInputState.helpers = helpers;
            return helpers;
        }).catch((error) => {
            console.warn('[StaffModule] failed to initialize staff input helpers', error);
            return null;
        }).finally(() => {
            this.staffInputState.helpersPromise = null;
        });
        return this.staffInputState.helpersPromise;
    }

    attachStaffInputListeners() {
        if (!this.staffInputState || this.staffInputState.strategy === 'interaction') return;
        const target = this.containerEl;
        if (!target) return;
        const svg = target.querySelector?.('svg');
        if (!svg) return;
        const helpers = this.staffInputState.helpers;
        if (!helpers) return;
        this.detachStaffInputListeners();
        const handler = (event) => this.handleStaffPointerEvent(event);
        const handlers = [];
        const documentHandlers = [];
        if (helpers.HAS_POINTER_EVENTS) {
            ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'].forEach((type) => {
                target.addEventListener(type, handler);
                handlers.push({ type, handler });
            });
        } else {
            target.addEventListener('mousedown', handler);
            target.addEventListener('touchstart', handler, { passive: false });
            target.addEventListener('mousemove', handler);
            target.addEventListener('mouseup', handler);
            target.addEventListener('touchmove', handler, { passive: false });
            target.addEventListener('touchend', handler, { passive: false });
            target.addEventListener('touchcancel', handler, { passive: false });
            handlers.push({ type: 'mousedown', handler }, { type: 'touchstart', handler }, { type: 'mousemove', handler }, { type: 'mouseup', handler }, { type: 'touchmove', handler }, { type: 'touchend', handler }, { type: 'touchcancel', handler });
            if (typeof document !== 'undefined') {
                const docTargets = [
                    'mousemove',
                    'mouseup',
                    'touchmove',
                    'touchend',
                    'touchcancel',
                ];
                docTargets.forEach((type) => {
                    const docHandler = (event) => this.handleStaffPointerEvent(event);
                    document.addEventListener(type, docHandler, { passive: false });
                    documentHandlers.push({ target: document, type, handler: docHandler });
                });
            }
        }
        this.staffInputState.handlers = handlers;
        this.staffInputState.documentHandlers = documentHandlers;
        this.staffInputState.boundSvg = svg;
        this.staffInputState.boundTarget = target;
        if (this.staffInputState.originalTouchAction === null) {
            this.staffInputState.originalTouchAction = target.style.touchAction || '';
        }
        target.style.touchAction = 'none';
    }

    detachStaffInputListeners() {
        if (!this.staffInputState) return;
        const target = this.staffInputState.boundTarget || this.staffInputState.boundSvg;
        if (target) {
            this.staffInputState.handlers.forEach(({ type, handler }) => {
                if (handler) {
                    target.removeEventListener(type, handler);
                }
            });
            if (this.staffInputState.originalTouchAction !== null) {
                target.style.touchAction = this.staffInputState.originalTouchAction;
            }
        }
        this.staffInputState.handlers = [];
        const docHandlers = this.staffInputState.documentHandlers || [];
        docHandlers.forEach(({ target, type, handler }) => {
            if (target && type && handler) {
                target.removeEventListener(type, handler);
            }
        });
        this.staffInputState.documentHandlers = [];
        this.staffInputState.boundSvg = null;
        this.staffInputState.boundTarget = null;
        this.staffInputState.originalTouchAction = null;
        if (this.staffInputState.activePointers) {
            this.staffInputState.activePointers.clear();
        }
        if (this.staffInputState.pointerNotes) {
            this.staffInputState.pointerNotes.clear();
        }
    }

    handleStaffPointerEvent(event) {
        if (!this.staffInputState || !this.staffInputState.enabled) return;
        if (this.staffInputState.strategy === 'interaction') return;
        const helpers = this.staffInputState.helpers;
        if (!helpers || typeof helpers.convertToSvgCoords !== 'function') return;
        if (!this.containerEl) return;
        const svg = this.containerEl.querySelector('svg');
        if (!svg) return;
        const hasPointerEvents = Boolean(helpers.HAS_POINTER_EVENTS);
        const type = event?.type || '';
        const isPointerEvent = hasPointerEvents && type.startsWith('pointer');
        let phase = null;
        if (isPointerEvent) {
            if (type === 'pointerdown') {
                if (event.button !== undefined && event.button !== 0) return;
                phase = 'start';
            } else if (type === 'pointermove') {
                if (!this.staffInputState.activePointers.has(event.pointerId)) return;
                phase = 'move';
            } else if (type === 'pointerup' || type === 'pointercancel') {
                if (!this.staffInputState.activePointers.has(event.pointerId)) return;
                phase = 'end';
            }
        } else if (type === 'mousedown' || type === 'touchstart') {
            if (event.button !== undefined && event.button !== 0) return;
            phase = 'start';
        } else if (type === 'mouseup' || type === 'touchend' || type === 'touchcancel') {
            phase = 'end';
        } else if (type === 'mousemove' || type === 'touchmove') {
            phase = 'move';
        }
        if (!phase) return;
        const pointerId = isPointerEvent
            ? event.pointerId
            : (type.startsWith('mouse') ? 'mouse' : 'touch');
        const captureTarget = this.staffInputState.boundTarget || svg;
        if (phase === 'start') {
            this.staffInputState.activePointers.add(pointerId);
            if (isPointerEvent && captureTarget && typeof captureTarget.setPointerCapture === 'function' && pointerId != null) {
                try {
                    captureTarget.setPointerCapture(pointerId);
                } catch (captureError) {
                    console.warn('[StaffModule] unable to capture pointer', captureError);
                }
            }
        } else if ((phase === 'end' || phase === 'cancel') && pointerId != null) {
            this.staffInputState.activePointers.delete(pointerId);
            if (isPointerEvent && captureTarget && typeof captureTarget.releasePointerCapture === 'function') {
                try {
                    captureTarget.releasePointerCapture(pointerId);
                } catch (_releaseError) {
                    /* noop */
                }
            }
        } else if (phase === 'move' && !this.staffInputState.activePointers.has(pointerId)) {
            return;
        }

        const normalized = helpers.normalizePointerEvent ? helpers.normalizePointerEvent(event) : event;
        let coords = null;
        if (phase !== 'end') {
            coords = helpers.convertToSvgCoords ? helpers.convertToSvgCoords(normalized, svg) : null;
            if (!coords) {
                coords = this.fallbackSvgCoords(normalized, svg);
            }
        }
        const pointerKey = pointerId != null ? pointerId : undefined;
        const pointerNotes = this.staffInputState.pointerNotes;
        const existingPointerMeta = pointerNotes.get(pointerKey) || null;
        let staffIndex = phase === 'start'
            ? this.resolveStaffIndexFromEvent(event, coords)
            : (Number.isInteger(existingPointerMeta?.staffIndex)
                ? existingPointerMeta.staffIndex
                : null);
        let pitchInfo = null;
        let note = null;
        if (coords) {
        const renderState = this.getRenderStateSnapshot();
            pitchInfo = helpers.findClosestPitchForY?.(coords.y, this.clef, {
                stave: renderState?.activeStave,
                metrics: renderState?.staffMetrics,
                midiMin: this.staffInputState.midiMin,
                midiMax: this.staffInputState.midiMax,
            });
            if (pitchInfo?.spec) {
                note = formatSpecToNote(pitchInfo.spec);
            }
        }
        if (phase !== 'end' && !note) return;
        if (typeof event.preventDefault === 'function') {
            event.preventDefault();
        }
        if (typeof event.stopPropagation === 'function') {
            event.stopPropagation();
        }
        if (phase === 'move'
            && note
            && existingPointerMeta
            && existingPointerMeta.note === note
            && (existingPointerMeta.staffIndex === staffIndex)) {
            return;
        }
        let insertIndex = phase === 'start'
            ? this.determineInsertIndexFromCoords(coords, staffIndex)
            : (Number.isInteger(existingPointerMeta?.insertIndex)
                ? existingPointerMeta.insertIndex
                : null);
        if (phase === 'start' && staffIndex == null && Number.isInteger(insertIndex)) {
            staffIndex = insertIndex;
        }
        if (typeof this.staffInputState.onInput === 'function') {
            this.staffInputState.onInput(note, {
                pitchInfo,
                coords,
                phase,
                pointerId,
                staffIndex,
                insertIndex,
            });
        }
        if (phase === 'end' || phase === 'cancel') {
            pointerNotes.delete(pointerKey);
        } else if (pointerKey != null) {
            pointerNotes.set(pointerKey, {
                note: note ?? existingPointerMeta?.note ?? null,
                staffIndex,
                insertIndex,
            });
        }
    }

    resolveStaffIndexFromEvent(event, coords = null) {
        const targetIndex = this.resolveStaffIndexFromTarget(event);
        if (targetIndex != null) {
            return targetIndex;
        }
        return this.resolveStaffIndexFromCoords(coords);
    }

    resolveStaffIndexFromTarget(event) {
        if (!event) return null;
        const buildPath = (start) => {
            const nodes = [];
            let current = start || null;
            while (current) {
                nodes.push(current);
                current = current.parentNode;
            }
            return nodes;
        };
        const path = typeof event.composedPath === 'function'
            ? event.composedPath()
            : buildPath(event.target);
        if (!Array.isArray(path)) return null;
        for (const node of path) {
            if (!node) continue;
            const dataset = node.dataset || {};
            let value = dataset.staffIndex;
            if (value == null && typeof node.getAttribute === 'function') {
                value = node.getAttribute('data-staff-index');
            }
            if (value == null || value === '') continue;
            const parsed = Number.parseInt(value, 10);
            if (Number.isInteger(parsed)) {
                return parsed;
            }
        }
        return null;
    }

    resolveStaffIndexFromCoords(coords) {
        if (!coords || !this.containerEl) return null;
        const svg = this.containerEl.querySelector('svg');
        if (!svg) return null;
        const pointerX = Number.isFinite(coords.x) ? coords.x : coords.scaledX;
        const pointerY = Number.isFinite(coords.y) ? coords.y : coords.scaledY;
        if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) return null;
        const noteEls = svg.querySelectorAll?.('.vf-stavenote[data-staff-index]');
        if (!noteEls || noteEls.length === 0) return null;
        const metrics = this.getRenderStateSnapshot()?.staffMetrics || null;
        const baseSpacing = Number.isFinite(metrics?.spacing) ? metrics.spacing : 10;
        const padding = Math.max(4, baseSpacing * 0.35);
        let bestIndex = null;
        let bestScore = Infinity;
        noteEls.forEach((node) => {
            if (!node) return;
            const attr = node.getAttribute('data-staff-index');
            const idx = Number.parseInt(attr, 10);
            if (!Number.isInteger(idx)) return;
            let bbox = null;
            try {
                bbox = node.getBBox?.();
            } catch (_err) {
                bbox = null;
            }
            if (!bbox) return;
            const expandedX = bbox.x - padding;
            const expandedY = bbox.y - padding;
            const expandedWidth = bbox.width + (padding * 2);
            const expandedHeight = bbox.height + (padding * 2);
            const inside = pointerX >= expandedX
                && pointerX <= expandedX + expandedWidth
                && pointerY >= expandedY
                && pointerY <= expandedY + expandedHeight;
            const centerX = bbox.x + (bbox.width / 2);
            const centerY = bbox.y + (bbox.height / 2);
            const dx = Math.abs(pointerX - centerX);
            const dy = Math.abs(pointerY - centerY);
            const withinBand = dy <= (padding * 1.5);
            if (!inside && !withinBand) return;
            const score = inside ? (dx + dy * 0.1) : (dx + dy);
            if (score < bestScore) {
                bestScore = score;
                bestIndex = idx;
            }
        });
        return bestIndex;
    }

    determineInsertIndexFromCoords(coords, staffIndex) {
        if (Number.isInteger(staffIndex) && staffIndex >= 0) {
            return staffIndex;
        }
        if (!coords || !this.containerEl) {
            return this.noteEntries.length;
        }
        const svg = this.containerEl.querySelector('svg');
        if (!svg) return this.noteEntries.length;
        const noteEls = svg.querySelectorAll?.('.vf-stavenote[data-staff-index]');
        if (!noteEls || noteEls.length === 0) {
            return this.noteEntries.length;
        }
        const targetX = Number.isFinite(coords.x) ? coords.x : coords.scaledX;
        if (!Number.isFinite(targetX)) {
            return this.noteEntries.length;
        }
        let candidate = null;
        noteEls.forEach((node) => {
            if (!node) return;
            const attr = node.getAttribute('data-staff-index');
            const idx = Number.parseInt(attr, 10);
            if (!Number.isInteger(idx)) return;
            let bbox = null;
            try {
                bbox = node.getBBox?.();
            } catch (_err) {
                bbox = null;
            }
            if (!bbox) return;
            const center = bbox.x + (bbox.width / 2);
            if (!Number.isFinite(center)) return;
            if (targetX <= center) {
                if (candidate == null || idx < candidate) {
                    candidate = idx;
                }
            }
        });
        if (candidate == null) {
            return this.noteEntries.length;
        }
        return candidate;
    }

    fallbackSvgCoords(pointerEvent, svg) {
        if (!pointerEvent || !svg) return null;
        const rect = typeof svg.getBoundingClientRect === 'function'
            ? svg.getBoundingClientRect()
            : null;
        if (!rect) return null;
        const clientX = pointerEvent.clientX ?? pointerEvent.pageX;
        const clientY = pointerEvent.clientY ?? pointerEvent.pageY;
        if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
        const viewBoxAttr = svg.getAttribute?.('viewBox') || '';
        let minX = 0;
        let minY = 0;
        let viewWidth = svg.viewBox?.baseVal?.width || svg.width?.baseVal?.value || rect.width || 0;
        let viewHeight = svg.viewBox?.baseVal?.height || svg.height?.baseVal?.value || rect.height || 0;
        if (viewBoxAttr && typeof viewBoxAttr === 'string') {
            const parts = viewBoxAttr.trim().split(/[\s,]+/).map((part) => Number.parseFloat(part));
            if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
                [minX, minY, viewWidth, viewHeight] = parts;
            }
        }
        if (!Number.isFinite(viewWidth) || viewWidth === 0 || !Number.isFinite(viewHeight) || viewHeight === 0) {
            return null;
        }
        const relX = (clientX - rect.left) / rect.width;
        const relY = (clientY - rect.top) / rect.height;
        if (!Number.isFinite(relX) || !Number.isFinite(relY)) return null;
        const x = minX + relX * viewWidth;
        const y = minY + relY * viewHeight;
        const scale = this.getRenderStateSnapshot()?.staffMetrics?.scale || 1;
        return {
            x,
            y,
            scaledX: x * scale,
            scaledY: y * scale,
            scale,
        };
    }

    updateUserNoteAt(index, nextNote) {
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

    removeNoteAt(index) {
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

    async refreshStaffInputBindings() {
        if (!this.staffInputState || !this.staffInputState.enabled) return;
        if (this.staffInputState.strategy === 'interaction') return;
        const helpers = this.staffInputState.helpers || await this.ensureStaffInputHelpers();
        if (!helpers) return;
        if (!this.containerEl) return;
        const svg = this.containerEl.querySelector('svg');
        if (!svg) return;
        svg.style.pointerEvents = 'all';
        svg.setAttribute('pointer-events', 'all');
        this.staffInputState.boundSvg = svg;
        if (this.staffInputState.boundTarget === this.containerEl && this.staffInputState.handlers.length > 0) {
            return;
        }
        this.attachStaffInputListeners();
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
            return;
        }
        const helpers = await this.ensureStaffInputHelpers();
        if (!helpers) {
            this.staffInputState.enabled = false;
            return;
        }
        await this.refreshStaffInputBindings();
    }

    insertNoteEntry(note, options = {}) {
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

    showNoteOnStaff(note, options = {}) {
        if (!note) return;
        this.cancelActiveReplay();
        this.insertNoteEntry(note, options);
        this.enqueue((display) => display.setSequence(this.noteEntries));
    }

    /**
     * Append a note to the staff, trimming older notes so that at most `maxVisible`
     * melodic notes remain. This creates a leftward "scroll" effect when crowded.
     * Only applies to melodic mode; harmonic mode falls back to showNoteOnStaff.
     * @param {string} note
     * @param {number} maxVisible - maximum number of visible notes (default 10)
     */
    showNoteOnStaffWithLimit(note, maxVisible = 10, options = {}) {
        if (!note) return;
        this.cancelActiveReplay();
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
        } else {
            this.insertNoteEntry(note, options);
        }
        const limit = Math.max(1, Number(maxVisible) || 10);
        if (this.noteEntries.length > limit) {
            const drop = this.noteEntries.length - limit;
            this.noteEntries.splice(0, drop);
            this.staffNotes.splice(0, drop);
            this.reindexStaffNotes();
        }
        this.enqueue((display) => display.setSequence(this.noteEntries));
    }

    /** Append a chord explicitly (notes array). Obeys maxVisible window. */
    showChordOnStaffWithLimit(notes, maxVisible = 10) {
        if (!Array.isArray(notes) || notes.length === 0) return;
        return this.showNoteOnStaffWithLimit(notes, maxVisible);
    }

    clearStaffNotes() {
        this.cancelActiveReplay();
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

    updateStaffComparison(currentSequence, userSequence, options = {}) {
        if (!Array.isArray(currentSequence) || currentSequence.length === 0) return;
        const user = Array.isArray(userSequence) ? userSequence : [];
        const mode = options.dictationMode || this.dictationMode;
        if (mode === 'harmonic') {
            if (this.noteEntries.length === 0) return;
            const isCorrect = typeof options.isCorrect === 'boolean'
                ? options.isCorrect
                : this.compareHarmonicSequences(currentSequence, user);

            // Build per-note correctness against the target chord (multiset logic)
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
                // Keep an overall state for messaging, but avoid whole-note coloring in display
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

    getStaffNotes() {
        return this.staffNotes;
    }

    getStaffNotesCount() {
        return this.staffNotes.length;
    }

    highlightNoteOnStaff(note, duration = 600) {
        if (!note) return;
        this.cancelActiveReplay();
        const entry = {
            note,
            state: 'highlight',
            ...(this.shouldStemless() ? { stemless: true } : {}),
        };
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
            // preserve overlay while cancelling highlight
            await display.setSequence(this.noteEntries);
        });
    }

    // Back-compat alias used by some callers
    async replayOnStaff(notes, options = {}) {
        return this.replaySequenceOnStaff(notes, options);
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
                // Intro/reference notes should be stemless for clarity
                stemless: true,
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

    // Show a persistent overlay of the correct answer on the staff
    showAnswerOverlay(sequence, options = {}) {
        const dictationMode = options.dictationMode || this.dictationMode;
        const userSeq = Array.isArray(options.userSequence) ? options.userSequence : null;
        const notes = Array.isArray(sequence) ? sequence.filter((n) => typeof n === 'string' && n) : [];
        if (notes.length === 0) return;
        if (dictationMode === 'harmonic') {
            const spelledTarget = sortNotesAscending(notes.map((n) => this.spell(n)));
            // Determine which target notes are missing from the user's chord
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
                    userCounts.set(key, have + 1); // virtually account to avoid duplicating
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
                // keep place with invisible rest to preserve alignment
                overlay.push({ isRest: true, duration: 'q', state: 'answer', style: { fillStyle: 'transparent', strokeStyle: 'transparent' } });
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
}

StaffDisplayRuntime.attachTo(StaffModule);

// Export the module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StaffModule;
} else {
    window.StaffModule = StaffModule;
}
