class AudioPreviewService {
    constructor(options = {}) {
        this.audioModule = options.audioModule || null;
        this.musicTheory = options.musicTheory || null;
        this.roundPhaseController = options.roundPhaseController || null;
        this.defaultDuration = Number.isFinite(options.defaultDuration)
            ? options.defaultDuration
            : 0.45;
        this.minIntervalMs = Number.isFinite(options.minIntervalMs)
            ? options.minIntervalMs
            : 60;
        this.lastPreviewTime = 0;
    }

    setAudioModule(audioModule) {
        this.audioModule = audioModule || null;
    }

    setMusicTheory(musicTheory) {
        this.musicTheory = musicTheory || null;
    }

    setRoundPhaseController(controller) {
        this.roundPhaseController = controller || null;
    }

    canPreview(options = {}) {
        if (!this.audioModule || typeof this.audioModule.playTone !== 'function') {
            return false;
        }
        if (!this.musicTheory || typeof this.musicTheory.getNoteFrequency !== 'function') {
            return false;
        }
        const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
        if (now - this.lastPreviewTime < this.minIntervalMs) {
            return false;
        }
        if (!options.allowWhilePlaying && typeof this.audioModule.getIsPlaying === 'function' && this.audioModule.getIsPlaying()) {
            return false;
        }
        if (options.phaseGuard && this.roundPhaseController && typeof this.roundPhaseController.getPhase === 'function') {
            const currentPhase = this.roundPhaseController.getPhase();
            const allowed = Array.isArray(options.phaseGuard?.allowed)
                ? options.phaseGuard.allowed
                : null;
            if (allowed && !allowed.includes(currentPhase)) {
                return false;
            }
            const blocked = Array.isArray(options.phaseGuard?.blocked)
                ? options.phaseGuard.blocked
                : null;
            if (blocked && blocked.includes(currentPhase)) {
                return false;
            }
        }
        return true;
    }

    previewPitch(note, options = {}) {
        if (!note) return null;
        if (!this.canPreview(options)) {
            return null;
        }
        const sanitized = typeof note === 'string' ? note.trim() : '';
        if (!sanitized) return null;
        const frequency = this.musicTheory.getNoteFrequency(sanitized);
        if (!Number.isFinite(frequency)) {
            return null;
        }
        const duration = Number.isFinite(options.duration) ? options.duration : this.defaultDuration;
        const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
        this.lastPreviewTime = now;
        try {
            let playPromise;
            if (typeof this.audioModule.playPreviewTone === 'function') {
                playPromise = this.audioModule.playPreviewTone(frequency, duration);
            } else {
                playPromise = this.audioModule.playTone(frequency, duration);
            }
            
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch((error) => {
                    console.warn('[AudioPreview] playback failed:', error);
                });
            }
            return playPromise;
        } catch (error) {
            console.warn('[AudioPreview] unable to play preview tone:', error);
            return null;
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioPreviewService;
} else if (typeof window !== 'undefined') {
    window.AudioPreviewService = AudioPreviewService;
} else if (typeof globalThis !== 'undefined') {
    globalThis.AudioPreviewService = AudioPreviewService;
}
