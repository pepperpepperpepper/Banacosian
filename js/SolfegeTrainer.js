(function initSolfegeTrainer(globalScope) {
    'use strict';

    const DEFAULT_SOLFEGE_TIME_SIGNATURE = '4/4';
    const TIME_SIGNATURE_DENOMINATORS = [1, 2, 4, 8, 16];
    const DEFAULT_SOLFEGE_BPM = 84;
    const MIN_SOLFEGE_BPM = 40;
    const MAX_SOLFEGE_BPM = 160;
    const COUNT_WORDS = [
        '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight',
        'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
        'Seventeen', 'Eighteen', 'Nineteen', 'Twenty', 'Twenty-one', 'Twenty-two', 'Twenty-three', 'Twenty-four',
        'Twenty-five', 'Twenty-six', 'Twenty-seven', 'Twenty-eight', 'Twenty-nine', 'Thirty', 'Thirty-one', 'Thirty-two',
    ];
    const DEFAULT_SING_WINDOW_BEATS = 4;
    const SolfegeLibraryCtor = globalScope?.SolfegeLibrary || null;
    const SolfegeTonePlayerCtor = globalScope?.SolfegeTonePlayer || null;
    const SolfegeStaffCtor = globalScope?.SolfegeStaff || null;
    const SolfegeConductorCtor = globalScope?.SolfegeConductor || null;

    class SolfegeTrainer {
        constructor() {
            this.roundLength = 10;
            this.scaleType = 'diatonic';
            this.sequenceLength = 3;
            this.mode = 'ionian';
            this.referenceType = 'tonic';
            this.tonic = null;
            this.timeSignature = DEFAULT_SOLFEGE_TIME_SIGNATURE;
            this.tempoBpm = DEFAULT_SOLFEGE_BPM;

            this.audioModule = new AudioModule();
            this.musicTheory = new MusicTheoryModule();
            this.staffModule = SolfegeStaffCtor
                ? new SolfegeStaffCtor({ containerId: 'staff-vexflow', showTimeSignature: true })
                : null;
            if (!this.staffModule) {
                console.warn('[Solfege] Staff module unavailable; notation will be disabled.');
            } else if (typeof this.staffModule.setTimeSignatureDisplay === 'function') {
                this.staffModule.setTimeSignatureDisplay(true);
            }
            this.uiModule = new UIModule();
            this.scoringModule = new ScoringModule();
            const cacheToken = globalScope.__EarCacheTag || null;
            this.melodyLibrary = SolfegeLibraryCtor ? new SolfegeLibraryCtor({ cacheToken }) : null;
            const initialVoiceId = this.audioModule?.currentTimbreId || 'sine';
            this.tonePlayer = SolfegeTonePlayerCtor ? new SolfegeTonePlayerCtor({ voiceId: initialVoiceId }) : null;
            this.conductor = SolfegeConductorCtor ? new SolfegeConductorCtor() : null;

            this.currentSequence = [];
            this.currentMelodyPlan = null;
            this.completedRounds = 0;
            this.sessionActive = false;
            this.awaitingAssessment = false;
            this.isPlaybackInProgress = false;
            this.pendingNextTimeout = null;
            this.notationPresented = false;
            this.isPaused = false;
            this.resumePlan = null;
            this.playbackAbortReason = null;
            this.currentCycleKind = null;
            this.pausedAssessmentPending = false;
            this.needsSequenceTimerReset = false;
            this.singWindowBeats = DEFAULT_SING_WINDOW_BEATS;

            this.cacheDom();
            if (this.elements.timeSignatureSelect) {
                this.elements.timeSignatureSelect.value = this.timeSignature;
            }
            this.bindSettingsToggle();
            this.bindEvents();
            this.populateModeDefaults();
            this.populateTimbres();
            this.syncStaffTonality();
            this.syncCountOffToTimeSignature();
            this.bindAudioUnlock();
            this.updateCountOffDisplay('');
            this.disableAssessmentButtons();
            this.updateStartButtonLabel();
            window.addEventListener('beforeunload', () => {
                try { this.audioModule.reset(); } catch (err) { console.warn('[Solfege] Audio reset failed', err); }
                try { this.conductor?.dispose?.(); } catch (err) { console.warn('[Solfege] Conductor dispose failed', err); }
            });
        }

        cacheDom() {
            this.elements = {
                startBtn: document.getElementById('solfegeStartBtn'),
                pauseBtn: document.getElementById('solfegePauseBtn'),
                settingsToggle: document.getElementById('settingsToggle'),
                settingsPanel: document.getElementById('settingsPanel'),
                sequenceLengthSelect: document.getElementById('solfegeSequenceLength'),
                tonicSelect: document.getElementById('solfegeTonic'),
                modeSelect: document.getElementById('solfegeMode'),
                referenceSelect: document.getElementById('solfegeReferenceType'),
                timeSignatureSelect: document.getElementById('solfegeTimeSignature'),
                countOffSelect: document.getElementById('solfegeCountOff'),
                timbreSelect: document.getElementById('solfegeTimbre'),
                correctBtn: document.getElementById('solfegeCorrectBtn'),
                wrongBtn: document.getElementById('solfegeWrongBtn'),
                countOffDisplay: document.getElementById('countOffDisplay'),
            };
            if (this.elements.countOffSelect) {
                this.elements.countOffSelect.setAttribute('disabled', '');
                this.elements.countOffSelect.title = 'Count-off matches the selected time signature.';
            }
            if (this.elements.sequenceLengthSelect) {
                this.elements.sequenceLengthSelect.setAttribute('disabled', '');
                this.elements.sequenceLengthSelect.title = 'Curated melodies currently have a fixed length.';
            }
            if (this.elements.timeSignatureSelect) {
                this.elements.timeSignatureSelect.setAttribute('disabled', '');
                this.elements.timeSignatureSelect.title = 'Curated melodies currently ship in 4/4.';
            }
            if (this.elements.pauseBtn) {
                this.elements.pauseBtn.disabled = true;
            }
        }

        bindAudioUnlock() {
            const events = ['pointerdown', 'touchstart', 'keydown', 'click'];
            const unlock = async () => {
                const ctx = this.audioModule?.getAudioContext();
                if (!ctx) return;
                if (ctx.state === 'suspended') {
                    try { await ctx.resume(); } catch (err) { console.warn('[Solfege] Audio resume failed', err); }
                }
                const tone = globalScope?.Tone;
                if (tone && typeof tone.start === 'function') {
                    try { await tone.start(); } catch (err) { console.warn('[Solfege] Tone resume failed', err); }
                }
                if (ctx.state === 'running') {
                    events.forEach((evt) => {
                        const useCapture = evt === 'pointerdown';
                        document.removeEventListener(evt, unlock, useCapture);
                    });
                }
            };
            events.forEach((evt) => {
                const useCapture = evt === 'pointerdown';
                document.addEventListener(evt, unlock, useCapture);
            });
        }

        bindSettingsToggle() {
            const toggle = this.elements.settingsToggle;
            const panel = this.elements.settingsPanel;
            if (!toggle || !panel) return;
            toggle.addEventListener('click', () => {
                const isHidden = panel.hasAttribute('hidden');
                if (isHidden) {
                    panel.removeAttribute('hidden');
                } else {
                    panel.setAttribute('hidden', '');
                }
                toggle.setAttribute('aria-expanded', String(isHidden));
            });
            const handlePress = (pressed) => {
                if (pressed) toggle.setAttribute('data-pressed', 'true');
                else toggle.removeAttribute('data-pressed');
            };
            ['pointerdown', 'pointerup', 'pointercancel', 'blur'].forEach((evt) => {
                toggle.addEventListener(evt, () => handlePress(evt === 'pointerdown'));
            });
        }

        bindEvents() {
            this.elements.startBtn?.addEventListener('click', () => this.startSession());
            this.elements.pauseBtn?.addEventListener('click', () => this.togglePause());
            this.elements.correctBtn?.addEventListener('click', () => this.handleAssessment(true));
            this.elements.wrongBtn?.addEventListener('click', () => this.handleAssessment(false));

            this.elements.sequenceLengthSelect?.addEventListener('change', (event) => {
                const nextLength = parseInt(event.target.value, 10);
                if (Number.isInteger(nextLength) && nextLength >= 2 && nextLength <= 8) {
                    this.sequenceLength = nextLength;
                }
            });

            this.elements.modeSelect?.addEventListener('change', (event) => {
                this.mode = event.target.value || this.mode;
                this.populateModeDefaults();
                this.syncStaffTonality();
            });

            this.elements.tonicSelect?.addEventListener('change', (event) => {
                this.tonic = event.target.value || this.tonic;
                this.syncStaffTonality();
            });

            this.elements.referenceSelect?.addEventListener('change', (event) => {
                this.referenceType = event.target.value || 'tonic';
            });

            this.elements.timeSignatureSelect?.addEventListener('change', (event) => {
                const normalized = this.normalizeTimeSignature(event.target.value);
                this.timeSignature = normalized;
                if (this.elements.timeSignatureSelect) {
                    this.elements.timeSignatureSelect.value = normalized;
                }
                this.applyTimeSignatureToStaff();
                this.syncCountOffToTimeSignature();
            });

            this.elements.timbreSelect?.addEventListener('change', (event) => {
                const nextTimbre = event.target.value;
                try {
                    this.audioModule.setTimbre(nextTimbre);
                } catch (err) {
                    console.warn('[Solfege] Unable to set timbre', err);
                }
                if (this.tonePlayer && typeof this.tonePlayer.setVoice === 'function') {
                    this.tonePlayer.setVoice(nextTimbre).catch((err) => {
                        console.warn('[Solfege] Unable to update Tone voice', err);
                    });
                }
            });
        }

        populateModeDefaults() {
            const tonicOptions = this.musicTheory.getAvailableTonicsForMode(this.mode) || [];
            const select = this.elements.tonicSelect;
            if (select) {
                select.innerHTML = '';
                tonicOptions.forEach((tonic) => {
                    const option = document.createElement('option');
                    option.value = tonic;
                    option.textContent = tonic;
                    select.appendChild(option);
                });
            }
            if (!this.tonic || !tonicOptions.includes(this.tonic)) {
                this.tonic = tonicOptions[0] || this.musicTheory.getDefaultTonicLetter(this.mode);
            }
            if (select) {
                select.value = this.tonic;
            }
        }

        populateTimbres() {
            const select = this.elements.timbreSelect;
            if (!select) return;
            select.innerHTML = '';
            const timbres = this.audioModule.getAvailableTimbres();
            timbres.forEach((timbre) => {
                const option = document.createElement('option');
                option.value = timbre.id;
                option.textContent = timbre.label;
                select.appendChild(option);
            });
            select.value = this.audioModule.getCurrentTimbreId();
        }

        getTempoBpm() {
            const bpm = Number(this.tempoBpm);
            if (!Number.isFinite(bpm)) {
                return DEFAULT_SOLFEGE_BPM;
            }
            return Math.min(MAX_SOLFEGE_BPM, Math.max(MIN_SOLFEGE_BPM, bpm));
        }

        getBeatDurationMs() {
            const bpm = this.getTempoBpm();
            return Math.round(60000 / Math.max(1, bpm));
        }

        getTimeSignatureParts(raw = this.timeSignature) {
            const defaultDenominator = Number(DEFAULT_SOLFEGE_TIME_SIGNATURE.split('/')[1]) || 4;
            if (raw && typeof raw === 'object') {
                const num = Number(raw.num);
                const den = Number(raw.den);
                if (Number.isFinite(num) && Number.isFinite(den)) {
                    const numerator = Math.max(1, Math.min(32, Math.round(num)));
                    const denominator = TIME_SIGNATURE_DENOMINATORS.includes(Math.round(den))
                        ? Math.round(den)
                        : defaultDenominator;
                    return { num: numerator, den: denominator };
                }
            }
            const value = typeof raw === 'string' && raw.trim().length > 0
                ? raw.trim()
                : DEFAULT_SOLFEGE_TIME_SIGNATURE;
            const match = /^(\d{1,2})\s*\/\s*(\d{1,2})$/.exec(value);
            const numerator = match ? Math.max(1, Math.min(32, parseInt(match[1], 10))) : 4;
            const denominatorRaw = match ? Math.max(1, Math.min(16, parseInt(match[2], 10))) : 4;
            const denominator = TIME_SIGNATURE_DENOMINATORS.includes(denominatorRaw)
                ? denominatorRaw
                : defaultDenominator;
            return { num: numerator, den: denominator };
        }

        normalizeTimeSignature(raw) {
            const parts = this.getTimeSignatureParts(raw);
            return `${parts.num}/${parts.den}`;
        }

        getTimeSignatureLabel() {
            return this.timeSignature || DEFAULT_SOLFEGE_TIME_SIGNATURE;
        }

        getBeatsPerMeasure() {
            const parts = this.getTimeSignatureParts();
            return parts.num;
        }

        getSingWindowBeats() {
            const beats = Number(this.singWindowBeats);
            if (Number.isFinite(beats) && beats > 0) {
                return beats;
            }
            const perMeasure = this.getBeatsPerMeasure();
            return perMeasure * 2 || 4;
        }

        getCountWord(beatNumber) {
            const index = Number.isFinite(beatNumber) ? Math.max(0, Math.min(COUNT_WORDS.length - 1, Math.round(beatNumber))) : 0;
            return COUNT_WORDS[index] || String(beatNumber);
        }

        applyTimeSignatureToStaff(options = {}) {
            if (!this.staffModule || typeof this.staffModule.setTimeSignature !== 'function') {
                return;
            }
            try {
                this.staffModule.setTimeSignature(this.timeSignature, options);
            } catch (err) {
                console.warn('[Solfege] Unable to sync time signature', err);
            }
        }

        syncTimeSignatureSelect(value) {
            if (!this.elements.timeSignatureSelect || !value) return;
            const option = Array.from(this.elements.timeSignatureSelect.options || [])
                .find((opt) => opt && opt.value === value);
            if (option) {
                this.elements.timeSignatureSelect.value = option.value;
            }
        }

        setSequenceLengthDisplay(length) {
            const select = this.elements.sequenceLengthSelect;
            if (!select) return;
            const target = Math.max(1, Number(length) || 1);
            let option = Array.from(select.options || [])
                .find((opt) => Number(opt.value) === target);
            if (!option) {
                option = document.createElement('option');
                option.value = String(target);
                option.textContent = `${target} notes`;
                select.appendChild(option);
            }
            select.value = String(target);
        }

        waitForNextAnimationFrame() {
            if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
                return this.delay(16);
            }
            return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
        }

        async flushStaffRender() {
            await this.waitForNextAnimationFrame();
            await this.waitForNextAnimationFrame();
        }

        updateStartButtonLabel() {
            if (!this.elements.startBtn) return;
            this.elements.startBtn.textContent = this.sessionActive ? 'Restart Session' : 'Start Session';
        }

        updateCountOffDisplay(message) {
            const el = this.elements.countOffDisplay;
            if (!el) return;
            if (message) {
                el.textContent = message;
                el.style.display = 'flex';
            } else {
                el.textContent = '';
                el.style.display = 'none';
            }
        }

        updatePauseButtonState() {
            const btn = this.elements.pauseBtn;
            if (!btn) return;
            if (!this.sessionActive) {
                btn.disabled = true;
                btn.textContent = 'Pause';
                return;
            }
            btn.disabled = false;
            btn.textContent = this.isPaused ? 'Resume' : 'Pause';
        }

        async stopTonePlayback() {
            if (!this.tonePlayer || typeof this.tonePlayer.stop !== 'function') return;
            try {
                await this.tonePlayer.stop();
            } catch (err) {
                console.warn('[Solfege] Unable to stop Tone playback', err);
            }
        }

        applyMelodyPlan(plan) {
            if (!plan) {
                this.currentMelodyPlan = null;
                this.singWindowBeats = this.getBeatsPerMeasure();
                this.setSequenceLengthDisplay(this.sequenceLength);
                if (this.staffModule && typeof this.staffModule.setFinalBarline === 'function') {
                    this.staffModule.setFinalBarline('end');
                }
                return;
            }
            this.currentMelodyPlan = plan;
            this.currentSequence = Array.isArray(plan.pitchNames) ? plan.pitchNames.slice() : [];
            if (this.currentSequence.length === 0 && Array.isArray(plan.staffEntries)) {
                this.currentSequence = plan.staffEntries
                    .filter((entry) => entry && !entry.isRest && (entry.note || (entry.notes && entry.notes.length > 0)))
                    .map((entry) => entry.note || entry.notes[0])
                    .filter(Boolean);
            }
            this.sequenceLength = this.currentSequence.length || this.getBeatsPerMeasure();
            const timeSigLabel = plan.timeSignatureLabel || this.timeSignature || DEFAULT_SOLFEGE_TIME_SIGNATURE;
            this.timeSignature = timeSigLabel;
            this.syncTimeSignatureSelect(timeSigLabel);
            this.applyTimeSignatureToStaff({ force: true });
            this.singWindowBeats = plan.totalBeats || DEFAULT_SING_WINDOW_BEATS;
            const displayLength = this.currentSequence.length || Math.round(this.singWindowBeats);
            this.setSequenceLengthDisplay(displayLength);
            this.syncCountOffToTimeSignature();
            if (this.staffModule && typeof this.staffModule.setFinalBarline === 'function') {
                this.staffModule.setFinalBarline(plan.finalBarline || 'end');
            }
        }

        togglePause() {
            if (!this.sessionActive) return;
            if (this.isPaused) {
                this.resumeSession();
            } else {
                this.pauseSession();
            }
        }

        pauseSession() {
            if (!this.sessionActive || this.isPaused) return;
            this.isPaused = true;
            if (typeof this.scoringModule.pauseSequenceTimer === 'function') {
                this.scoringModule.pauseSequenceTimer();
            }
            this.updatePauseButtonState();
            this.uiModule.updateFeedback('Paused. Tap Resume to keep going.');
            this.resetCountOffSpeechQueue();
            this.pauseAudioContext();
            try {
                if (this.staffModule && typeof this.staffModule.cancelActiveReplay === 'function') {
                    this.staffModule.cancelActiveReplay();
                }
            } catch (err) {
                console.warn('[Solfege] Unable to cancel staff replay during pause', err);
            }

            this.pausedAssessmentPending = this.awaitingAssessment;
            this.disableAssessmentButtons();
            this.needsSequenceTimerReset = false;

            if (this.pendingNextTimeout) {
                clearTimeout(this.pendingNextTimeout);
                this.pendingNextTimeout = null;
                this.resumePlan = { action: 'prepareNext' };
            } else if (this.awaitingAssessment) {
                this.resumePlan = { action: 'awaitAssessment' };
            } else if (this.isPlaybackInProgress) {
                this.requestPlaybackAbort('paused');
                const isReplayCycle = this.currentCycleKind === 'replay';
                this.resumePlan = { action: 'restartCycle', isReplay: isReplayCycle };
                this.needsSequenceTimerReset = !isReplayCycle;
            } else {
                this.resumePlan = { action: 'restartCycle', isReplay: false };
                this.needsSequenceTimerReset = true;
            }
            void this.stopTonePlayback();
            if (this.conductor && typeof this.conductor.cancelPending === 'function') {
                this.conductor.cancelPending();
            }
        }

        resumeSession() {
            if (!this.sessionActive || !this.isPaused) return;
            this.isPaused = false;
            this.playbackAbortReason = null;
            if (typeof this.scoringModule.resumeSequenceTimer === 'function') {
                this.scoringModule.resumeSequenceTimer();
            }
            this.updatePauseButtonState();
            this.resumeAudioContext();
            const pending = this.resumePlan;
            this.resumePlan = null;

            if (pending?.action === 'prepareNext') {
                void this.prepareNextMelody();
            } else if (pending?.action === 'restartCycle') {
                if (this.needsSequenceTimerReset && !pending.isReplay && typeof this.scoringModule.startNewSequence === 'function') {
                    this.scoringModule.startNewSequence();
                }
                this.needsSequenceTimerReset = false;
                void this.playFullCycle({ isReplay: !!pending.isReplay });
            } else if (pending?.action === 'awaitAssessment') {
                if (this.pausedAssessmentPending) {
                    this.enableAssessmentButtons();
                }
            } else if (this.awaitingAssessment && this.pausedAssessmentPending) {
                this.enableAssessmentButtons();
            }

            this.pausedAssessmentPending = false;
            if (pending?.action !== 'restartCycle') {
                this.needsSequenceTimerReset = false;
            }
        }

        pauseAudioContext() {
            try {
                const ctx = this.audioModule?.getAudioContext();
                if (ctx && typeof ctx.suspend === 'function' && ctx.state === 'running') {
                    ctx.suspend().catch((err) => console.warn('[Solfege] Audio suspend failed', err));
                }
            } catch (err) {
                console.warn('[Solfege] Unable to pause audio context', err);
            }
        }

        resumeAudioContext() {
            try {
                const ctx = this.audioModule?.getAudioContext();
                if (ctx && typeof ctx.resume === 'function' && ctx.state === 'suspended') {
                    ctx.resume().catch((err) => console.warn('[Solfege] Audio resume failed', err));
                }
            } catch (err) {
                console.warn('[Solfege] Unable to resume audio context', err);
            }
        }

        requestPlaybackAbort(reason = 'aborted') {
            this.playbackAbortReason = reason || 'aborted';
        }

        throwIfPlaybackAborted() {
            if (!this.playbackAbortReason) return;
            const error = new Error(this.playbackAbortReason);
            error.code = 'PLAYBACK_ABORTED';
            throw error;
        }

        async startSession() {
            if (this.isPlaybackInProgress) return;
            await this.stopTonePlayback();
            if (this.conductor && typeof this.conductor.cancelPending === 'function') {
                this.conductor.cancelPending();
            }
            this.sessionActive = true;
            this.isPaused = false;
            this.resumePlan = null;
            this.playbackAbortReason = null;
            this.pausedAssessmentPending = false;
            this.needsSequenceTimerReset = false;
            this.currentMelodyPlan = null;
            this.singWindowBeats = DEFAULT_SING_WINDOW_BEATS;
            this.updateStartButtonLabel();
            this.updatePauseButtonState();
            if (this.elements.pauseBtn) {
                this.elements.pauseBtn.disabled = false;
            }
            if (this.pendingNextTimeout) {
                clearTimeout(this.pendingNextTimeout);
                this.pendingNextTimeout = null;
            }
            this.completedRounds = 0;
            this.currentSequence = [];
            this.notationPresented = false;
            this.awaitingAssessment = false;
            this.scoringModule.score = { correct: 0, total: 0 };
            this.scoringModule.startNewRound();
            this.scoringModule.updateScore();
            this.scoringModule.updateRoundDisplay();
            this.uiModule.updateUserSequenceDisplay([], [], { dictationType: 'melodic' });
            if (this.staffModule && typeof this.staffModule.clearStaffNotes === 'function') {
                this.staffModule.clearStaffNotes();
            }
            await this.prepareNextMelody();
        }

        async prepareNextMelody() {
            if (!this.sessionActive || this.isPaused) return;
            if (this.completedRounds >= this.roundLength) {
                this.finishSession();
                return;
            }
            let melodyResolved = false;
            if (this.melodyLibrary) {
                try {
                    const plan = await this.melodyLibrary.getRandomMelody({
                        mode: this.mode,
                        tonicLetter: this.tonic,
                        musicTheory: this.musicTheory,
                    });
                    if (!plan || plan.error) {
                        const message = plan?.error === 'unsupported-mode'
                            ? 'The curated Solfege library currently covers Ionian, Aeolian, or Blues. Please pick one of those modes.'
                            : 'Unable to load a curated melody. Please try again.';
                        this.uiModule.updateFeedback(message, 'incorrect');
                        return;
                    }
                    this.applyMelodyPlan(plan);
                    melodyResolved = true;
                } catch (err) {
                    console.warn('[Solfege] Library melody fetch failed', err);
                    this.uiModule.updateFeedback('Unable to load a curated melody. Please try again.', 'incorrect');
                    return;
                }
            }
            if (!melodyResolved) {
                const notePool = this.buildNotePool();
                if (!Array.isArray(notePool) || notePool.length === 0) {
                    this.uiModule.updateFeedback('Unable to build a melody for this mode/tonic. Try another setting.', 'incorrect');
                    return;
                }
                this.currentSequence = this.generateMelody(notePool, this.sequenceLength);
                if (this.currentSequence.length === 0) {
                    this.uiModule.updateFeedback('Melody generation failed. Adjust settings and try again.', 'incorrect');
                    return;
                }
                this.sequenceLength = this.currentSequence.length;
                this.applyMelodyPlan(null);
                this.setSequenceLengthDisplay(this.currentSequence.length);
            }
            this.notationPresented = false;
            this.uiModule.updateSequenceDisplay(this.currentSequence, { dictationType: 'melodic' });
            this.disableAssessmentButtons();
            this.awaitingAssessment = false;
            this.scoringModule.startNewSequence();
            await this.playFullCycle({ isReplay: false });
        }

        buildNotePool() {
            try {
                const diatonic = this.musicTheory.generateDiatonicNotes(this.mode, this.tonic) || [];
                if (diatonic.length > 0) {
                    return diatonic.slice();
                }
            } catch (err) {
                console.warn('[Solfege] Failed to generate diatonic pool', err);
            }
            const fallback = this.musicTheory.getNotes ? this.musicTheory.getNotes() : [];
            return Array.isArray(fallback) ? fallback.slice() : [];
        }

        generateMelody(notePool, length) {
            const targetLength = Math.max(1, Number(length) || 3);
            if (!Array.isArray(notePool) || notePool.length === 0) {
                return [];
            }
            const melody = [];
            for (let i = 0; i < targetLength; i += 1) {
                const note = notePool[Math.floor(Math.random() * notePool.length)];
                melody.push(note);
            }
            return melody;
        }

        async renderSequenceOnStaff() {
            if (!this.staffModule) {
                return;
            }
            try {
                if (this.currentMelodyPlan && typeof this.staffModule.renderPlan === 'function') {
                    await this.staffModule.renderPlan(this.currentMelodyPlan);
                } else if (this.currentMelodyPlan && Array.isArray(this.currentMelodyPlan.staffEntries)
                    && typeof this.staffModule.applyRenderedSequence === 'function') {
                    await this.staffModule.applyRenderedSequence(this.currentMelodyPlan.staffEntries);
                } else if (typeof this.staffModule.applyInteractionSequence === 'function') {
                    await this.staffModule.applyInteractionSequence(this.currentSequence.slice());
                }
            } catch (err) {
                console.warn('[Solfege] Unable to render staff sequence', err);
            }
        }

        async ensureNotationPresented() {
            if (this.notationPresented) {
                return;
            }
            await this.renderSequenceOnStaff();
            await this.flushStaffRender();
            this.notationPresented = true;
        }

        resolveReferenceNote() {
            if (this.referenceType === 'first-note' && this.currentSequence.length > 0) {
                return this.currentSequence[0];
            }
            if (this.currentMelodyPlan?.targetTonicNote) {
                return this.currentMelodyPlan.targetTonicNote;
            }
            try {
                const range = this.musicTheory.getModeRange(this.mode, this.tonic);
                if (range && range.tonicNote) {
                    return range.tonicNote;
                }
            } catch (err) {
                console.warn('[Solfege] Unable to resolve tonic note', err);
            }
            return this.currentSequence[0] || null;
        }

        async playReferenceNote() {
            this.throwIfPlaybackAborted();
            const referenceNote = this.resolveReferenceNote();
            if (!referenceNote) return;
            const displayTonic = this.musicTheory.getDisplayTonicName(this.mode, this.tonic) || this.tonic || 'tonic';
            const referenceLabel = (this.referenceType === 'first-note') ? 'first note' : `tonic ${displayTonic}`;
            this.uiModule.updateFeedback(`Reference: ${referenceLabel}`);
            try {
                if (this.staffModule && typeof this.staffModule.highlightNoteOnStaff === 'function') {
                    this.staffModule.highlightNoteOnStaff(referenceNote, 900);
                }
            } catch (err) {
                console.warn('[Solfege] Highlight failed', err);
            }
            const frequency = this.musicTheory.getNoteFrequency(referenceNote);
            if (typeof frequency === 'number') {
                await this.audioModule.playTone(frequency, 0.7);
                await this.delay(250);
                this.throwIfPlaybackAborted();
            }
        }

        resetCountOffSpeechQueue() {
            if (typeof window === 'undefined' || !window.speechSynthesis || typeof window.speechSynthesis.cancel !== 'function') {
                return;
            }
            try {
                window.speechSynthesis.cancel();
            } catch (err) {
                console.warn('[Solfege] Unable to reset speech queue', err);
            }
        }

        speakCountLabel(label) {
            if (!label || typeof label !== 'string') {
                return false;
            }
            if (typeof window === 'undefined' || !window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') {
                return false;
            }
            try {
                const utterance = new window.SpeechSynthesisUtterance(label);
                const tempo = Math.max(40, Math.min(180, this.getTempoBpm()));
                const normalizedRate = Math.min(1.6, Math.max(1.05, tempo / 70));
                utterance.rate = normalizedRate;
                utterance.pitch = 1.0;
                utterance.volume = 0.9;
                window.speechSynthesis.speak(utterance);
                return true;
            } catch (err) {
                console.warn('[Solfege] Count-off speech failed', err);
                return false;
            }
        }

        playFallbackClick(isDownbeat) {
            if (!this.audioModule || typeof this.audioModule.playTone !== 'function') {
                return;
            }
            const durationSeconds = 0.05;
            const frequency = isDownbeat ? 1900 : 1400;
            try {
                // fire-and-forget; we do not await so the tempo is governed solely by delays
                void this.audioModule.playTone(frequency, durationSeconds);
            } catch (err) {
                console.warn('[Solfege] Count-off click failed', err);
            }
        }

        playCountCue(label, { isDownbeat = false, allowFallback = true } = {}) {
            const usedSpeech = this.speakCountLabel(label);
            if (!usedSpeech && allowFallback) {
                this.playFallbackClick(isDownbeat);
            }
        }

        playMetronomeClick({ isDownbeat = false } = {}) {
            this.playFallbackClick(isDownbeat);
        }

        async playCountOff() {
            if (this.conductor) {
                await this.playCountOffWithConductor();
                return;
            }
            const totalBeats = this.getBeatsPerMeasure();
            if (totalBeats <= 0) return;
            this.throwIfPlaybackAborted();
            const beatDurationMs = this.getBeatDurationMs();
            const label = this.getTimeSignatureLabel();
            this.resetCountOffSpeechQueue();
            for (let beat = 1; beat <= totalBeats; beat += 1) {
                this.throwIfPlaybackAborted();
                const isLastBeat = beat === totalBeats;
                const spokenCue = isLastBeat ? 'Sing' : this.getCountWord(beat);
                const displayCue = isLastBeat
                    ? 'SING'
                    : `Count-off ${label} — ${(spokenCue || '').toString().toUpperCase()}`;
                this.updateCountOffDisplay(displayCue);
                this.playCountCue(spokenCue, {
                    isDownbeat: beat === 1 || isLastBeat,
                    allowFallback: !isLastBeat,
                });
                if (!isLastBeat) {
                    await this.delay(beatDurationMs);
                    this.throwIfPlaybackAborted();
                }
            }
            this.updateCountOffDisplay('SING');
        }

        async playCountOffWithConductor() {
            const beats = this.getBeatsPerMeasure();
            const tempo = this.getTempoBpm();
            const label = this.getTimeSignatureLabel();
            const buildDisplay = (beat, isLast) => {
                if (isLast) {
                    return 'SING';
                }
                const cue = (this.getCountWord(beat) || '').toString().toUpperCase();
                return `Count-off ${label} — ${cue}`;
            };
            const buildWord = (beat, isLast) => {
                if (isLast) return 'sing';
                const cue = this.getCountWord(beat);
                return cue ? cue.toLowerCase() : null;
            };
            try {
                await this.conductor.playCountOff({
                    beats,
                    tempoBpm: tempo,
                    beatsPerMeasure: beats,
                    shouldAbort: () => !!this.playbackAbortReason,
                    buildDisplay,
                    buildWord,
                    onDisplay: ({ label: displayText }) => {
                        if (displayText) {
                            this.updateCountOffDisplay(displayText);
                        }
                    },
                });
            } catch (err) {
                if (err && err.code === 'CONDUCTOR_ABORTED') {
                    this.throwIfPlaybackAborted();
                } else {
                    throw err;
                }
            }
            this.updateCountOffDisplay('SING');
        }

        async runSingMeasure() {
            if (this.conductor) {
                await this.runSingMeasureWithConductor();
                return;
            }
            const beats = this.getSingWindowBeats();
            if (!Number.isFinite(beats) || beats <= 0) {
                await this.delay(300);
                return;
            }
            this.throwIfPlaybackAborted();
            const beatDurationMs = this.getBeatDurationMs();
            const totalBeats = Math.max(1, Math.round(beats));
            const beatsPerMeasure = Math.max(1, this.getBeatsPerMeasure());
            for (let beat = 1; beat <= totalBeats; beat += 1) {
                this.throwIfPlaybackAborted();
                const displayCue = `${beat}/${totalBeats}`;
                this.updateCountOffDisplay(`SING • ${displayCue}`);
                const isDownbeat = ((beat - 1) % beatsPerMeasure) === 0;
                this.playMetronomeClick({ isDownbeat });
                await this.delay(beatDurationMs);
                this.throwIfPlaybackAborted();
            }
            this.updateCountOffDisplay('Playback incoming…');
        }

        async runSingMeasureWithConductor() {
            const beats = Math.max(1, Math.round(this.getSingWindowBeats()));
            const tempo = this.getTempoBpm();
            const beatsPerMeasure = this.getBeatsPerMeasure();
            try {
                await this.conductor.playSingWindow({
                    beats,
                    tempoBpm: tempo,
                    beatsPerMeasure,
                    shouldAbort: () => !!this.playbackAbortReason,
                    buildDisplay: (beat) => `SING • ${beat}/${beats}`,
                    onDisplay: ({ label }) => {
                        this.updateCountOffDisplay(label || 'SING');
                    },
                });
            } catch (err) {
                if (err && err.code === 'CONDUCTOR_ABORTED') {
                    this.throwIfPlaybackAborted();
                } else {
                    throw err;
                }
            }
            this.updateCountOffDisplay('Playback incoming…');
        }

        async playMelodyAudio() {
            this.throwIfPlaybackAborted();
            if (this.currentMelodyPlan && Array.isArray(this.currentMelodyPlan.playbackEvents) && this.tonePlayer) {
                const beatDurationMs = this.getBeatDurationMs();
                const highlightDuration = Math.max(220, Math.min(900, beatDurationMs * 0.85));
                const gapDuration = Math.max(60, Math.min(beatDurationMs * 0.35, 300));
                if (this.staffModule?.replaySequenceOnStaff) {
                    try {
                        this.staffModule.replaySequenceOnStaff(this.currentSequence, {
                            dictationMode: 'melodic',
                            noteDuration: highlightDuration,
                            gapDuration,
                        });
                    } catch (err) {
                        console.warn('[Solfege] Staff playback failed', err);
                    }
                }
                try {
                    await this.tonePlayer.play(this.currentMelodyPlan.playbackEvents, {
                        tempoBpm: this.getTempoBpm(),
                    });
                } catch (err) {
                    console.warn('[Solfege] Tone playback failed', err);
                    await this.delay(420);
                }
                this.throwIfPlaybackAborted();
                return;
            }
            const frequencies = this.currentSequence
                .map((note) => this.musicTheory.getNoteFrequency(note))
                .filter((freq) => typeof freq === 'number' && Number.isFinite(freq));
            if (frequencies.length === 0) {
                await this.delay(400);
                this.throwIfPlaybackAborted();
                return;
            }
            const beatDurationMs = this.getBeatDurationMs();
            const onsetSpacingMs = Math.max(260, beatDurationMs);
            const noteDurationMs = Math.max(220, Math.min(onsetSpacingMs * 0.85, 900));
            const restDurationMs = Math.max(0, onsetSpacingMs - noteDurationMs);
            if (this.staffModule?.replaySequenceOnStaff) {
                try {
                    this.staffModule.replaySequenceOnStaff(this.currentSequence, {
                        dictationMode: 'melodic',
                        noteDuration: noteDurationMs,
                        gapDuration: restDurationMs,
                    });
                } catch (err) {
                    console.warn('[Solfege] Staff playback failed', err);
                }
            }
            for (let i = 0; i < frequencies.length; i += 1) {
                this.throwIfPlaybackAborted();
                await this.audioModule.playTone(frequencies[i], noteDurationMs / 1000);
                await this.delay(noteDurationMs);
                this.throwIfPlaybackAborted();
                if (i < frequencies.length - 1 && restDurationMs > 0) {
                    await this.delay(restDurationMs);
                    this.throwIfPlaybackAborted();
                }
            }
            this.throwIfPlaybackAborted();
        }

        async playFullCycle({ isReplay = false } = {}) {
            if (this.isPlaybackInProgress || this.currentSequence.length === 0 || this.isPaused) return;
            await this.stopTonePlayback();
            this.isPlaybackInProgress = true;
            this.currentCycleKind = isReplay ? 'replay' : 'primary';
            const wasAwaiting = this.awaitingAssessment;
            this.disableAssessmentButtons();
            try {
                await this.audioModule.initializeAudio();
                this.throwIfPlaybackAborted();
                if (isReplay) {
                    this.uiModule.updateFeedback('Replaying last melody…');
                    await this.playMelodyAudio();
                    this.throwIfPlaybackAborted();
                } else {
                    this.uiModule.updateFeedback('Reference pitch incoming…');
                    await this.playReferenceNote();
                    this.throwIfPlaybackAborted();
                    await this.ensureNotationPresented();
                    this.throwIfPlaybackAborted();
                    await this.playCountOff();
                    this.throwIfPlaybackAborted();
                    await this.runSingMeasure();
                    this.throwIfPlaybackAborted();
                    this.uiModule.updateFeedback('Original melody playing…');
                    await this.playMelodyAudio();
                    this.throwIfPlaybackAborted();
                    this.awaitingAssessment = true;
                }
                this.updateCountOffDisplay('');
                if ((this.awaitingAssessment || wasAwaiting) && !this.isPaused) {
                    this.enableAssessmentButtons();
                    this.uiModule.updateFeedback('How did it feel? Mark your result.');
                }
            } catch (err) {
                if (err && err.code === 'PLAYBACK_ABORTED') {
                    // Suppress error output during pause/abort.
                    this.awaitingAssessment = wasAwaiting;
                } else {
                    console.error('[Solfege] Playback failed', err);
                    this.uiModule.updateFeedback('Playback error. Please try again.', 'incorrect');
                    if (!isReplay) {
                        this.awaitingAssessment = false;
                    }
                }
            } finally {
                this.isPlaybackInProgress = false;
                this.currentCycleKind = null;
                if (!this.isPaused) {
                    this.playbackAbortReason = null;
                }
            }
        }

        disableAssessmentButtons() {
            if (this.elements.correctBtn) this.elements.correctBtn.disabled = true;
            if (this.elements.wrongBtn) this.elements.wrongBtn.disabled = true;
        }

        enableAssessmentButtons() {
            if (this.elements.correctBtn) this.elements.correctBtn.disabled = false;
            if (this.elements.wrongBtn) this.elements.wrongBtn.disabled = false;
        }

        async handleAssessment(isCorrect) {
            if (!this.sessionActive || !this.awaitingAssessment || this.isPlaybackInProgress || this.isPaused) {
                return;
            }
            this.awaitingAssessment = false;
            this.disableAssessmentButtons();
            const userSequence = isCorrect ? this.currentSequence.slice() : [];
            const result = this.scoringModule.checkSequence(userSequence, this.currentSequence, { dictationType: 'melodic' });
            this.scoringModule.updateScore();
            this.scoringModule.updateRoundDisplay();

            if (result.isCorrect) {
                this.uiModule.updateFeedback(`Great job! (${result.sequenceTimeFormatted})`, 'correct');
            } else {
                this.uiModule.updateFeedback(`Keep practicing! (${result.sequenceTimeFormatted})`, 'incorrect');
            }

            this.completedRounds += 1;
            if (this.completedRounds >= this.roundLength) {
                this.finishSession();
            } else {
                this.pendingNextTimeout = setTimeout(() => {
                    this.pendingNextTimeout = null;
                    this.prepareNextMelody();
                }, 350);
            }
        }

        finishSession() {
            this.sessionActive = false;
            this.awaitingAssessment = false;
            this.isPaused = false;
            this.resumePlan = null;
            this.playbackAbortReason = null;
            this.needsSequenceTimerReset = false;
            void this.stopTonePlayback();
            if (this.conductor && typeof this.conductor.cancelPending === 'function') {
                this.conductor.cancelPending();
            }
            this.updateStartButtonLabel();
            this.disableAssessmentButtons();
            if (this.pendingNextTimeout) {
                clearTimeout(this.pendingNextTimeout);
                this.pendingNextTimeout = null;
            }
            this.updatePauseButtonState();
            try {
                const summary = this.scoringModule.completeRound(this.scaleType, this.mode, 'melodic', this.sequenceLength);
                const accuracy = summary?.accuracy ?? Math.round((this.scoringModule.score.correct / Math.max(1, this.scoringModule.score.total)) * 100);
                this.uiModule.updateFeedback(`Session complete! Accuracy ${accuracy}%. Press Start to try again.`, 'correct');
            } catch (err) {
                console.warn('[Solfege] Unable to finalize round', err);
                this.uiModule.updateFeedback('Session complete. Press Start to try again.', 'feedback');
            }
        }

        syncStaffTonality() {
            if (!this.staffModule) return;
            try {
                if (typeof this.staffModule.setDictationMode === 'function') {
                    this.staffModule.setDictationMode('melodic');
                }
                const context = this.musicTheory.getKeySignatureContext(this.mode, this.tonic) || {};
                const keySig = context.keySignatureSpec || context.displayTonic || 'C';
                if (typeof this.staffModule.setKeySignature === 'function') {
                    this.staffModule.setKeySignature(keySig);
                }
                this.applyTimeSignatureToStaff();
            } catch (err) {
                console.warn('[Solfege] Unable to sync staff tonality', err);
            }
        }

        syncCountOffToTimeSignature() {
            const beats = this.getBeatsPerMeasure();
            if (!Number.isInteger(beats) || beats <= 0) {
                return;
            }
            const select = this.elements.countOffSelect;
            if (select) {
                const option = Array.from(select.options || []).find((opt) => Number.parseInt(opt.value, 10) === beats);
                if (option) {
                    select.value = option.value;
                }
            }
            this.syncSequenceLengthToMeter(beats);
        }

        syncSequenceLengthToMeter(beatsOverride) {
            const beats = Number.isInteger(beatsOverride) ? beatsOverride : this.getBeatsPerMeasure();
            if (!Number.isInteger(beats) || beats <= 0) {
                return;
            }
            const target = this.currentSequence.length > 0 ? this.currentSequence.length : beats;
            this.sequenceLength = target;
            this.setSequenceLengthDisplay(target);
        }

        delay(ms) {
            return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms || 0)));
        }
    }

    globalScope.SolfegeTrainer = SolfegeTrainer;

    function boot() {
        if (!document.getElementById('solfegeStartBtn')) {
            return;
        }
        globalScope.__solfegeTrainer = new SolfegeTrainer();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})(typeof window !== 'undefined' ? window : globalThis);
