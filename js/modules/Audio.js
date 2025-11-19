/**
 * Audio Module - Handles audio context initialization and tone generation
 */
class AudioModule {
    constructor() {
        this.audioContext = null;
        this.isPlaying = false;
        this.timbreOptions = [
            { id: "sine", label: "Sine", type: "sine", peakGain: 0.7 },
            {
                id: "triangle",
                label: "Triangle",
                type: "triangle",
                peakGain: 0.65,
            },
            { id: "square", label: "Square", type: "square", peakGain: 0.55 },
            { id: "sawtooth", label: "Saw", type: "sawtooth", peakGain: 0.5 },
        ];
        this.currentTimbreId = this.timbreOptions[0].id;
    }

    /**
     * Initialize the Web Audio API context
     */
    async initializeAudio() {
        try {
            this.audioContext = new (window.AudioContext ||
                window.webkitAudioContext)();
            console.log("Audio context initialized successfully");
        } catch (error) {
            console.error("Web Audio API not supported:", error);
            throw new Error(
                "Your browser does not support the Web Audio API. Please use a modern browser.",
            );
        }
    }

    /**
     * Play a tone with specified frequency and duration
     * @param {number} frequency - The frequency in Hz
     * @param {number} duration - The duration in seconds (default: 0.5)
     */
    async playTone(frequency, duration = 0.5) {
        duration *= 2;
        if (!this.audioContext) {
            await this.initializeAudio();
        }

        if (this.audioContext.state === "suspended") {
            await this.audioContext.resume();
        }

        if (typeof frequency !== "number" || !Number.isFinite(frequency)) {
            console.warn(
                "[AudioModule] Skipping tone with invalid frequency:",
                frequency,
            );
            return;
        }

        const oscillator = this.audioContext.createOscillator();
        const oscillator2 = this.audioContext.createOscillator();
        const envelope = this.audioContext.createGain();
        const gain1 = this.audioContext.createGain();
        const gain2 = this.audioContext.createGain();
        const biquadFilter = this.audioContext.createBiquadFilter();

        const timbre = this.getTimbreConfig(this.currentTimbreId);
        const waveform = timbre.type || "sine";
        const peakGain =
            typeof timbre.peakGain === "number" ? timbre.peakGain : 0.3;
        const needsFilter = waveform === "square" || waveform == "sawtooth";

        oscillator.connect(gain1);
        oscillator2.connect(gain2);
        if (needsFilter) {
            gain1.connect(biquadFilter);
            gain2.connect(biquadFilter);
            biquadFilter.connect(envelope);
        } else {
            gain1.connect(envelope);
            gain2.connect(envelope);
        }
        envelope.connect(this.audioContext.destination);

        // Oscillator at fundamental
        oscillator.frequency.setValueAtTime(
            frequency,
            this.audioContext.currentTime,
        );
        oscillator.type = waveform;
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + duration);

        // Suboscillator an octave down
        oscillator2.frequency.setValueAtTime(
            frequency / 2,
            this.audioContext.currentTime,
        );
        oscillator2.type = needsFilter ? "square" : waveform;
        oscillator2.start(this.audioContext.currentTime);
        oscillator2.stop(this.audioContext.currentTime + duration);

        // Mix of Osc + Sub
        let mix = needsFilter ? 0.5 : 0.7;
        let mult = needsFilter ? 1 : 1.3;
        gain1.gain.setValueAtTime(
            peakGain * mix * mult,
            this.audioContext.currentTime,
        );
        gain2.gain.setValueAtTime(
            peakGain * (1 - mix) * mult,
            this.audioContext.currentTime,
        );

        // VCF for square/saw sound
        if (needsFilter) {
            biquadFilter.type = "lowpass";
            biquadFilter.frequency.setValueAtTime(
                Math.min(
                    frequency * Math.pow(2, waveform === "square" ? 4 : 2.2),
                    22050,
                ),
                this.audioContext.currentTime,
            );
            biquadFilter.Q.setValueAtTime(1, this.audioContext.currentTime);
            biquadFilter.frequency.exponentialRampToValueAtTime(
                frequency,
                this.audioContext.currentTime + duration / 4,
            );
            biquadFilter.frequency.exponentialRampToValueAtTime(
                frequency / 3,
                this.audioContext.currentTime + duration,
            );
        }

        // VCA Envelope
        envelope.gain.setValueAtTime(0, this.audioContext.currentTime);
        envelope.gain.linearRampToValueAtTime(
            peakGain,
            this.audioContext.currentTime + 0.05,
        );
        envelope.gain.exponentialRampToValueAtTime(
            Math.max(peakGain * 0.03, 0.015),
            this.audioContext.currentTime + duration * 0.95,
        );
        envelope.gain.exponentialRampToValueAtTime(
            0.0001,
            this.audioContext.currentTime + duration,
        );
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
        if (this.audioContext.state === "suspended") {
            await this.audioContext.resume();
        }

        const sanitized = frequencies
            .map((freq) =>
                typeof freq === "number" && Number.isFinite(freq) ? freq : null,
            )
            .filter((freq) => typeof freq === "number");
        if (sanitized.length === 0) {
            return;
        }

        const timbre = this.getTimbreConfig(this.currentTimbreId);
        const waveform = timbre.type || "sine";
        const peakGain =
            typeof timbre.peakGain === "number" ? timbre.peakGain : 0.3;
        const normalizedGain =
            peakGain / Math.max(1, Math.sqrt(sanitized.length));

        const masterGain = this.audioContext.createGain();
        masterGain.connect(this.audioContext.destination);

        const now = this.audioContext.currentTime;
        const stopAt = now + duration;

        masterGain.gain.setValueAtTime(0, now);
        masterGain.gain.linearRampToValueAtTime(normalizedGain, now + 0.05);
        masterGain.gain.exponentialRampToValueAtTime(
            Math.max(normalizedGain * 0.03, 0.015),
            stopAt,
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
        const config =
            this.getTimbreConfig(timbreId) ||
            this.getTimbreConfig(this.currentTimbreId);
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
        return (
            this.timbreOptions.find((option) => option.id === timbreId) ||
            this.timbreOptions[0] ||
            null
        );
    }

    /**
     * Get the list of available timbres
     * @returns {Array<{id:string,label:string}>}
     */
    getAvailableTimbres() {
        return this.timbreOptions.map((option) => ({
            id: option.id,
            label: option.label,
        }));
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
        return config ? config.label : "";
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
if (typeof module !== "undefined" && module.exports) {
    module.exports = AudioModule;
} else {
    window.AudioModule = AudioModule;
}
