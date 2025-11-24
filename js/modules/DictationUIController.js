class DictationUIController {
    constructor(options = {}) {
        this.uiModule = options.uiModule || new UIModule();
        this.boundCallbacks = null;
    }

    getModule() {
        return this.uiModule;
    }

    bindEventHandlers(callbacks = {}) {
        this.boundCallbacks = callbacks;
        if (this.uiModule && typeof this.uiModule.setupEventListeners === 'function') {
            this.uiModule.setupEventListeners(callbacks);
        }
    }

    setNoteLabelFormatter(formatter) {
        if (this.uiModule && typeof this.uiModule.setNoteLabelFormatter === 'function') {
            this.uiModule.setNoteLabelFormatter(formatter);
        }
    }

    updateFeedback(message, className = 'feedback') {
        if (this.uiModule && typeof this.uiModule.updateFeedback === 'function') {
            this.uiModule.updateFeedback(message, className);
        }
    }

    setStaffSubmitEnabled(enabled) {
        if (this.uiModule && typeof this.uiModule.setStaffSubmitEnabled === 'function') {
            this.uiModule.setStaffSubmitEnabled(enabled);
        }
    }

    setStaffInputActive(active) {
        if (this.uiModule && typeof this.uiModule.setStaffInputActive === 'function') {
            this.uiModule.setStaffInputActive(active);
        }
    }

    setInputModeValue(value) {
        if (this.uiModule && typeof this.uiModule.setInputModeValue === 'function') {
            this.uiModule.setInputModeValue(value);
        }
    }

    showHistory(roundHistory, calculateAverageAccuracy, getBestRound) {
        if (this.uiModule && typeof this.uiModule.showHistory === 'function') {
            this.uiModule.showHistory(roundHistory, calculateAverageAccuracy, getBestRound);
        }
    }

    hideHistory() {
        if (this.uiModule && typeof this.uiModule.hideHistory === 'function') {
            this.uiModule.hideHistory();
        }
    }

    showStatusArea() {
        if (this.uiModule && typeof this.uiModule.showStatusArea === 'function') {
            this.uiModule.showStatusArea();
        }
    }

    hideStatusArea() {
        if (this.uiModule && typeof this.uiModule.hideStatusArea === 'function') {
            this.uiModule.hideStatusArea();
        }
    }

    setPlayButtonState(disabled) {
        if (this.uiModule && typeof this.uiModule.setPlayButtonState === 'function') {
            this.uiModule.setPlayButtonState(disabled);
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DictationUIController;
} else {
    window.DictationUIController = DictationUIController;
}
