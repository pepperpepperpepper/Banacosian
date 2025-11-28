(function initSolfegeTonePlayer(globalScope) {
    'use strict';

    const DEFAULT_TEMPO = 84;
    const MIN_TEMPO = 30;
    const MAX_TEMPO = 220;
    const VOICE_PRESETS = {
        sine: {
            oscillator: { type: 'sine' },
            envelope: { attack: 0.015, decay: 0.08, sustain: 0.85, release: 0.25 }
        },
        triangle: {
            oscillator: { type: 'triangle' },
            envelope: { attack: 0.01, decay: 0.06, sustain: 0.8, release: 0.22 }
        },
        square: {
            oscillator: { type: 'square' },
            envelope: { attack: 0.005, decay: 0.07, sustain: 0.7, release: 0.18 }
        },
        sawtooth: {
            oscillator: { type: 'sawtooth' },
            envelope: { attack: 0.004, decay: 0.06, sustain: 0.6, release: 0.16 }
        },
        flute: {
            oscillator: { type: 'sine' },
            envelope: { attack: 0.03, decay: 0.05, sustain: 0.9, release: 0.35 },
            portamento: 0.015
        }
    };

    class SolfegeTonePlayer {
        constructor(options = {}) {
            this.voiceId = options.voiceId || 'sine';
            this.synth = null;
            this.stopTimer = null;
            this.pendingResolve = null;
            this.active = false;
        }

        getTone() {
            const tone = globalScope?.Tone;
            if (!tone) {
                throw new Error('Tone.js is not loaded.');
            }
            return tone;
        }

        async ensureSynth() {
            if (this.synth) {
                return this.synth;
            }
            const tone = this.getTone();
            const voice = VOICE_PRESETS[this.voiceId] || VOICE_PRESETS.sine;
            this.synth = new tone.PolySynth(tone.Synth, voice).toDestination();
            if (typeof this.synth.maxPolyphony === 'number') {
                this.synth.maxPolyphony = 8;
            }
            return this.synth;
        }

        async initialize() {
            await this.ensureSynth();
        }

        async setVoice(voiceId) {
            if (!voiceId || voiceId === this.voiceId) {
                return;
            }
            this.voiceId = voiceId;
            if (this.synth && typeof this.synth.dispose === 'function') {
                try { this.synth.dispose(); } catch (err) { console.warn('[SolfegeTonePlayer] dispose failed', err); }
            }
            this.synth = null;
            await this.ensureSynth();
        }

        normalizeTempo(tempoBpm) {
            const value = Number(tempoBpm);
            if (!Number.isFinite(value)) {
                return DEFAULT_TEMPO;
            }
            return Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, value));
        }

        async play(events, options = {}) {
            if (!Array.isArray(events) || events.length === 0) {
                return;
            }
            const tone = this.getTone();
            await tone.start();
            await this.stop();
            const synth = await this.ensureSynth();
            const tempo = this.normalizeTempo(options.tempoBpm);
            const secondsPerBeat = 60 / tempo;
            const startAt = tone.now() + 0.04;
            let furthestTime = startAt;

            events.forEach((event) => {
                const startTime = startAt + (Math.max(0, event.startBeat || 0) * secondsPerBeat);
                const durationSeconds = Math.max(0.035, (event.durationBeats || 0) * secondsPerBeat);
                if (!event.isRest && Array.isArray(event.midiPitches) && event.midiPitches.length > 0) {
                    const notes = event.midiPitches.map((midi) => tone.Frequency(midi, 'midi').toFrequency());
                    synth.triggerAttackRelease(notes, durationSeconds, startTime, 0.92);
                }
                const eventEnd = startTime + durationSeconds;
                if (eventEnd > furthestTime) {
                    furthestTime = eventEnd;
                }
            });

            const totalMs = Math.max(0, ((furthestTime - tone.now()) * 1000) + 30);
            return new Promise((resolve) => {
                this.active = true;
                this.pendingResolve = resolve;
                this.stopTimer = setTimeout(() => {
                    this.finishPlayback();
                }, totalMs);
            });
        }

        finishPlayback() {
            if (this.stopTimer) {
                clearTimeout(this.stopTimer);
                this.stopTimer = null;
            }
            if (this.synth && typeof this.synth.releaseAll === 'function') {
                try { this.synth.releaseAll(); } catch (err) { console.warn('[SolfegeTonePlayer] releaseAll failed', err); }
            }
            if (this.pendingResolve) {
                this.pendingResolve();
                this.pendingResolve = null;
            }
            this.active = false;
        }

        async stop() {
            if (this.stopTimer) {
                clearTimeout(this.stopTimer);
                this.stopTimer = null;
            }
            if (this.synth && typeof this.synth.releaseAll === 'function') {
                try { this.synth.releaseAll(); } catch (err) { console.warn('[SolfegeTonePlayer] releaseAll failed', err); }
            }
            if (this.pendingResolve) {
                this.pendingResolve();
                this.pendingResolve = null;
            }
            this.active = false;
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = SolfegeTonePlayer;
    } else {
        globalScope.SolfegeTonePlayer = SolfegeTonePlayer;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
