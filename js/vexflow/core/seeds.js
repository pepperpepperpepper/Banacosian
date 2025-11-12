import { logStructured } from '/js/shared/utils.js';

const WAIT_DEFAULT_INTERVAL_MS = 100;
const WAIT_DEFAULT_MAX_ATTEMPTS = 40;

export const INITIAL_NOTE_COUNT = 2;
export const MAX_ADDITIONAL_NOTES = 10;
export const DEFAULT_SEED_NOTE_LIMIT = INITIAL_NOTE_COUNT;

const DEFAULT_RENDER_STATE = Object.freeze({
    abc: null,
    voices: [],
    meter: null,
    warnings: [],
    initialized: false,
    keySig: 'C',
    interactionEnabled: true,
    pendingSelection: null,
    staffMetrics: null,
    svgRect: null,
    activeStave: null,
    staffScale: null,
    fontChoice: null,
    baseMessage: '',
    minWidth: null,
    maxWidth: null,
    targetWidth: null,
    baseHeight: null,
    computedWidth: null,
    computedHeight: null,
});

function cloneVoices(voices) {
    if (!Array.isArray(voices)) return [];
    return voices.map((voice) => ({
        ...voice,
        noteSpecs: Array.isArray(voice?.noteSpecs)
            ? voice.noteSpecs.map((spec) => ({ ...spec }))
            : [],
    }));
}

function normalizePendingSelection(pendingSelection) {
    if (!pendingSelection) return null;
    const voiceIndex = Number.isInteger(pendingSelection.voiceIndex) ? pendingSelection.voiceIndex : null;
    const noteIndex = Number.isInteger(pendingSelection.noteIndex) ? pendingSelection.noteIndex : null;
    if (voiceIndex === null || noteIndex === null) return null;
    return { voiceIndex, noteIndex };
}

export function createRenderState(initial = {}) {
    const warnings = Array.isArray(initial?.warnings) ? [...initial.warnings] : [];
    const voices = cloneVoices(initial?.voices);
    const pendingSelection = normalizePendingSelection(initial?.pendingSelection);
    return {
        ...DEFAULT_RENDER_STATE,
        ...initial,
        warnings,
        voices,
        pendingSelection,
        interactionEnabled: typeof initial?.interactionEnabled === 'boolean'
            ? initial.interactionEnabled
            : DEFAULT_RENDER_STATE.interactionEnabled,
    };
}

export function createRenderRuntime({ initialState = {}, onError } = {}) {
    const state = createRenderState(initialState);
    let queue = Promise.resolve();
    const errorHandler = typeof onError === 'function'
        ? onError
        : (error) => {
            if (error) {
                console.error('[VexflowSeeds] render runtime task failed', error);
            }
        };

    function enqueue(task) {
        if (typeof task !== 'function') return queue;
        queue = queue
            .then(() => Promise.resolve(task(state)))
            .catch((error) => {
                errorHandler(error, state);
                return null;
            });
        return queue;
    }

    function update(partial = {}) {
        if (!partial || typeof partial !== 'object') return state;
        Object.assign(state, partial);
        return state;
    }

    function recordWarnings(warnings) {
        if (!Array.isArray(warnings)) {
            state.warnings = [];
            return state.warnings;
        }
        const unique = Array.from(new Set(warnings.filter(Boolean)));
        state.warnings = unique;
        return state.warnings;
    }

    function setPendingSelection(selection) {
        state.pendingSelection = normalizePendingSelection(selection);
        return state.pendingSelection;
    }

    return {
        state,
        enqueue,
        update,
        recordWarnings,
        setPendingSelection,
        resetQueue: () => { queue = Promise.resolve(); },
        get queue() {
            return queue;
        },
    };
}

const waitCache = new Map();

function hasRequiredApi(abcjs, requireMethod) {
    if (!abcjs) return false;
    if (!requireMethod) return true;
    const candidate = abcjs[requireMethod];
    return typeof candidate === 'function';
}

export function waitForAbcjs({ requireMethod } = {}) {
    if (typeof window === 'undefined') {
        return Promise.reject(new Error('ABCJS loader requires a browser environment.'));
    }

    const cacheKey = requireMethod || '__default__';
    if (waitCache.has(cacheKey)) {
        return waitCache.get(cacheKey);
    }

    const promise = new Promise((resolve, reject) => {
        if (hasRequiredApi(window.ABCJS, requireMethod)) {
            resolve(window.ABCJS);
            return;
        }

        let attempts = 0;
        const timer = window.setInterval(() => {
            attempts += 1;
            if (hasRequiredApi(window.ABCJS, requireMethod)) {
                window.clearInterval(timer);
                resolve(window.ABCJS);
                return;
            }
            if (attempts >= WAIT_DEFAULT_MAX_ATTEMPTS) {
                window.clearInterval(timer);
                reject(new Error('ABCJS failed to load.'));
            }
        }, WAIT_DEFAULT_INTERVAL_MS);
    });

    waitCache.set(cacheKey, promise);
    return promise;
}

export function logSeedInitialization(details) {
    logStructured('[VexflowSeeds] initialization', details);
}
