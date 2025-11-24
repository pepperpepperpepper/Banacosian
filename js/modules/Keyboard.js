/**
 * Keyboard Module - Handles piano keyboard management and interaction
 */
class KeyboardModule {
    constructor(musicTheory, audioModule) {
        this.musicTheory = musicTheory;
        this.audioModule = audioModule;
        this.scaleType = 'diatonic';
        this.mode = 'ionian';
        this.labelIncludesOctave = false;
        this.allowOverlap = true; // allow simultaneous notes by default for /keyboard
        this.diatonicNotes = [];
        this.tonicLetter = this.musicTheory.getDefaultTonicLetter(this.mode);
        this.whiteKeyElements = Array.from(document.querySelectorAll('.white-key'));
        this.blackKeyElements = Array.from(document.querySelectorAll('.black-key'));
        this.pianoKeysContainer = document.querySelector('.piano-keys');
        this.pianoRoot = document.querySelector('.piano');
        this.disabledKeysStyle = 'hatched';
        this.currentLayout = null;
        this.boundKeyHandler = null;
        this.boundPointerDown = null;
        this.boundPointerUp = null;
        this.boundPointerMove = null;
        this.boundTouchStart = null;
        this.boundTouchEnd = null;
        this.boundTouchMove = null;
        this.pointerDownMap = new Map();
        this.pointerTypeMap = new Map();
        this.managePressedVisually = true;
        this.onNotePlayedCallback = null;
        this.hasLeadingBlack = false;
        this.hasTrailingBlack = false;
        this.updateMetricsHandle = null;
        this.handleResize = this.handleResize.bind(this);
        this.chromaticPreference = null;
        this.displayTonicForLabels = null;
        // Sustain support
        this.sustainCounts = new Map(); // note -> refcount
        this.pointerNoteMap = new Map(); // pointerId -> note
        this.touchNoteMap = new Map(); // touchId -> note
        this.audioPreviewService = null;
        this.previewConfig = {
            playOptions: {},
            hoverOptions: null,
            enableHover: false,
        };
        this.lastHoverPreviewNote = null;
        this.boundHoverPreview = null;
        this.boundHoverLeave = null;
        this.hoverEventMode = null;

        this.applyDisabledKeysStyle();

        if (typeof window !== 'undefined') {
            window.addEventListener('resize', this.handleResize);
        }
    }

    /**
     * Reset the keyboard state.
     * Clears all active pointers, stops sustains, and resets visual state.
     */
    reset() {
        // Clear pointer maps
        this.pointerDownMap.clear();
        this.pointerTypeMap.clear();
        this.pointerNoteMap.clear();
        this.touchNoteMap.clear();
        
        // Reset sustain counts
        this.sustainCounts.clear();

        // Reset visual state
        if (this.pianoKeysContainer) {
            const pressedKeys = this.pianoKeysContainer.querySelectorAll('.pressed');
            pressedKeys.forEach(key => {
                key.classList.remove('pressed');
                key.removeAttribute('data-touch-id');
            });
        }
    }

    /**
     * Start sustaining a note with reference counting so multiple pointers can hold it.
     */
    startSustainForNote(actualNote) {
        if (!actualNote) return;
        // Respect mode filtering when not chromatic
        if (this.scaleType !== 'chromatic') {
            if (!this.diatonicNotes || this.diatonicNotes.length === 0) {
                this.diatonicNotes = this.musicTheory.generateDiatonicNotes(this.mode, this.tonicLetter);
            }
            if (!this.diatonicNotes.includes(actualNote)) {
                return;
            }
        }
        const freq = this.musicTheory.getNoteFrequency(actualNote);
        if (!Number.isFinite(freq)) return;
        const count = this.sustainCounts.get(actualNote) || 0;
        if (count === 0 && this.audioModule && typeof this.audioModule.startSustain === 'function') {
            this.audioModule.startSustain(actualNote, freq);
        }
        this.sustainCounts.set(actualNote, count + 1);
        if (this.onNotePlayedCallback) {
            try { this.onNotePlayedCallback(actualNote); } catch (_) {}
        }
    }

    /** Stop sustaining a note, honoring reference counts. */
    stopSustainForNote(actualNote) {
        if (!actualNote) return;
        const count = this.sustainCounts.get(actualNote) || 0;
        if (count <= 1) {
            this.sustainCounts.delete(actualNote);
            if (this.audioModule && typeof this.audioModule.stopSustain === 'function') {
                this.audioModule.stopSustain(actualNote);
            }
        } else {
            this.sustainCounts.set(actualNote, count - 1);
        }
    }

    /**
     * Control whether key labels include octave numbers (e.g., C4)
     * @param {boolean} flag
     */
    setLabelIncludesOctave(flag) {
        this.labelIncludesOctave = !!flag;
        this.updateKeyboardVisibility();
    }

    /** Set whether overlapping sounds are allowed (polyphony). */
    setAllowOverlap(flag) {
        this.allowOverlap = !!flag;
    }

    setAudioPreviewService(service, options = {}) {
        this.audioPreviewService = service || null;
        this.previewConfig = {
            playOptions: options.playOptions || {},
            hoverOptions: options.hoverOptions || null,
            enableHover: Boolean(options.enableHover),
        };
        this.lastHoverPreviewNote = null;
        if (this.audioPreviewService && this.previewConfig.enableHover) {
            this.attachHoverPreview();
        } else {
            this.detachHoverPreview();
        }
    }

    /**
     * Set the current scale type
     * @param {string} scaleType - 'diatonic' or 'chromatic'
     */
    setScaleType(scaleType) {
        this.scaleType = scaleType;
    }

