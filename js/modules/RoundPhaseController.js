(() => {
    const globalScope = typeof window !== 'undefined' ? window : globalThis;

    const ROUND_PHASES = globalScope.ROUND_PHASES || Object.freeze({
        IDLE: 'idle',
        REFERENCE_PROMPT: 'reference_prompt',
        REFERENCE_NOTES: 'reference_notes',
        SEQUENCE_PLAYBACK: 'sequence_playback',
        AWAIT_INPUT: 'await_input',
        RESULT_FEEDBACK: 'result_feedback',
        NEXT_SEQUENCE_COUNTDOWN: 'next_sequence_countdown',
    });

    class RoundPhaseController {
        constructor({ uiModule } = {}) {
            this.uiModule = uiModule || null;
            this.roundPhase = ROUND_PHASES.IDLE;
            this.roundPhaseVerbose = false;
            this.initializeRoundPhaseDebug();
        }

        setUiModule(nextModule) {
            this.uiModule = nextModule || null;
        }

        initializeRoundPhaseDebug() {
            if (typeof window === 'undefined') {
                return;
            }
            try {
                const params = new URLSearchParams(window.location.search || '');
                if (params.has('stateDebug')) {
                    this.roundPhaseVerbose = params.get('stateDebug') !== '0';
                } else if (window.localStorage) {
                    const stored = window.localStorage.getItem('dictationStateDebug');
                    this.roundPhaseVerbose = stored === 'true';
                }
            } catch (error) {
                console.warn('Unable to evaluate stateDebug flag:', error);
                this.roundPhaseVerbose = false;
            }

            if (typeof window !== 'undefined') {
                window.DictationDebug = window.DictationDebug || {};
                window.DictationDebug.setRoundPhaseVerbose = (enabled) => {
                    this.setVerboseLogging(Boolean(enabled));
                };
                window.DictationDebug.toggleRoundPhaseVerbose = () => {
                    this.setVerboseLogging(!this.roundPhaseVerbose);
                };
            }

            if (this.roundPhaseVerbose) {
                console.info('[RoundPhase] verbose logging enabled via settings.');
                console.info('[RoundPhase] initial state:', this.roundPhase);
            }
        }

        setVerboseLogging(flag) {
            this.roundPhaseVerbose = Boolean(flag);
            if (typeof window !== 'undefined' && window.localStorage) {
                try {
                    window.localStorage.setItem('dictationStateDebug', this.roundPhaseVerbose ? 'true' : 'false');
                } catch (storageError) {
                    console.warn('Unable to persist stateDebug flag:', storageError);
                }
            }
            console.info(`[RoundPhase] verbose logging ${this.roundPhaseVerbose ? 'enabled' : 'disabled'}.`);
        }

        setPhase(nextPhase, options = {}) {
            const allowed = Object.values(ROUND_PHASES);
            const resolved = allowed.includes(nextPhase) ? nextPhase : ROUND_PHASES.IDLE;
            const previousPhase = this.roundPhase;
            this.roundPhase = resolved;
            if (this.roundPhaseVerbose) {
                console.info('[RoundPhase]', `${previousPhase} -> ${resolved}`, {
                    feedback: options.feedback || null,
                    feedbackClass: options.feedbackClass || 'feedback',
                });
            }
            const { feedback, feedbackClass = 'feedback' } = options;
            if (feedback && this.uiModule && typeof this.uiModule.updateFeedback === 'function') {
                this.uiModule.updateFeedback(feedback, feedbackClass);
            }
        }

        getPhase() {
            return this.roundPhase;
        }

        beginNextSequenceCountdown(seconds, onComplete) {
            this.setPhase(ROUND_PHASES.NEXT_SEQUENCE_COUNTDOWN);
            if (!this.uiModule || typeof this.uiModule.startCountdown !== 'function') {
                if (typeof onComplete === 'function') {
                    onComplete();
                }
                return;
            }
            this.uiModule.startCountdown(seconds, () => {
                this.setPhase(ROUND_PHASES.IDLE);
                if (typeof onComplete === 'function') {
                    onComplete();
                }
            });
        }
    }

    globalScope.RoundPhaseController = RoundPhaseController;
    globalScope.ROUND_PHASES = ROUND_PHASES;
})();
