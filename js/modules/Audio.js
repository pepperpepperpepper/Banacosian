/**
 * Audio Module - Handles audio context initialization and tone generation
 */
class AudioModule {
    constructor() {
        this.audioContext = null;
        this.isPlaying = false;
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

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        console.log('Frequency value:', frequency, 'Type:', typeof frequency, 'Is finite:', isFinite(frequency));
        oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, this.audioContext.currentTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

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