    /**
     * Set the current mode
     * @param {string} mode - Mode name (e.g., 'ionian', 'dorian')
     */
    setMode(mode, tonicLetter) {
        this.mode = mode;
        if (tonicLetter) {
            if (typeof this.musicTheory.normalizeTonicForMode === 'function') {
                this.tonicLetter = this.musicTheory.normalizeTonicForMode(this.mode, tonicLetter);
            } else if (this.musicTheory.normalizeTonic) {
                this.tonicLetter = this.musicTheory.normalizeTonic(tonicLetter);
            } else {
                this.tonicLetter = tonicLetter.toUpperCase();
            }
        } else {
            this.tonicLetter = this.musicTheory.getDefaultTonicLetter
                ? this.musicTheory.getDefaultTonicLetter(this.mode)
                : 'C';
        }
        this.applyModeLayout();
        this.diatonicNotes = this.musicTheory.generateDiatonicNotes(this.mode, this.tonicLetter);
    }

    setChromaticPreference(preference) {
        const normalized = (preference === 'flat' || preference === 'sharp') ? preference : null;
        if (this.chromaticPreference === normalized) {
            return;
        }
        this.chromaticPreference = normalized;
        this.updateKeyboardVisibility();
    }

    setDisplayTonicForLabels(tonicLetter) {
        if (!tonicLetter) {
            if (this.displayTonicForLabels !== null) {
                this.displayTonicForLabels = null;
                this.updateKeyboardVisibility();
            }
            return;
        }
        const normalized = (this.musicTheory && typeof this.musicTheory.normalizeTonic === 'function')
            ? this.musicTheory.normalizeTonic(tonicLetter)
            : tonicLetter;
        if (this.displayTonicForLabels === normalized) {
            return;
        }
        this.displayTonicForLabels = normalized;
        this.updateKeyboardVisibility();
    }

    /**
     * Set the tonic for the current mode
     * @param {string} tonicLetter - New tonic letter
     */
    setTonic(tonicLetter) {
        if (!tonicLetter) return;
        if (typeof this.musicTheory.normalizeTonicForMode === 'function') {
            this.tonicLetter = this.musicTheory.normalizeTonicForMode(this.mode, tonicLetter);
        } else if (this.musicTheory.normalizeTonic) {
            this.tonicLetter = this.musicTheory.normalizeTonic(tonicLetter);
        } else {
            this.tonicLetter = tonicLetter.toUpperCase();
        }
        this.applyModeLayout();
        this.diatonicNotes = this.musicTheory.generateDiatonicNotes(this.mode, this.tonicLetter);
    }

    attachHoverPreview() {
        if (!this.previewConfig.enableHover || !this.audioPreviewService) {
            return;
        }
        this.pianoKeysContainer = this.pianoKeysContainer || document.querySelector('.piano-keys');
        if (!this.pianoKeysContainer) {
            return;
        }
        if (this.boundHoverPreview) {
            return;
        }
        const usePointer = typeof window !== 'undefined' && 'PointerEvent' in window;
        this.hoverEventMode = usePointer ? 'pointer' : 'mouse';
        const overEvent = usePointer ? 'pointerover' : 'mouseover';
        const outEvent = usePointer ? 'pointerout' : 'mouseout';
        this.boundHoverPreview = (event) => {
            if (!this.previewConfig.enableHover || !this.audioPreviewService) {
                return;
            }
            if (this.hoverEventMode === 'pointer' && event.pointerType && event.pointerType !== 'mouse') {
                return;
            }
            const target = event.target && event.target.closest
                ? event.target.closest('.white-key, .black-key')
                : null;
            if (!target || target.classList.contains('disabled')) {
                return;
            }
            const note = target.dataset ? target.dataset.note : null;
            if (!note || note === this.lastHoverPreviewNote) {
                return;
            }
            this.lastHoverPreviewNote = note;
            this.previewNote(note);
        };
        this.boundHoverLeave = (event) => {
            if (this.hoverEventMode === 'pointer' && event.pointerType && event.pointerType !== 'mouse') {
                return;
            }
            const related = event.relatedTarget;
            if (!related || !this.pianoKeysContainer.contains(related)) {
                this.lastHoverPreviewNote = null;
            } else if (!related.closest || !related.closest('.white-key, .black-key')) {
                this.lastHoverPreviewNote = null;
            }
        };
        this.pianoKeysContainer.addEventListener(overEvent, this.boundHoverPreview);
        this.pianoKeysContainer.addEventListener(outEvent, this.boundHoverLeave);
    }

    detachHoverPreview() {
        if (!this.boundHoverPreview || !this.pianoKeysContainer) {
            this.boundHoverPreview = null;
            this.boundHoverLeave = null;
            this.hoverEventMode = null;
            this.lastHoverPreviewNote = null;
            return;
        }
        const overEvent = this.hoverEventMode === 'pointer' ? 'pointerover' : 'mouseover';
        const outEvent = this.hoverEventMode === 'pointer' ? 'pointerout' : 'mouseout';
        this.pianoKeysContainer.removeEventListener(overEvent, this.boundHoverPreview);
        this.pianoKeysContainer.removeEventListener(outEvent, this.boundHoverLeave);
        this.boundHoverPreview = null;
        this.boundHoverLeave = null;
        this.hoverEventMode = null;
        this.lastHoverPreviewNote = null;
    }

