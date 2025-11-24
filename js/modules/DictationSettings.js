(() => {
    const globalScope = typeof window !== 'undefined' ? window : globalThis;

    const SETTINGS_KEYS = [
        'sequenceLength',
        'scaleType',
        'dictationType',
        'mode',
        'tonic',
        'timbre',
        'staffFont',
        'disabledKeysStyle',
        'answerRevealMode',
        'inputMode',
    ];

    class DictationSettings {
        constructor(options = {}) {
            this.store = options.store || (globalScope.SettingsStore || null);
            this.defaults = { ...(options.defaults || {}) };
            this.minSequenceLength = Number.isFinite(options.minSequenceLength)
                ? options.minSequenceLength
                : 2;
            this.maxSequenceLength = Number.isFinite(options.maxSequenceLength)
                ? options.maxSequenceLength
                : 5;
            this.defaultSequenceLength = Number.isFinite(options.defaultSequenceLength)
                ? options.defaultSequenceLength
                : 3;
        }

        normalizeSequenceLength(rawValue) {
            const parsed = Number.parseInt(rawValue, 10);
            if (!Number.isFinite(parsed)) {
                return this.defaultSequenceLength;
            }
            if (parsed < this.minSequenceLength) return this.minSequenceLength;
            if (parsed > this.maxSequenceLength) return this.maxSequenceLength;
            return parsed;
        }

        buildSnapshot(source = {}) {
            if (!source || typeof source !== 'object') {
                return {};
            }
            const snapshot = {};
            SETTINGS_KEYS.forEach((key) => {
                if (source[key] === undefined || source[key] === null) {
                    return;
                }
                if (key === 'sequenceLength') {
                    snapshot.sequenceLength = this.normalizeSequenceLength(source.sequenceLength);
                } else {
                    snapshot[key] = source[key];
                }
            });
            return snapshot;
        }

        loadInitialSettings(overrides = {}) {
            const defaultsSnapshot = this.buildSnapshot(this.defaults);
            const savedSnapshot = this.buildSnapshot(this.readFromStore());
            const overrideSnapshot = this.buildSnapshot(overrides);
            return {
                ...defaultsSnapshot,
                ...savedSnapshot,
                ...overrideSnapshot,
            };
        }

        readFromStore() {
            if (!this.store || typeof this.store.load !== 'function') {
                return null;
            }
            try {
                return this.store.load();
            } catch (error) {
                console.warn('Failed to load saved settings:', error);
                return null;
            }
        }

        async persist(state = {}) {
            const snapshot = this.buildSnapshot({ ...this.defaults, ...state });
            if (!this.store || typeof this.store.save !== 'function') {
                return snapshot;
            }
            try {
                this.store.save(snapshot);
                if (typeof this.store.sha256Hex === 'function' && typeof this.store.setHash === 'function') {
                    const hash = await this.store.sha256Hex(JSON.stringify(snapshot));
                    if (hash) {
                        this.store.setHash(hash);
                    }
                }
            } catch (error) {
                console.warn('Persist settings failed:', error);
            }
            return snapshot;
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = DictationSettings;
    } else {
        globalScope.DictationSettings = DictationSettings;
    }
})();
