(function initSolfegeConductor(globalScope) {
    'use strict';

    class SolfegeConductor {
        constructor(options = {}) {
            this.clickLeadSeconds = typeof options.clickLeadSeconds === 'number'
                ? Math.max(0, options.clickLeadSeconds)
                : 0.08;
            this.clickDuration = typeof options.clickDuration === 'number'
                ? Math.max(0.005, options.clickDuration)
                : 0.045;
            this.accentFrequency = options.accentFrequency || 1900;
            this.clickFrequency = options.clickFrequency || 1350;
            this.clickGainDb = typeof options.clickGainDb === 'number' ? options.clickGainDb : -6;
            this.pendingTimeouts = new Set();
            this.tone = null;
            this.clickSynth = null;
            this.countBank = null;
            this.countPlayers = new Map();
        }

        async ensureTone() {
            const Tone = globalScope?.Tone;
            if (!Tone) {
                throw new Error('[SolfegeConductor] Tone.js is not available');
            }
            if (!this.tone) {
                this.tone = Tone;
            }
            await Tone.start();
            if (!this.clickSynth) {
                this.clickSynth = new Tone.MembraneSynth({
                    envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.03 },
                    octaves: 2,
                    pitchDecay: 0.01,
                }).toDestination();
                this.clickSynth.volume.value = this.clickGainDb;
            }
            if (!this.countBank) {
                const CountBankCtor = globalScope?.SolfegeCountAudioBank || null;
                if (CountBankCtor) {
                    this.countBank = new CountBankCtor();
                }
            }
            return this.tone;
        }

        cancelPending() {
            this.pendingTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
            this.pendingTimeouts.clear();
            if (this.tone?.Draw && typeof this.tone.Draw.cancel === 'function') {
                this.tone.Draw.cancel(this.tone.now());
            }
        }

        dispose() {
            this.cancelPending();
            if (this.clickSynth && typeof this.clickSynth.dispose === 'function') {
                this.clickSynth.dispose();
            }
            this.clickSynth = null;
            this.countPlayers.forEach((player) => {
                if (player?.dispose) player.dispose();
            });
            this.countPlayers.clear();
        }

        async playCountOff(options = {}) {
            const beatCount = Math.max(1, Math.round(options.beats || 4));
            return this.playSequence({
                ...options,
                beats: beatCount,
                skipFinalClick: true,
                announceWords: true,
            });
        }

        async playSingWindow(options = {}) {
            const beatCount = Math.max(1, Math.round(options.beats || 8));
            return this.playSequence({
                ...options,
                beats: beatCount,
                skipFinalClick: false,
                announceWords: false,
            });
        }

        async playSequence({
            beats,
            tempoBpm,
            beatsPerMeasure,
            shouldAbort,
            onDisplay,
            buildDisplay,
            buildWord,
            skipFinalClick,
            announceWords,
        }) {
            const Tone = await this.ensureTone();
            this.cancelPending();
            const totalBeats = Math.max(1, Math.round(beats || 1));
            const meter = Math.max(1, Math.round(beatsPerMeasure || totalBeats));
            const beatSeconds = 60 / Math.max(1, tempoBpm || 60);
            const startAt = Tone.now() + this.clickLeadSeconds;

            if (announceWords && typeof buildWord === 'function' && this.countBank) {
                const neededWords = [];
                for (let i = 1; i <= totalBeats; i += 1) {
                    const candidate = buildWord(i, i === totalBeats);
                    if (candidate && this.countBank.hasWord(candidate)) {
                        const key = candidate.toLowerCase();
                        if (!this.countPlayers.has(key)) {
                            neededWords.push(candidate);
                        }
                    }
                }
                if (neededWords.length > 0) {
                    await this.preloadWords(neededWords);
                }
            }

            for (let index = 0; index < totalBeats; index += 1) {
                if (shouldAbort?.()) {
                    this.cancelPending();
                    throw this.createAbortError();
                }
                const beatNumber = index + 1;
                const isLast = beatNumber === totalBeats;
                const isDownbeat = (index % meter) === 0;
                const playbackTime = startAt + index * beatSeconds;

                if (!(skipFinalClick && isLast)) {
                    this.triggerClick({
                        time: playbackTime,
                        isDownbeat,
                    });
                }

                if (announceWords && typeof buildWord === 'function') {
                    const word = buildWord(beatNumber, isLast);
                    if (word) {
                        this.triggerWordSample(word, playbackTime);
                    }
                }

                if (typeof onDisplay === 'function') {
                    Tone.Draw.schedule(() => {
                        if (shouldAbort?.()) return;
                        const label = buildDisplay ? buildDisplay(beatNumber, isLast) : null;
                        onDisplay({ beat: beatNumber, total: totalBeats, isLast, label });
                    }, playbackTime);
                }
            }

            await this.waitUntil(startAt + totalBeats * beatSeconds, shouldAbort);
            this.cancelPending();
        }

        triggerClick({ time, isDownbeat }) {
            if (!this.clickSynth) return;
            const frequency = isDownbeat ? this.accentFrequency : this.clickFrequency;
            this.clickSynth.triggerAttackRelease(frequency, this.clickDuration, time);
        }

        async preloadWords(words = []) {
            if (!this.countBank || !this.tone) return;
            const unique = Array.from(new Set(words.map((w) => (w || '').toLowerCase()).filter(Boolean)));
            const Tone = this.tone;
            const loadPromises = unique.map(async (word) => {
                if (this.countPlayers.has(word)) return;
                const uri = this.countBank.getDataUri(word);
                if (!uri) return;
                const player = new Tone.Player({ autostart: false }).toDestination();
                player.volume.value = -4;
                await player.load(uri);
                this.countPlayers.set(word, player);
            });
            await Promise.all(loadPromises);
        }

        triggerWordSample(word, time) {
            if (!word) return;
            const player = this.countPlayers.get(word.toLowerCase());
            if (!player) return;
            player.start(time);
        }

        waitUntil(targetTime, shouldAbort) {
            if (!this.tone) {
                return Promise.resolve();
            }
            const remainingMs = Math.max(0, (targetTime - this.tone.now()) * 1000);
            return new Promise((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    this.pendingTimeouts.delete(timeoutId);
                    if (shouldAbort?.()) {
                        reject(this.createAbortError());
                    } else {
                        resolve();
                    }
                }, remainingMs);
                this.pendingTimeouts.add(timeoutId);
            });
        }

        createAbortError() {
            const err = new Error('conductor-aborted');
            err.code = 'CONDUCTOR_ABORTED';
            return err;
        }
    }

    globalScope.SolfegeConductor = SolfegeConductor;
})(typeof window !== 'undefined' ? window : globalThis);