    previewNote(note, overrides = {}) {
        if (!note || !this.audioPreviewService || typeof this.audioPreviewService.previewPitch !== 'function') {
            return null;
        }
        const merged = {
            ...(this.previewConfig.hoverOptions || {}),
            ...overrides,
        };
        return this.audioPreviewService.previewPitch(note, merged);
    }

    playNoteSound(actualNote, overrides = {}) {
        if (!actualNote) {
            return null;
        }
        if (this.audioPreviewService && typeof this.audioPreviewService.previewPitch === 'function') {
            const merged = {
                ...(this.previewConfig.playOptions || {}),
                ...overrides,
            };
            const previewResult = this.audioPreviewService.previewPitch(actualNote, merged);
            if (previewResult) {
                return previewResult;
            }
        }
        const frequency = this.musicTheory.getNoteFrequency(actualNote);
        if (!frequency || !this.audioModule || typeof this.audioModule.playTone !== 'function') {
            return null;
        }
        return this.audioModule.playTone(frequency, overrides.duration || 0.5);
    }

    /**
     * Render the physical keyboard based on the provided layout
     * @param {Object} layout - Keyboard layout descriptor
     */
    renderKeyboard(layout) {
        this.pianoKeysContainer = this.pianoKeysContainer || document.querySelector('.piano-keys');
        if (!this.pianoKeysContainer) {
            return;
        }
        this.pianoRoot = this.pianoRoot || document.querySelector('.piano');
        this.applyDisabledKeysStyle();

        const container = this.pianoKeysContainer;
        container.innerHTML = '';

        const usingUnitLayout = layout
            && typeof layout.unitSpan === 'number'
            && Number.isFinite(layout.unitSpan)
            && layout.unitSpan > 0;
        const spanUnits = usingUnitLayout ? layout.unitSpan : null;
        const minLeftUnits = usingUnitLayout ? (layout.unitMinLeft || 0) : 0;

        const whiteFragment = document.createDocumentFragment();
        const whiteDetails = (layout && layout.whiteKeyDetails && layout.whiteKeyDetails.length > 0)
            ? layout.whiteKeyDetails
            : (layout && layout.physicalWhiteKeys ? layout.physicalWhiteKeys.map(note => ({ note })) : (layout && layout.whiteKeys ? layout.whiteKeys.map(note => ({ note })) : []));
        const blackDetails = (layout && layout.blackKeys) ? layout.blackKeys : [];

        const whiteNotchInfo = whiteDetails.map(() => ({ left: false, right: false }));
        if (whiteNotchInfo.length > 0 && blackDetails.length > 0) {
            blackDetails.forEach((detail) => {
                const precedingIndex = (typeof detail.precedingIndex === 'number')
                    ? detail.precedingIndex
                    : (typeof detail.precedingIndex === 'string' ? parseInt(detail.precedingIndex, 10) : null);
                const followingIndex = (typeof detail.followingIndex === 'number')
                    ? detail.followingIndex
                    : (typeof detail.followingIndex === 'string' ? parseInt(detail.followingIndex, 10) : null);
                if (Number.isInteger(precedingIndex) && whiteNotchInfo[precedingIndex]) {
                    whiteNotchInfo[precedingIndex].right = true;
                }
                if (Number.isInteger(followingIndex) && whiteNotchInfo[followingIndex]) {
                    whiteNotchInfo[followingIndex].left = true;
                }
            });
        }

        whiteDetails.forEach((detail, index) => {
            const keyEl = document.createElement('div');
            keyEl.className = 'white-key flat-key white';
            keyEl.dataset.note = detail.note || detail.rawNote || '';
            if (typeof detail.midi === 'number') {
                keyEl.dataset.midi = String(detail.midi);
            } else {
                keyEl.removeAttribute('data-midi');
            }
            keyEl.dataset.whiteIndex = String(typeof detail.whiteIndex === 'number' ? detail.whiteIndex : index);
            if (detail.displayLabel) {
                keyEl.dataset.displayLabel = detail.displayLabel;
            } else if (detail.displayName) {
                keyEl.dataset.displayLabel = detail.displayName;
            } else {
                keyEl.removeAttribute('data-display-label');
            }
            const notchInfo = whiteNotchInfo[index];
            if (notchInfo && notchInfo.left) {
                keyEl.classList.add('white-key-notch-left');
            }
            if (notchInfo && notchInfo.right) {
                keyEl.classList.add('white-key-notch-right');
            }
            if (usingUnitLayout && typeof detail.leftUnits === 'number' && typeof detail.widthUnits === 'number' && spanUnits) {
                const leftPercent = ((detail.leftUnits - minLeftUnits) / spanUnits) * 100;
                const widthPercent = (detail.widthUnits / spanUnits) * 100;
                keyEl.style.left = `${leftPercent}%`;
                keyEl.style.width = `${widthPercent}%`;
            } else {
                keyEl.style.left = '';
                keyEl.style.width = '';
            }

            if (!keyEl.querySelector('.key-label')) {
                const labelEl = document.createElement('span');
                labelEl.className = 'key-label';
                keyEl.appendChild(labelEl);
            }

            whiteFragment.appendChild(keyEl);
        });

        container.appendChild(whiteFragment);

        const blackFragment = document.createDocumentFragment();

        blackDetails.forEach(detail => {
            const keyEl = document.createElement('div');
            keyEl.className = 'black-key flat-key black';
            keyEl.dataset.note = detail.note || detail.rawNote || '';

            if (detail.displayLabel) {
                keyEl.dataset.displayLabel = detail.displayLabel;
            } else if (detail.displayName) {
                keyEl.dataset.displayLabel = detail.displayName;
            } else {
                keyEl.removeAttribute('data-display-label');
            }

            if (typeof detail.precedingIndex === 'number') {
                keyEl.dataset.precedingIndex = String(detail.precedingIndex);
            } else {
                keyEl.dataset.precedingIndex = '';
            }

            if (typeof detail.followingIndex === 'number') {
                keyEl.dataset.followingIndex = String(detail.followingIndex);
            } else {
                keyEl.dataset.followingIndex = '';
            }

            if (detail.edge) {
                keyEl.dataset.edge = detail.edge;
            } else {
                keyEl.removeAttribute('data-edge');
            }

            if (usingUnitLayout && typeof detail.leftUnits === 'number' && typeof detail.widthUnits === 'number' && spanUnits) {
                const leftPercent = ((detail.leftUnits - minLeftUnits) / spanUnits) * 100;
                const widthPercent = (detail.widthUnits / spanUnits) * 100;
                keyEl.style.left = `${leftPercent}%`;
                keyEl.style.width = `${widthPercent}%`;
            } else {
                keyEl.style.left = '';
                keyEl.style.width = '';
            }

            if (!keyEl.querySelector('.key-label')) {
                const labelEl = document.createElement('span');
                labelEl.className = 'key-label';
                keyEl.appendChild(labelEl);
            }

            blackFragment.appendChild(keyEl);
        });

        container.appendChild(blackFragment);

        this.whiteKeyElements = Array.from(container.querySelectorAll('.white-key'));
        this.blackKeyElements = Array.from(container.querySelectorAll('.black-key'));

        const leadingBlack = usingUnitLayout
            ? Boolean(layout && layout.hasLeadingBlack)
            : blackDetails.some(detail => detail.edge === 'left');
        const trailingEdgeBlack = usingUnitLayout
            ? Boolean(layout && layout.hasTrailingBlack)
            : blackDetails.some(detail => detail.edge === 'right');
        const trailingBlack = trailingEdgeBlack;

        this.hasLeadingBlack = leadingBlack;
        this.hasTrailingBlack = trailingBlack;

        container.dataset.layoutMode = usingUnitLayout ? 'unit' : 'legacy';
        container.classList.toggle('piano-leading-black', leadingBlack);
        container.classList.toggle('piano-trailing-black', trailingBlack);
        if (whiteDetails && whiteDetails.length > 0) {
            container.style.setProperty('--white-key-count', String(whiteDetails.length));
        }

        if (!leadingBlack && !trailingBlack) {
            container.style.paddingLeft = '0px';
            container.style.paddingRight = '0px';
        } else if (usingUnitLayout) {
            container.style.paddingLeft = '0px';
            container.style.paddingRight = '0px';
        }

        if (!usingUnitLayout) {
            this.queueWhiteKeyMetricUpdate();
        }
    }

