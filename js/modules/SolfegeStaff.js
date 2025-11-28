(function initSolfegeOsmdStaff(globalScope) {
    'use strict';

    const OSMD_DRAWING_PARAMS = 'compacttight';
    const PLACEHOLDER_HTML = '<p class="staff-placeholder">Notation will appear here after you start a round.</p>';

    function getOsmdNamespace(scope) {
        return scope && scope.opensheetmusicdisplay ? scope.opensheetmusicdisplay : null;
    }

    class SolfegeStaff {
        constructor(options = {}) {
            const scope = typeof document !== 'undefined' ? document : null;
            const containerId = options.containerId || 'staff-vexflow';
            this.container = options.container || (scope ? scope.getElementById(containerId) : null);
            this.statusEl = options.statusEl || null;
            this.osmd = null;
            this.osmdPromise = null;
            this.renderQueue = Promise.resolve();
            this.lastPlan = null;
            this.activeReplayToken = null;
            this.placeholderShown = false;

            if (this.container && !this.container.innerHTML.trim()) {
                this.container.innerHTML = PLACEHOLDER_HTML;
                this.placeholderShown = true;
            }
        }

        hasOsmd() {
            return !!getOsmdNamespace(globalScope)?.OpenSheetMusicDisplay;
        }

        ensureOsmd() {
            if (!this.container) {
                console.warn('[SolfegeStaff] Container element missing.');
                return Promise.resolve(null);
            }
            if (this.osmd) {
                return Promise.resolve(this.osmd);
            }
            if (this.osmdPromise) {
                return this.osmdPromise;
            }
            if (!this.hasOsmd()) {
                console.warn('[SolfegeStaff] OpenSheetMusicDisplay library not found on window.');
                return Promise.resolve(null);
            }
            const namespace = getOsmdNamespace(globalScope);
            const OpenSheetMusicDisplay = namespace.OpenSheetMusicDisplay;
            const options = {
                autoResize: true,
                backend: 'svg',
                drawTitle: false,
                drawSubtitle: false,
                drawLyricist: false,
                drawComposer: false,
                drawPartNames: false,
                drawMeasureNumbers: false,
                drawingParameters: OSMD_DRAWING_PARAMS,
            };
            this.osmdPromise = (async () => {
                const osmd = new OpenSheetMusicDisplay(this.container, options);
                if (typeof osmd.setLogLevel === 'function') {
                    // Suppress verbose info/debug logs in the console.
                    osmd.setLogLevel('warn');
                }
                this.osmd = osmd;
                return osmd;
            })().catch((error) => {
                console.error('[SolfegeStaff] Failed to initialize OSMD.', error);
                this.osmdPromise = null;
                return null;
            });
            return this.osmdPromise;
        }

        renderPlan(plan) {
            if (!plan || !plan.musicXmlUrl) {
                return this.clearStaffNotes();
            }
            this.lastPlan = plan;
            this.renderQueue = this.renderQueue
                .then(() => this.renderPlanInternal(plan))
                .catch((error) => {
                    console.error('[SolfegeStaff] Unable to render plan.', error);
                });
            return this.renderQueue;
        }

        async renderPlanInternal(plan) {
            const osmd = await this.ensureOsmd();
            if (!osmd) return;
            try {
                if (this.placeholderShown) {
                    this.container.innerHTML = '';
                    this.placeholderShown = false;
                }
                await osmd.load(plan.musicXmlUrl);
                this.applyTranspose(osmd, Number(plan.transposeSemitones) || 0);
                await osmd.render();
                if (this.statusEl) {
                    this.statusEl.textContent = `Rendered ${plan.timeSignatureLabel || ''} melody`;
                }
            } catch (error) {
                console.error('[SolfegeStaff] OSMD render failed.', error);
                throw error;
            }
        }

        applyTranspose(osmd, semitoneOffset) {
            const namespace = getOsmdNamespace(globalScope);
            if (!osmd) return;
            const transposeValue = Number.isFinite(semitoneOffset) ? semitoneOffset : 0;
            if (transposeValue === 0) {
                if (osmd.sheet) {
                    osmd.sheet.Transpose = 0;
                }
                return;
            }
            if (!osmd.TransposeCalculator && namespace?.TransposeCalculator) {
                osmd.TransposeCalculator = new namespace.TransposeCalculator();
            }
            if (osmd.sheet) {
                osmd.sheet.Transpose = transposeValue;
            }
        }

        clearStaffNotes() {
            if (this.container) {
                this.container.innerHTML = PLACEHOLDER_HTML;
                this.placeholderShown = true;
            }
            return Promise.resolve();
        }

        cancelActiveReplay() {
            this.activeReplayToken = null;
            return Promise.resolve();
        }

        setTimeSignatureDisplay() { return Promise.resolve(); }

        setTimeSignature() { return Promise.resolve(); }

        setKeySignature() { return Promise.resolve(); }

        setClef() { return Promise.resolve(); }

        setFinalBarline() { return Promise.resolve(); }

        setDictationMode() { return Promise.resolve(); }

        applyRenderedSequence() {
            return this.renderPlan(this.lastPlan);
        }

        applyInteractionSequence() {
            return this.renderPlan(this.lastPlan);
        }

        highlightNoteOnStaff() { return Promise.resolve(); }

        replaySequenceOnStaff() { return Promise.resolve(); }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = SolfegeStaff;
    } else if (globalScope) {
        globalScope.SolfegeStaff = SolfegeStaff;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
