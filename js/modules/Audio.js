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
            { id: 'sawtooth', label: 'Saw', type: 'sawtooth', peakGain: 0.5 }
        ];
        this.currentTimbreId = this.timbreOptions[0].id;
    }

    /**
     * Initialize the Web Audio API context
     */
    async initializeAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('Audio context initialized successfully');
        } catch (error) {
            console.error('Web Audio API not supported:', error);
            throw new Error('Your browser does not support the Web Audio API. Please use a modern browser.');
        }
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
            await this.audioContext.resume();
        }

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        const timbre = this.getTimbreConfig(this.currentTimbreId);
        const waveform = timbre.type || 'sine';
        const peakGain = typeof timbre.peakGain === 'number' ? timbre.peakGain : 0.3;

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        console.log('Frequency value:', frequency, 'Type:', typeof frequency, 'Is finite:', isFinite(frequency));
        oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
        oscillator.type = waveform;

        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(peakGain, this.audioContext.currentTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(Math.max(peakGain * 0.03, 0.015), this.audioContext.currentTime + duration);

        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + duration);
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