    /**
     * Update the physical keyboard layout to match the current mode
     */
    applyModeLayout() {
        const layout = this.musicTheory.getKeyboardLayout(this.mode, this.tonicLetter);
        this.currentLayout = layout;
        if (layout && layout.tonicLetter) {
            this.tonicLetter = layout.tonicLetter;
        }
        this.renderKeyboard(layout);
        this.updateKeyboardVisibility();
    }

    /**
     * Reposition black keys based on the current white key layout
     */
    positionBlackKeys() {
        if (!this.pianoKeysContainer || !this.currentLayout) {
            return;
        }

        if (this.pianoKeysContainer.dataset.layoutMode === 'unit') {
            return;
        }

        const containerRect = this.pianoKeysContainer.getBoundingClientRect();

        this.blackKeyElements.forEach((keyEl) => {
            const rawPreceding = keyEl.dataset.precedingIndex;
            const rawFollowing = keyEl.dataset.followingIndex;
            const edgeHint = keyEl.dataset.edge || '';

            const precedingIndex = (rawPreceding === '' || typeof rawPreceding === 'undefined')
                ? null
                : parseInt(rawPreceding, 10);
            const followingIndex = (rawFollowing === '' || typeof rawFollowing === 'undefined')
                ? null
                : parseInt(rawFollowing, 10);

            const precedingEl = (precedingIndex !== null) ? this.whiteKeyElements[precedingIndex] : null;
            const followingEl = (followingIndex !== null) ? this.whiteKeyElements[followingIndex] : null;

            const precedingVisible = precedingEl && !precedingEl.hasAttribute('hidden');
            const followingVisible = followingEl && !followingEl.hasAttribute('hidden');

            if (!precedingVisible && !followingVisible) {
                keyEl.setAttribute('hidden', '');
                return;
            }

            keyEl.removeAttribute('hidden');
            keyEl.style.display = '';
            keyEl.style.pointerEvents = '';
            keyEl.style.opacity = '';

            const keyWidth = keyEl.offsetWidth || 0;
            let leftPx = null;

            const precedingRect = precedingVisible ? precedingEl.getBoundingClientRect() : null;
            const followingRect = followingVisible ? followingEl.getBoundingClientRect() : null;

            if (precedingRect && followingRect) {
                const midpoint = (precedingRect.right + followingRect.left) / 2;
                leftPx = midpoint - containerRect.left - (keyWidth / 2);
            } else if (precedingRect) {
                leftPx = precedingRect.right - containerRect.left - (keyWidth / 2);
            } else if (followingRect) {
                leftPx = followingRect.left - containerRect.left - (keyWidth / 2);
            }

            if (leftPx === null) {
                keyEl.setAttribute('hidden', '');
                return;
            }

            if (leftPx < 0) {
                leftPx = 0;
            }

            const containerWidth = containerRect.width || this.pianoKeysContainer.offsetWidth || 0;
            const isTrailingEdge = edgeHint === 'right';
            if (containerWidth > 0 && !isTrailingEdge) {
                const maxLeft = containerWidth - keyWidth;
                if (leftPx > maxLeft) {
                    leftPx = maxLeft;
                }
            }

            keyEl.style.left = `${leftPx}px`;
        });

        this.adjustKeyboardOffset();
    }

