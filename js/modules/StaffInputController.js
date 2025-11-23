class StaffInputController {
    constructor(options = {}) {
        this.staffModule = options.staffModule || null;
        this.getPracticeSequence = options.getPracticeSequence || (() => []);
        this.setPracticeSequence = options.setPracticeSequence || (() => {});
        this.getAnswerSequence = options.getAnswerSequence || (() => []);
        this.setAnswerSequence = options.setAnswerSequence || (() => {});
        this.getPracticeLimit = options.getPracticeLimit || (() => 0);
        this.getAnswerLimit = options.getAnswerLimit || (() => 0);
        this.getContext = options.getContext || (() => ({}));
        this.onPracticeChange = options.onPracticeChange || (() => {});
        this.onAnswerChange = options.onAnswerChange || (() => {});
        this.onAnswerReady = options.onAnswerReady || (() => {});
        this.onSubmitStateChange = options.onSubmitStateChange || (() => {});
        this.onComparisonUpdate = options.onComparisonUpdate || (() => {});
        this.onFeedback = options.onFeedback || (() => {});
        this.onPitchPreview = options.onPitchPreview || (() => {});
        this.previewService = options.previewService || null;

        this.phase = 'practice';
        this.enabled = false;
        this.practiceLimit = this.normalizeLimit(this.getPracticeLimit());
        this.answerLimit = this.normalizeLimit(this.getAnswerLimit());
    }

    normalizeLimit(raw) {
        if (!Number.isFinite(raw) || raw <= 0) return 0;
        return raw;
    }

    getPhase() {
        return this.phase;
    }

    setPhase(nextPhase) {
        if (!nextPhase) return;
        this.phase = nextPhase;
    }

    async setEnabled(enabled, options = {}) {
        if (!this.staffModule || typeof this.staffModule.setStaffInputMode !== 'function') {
            return;
        }
        if (!enabled) {
            await this.staffModule.setStaffInputMode({ enabled: false });
            this.enabled = false;
            this.phase = 'disabled';
            return;
        }
        const payload = {
            enabled: true,
            onInput: (note, meta = {}) => {
                this.handleStaffInput(note, meta);
            },
        };
        if (Number.isFinite(options.midiMin)) payload.midiMin = options.midiMin;
        if (Number.isFinite(options.midiMax)) payload.midiMax = options.midiMax;
        await this.staffModule.setStaffInputMode(payload);
        this.enabled = true;
        if (options.phase) {
            this.phase = options.phase;
        } else if (this.phase === 'disabled') {
            this.phase = 'practice';
        }
    }

    setPracticeLimit(limit) {
        this.practiceLimit = this.normalizeLimit(limit);
        this.trimPracticeToLimit();
    }

    setAnswerLimit(limit) {
        this.answerLimit = this.normalizeLimit(limit);
        this.trimAnswerToLimit();
    }

    resetPracticeSequence() {
        const sequence = this.getPracticeSequence();
        if (!Array.isArray(sequence) || sequence.length === 0) return;
        sequence.length = 0;
        this.setPracticeSequence(sequence);
        this.emitPracticeChange({ reason: 'reset' });
    }

    resetAnswerSequence() {
        const sequence = this.getAnswerSequence();
        if (!Array.isArray(sequence) || sequence.length === 0) return;
        sequence.length = 0;
        this.setAnswerSequence(sequence);
        this.emitAnswerChange({ reason: 'reset', requiresSubmit: this.requiresSubmit() });
        this.onSubmitStateChange(false);
    }

    trimPracticeToLimit() {
        const limit = this.practiceLimit;
        if (limit <= 0) {
            this.resetPracticeSequence();
            return;
        }
        const sequence = this.getPracticeSequence();
        if (!Array.isArray(sequence) || sequence.length <= limit) return;
        sequence.length = limit;
        this.setPracticeSequence(sequence);
        this.emitPracticeChange({ reason: 'limit-trim' });
    }

    trimAnswerToLimit() {
        const limit = this.answerLimit;
        if (limit <= 0) {
            this.resetAnswerSequence();
            return;
        }
        const sequence = this.getAnswerSequence();
        if (!Array.isArray(sequence) || sequence.length <= limit) return;
        sequence.length = limit;
        this.setAnswerSequence(sequence);
        this.emitAnswerChange({ reason: 'limit-trim', requiresSubmit: this.requiresSubmit() });
    }

    handleStaffInput(note, meta = {}) {
        if (!this.enabled) return false;
        const phase = this.phase;
        if (meta.phase === 'move' || meta.phase === 'end' || meta.phase === 'cancel') {
            return true;
        }
        if (phase === 'practice') {
            return this.handlePracticeInput(note, meta);
        }
        if (phase === 'answer') {
            return this.handleAnswerInput(note, meta);
        }
        return false;
    }

    handlePracticeInput(note, meta) {
        const sequence = this.getPracticeSequence();
        if (!Array.isArray(sequence)) return true;
        const limit = this.practiceLimit > 0 ? this.practiceLimit : this.normalizeLimit(this.getPracticeLimit());
        if (limit <= 0) {
            this.resetPracticeSequence();
            return true;
        }
        const staffIndex = this.normalizeIndex(meta.staffIndex);
        const insertIndex = this.normalizeInsertIndex(meta.insertIndex, sequence.length);
        const isDelete = meta.operation === 'delete';
        if (isDelete) {
            if (staffIndex == null || staffIndex < 0 || staffIndex >= sequence.length) {
                return true;
            }
            sequence.splice(staffIndex, 1);
            this.setPracticeSequence(sequence);
            this.emitPracticeChange({ reason: 'delete', staffIndex });
            return true;
        }
        if (!note) return true;
        if (staffIndex != null && staffIndex >= 0 && staffIndex < sequence.length) {
            sequence[staffIndex] = note;
            this.setPracticeSequence(sequence);
            this.emitPracticeChange({ reason: 'update', staffIndex });
            this.preview(note, { allowWhilePlaying: this.phase === 'practice' });
            return true;
        }
        if (sequence.length >= limit) {
            const fallback = sequence.length > 0 ? sequence.length - 1 : 0;
            const preferredIndex = Number.isInteger(meta.insertIndex) ? meta.insertIndex : fallback;
            const targetSlot = this.normalizeInsertIndex(preferredIndex, limit - 1);
            sequence[targetSlot] = note;
            this.setPracticeSequence(sequence);
            this.emitPracticeChange({ reason: 'override', staffIndex: targetSlot });
            this.preview(note, { allowWhilePlaying: this.phase === 'practice' });
            return true;
        }
        const boundedIndex = this.normalizeInsertIndex(insertIndex, sequence.length);
        sequence.splice(boundedIndex, 0, note);
        this.setPracticeSequence(sequence);
        this.emitPracticeChange({ reason: 'insert', staffIndex: boundedIndex });
        this.preview(note, { allowWhilePlaying: this.phase === 'practice' });
        return true;
    }

    handleAnswerInput(note, meta) {
        const sequence = this.getAnswerSequence();
        if (!Array.isArray(sequence)) return true;
        const answerLimit = this.answerLimit > 0 ? this.answerLimit : this.normalizeLimit(this.getAnswerLimit());
        const requiresSubmit = this.requiresSubmit();
        const targetLength = this.targetLength();
        const staffIndex = this.normalizeIndex(meta.staffIndex);
        const isDelete = meta.operation === 'delete';
        if (isDelete) {
            if (staffIndex == null || staffIndex < 0 || staffIndex >= sequence.length) {
                return true;
            }
            sequence.splice(staffIndex, 1);
            this.setAnswerSequence(sequence);
            this.emitAnswerChange({ reason: 'delete', requiresSubmit });
            if (requiresSubmit) {
                this.onSubmitStateChange(false);
            } else {
                this.onComparisonUpdate(sequence.slice());
            }
            return true;
        }
        if (!note) return true;
        if (staffIndex != null && staffIndex >= 0 && staffIndex < sequence.length) {
            sequence[staffIndex] = note;
            this.setAnswerSequence(sequence);
            this.emitAnswerChange({ reason: 'update', requiresSubmit });
            if (!requiresSubmit) {
                this.onComparisonUpdate(sequence.slice());
            }
            this.preview(note);
            this.evaluateAnswerState(sequence, { requiresSubmit, targetLength });
            return true;
        }
        if (answerLimit > 0 && sequence.length >= answerLimit) {
            const fallback = sequence.length > 0 ? sequence.length - 1 : 0;
            const preferredIndex = Number.isInteger(meta.insertIndex)
                ? meta.insertIndex
                : (staffIndex != null ? staffIndex : fallback);
            const targetSlot = this.normalizeInsertIndex(preferredIndex, Math.max(answerLimit - 1, 0));
            sequence[targetSlot] = note;
            this.setAnswerSequence(sequence);
            this.emitAnswerChange({ reason: 'override', requiresSubmit });
            if (!requiresSubmit) {
                this.onComparisonUpdate(sequence.slice());
            }
            this.preview(note);
            this.evaluateAnswerState(sequence, { requiresSubmit, targetLength });
            return true;
        }
        sequence.push(note);
        this.setAnswerSequence(sequence);
        this.emitAnswerChange({ reason: 'insert', requiresSubmit });
        if (!requiresSubmit) {
            this.onComparisonUpdate(sequence.slice());
        }
        this.preview(note);
        this.evaluateAnswerState(sequence, { requiresSubmit, targetLength });
        return true;
    }

    evaluateAnswerState(sequence, { requiresSubmit, targetLength }) {
        if (!Array.isArray(sequence)) return;
        if (requiresSubmit) {
            if (targetLength > 0 && sequence.length >= targetLength) {
                this.onSubmitStateChange(true);
                const maybePromise = this.onAnswerReady({ requiresSubmit: true, message: 'Ready to submit your answer.' });
                this.safeConsumePromise(maybePromise, 'staff answer ready (submit)');
            } else {
                this.onSubmitStateChange(false);
                if (targetLength > 0) {
                    this.onFeedback(`Note ${sequence.length} of ${targetLength}`);
                }
            }
            return;
        }
        if (targetLength > 0 && sequence.length >= targetLength) {
            const maybePromise = this.onAnswerReady({ requiresSubmit: false });
            this.safeConsumePromise(maybePromise, 'staff answer ready (auto-check)');
        } else if (targetLength > 0) {
            this.onFeedback(`Note ${sequence.length} of ${targetLength}`);
        }
    }

    requiresSubmit() {
        const context = typeof this.getContext === 'function' ? this.getContext() : {};
        return Boolean(context && context.requiresSubmit);
    }

    targetLength() {
        const context = typeof this.getContext === 'function' ? this.getContext() : {};
        if (Number.isInteger(context?.targetLength) && context.targetLength > 0) {
            return context.targetLength;
        }
        return this.answerLimit;
    }

    emitPracticeChange(meta = {}) {
        if (typeof this.onPracticeChange !== 'function') return;
        const sequence = this.getPracticeSequence();
        this.onPracticeChange(Array.isArray(sequence) ? sequence.slice() : [], meta);
    }

    emitAnswerChange(meta = {}) {
        if (typeof this.onAnswerChange !== 'function') return;
        const sequence = this.getAnswerSequence();
        this.onAnswerChange(Array.isArray(sequence) ? sequence.slice() : [], meta);
    }

    normalizeIndex(value) {
        if (!Number.isInteger(value)) return null;
        return value;
    }

    normalizeInsertIndex(value, maxIndex) {
        if (!Number.isInteger(value)) return Math.max(0, maxIndex);
        if (value < 0) return 0;
        if (value > maxIndex) return maxIndex;
        return value;
    }

    preview(note, meta = {}) {
        if (!note) return;
        if (this.previewService && typeof this.previewService.previewPitch === 'function') {
            this.previewService.previewPitch(note, {
                allowWhilePlaying: Boolean(meta.allowWhilePlaying),
                phaseGuard: meta.phaseGuard,
                duration: meta.duration,
            });
            return;
        }
        if (typeof this.onPitchPreview === 'function') {
            this.onPitchPreview(note);
        }
    }

    safeConsumePromise(maybePromise, label) {
        if (!maybePromise || typeof maybePromise.then !== 'function') return;
        maybePromise.catch((error) => {
            console.warn(`[StaffInputController] ${label} failed:`, error);
        });
    }
}

window.StaffInputController = StaffInputController;
