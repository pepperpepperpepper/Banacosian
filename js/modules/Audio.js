/**
 * Audio Module - Handles audio context initialization and tone generation
 */
class AudioModule {
    constructor() {
        this.audioContext = null;
        this.isPlaying = false;
        this.timbreOptions = [
            { id: 'sine', label: 'Sine', type: 'sine', peakGain: 0.7 },
            { id: 'triangle', label: 'Triangle', type: 'triangle', peakGain: 0.65 },
            { id: 'square', label: 'Square', type: 'square', peakGain: 0.55 },
            { id: 'sawtooth', label: 'Saw', type: 'sawtooth', peakGain: 0.5 },
            // Sustaining timbre: extended sine that plays until released
            { id: 'flute', label: 'Flute (sustain)', type: 'sine', peakGain: 0.35, sustain: true, attack: 0.03, release: 0.12 }
        ];
        this.currentTimbreId = this.timbreOptions[0].id;
        // Active sustaining voices keyed by an arbitrary key (e.g., note string)
        this.activeSustainVoices = new Map();
        // Pending sustain starts that may still be initializing AudioContext
        this.pendingSustainStarts = new Map(); // key -> { cancel: boolean }
        // Track the active preview voice to enforce monophonic previews
        this.activePreviewVoice = null;
    }