    adjustKeyboardOffset() {
        if (!this.pianoKeysContainer || !this.whiteKeyElements || this.whiteKeyElements.length === 0) {
            return;
        }

        const container = this.pianoKeysContainer;
        container.style.transform = 'translateX(0)';

        const containerRect = container.getBoundingClientRect();
        const containerWidth = containerRect.width;

        const firstVisibleWhite = this.whiteKeyElements.find(el => !el.hasAttribute('hidden')) || this.whiteKeyElements[0];
        if (!firstVisibleWhite) {
            container.style.transform = 'translateX(0)';
            return;
        }

        const firstRect = firstVisibleWhite.getBoundingClientRect();
        const firstOffset = firstRect.left - containerRect.left;

        let trailingKey = null;
        if (this.hasTrailingBlack) {
            trailingKey = this.blackKeyElements.find(el => (el.dataset.edge === 'right') && !el.hasAttribute('hidden'));
        }

        if (!trailingKey) {
            for (let i = this.whiteKeyElements.length - 1; i >= 0; i -= 1) {
                const candidate = this.whiteKeyElements[i];
                if (!candidate.hasAttribute('hidden')) {
                    trailingKey = candidate;
                    break;
                }
            }
        }

        if (!trailingKey) {
            container.style.transform = 'translateX(0)';
            return;
        }

        const isTrailingBlack = trailingKey.classList.contains('black-key');
        let trailingEdgePosition;
        if (isTrailingBlack) {
            const leftValue = parseFloat(trailingKey.style.left || '0');
            trailingEdgePosition = leftValue + trailingKey.offsetWidth;
        } else {
            const trailingRect = trailingKey.getBoundingClientRect();
            trailingEdgePosition = trailingRect.right - containerRect.left;
        }

        const desiredRightMargin = isTrailingBlack ? Math.min(containerWidth * 0.015, 8) : Math.min(containerWidth * 0.01, 6);
        let shift = trailingEdgePosition - (containerWidth - desiredRightMargin);
        if (shift < 0) {
            shift = 0;
        }

        const firstWidth = firstVisibleWhite.offsetWidth || 0;
        const leftAllowance = isTrailingBlack ? firstWidth * 0.35 : firstWidth * 0.25;
        const maxShift = Math.max(0, firstOffset + leftAllowance);

        if (shift > maxShift) {
            shift = maxShift;
        }

        container.style.transform = shift > 0 ? `translateX(${-shift}px)` : 'translateX(0)';
    }

    /**
     * Queue a white key metric update (debounced to animation frame)
     */
    queueWhiteKeyMetricUpdate() {
        if (!this.pianoKeysContainer) {
            return;
        }

        if (this.pianoKeysContainer.dataset.layoutMode === 'unit') {
            return;
        }

        if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
            this.updateWhiteKeyMetrics();
            this.positionBlackKeys();
            return;
        }

        if (this.updateMetricsHandle) {
            if (typeof window.cancelAnimationFrame === 'function') {
                window.cancelAnimationFrame(this.updateMetricsHandle);
            } else {
                clearTimeout(this.updateMetricsHandle);
            }
        }

        this.updateMetricsHandle = window.requestAnimationFrame(() => {
            this.updateMetricsHandle = null;
            this.updateWhiteKeyMetrics();
            this.positionBlackKeys();
        });
    }

    /**
     * Handle resize events so the black keys stay aligned
     */
    handleResize() {
        this.queueWhiteKeyMetricUpdate();
    }

    updateWhiteKeyMetrics() {
        if (!this.pianoKeysContainer || !this.whiteKeyElements || this.whiteKeyElements.length === 0) {
            return;
        }
        if (this.pianoKeysContainer.dataset.layoutMode === 'unit') {
            return;
        }
        const firstWhite = this.whiteKeyElements[0];
        if (!firstWhite) {
            return;
        }
        const whiteWidth = firstWhite.offsetWidth;
        if (whiteWidth > 0) {
            this.pianoKeysContainer.style.setProperty('--white-key-width', `${whiteWidth}px`);
        }

        let step = 0;

        if (this.whiteKeyElements.length > 1 && typeof firstWhite.getBoundingClientRect === 'function') {
            const firstRect = firstWhite.getBoundingClientRect();
            const secondRect = this.whiteKeyElements[1].getBoundingClientRect();
            const measured = secondRect.left - firstRect.left;
            if (Number.isFinite(measured) && measured > 0) {
                step = measured;
            }
        }

        const computedStyle = (typeof window !== 'undefined' && window.getComputedStyle)
            ? window.getComputedStyle(firstWhite)
            : null;
        const marginLeft = computedStyle ? parseFloat(computedStyle.marginLeft) || 0 : 0;
        const marginRight = computedStyle ? parseFloat(computedStyle.marginRight) || 0 : 0;

        if (step <= 0) {
            step = whiteWidth + marginLeft + marginRight;
        }

        if (step > 0) {
            this.pianoKeysContainer.style.setProperty('--white-key-step', `${step}px`);
        }

        let leadingPad = 0;
        if (this.hasLeadingBlack && step > 0) {
            const leadingBlackEl = this.blackKeyElements.find(el => el.dataset.edge === 'left') || this.blackKeyElements[0];
            const blackWidth = leadingBlackEl ? leadingBlackEl.offsetWidth || 0 : 0;
            if (blackWidth > 0) {
                leadingPad = Math.max(0, (blackWidth / 2) - marginLeft);
                this.pianoKeysContainer.style.paddingLeft = `${leadingPad}px`;
            } else {
                leadingPad = step / 2;
                this.pianoKeysContainer.style.paddingLeft = `${leadingPad}px`;
            }
        } else {
            this.pianoKeysContainer.style.paddingLeft = '0px';
        }

        if (this.hasTrailingBlack && step > 0) {
            this.pianoKeysContainer.style.paddingRight = `${step / 2}px`;
        } else {
            this.pianoKeysContainer.style.paddingRight = '0px';
        }
    }

    /**
     * Update keyboard visibility and labels based on current mode
     */
    updateKeyboardVisibility() {
        const showAllNotes = this.scaleType === 'chromatic';
        if (!showAllNotes) {
            this.diatonicNotes = this.musicTheory.generateDiatonicNotes(this.mode, this.tonicLetter);
        }
        const activeNotes = new Set(this.diatonicNotes);

        const keys = document.querySelectorAll('.white-key, .black-key');
        const includeOctave = this.labelIncludesOctave;
        const labelTonic = this.displayTonicForLabels || this.tonicLetter;
        const preferChromatic = showAllNotes ? this.chromaticPreference : null;

        keys.forEach(key => {
            const actualNote = key.dataset.note;
            if (key.hasAttribute('hidden') || !actualNote) {
                const labelEl = key.querySelector('.key-label');
                if (labelEl) {
                    labelEl.textContent = '';
                    labelEl.style.visibility = 'hidden';
                }
                key.classList.add('disabled');
                return;
            }
            let noteLabel;
            if (preferChromatic && this.musicTheory && typeof this.musicTheory.getChromaticDisplayLabel === 'function') {
                noteLabel = this.musicTheory.getChromaticDisplayLabel(actualNote, preferChromatic, { includeOctave });
            } else if (this.musicTheory && typeof this.musicTheory.getDisplayNoteLabel === 'function') {
                noteLabel = this.musicTheory.getDisplayNoteLabel(actualNote, this.mode, labelTonic, { includeOctave });
            } else if (this.musicTheory && typeof this.musicTheory.getDisplayNoteName === 'function') {
                noteLabel = this.musicTheory.getDisplayNoteName(actualNote, this.mode, labelTonic);
            } else {
                noteLabel = actualNote;
            }
            const labelEl = key.querySelector('.key-label') || (() => {
                const created = document.createElement('span');
                created.className = 'key-label';
                key.appendChild(created);
                return created;
            })();
            const labelText = noteLabel || '';
            labelEl.textContent = labelText;

            const shouldDisable = !showAllNotes && !activeNotes.has(actualNote);

            if (shouldDisable && this.disabledKeysStyle === 'invisible') {
                labelEl.style.visibility = 'hidden';
            } else {
                labelEl.style.visibility = labelText ? 'visible' : 'hidden';
            }
            if (noteLabel) {
                key.dataset.displayLabel = noteLabel;
            } else {
                key.removeAttribute('data-display-label');
            }

            if (shouldDisable) {
                key.classList.add('disabled');
            } else {
                key.classList.remove('disabled');
            }
        });
        
        // Ensure inline styling does not override CSS sizing/background
        const piano = document.querySelector('.piano');
        if (piano) {
            piano.style.removeProperty('background');
            piano.style.removeProperty('padding');
        }
    }

    /**
     * Set how disabled keys should be rendered visually
     * @param {string} style - 'hatched' or 'invisible'
     */
    setDisabledKeysStyle(style) {
        const normalized = style === 'invisible' ? 'invisible' : 'hatched';
        this.disabledKeysStyle = normalized;
        this.applyDisabledKeysStyle();
    }

    /**
     * Apply the disabled key class to the piano container
     */
    applyDisabledKeysStyle() {
        if (!this.pianoRoot || !this.pianoRoot.classList) {
            this.pianoRoot = document.querySelector('.piano');
        }
        if (!this.pianoRoot) {
            return;
        }
        this.pianoRoot.classList.toggle('disabled-keys-invisible', this.disabledKeysStyle === 'invisible');
    }

    /**
     * Handle note play event
     * @param {string} physicalNote - The physical note that was clicked
     * @param {Function} onNotePlayed - Callback function when note is played
     */
    async playNote(physicalNote, onNotePlayed = this.onNotePlayedCallback) {
        if (!this.allowOverlap && this.audioModule.getIsPlaying && this.audioModule.getIsPlaying()) return;
        
        let actualNote;
        
        actualNote = physicalNote;
        if (!actualNote) return;

        if (this.scaleType !== 'chromatic') {
            if (!this.diatonicNotes || this.diatonicNotes.length === 0) {
                this.diatonicNotes = this.musicTheory.generateDiatonicNotes(this.mode, this.tonicLetter);
            }
            if (!this.diatonicNotes.includes(actualNote)) {
                return;
            }
        }
        
        // Visual feedback on key press (managed by pointer/touch handlers when enabled)
        const key = document.querySelector(`.white-key[data-note="${actualNote}"], .black-key[data-note="${actualNote}"]`);
        if (!key || key.classList.contains('disabled')) {
            return;
        }
        if (this.managePressedVisually) {
            key.classList.add('pressed');
            setTimeout(() => key.classList.remove('pressed'), 150);
        }
        
        // Play the note
        const playback = this.playNoteSound(actualNote);
        if (playback && typeof playback.then === 'function') {
            await playback;
        }

        // Call the callback with the actual note played
        if (onNotePlayed) {
            onNotePlayed(actualNote);
        }
    }

    /**
     * Setup keyboard event listeners
     * @param {Function} onNotePlayed - Callback function when note is played
     */
    setupEventListeners(onNotePlayed) {
        this.onNotePlayedCallback = onNotePlayed;
        this.pianoKeysContainer = this.pianoKeysContainer || document.querySelector('.piano-keys');
        if (!this.pianoKeysContainer) {
            return;
        }

        // Prefer Pointer Events (multi-touch friendly). Fallback to touch/click.
        if (window && 'PointerEvent' in window) {
            if (!this.boundPointerDown) {
                this.boundPointerDown = (e) => {
                    const target = e.target && e.target.closest ? e.target.closest('.white-key, .black-key') : null;
                    if (!target || !this.pianoKeysContainer.contains(target)) return;
                    e.preventDefault();
                    const note = target.dataset.note;
                    if (!note || target.classList.contains('disabled')) return;
                    try { target.setPointerCapture && target.setPointerCapture(e.pointerId); } catch (_) {}
                    this.pointerDownMap.set(e.pointerId, target);
                    this.pointerTypeMap.set(e.pointerId, e.pointerType || 'mouse');
                    target.classList.add('pressed');
                    const isSustain = this.audioModule && typeof this.audioModule.isSustainTimbre === 'function' && this.audioModule.isSustainTimbre();
                    if (isSustain) {
                        this.pointerNoteMap.set(e.pointerId, note);
                        this.startSustainForNote(note);
                    } else {
                        this.playNote(note);
                    }
                };
                this.pianoKeysContainer.addEventListener('pointerdown', this.boundPointerDown, { passive: false });
            }
            if (!this.boundPointerUp) {
                this.boundPointerUp = (e) => {
                    const keyEl = this.pointerDownMap.get(e.pointerId);
                    if (keyEl) {
                        keyEl.classList.remove('pressed');
                        this.pointerDownMap.delete(e.pointerId);
                    }
                    const note = this.pointerNoteMap.get(e.pointerId);
                    if (note) {
                        this.stopSustainForNote(note);
                        this.pointerNoteMap.delete(e.pointerId);
                    }
                    this.pointerTypeMap.delete(e.pointerId);
                };
                window.addEventListener('pointerup', this.boundPointerUp, { passive: true });
                window.addEventListener('pointercancel', this.boundPointerUp, { passive: true });
                window.addEventListener('pointerleave', this.boundPointerUp, { passive: true });
            }
            if (!this.boundMouseUp) {
                this.boundMouseUp = () => {
                    // Fallback: in case pointerup didn't fire for mouse, release any mouse-held notes
                    for (const [id, type] of Array.from(this.pointerTypeMap.entries())) {
                        if (type !== 'mouse') continue;
                        const keyEl = this.pointerDownMap.get(id);
                        if (keyEl) keyEl.classList.remove('pressed');
                        this.pointerDownMap.delete(id);
                        const note = this.pointerNoteMap.get(id);
                        if (note) {
                            this.stopSustainForNote(note);
                            this.pointerNoteMap.delete(id);
                        }
                        this.pointerTypeMap.delete(id);
                    }
                };
                window.addEventListener('mouseup', this.boundMouseUp, { passive: true });
            }
            if (!this.boundLostCapture) {
                this.boundLostCapture = (e) => {
                    const id = e.pointerId;
                    const keyEl = this.pointerDownMap.get(id);
                    if (keyEl) {
                        keyEl.classList.remove('pressed');
                        this.pointerDownMap.delete(id);
                    }
                    const note = this.pointerNoteMap.get(id);
                    if (note) {
                        this.stopSustainForNote(note);
                        this.pointerNoteMap.delete(id);
                    }
                    this.pointerTypeMap.delete(id);
                };
                // Listen at capture to catch from any key element
                document.addEventListener('lostpointercapture', this.boundLostCapture, true);
            }
            if (!this.boundPointerMove) {
                this.boundPointerMove = (e) => {
                    // Only handle active drags we started
                    if (!this.pointerDownMap.has(e.pointerId)) return;
                    const isSustain = this.audioModule && typeof this.audioModule.isSustainTimbre === 'function' && this.audioModule.isSustainTimbre();
                    const container = this.pianoKeysContainer;
                    const el = document.elementFromPoint(e.clientX, e.clientY);
                    const target = el && el.closest ? el.closest('.white-key, .black-key') : null;
                    const nextEl = (target && container.contains(target) && !target.classList.contains('disabled') && !target.hasAttribute('hidden')) ? target : null;
                    const prevEl = this.pointerDownMap.get(e.pointerId);
                    const prevNote = this.pointerNoteMap.get(e.pointerId) || (prevEl ? prevEl.dataset.note : null);
                    const nextNote = nextEl ? nextEl.dataset.note : null;
                    if (prevEl === nextEl || prevNote === nextNote) return;
                    if (prevEl) prevEl.classList.remove('pressed');
                    if (isSustain && prevNote) this.stopSustainForNote(prevNote);
                    if (nextEl && nextNote) {
                        nextEl.classList.add('pressed');
                        this.pointerDownMap.set(e.pointerId, nextEl);
                        this.pointerNoteMap.set(e.pointerId, nextNote);
                        if (isSustain) {
                            this.startSustainForNote(nextNote);
                        } else {
                            this.playNote(nextNote);
                        }
                    } else {
                        // moved off keys
                        this.pointerDownMap.set(e.pointerId, null);
                        this.pointerNoteMap.delete(e.pointerId);
                    }
                };
                window.addEventListener('pointermove', this.boundPointerMove, { passive: true });
            }
            // When using pointer events, let pointer handlers manage visual pressed state
            this.managePressedVisually = false;
            // Do not add click handler to avoid double-trigger
            return;
        }

        // Touch fallback
        if ('ontouchstart' in window && !this.boundTouchStart) {
            this.boundTouchStart = (e) => {
                if (!e.changedTouches) return;
                for (const t of Array.from(e.changedTouches)) {
                    const el = document.elementFromPoint(t.clientX, t.clientY);
                    const target = el && el.closest ? el.closest('.white-key, .black-key') : null;
                    if (!target || !this.pianoKeysContainer.contains(target)) continue;
                    e.preventDefault();
                    const note = target.dataset.note;
                    if (!note || target.classList.contains('disabled')) continue;
                    target.dataset.touchId = String(t.identifier);
                    target.classList.add('pressed');
                    const isSustain = this.audioModule && typeof this.audioModule.isSustainTimbre === 'function' && this.audioModule.isSustainTimbre();
                    if (isSustain) {
                        this.touchNoteMap.set(String(t.identifier), note);
                        this.startSustainForNote(note);
                    } else {
                        this.playNote(note);
                    }
                }
            };
            this.pianoKeysContainer.addEventListener('touchstart', this.boundTouchStart, { passive: false });
        }
        if ('ontouchend' in window && !this.boundTouchEnd) {
            this.boundTouchEnd = (e) => {
                if (!e.changedTouches) return;
                for (const t of Array.from(e.changedTouches)) {
                    const id = String(t.identifier);
                    const pressed = this.pianoKeysContainer.querySelector(`.flat-key[data-touch-id="${id}"]`);
                    if (pressed) {
                        pressed.classList.remove('pressed');
                        pressed.removeAttribute('data-touch-id');
                    }
                    const note = this.touchNoteMap.get(id) || (pressed ? pressed.dataset.note : null);
                    if (note) {
                        this.stopSustainForNote(note);
                        this.touchNoteMap.delete(id);
                    }
                }
            };
            window.addEventListener('touchend', this.boundTouchEnd, { passive: true });
            window.addEventListener('touchcancel', this.boundTouchEnd, { passive: true });
        }
        if ('ontouchmove' in window && !this.boundTouchMove) {
            this.boundTouchMove = (e) => {
                if (!e.changedTouches) return;
                const isSustain = this.audioModule && typeof this.audioModule.isSustainTimbre === 'function' && this.audioModule.isSustainTimbre();
                for (const t of Array.from(e.changedTouches)) {
                    const id = String(t.identifier);
                    // Only track touches that began on keys (have a mapping or pressed el)
                    const had = this.touchNoteMap.has(id) || !!this.pianoKeysContainer.querySelector(`.flat-key[data-touch-id="${id}"]`);
                    if (!had) continue;
                    const el = document.elementFromPoint(t.clientX, t.clientY);
                    const target = el && el.closest ? el.closest('.white-key, .black-key') : null;
                    const nextEl = (target && this.pianoKeysContainer.contains(target) && !target.classList.contains('disabled') && !target.hasAttribute('hidden')) ? target : null;
                    const prevEl = this.pianoKeysContainer.querySelector(`.flat-key[data-touch-id="${id}"]`);
                    const prevNote = this.touchNoteMap.get(id) || (prevEl ? prevEl.dataset.note : null);
                    const nextNote = nextEl ? nextEl.dataset.note : null;
                    if (prevEl === nextEl || prevNote === nextNote) continue;
                    if (prevEl) { prevEl.classList.remove('pressed'); prevEl.removeAttribute('data-touch-id'); }
                    if (isSustain && prevNote) this.stopSustainForNote(prevNote);
                    if (nextEl && nextNote) {
                        nextEl.classList.add('pressed');
                        nextEl.dataset.touchId = id;
                        this.touchNoteMap.set(id, nextNote);
                        if (isSustain) {
                            this.startSustainForNote(nextNote);
                        } else {
                            this.playNote(nextNote);
                        }
                    } else {
                        this.touchNoteMap.delete(id);
                    }
                }
            };
            window.addEventListener('touchmove', this.boundTouchMove, { passive: true });
        }
        // Touch handlers drive visual pressed state
        this.managePressedVisually = false;

        // Mouse click fallback
        if (!this.boundKeyHandler) {
            this.boundKeyHandler = (event) => {
                const target = event.target.closest('.white-key, .black-key');
                if (!target || !this.pianoKeysContainer.contains(target)) {
                    return;
                }
                this.playNote(target.dataset.note);
            };
            this.pianoKeysContainer.addEventListener('click', this.boundKeyHandler);
            this.managePressedVisually = true;
        }

        this.attachHoverPreview();
    }

    /**
     * Get current diatonic notes
     * @returns {Array} Array of diatonic notes
     */
    getDiatonicNotes() {
        return this.diatonicNotes;
    }

    /**
     * Get current scale type
     * @returns {string} Current scale type
     */
    getScaleType() {
        return this.scaleType;
    }

    /**
     * Get current mode
     * @returns {string} Current mode
     */
    getMode() {
        return this.mode;
    }
}

// Export the module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = KeyboardModule;
} else {
    window.KeyboardModule = KeyboardModule;
}