    /**
     * Initialize the Web Audio API context
     */
    async initializeAudio() {
        if (this.audioContext) return; // Prevent double init
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('Audio context initialized successfully');
        } catch (error) {
            console.error('Web Audio API not supported:', error);
            throw new Error('Your browser does not support the Web Audio API. Please use a modern browser.');
        }
    }

    /**
     * Play a single tone for preview purposes.
     * Modified to allow polyphony (chords) by NOT stopping previous voices.
     * @param {number} frequency 
     * @param {number} duration 
     */
    async playPreviewTone(frequency, duration = 0.5) {
        // Polyphony restored: We do NOT stop the previous voice here.
        
        if (!this.audioContext) {
            await this.initializeAudio();
        }

        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        if (typeof frequency !== 'number' || !Number.isFinite(frequency)) {
            return;
        }

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        const timbre = this.getTimbreConfig(this.currentTimbreId);
        const waveform = timbre.type || 'sine';
        const peakGain = typeof timbre.peakGain === 'number' ? timbre.peakGain : 0.3;

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
        oscillator.type = waveform;

        const now = this.audioContext.currentTime;
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(peakGain, now + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(Math.max(peakGain * 0.03, 0.015), now + duration);

        oscillator.start(now);
        oscillator.stop(now + duration);
    }

    /**
     * Play a tone with specified frequency and duration
     * @param {number} frequency - The frequency in Hz
     * @param {number} duration - The duration in seconds (default: 0.5)
     */
    async playTone(frequency, duration = 0.5) {
        if (!this.audioContext) {
            await this.initializeAudio();
        }

        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        if (typeof frequency !== 'number' || !Number.isFinite(frequency)) {
            console.warn('[AudioModule] Skipping tone with invalid frequency:', frequency);
            return;
        }

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        const timbre = this.getTimbreConfig(this.currentTimbreId);
        const waveform = timbre.type || 'sine';
        const peakGain = typeof timbre.peakGain === 'number' ? timbre.peakGain : 0.3;

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
        oscillator.type = waveform;

        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(peakGain, this.audioContext.currentTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(Math.max(peakGain * 0.03, 0.015), this.audioContext.currentTime + duration);

        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + duration);
    }

    /**
     * Play multiple tones simultaneously as a chord
     * @param {number[]} frequencies - Array of frequencies in Hz
     * @param {number} duration - Duration in seconds
     */
    async playChord(frequencies, duration = 0.6) {
        if (!Array.isArray(frequencies) || frequencies.length === 0) {
            return;
        }
        if (!this.audioContext) {
            await this.initializeAudio();
        }
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        const sanitized = frequencies
            .map((freq) => (typeof freq === 'number' && Number.isFinite(freq) ? freq : null))
            .filter((freq) => typeof freq === 'number');
        if (sanitized.length === 0) {
            return;
        }

        const timbre = this.getTimbreConfig(this.currentTimbreId);
        const waveform = timbre.type || 'sine';
        const peakGain = typeof timbre.peakGain === 'number' ? timbre.peakGain : 0.3;
        const normalizedGain = peakGain / Math.max(1, Math.sqrt(sanitized.length));

        const masterGain = this.audioContext.createGain();
        masterGain.connect(this.audioContext.destination);

        const now = this.audioContext.currentTime;
        const stopAt = now + duration;

        masterGain.gain.setValueAtTime(0, now);
        masterGain.gain.linearRampToValueAtTime(normalizedGain, now + 0.05);
        masterGain.gain.exponentialRampToValueAtTime(
            Math.max(normalizedGain * 0.03, 0.015),
            stopAt
        );

        sanitized.forEach((freq) => {
            const oscillator = this.audioContext.createOscillator();
            oscillator.type = waveform;
            oscillator.frequency.setValueAtTime(freq, now);
            oscillator.connect(masterGain);
            oscillator.start(now);
            oscillator.stop(stopAt);
        });
    }

    /**
     * Play a sequence of tones in order with precise scheduling on the AudioContext timeline.
     * @param {number[]} frequencies - Array of frequencies in Hz (played sequentially)
     * @param {number} noteDurationSeconds - Duration of each note in seconds
     * @param {number} gapSeconds - Gap between note onsets in seconds
     */
    async playToneSequence(frequencies, noteDurationSeconds = 0.55, gapSeconds = 0.14) {
        if (!Array.isArray(frequencies) || frequencies.length === 0) {
            return;
        }
        if (!this.audioContext) {
            await this.initializeAudio();
        }
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        const sanitized = frequencies
            .map((freq) => (typeof freq === 'number' && Number.isFinite(freq) ? freq : null))
            .filter((freq) => typeof freq === 'number');
        if (sanitized.length === 0) {
            return;
        }

        const timbre = this.getTimbreConfig(this.currentTimbreId);
        const waveform = timbre.type || 'sine';
        const peakGain = typeof timbre.peakGain === 'number' ? timbre.peakGain : 0.3;
        const noteDur = Math.max(0.05, Number(noteDurationSeconds) || 0.55);
        const gap = Math.max(0, Number(gapSeconds) || 0.14); // onset-to-onset spacing

        const ctx = this.audioContext;
        const now = ctx.currentTime;
        const count = sanitized.length;
        const totalDuration = noteDur + gap * Math.max(0, count - 1);

        sanitized.forEach((freq, index) => {
            const start = now + index * gap;
            const stop = start + noteDur;

            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();

            oscillator.type = waveform;
            oscillator.frequency.setValueAtTime(freq, start);

            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);

            gainNode.gain.setValueAtTime(0, start);
            gainNode.gain.linearRampToValueAtTime(peakGain, start + 0.05);
            gainNode.gain.exponentialRampToValueAtTime(
                Math.max(peakGain * 0.03, 0.015),
                stop
            );

            oscillator.start(start);
            oscillator.stop(stop);
        });

        // Keep the calling code paused until the scheduled audio has completed.
        await new Promise((resolve) => {
            setTimeout(resolve, (totalDuration + 0.05) * 1000);
        });
    }

    /**
     * Check if audio is currently playing
     * @returns {boolean}
     */
    getIsPlaying() {
        return this.isPlaying;
    }

    /**
     * Set the playing state
     * @param {boolean} isPlaying 
     */
    setIsPlaying(isPlaying) {
        this.isPlaying = isPlaying;
    }

    /**
     * Set the active timbre
     * @param {string} timbreId - Timbre identifier
     */
    setTimbre(timbreId) {
        const config = this.getTimbreConfig(timbreId) || this.getTimbreConfig(this.currentTimbreId);
        if (config) {
            this.currentTimbreId = config.id;
        }
        return this.currentTimbreId;
    }

    /**
     * Get a timbre configuration by id
     * @param {string} timbreId
     * @returns {{id:string,label:string,type:string,peakGain:number}|null}
     */
    getTimbreConfig(timbreId) {
        if (!timbreId) {
            return this.timbreOptions[0] || null;
        }
        return this.timbreOptions.find(option => option.id === timbreId) || this.timbreOptions[0] || null;
    }

    /**
     * Get the list of available timbres
     * @returns {Array<{id:string,label:string}>}
     */
    getAvailableTimbres() {
        return this.timbreOptions.map(option => ({ id: option.id, label: option.label }));
    }

    /**
     * Get the current timbre identifier
     * @returns {string}
     */
    getCurrentTimbreId() {
        return this.currentTimbreId;
    }

    /**
     * Get the display label for a timbre
     * @param {string} timbreId
     * @returns {string}
     */
    getTimbreLabel(timbreId) {
        const config = this.getTimbreConfig(timbreId);
        return config ? config.label : '';
    }

    /**
     * Whether the given timbre (or current) is a sustaining timbre.
     */
    isSustainTimbre(timbreId = this.currentTimbreId) {
        const cfg = this.getTimbreConfig(timbreId);
        return !!(cfg && cfg.sustain);
    }

    /**
     * Start a sustaining tone identified by a caller-provided key (e.g., note "C4").
     * If a voice with the same key already exists, it is left running.
     * Returns the key for convenience.
     */
    async startSustain(key, frequency) {
        if (!key) return null;
        if (this.activeSustainVoices.has(key)) return key;
        let pending = this.pendingSustainStarts.get(key);
        if (!pending) {
            pending = { cancel: false };
            this.pendingSustainStarts.set(key, pending);
        } else {
            pending.cancel = false; // reset any stale cancel
        }
        try {
            if (!this.audioContext) {
                await this.initializeAudio();
            }
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            if (!Number.isFinite(frequency)) return null;
            if (pending.cancel) { this.pendingSustainStarts.delete(key); return null; }
            if (this.activeSustainVoices.has(key)) { this.pendingSustainStarts.delete(key); return key; }

            const cfg = this.getTimbreConfig(this.currentTimbreId) || {};
            const waveform = cfg.type || 'sine';
            const peakGain = typeof cfg.peakGain === 'number' ? cfg.peakGain : 0.25;
            const attack = Math.max(0.005, Number(cfg.attack || 0.02));

            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            osc.type = waveform;
            osc.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
            osc.connect(gain);
            gain.connect(this.audioContext.destination);

            const now = this.audioContext.currentTime;
            gain.gain.cancelScheduledValues(now);
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(peakGain, now + attack);

            osc.start(now);
            this.activeSustainVoices.set(key, { osc, gain, startedAt: now });
            if (pending.cancel) {
                // A stop was requested while starting; release immediately
                this._releaseVoice(key, this.activeSustainVoices.get(key));
            }
            return key;
        } finally {
            this.pendingSustainStarts.delete(key);
        }
    }

    /**
     * Stop a sustaining tone previously started with startSustain.
     */
    stopSustain(key) {
        if (!key) return;
        const voice = this.activeSustainVoices.get(key);
        if (voice) {
            this._releaseVoice(key, voice);
            return;
        }
        const pending = this.pendingSustainStarts.get(key);
        if (pending) {
            pending.cancel = true;
        }
    }

    /** Internal: release and remove a sustain voice safely. */
    _releaseVoice(key, voice) {
        if (!voice) return;
        const cfg = this.getTimbreConfig(this.currentTimbreId) || {};
        const release = Math.max(0.02, Number(cfg.release || 0.08));
        try {
            const now = this.audioContext ? this.audioContext.currentTime : 0;
            if (voice.gain && voice.gain.gain) {
                voice.gain.gain.cancelScheduledValues(now);
                const current = voice.gain.gain.value;
                voice.gain.gain.setValueAtTime(current, now);
                voice.gain.gain.linearRampToValueAtTime(0.0001, now + release);
            }
            if (voice.osc) {
                voice.osc.stop(now + release + 0.01);
            }
        } catch (_) {}
        this.activeSustainVoices.delete(key);
    }

    /** Stop all sustaining voices (safety). */
    stopAllSustain() {
        for (const [key, voice] of Array.from(this.activeSustainVoices.entries())) {
            this._releaseVoice(key, voice);
        }
        for (const pending of this.pendingSustainStarts.values()) {
            pending.cancel = true;
        }
    }

    /**
     * Get the audio context
     * @returns {AudioContext|null}
     */
    getAudioContext() {
        return this.audioContext;
    }
}

// Export the module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioModule;
} else {
    window.AudioModule = AudioModule;
}
