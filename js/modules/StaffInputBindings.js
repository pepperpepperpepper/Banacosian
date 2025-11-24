(function initStaffInputBindings(globalScope) {
    function resolveStaffNoteUtils() {
        if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
            try {
                // eslint-disable-next-line global-require
                return require('./StaffNoteUtils.js');
            } catch (error) {
                console.warn('[StaffInputBindings] Unable to require StaffNoteUtils.', error);
                return null;
            }
        }
        return globalScope?.StaffNoteUtils || null;
    }

    const StaffNoteUtils = resolveStaffNoteUtils();
    if (!StaffNoteUtils) {
        throw new Error('StaffInputBindings requires StaffNoteUtils. Load js/modules/StaffNoteUtils.js first.');
    }

    const { formatSpecToNote } = StaffNoteUtils;

    async function ensureStaffInputHelpers() {
        if (!this.staffInputState) return null;
        if (this.staffInputState.strategy === 'interaction') return null;
        if (this.staffInputState.helpers) return this.staffInputState.helpers;
        if (this.staffInputState.helpersPromise) return this.staffInputState.helpersPromise;
        this.staffInputState.helpersPromise = Promise.all([
            import('/staff/interaction-dom.js').catch((error) => {
                console.warn('[StaffModule] unable to load interaction DOM helpers', error);
                return {};
            }),
            import('/js/vexflow/core/helpers/pitch.js').catch((error) => {
                console.warn('[StaffModule] unable to load pitch helpers', error);
                return {};
            }),
        ]).then(([domHelpers, pitchHelpers]) => {
            const helpers = {
                HAS_POINTER_EVENTS: Boolean(domHelpers?.HAS_POINTER_EVENTS),
                normalizePointerEvent: typeof domHelpers?.normalizePointerEvent === 'function'
                    ? domHelpers.normalizePointerEvent
                    : ((event) => event),
                convertToSvgCoords: domHelpers?.convertToSvgCoords,
                findClosestPitchForY: pitchHelpers?.findClosestPitchForY,
            };
            if (typeof helpers.convertToSvgCoords !== 'function' || typeof helpers.findClosestPitchForY !== 'function') {
                console.warn('[StaffModule] staff input helpers incomplete');
                return null;
            }
            this.staffInputState.helpers = helpers;
            return helpers;
        }).catch((error) => {
            console.warn('[StaffModule] failed to initialize staff input helpers', error);
            return null;
        }).finally(() => {
            this.staffInputState.helpersPromise = null;
        });
        return this.staffInputState.helpersPromise;
    }

    function fallbackSvgCoords(pointerEvent, svg) {
        if (!pointerEvent || !svg) return null;
        const rect = typeof svg.getBoundingClientRect === 'function'
            ? svg.getBoundingClientRect()
            : null;
        if (!rect) return null;
        const clientX = pointerEvent.clientX ?? pointerEvent.pageX;
        const clientY = pointerEvent.clientY ?? pointerEvent.pageY;
        if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
        const viewBoxAttr = svg.getAttribute?.('viewBox') || '';
        let minX = 0;
        let minY = 0;
        let viewWidth = svg.viewBox?.baseVal?.width || svg.width?.baseVal?.value || rect.width || 0;
        let viewHeight = svg.viewBox?.baseVal?.height || svg.height?.baseVal?.value || rect.height || 0;
        if (viewBoxAttr && typeof viewBoxAttr === 'string') {
            const parts = viewBoxAttr.trim().split(/[\s,]+/).map((part) => Number.parseFloat(part));
            if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
                [minX, minY, viewWidth, viewHeight] = parts;
            }
        }
        if (!Number.isFinite(viewWidth) || viewWidth === 0 || !Number.isFinite(viewHeight) || viewHeight === 0) {
            return null;
        }
        const relX = (clientX - rect.left) / rect.width;
        const relY = (clientY - rect.top) / rect.height;
        if (!Number.isFinite(relX) || !Number.isFinite(relY)) return null;
        const x = minX + relX * viewWidth;
        const y = minY + relY * viewHeight;
        const scale = this.getRenderStateSnapshot?.()?.staffMetrics?.scale || 1;
        return {
            x,
            y,
            scaledX: x * scale,
            scaledY: y * scale,
            scale,
        };
    }

    function determineInsertIndexFromCoords(coords, staffIndex) {
        if (Number.isInteger(staffIndex) && staffIndex >= 0) {
            return staffIndex;
        }
        if (!coords || !this.containerEl) {
            return this.noteEntries.length;
        }
        const svg = this.containerEl.querySelector('svg');
        if (!svg) return this.noteEntries.length;
        const noteEls = svg.querySelectorAll?.('.vf-stavenote[data-staff-index]');
        if (!noteEls || noteEls.length === 0) {
            return this.noteEntries.length;
        }
        const targetX = Number.isFinite(coords.x) ? coords.x : coords.scaledX;
        if (!Number.isFinite(targetX)) {
            return this.noteEntries.length;
        }
        let candidate = null;
        noteEls.forEach((node) => {
            if (!node) return;
            const attr = node.getAttribute('data-staff-index');
            const idx = Number.parseInt(attr, 10);
            if (!Number.isInteger(idx)) return;
            let bbox = null;
            try {
                bbox = node.getBBox?.();
            } catch (_err) {
                bbox = null;
            }
            if (!bbox) return;
            const center = bbox.x + (bbox.width / 2);
            if (!Number.isFinite(center)) return;
            if (targetX <= center) {
                if (candidate == null || idx < candidate) {
                    candidate = idx;
                }
            }
        });
        if (candidate == null) {
            return this.noteEntries.length;
        }
        return candidate;
    }

    function resolveStaffIndexFromTarget(event) {
        if (!event) return null;
        const buildPath = (start) => {
            const nodes = [];
            let current = start || null;
            while (current) {
                nodes.push(current);
                current = current.parentNode;
            }
            return nodes;
        };
        const path = typeof event.composedPath === 'function'
            ? event.composedPath()
            : buildPath(event.target);
        if (!Array.isArray(path)) return null;
        for (const node of path) {
            if (!node) continue;
            const dataset = node.dataset || {};
            let value = dataset.staffIndex;
            if (value == null && typeof node.getAttribute === 'function') {
                value = node.getAttribute('data-staff-index');
            }
            if (value == null || value === '') continue;
            const parsed = Number.parseInt(value, 10);
            if (Number.isInteger(parsed)) {
                return parsed;
            }
        }
        return null;
    }

    function resolveStaffIndexFromCoords(coords) {
        if (!coords || !this.containerEl) return null;
        const svg = this.containerEl.querySelector('svg');
        if (!svg) return null;
        const pointerX = Number.isFinite(coords.x) ? coords.x : coords.scaledX;
        const pointerY = Number.isFinite(coords.y) ? coords.y : coords.scaledY;
        if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) return null;
        const noteEls = svg.querySelectorAll?.('.vf-stavenote[data-staff-index]');
        if (!noteEls || noteEls.length === 0) return null;
        const metrics = this.getRenderStateSnapshot?.()?.staffMetrics || null;
        const baseSpacing = Number.isFinite(metrics?.spacing) ? metrics.spacing : 10;
        const padding = Math.max(4, baseSpacing * 0.35);
        let bestIndex = null;
        let bestScore = Infinity;
        noteEls.forEach((node) => {
            if (!node) return;
            const attr = node.getAttribute('data-staff-index');
            const idx = Number.parseInt(attr, 10);
            if (!Number.isInteger(idx)) return;
            let bbox = null;
            try {
                bbox = node.getBBox?.();
            } catch (_err) {
                bbox = null;
            }
            if (!bbox) return;
            const expandedX = bbox.x - padding;
            const expandedY = bbox.y - padding;
            const expandedWidth = bbox.width + (padding * 2);
            const expandedHeight = bbox.height + (padding * 2);
            const inside = pointerX >= expandedX
                && pointerX <= expandedX + expandedWidth
                && pointerY >= expandedY
                && pointerY <= expandedY + expandedHeight;
            const centerX = bbox.x + (bbox.width / 2);
            const centerY = bbox.y + (bbox.height / 2);
            const dx = Math.abs(pointerX - centerX);
            const dy = Math.abs(pointerY - centerY);
            const withinBand = dy <= (padding * 1.5);
            if (!inside && !withinBand) return;
            const score = inside ? (dx + dy * 0.1) : (dx + dy);
            if (score < bestScore) {
                bestScore = score;
                bestIndex = idx;
            }
        });
        return bestIndex;
    }

    function resolveStaffIndexFromEvent(event, coords = null) {
        const targetIndex = this.resolveStaffIndexFromTarget(event);
        if (targetIndex != null) {
            return targetIndex;
        }
        return this.resolveStaffIndexFromCoords(coords);
    }

    function handleStaffPointerEvent(event) {
        if (!this.staffInputState || !this.staffInputState.enabled) return;
        if (this.staffInputState.strategy === 'interaction') return;
        const helpers = this.staffInputState.helpers;
        if (!helpers || typeof helpers.convertToSvgCoords !== 'function') return;
        if (!this.containerEl) return;
        const svg = this.containerEl.querySelector('svg');
        if (!svg) return;
        const hasPointerEvents = Boolean(helpers.HAS_POINTER_EVENTS);
        const type = event?.type || '';
        const isPointerEvent = hasPointerEvents && type.startsWith('pointer');
        let phase = null;
        if (isPointerEvent) {
            if (type === 'pointerdown') {
                if (event.button !== undefined && event.button !== 0) return;
                phase = 'start';
            } else if (type === 'pointermove') {
                if (!this.staffInputState.activePointers.has(event.pointerId)) return;
                phase = 'move';
            } else if (type === 'pointerup' || type === 'pointercancel') {
                if (!this.staffInputState.activePointers.has(event.pointerId)) return;
                phase = 'end';
            }
        } else if (type === 'mousedown' || type === 'touchstart') {
            if (event.button !== undefined && event.button !== 0) return;
            phase = 'start';
        } else if (type === 'mouseup' || type === 'touchend' || type === 'touchcancel') {
            phase = 'end';
        } else if (type === 'mousemove' || type === 'touchmove') {
            phase = 'move';
        }
        if (!phase) return;
        const pointerId = isPointerEvent
            ? event.pointerId
            : (type.startsWith('mouse') ? 'mouse' : 'touch');
        const captureTarget = this.staffInputState.boundTarget || svg;
        if (phase === 'start') {
            this.staffInputState.activePointers.add(pointerId);
            if (isPointerEvent && captureTarget && typeof captureTarget.setPointerCapture === 'function' && pointerId != null) {
                try {
                    captureTarget.setPointerCapture(pointerId);
                } catch (captureError) {
                    console.warn('[StaffModule] unable to capture pointer', captureError);
                }
            }
        } else if ((phase === 'end' || phase === 'cancel') && pointerId != null) {
            this.staffInputState.activePointers.delete(pointerId);
            if (isPointerEvent && captureTarget && typeof captureTarget.releasePointerCapture === 'function') {
                try {
                    captureTarget.releasePointerCapture(pointerId);
                } catch (_releaseError) {
                    /* noop */
                }
            }
        } else if (phase === 'move' && !this.staffInputState.activePointers.has(pointerId)) {
            return;
        }

        const normalized = helpers.normalizePointerEvent ? helpers.normalizePointerEvent(event) : event;
        let coords = null;
        if (phase !== 'end') {
            coords = helpers.convertToSvgCoords ? helpers.convertToSvgCoords(normalized, svg) : null;
            if (!coords) {
                coords = this.fallbackSvgCoords(normalized, svg);
            }
        }
        const pointerKey = pointerId != null ? pointerId : undefined;
        const pointerNotes = this.staffInputState.pointerNotes;
        const existingPointerMeta = pointerNotes.get(pointerKey) || null;
        let staffIndex = phase === 'start'
            ? this.resolveStaffIndexFromEvent(event, coords)
            : (Number.isInteger(existingPointerMeta?.staffIndex)
                ? existingPointerMeta.staffIndex
                : null);
        let pitchInfo = null;
        let note = null;
        if (coords) {
            const renderState = this.getRenderStateSnapshot?.();
            pitchInfo = helpers.findClosestPitchForY?.(coords.y, this.clef, {
                stave: renderState?.activeStave,
                metrics: renderState?.staffMetrics,
                midiMin: this.staffInputState.midiMin,
                midiMax: this.staffInputState.midiMax,
            });
            if (pitchInfo?.spec) {
                note = formatSpecToNote(pitchInfo.spec);
            }
        }
        if (phase !== 'end' && !note) return;
        if (typeof event.preventDefault === 'function') {
            event.preventDefault();
        }
        if (typeof event.stopPropagation === 'function') {
            event.stopPropagation();
        }
        if (phase === 'move'
            && note
            && existingPointerMeta
            && existingPointerMeta.note === note
            && (existingPointerMeta.staffIndex === staffIndex)) {
            return;
        }
        let insertIndex = phase === 'start'
            ? this.determineInsertIndexFromCoords(coords, staffIndex)
            : (Number.isInteger(existingPointerMeta?.insertIndex)
                ? existingPointerMeta.insertIndex
                : null);
        if (phase === 'start' && staffIndex == null && Number.isInteger(insertIndex)) {
            staffIndex = insertIndex;
        }
        if (
            phase === 'start'
            && typeof this.staffInputState.pointerInsertGuard === 'function'
        ) {
            const allowPointer = this.staffInputState.pointerInsertGuard({
                phase,
                staffIndex,
                insertIndex,
                note,
                pointerId,
                coords,
            });
            if (allowPointer === false) {
                pointerNotes.delete(pointerKey);
                return;
            }
        }
        if (typeof this.staffInputState.onInput === 'function') {
            this.staffInputState.onInput(note, {
                pitchInfo,
                coords,
                phase,
                pointerId,
                staffIndex,
                insertIndex,
            });
        }
        if (phase === 'end' || phase === 'cancel') {
            pointerNotes.delete(pointerKey);
        } else if (pointerKey != null) {
            pointerNotes.set(pointerKey, {
                note: note ?? existingPointerMeta?.note ?? null,
                staffIndex,
                insertIndex,
            });
        }
    }

    function attachStaffInputListeners() {
        if (!this.staffInputState || this.staffInputState.strategy === 'interaction') return;
        const target = this.containerEl;
        if (!target) return;
        const svg = target.querySelector?.('svg');
        if (!svg) return;
        const helpers = this.staffInputState.helpers;
        if (!helpers) return;
        this.detachStaffInputListeners();
        const handler = (event) => this.handleStaffPointerEvent(event);
        const handlers = [];
        const documentHandlers = [];
        if (helpers.HAS_POINTER_EVENTS) {
            ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'].forEach((type) => {
                target.addEventListener(type, handler);
                handlers.push({ type, handler });
            });
        } else {
            target.addEventListener('mousedown', handler);
            target.addEventListener('touchstart', handler, { passive: false });
            target.addEventListener('mousemove', handler);
            target.addEventListener('mouseup', handler);
            target.addEventListener('touchmove', handler, { passive: false });
            target.addEventListener('touchend', handler, { passive: false });
            target.addEventListener('touchcancel', handler, { passive: false });
            handlers.push({ type: 'mousedown', handler }, { type: 'touchstart', handler }, { type: 'mousemove', handler }, { type: 'mouseup', handler }, { type: 'touchmove', handler }, { type: 'touchend', handler }, { type: 'touchcancel', handler });
            if (typeof document !== 'undefined') {
                const docTargets = [
                    'mousemove',
                    'mouseup',
                    'touchmove',
                    'touchend',
                    'touchcancel',
                ];
                docTargets.forEach((type) => {
                    const docHandler = (docEvent) => this.handleStaffPointerEvent(docEvent);
                    document.addEventListener(type, docHandler, { passive: false });
                    documentHandlers.push({ target: document, type, handler: docHandler });
                });
            }
        }
        this.staffInputState.handlers = handlers;
        this.staffInputState.documentHandlers = documentHandlers;
        this.staffInputState.boundSvg = svg;
        this.staffInputState.boundTarget = target;
        if (this.staffInputState.originalTouchAction === null) {
            this.staffInputState.originalTouchAction = target.style.touchAction || '';
        }
        target.style.touchAction = 'none';
    }

    function detachStaffInputListeners() {
        if (!this.staffInputState) return;
        const target = this.staffInputState.boundTarget || this.staffInputState.boundSvg;
        if (target) {
            this.staffInputState.handlers.forEach(({ type, handler }) => {
                if (handler) {
                    target.removeEventListener(type, handler);
                }
            });
            if (this.staffInputState.originalTouchAction !== null) {
                target.style.touchAction = this.staffInputState.originalTouchAction;
            }
        }
        this.staffInputState.handlers = [];
        const docHandlers = this.staffInputState.documentHandlers || [];
        docHandlers.forEach(({ target: docTarget, type, handler }) => {
            if (docTarget && type && handler) {
                docTarget.removeEventListener(type, handler);
            }
        });
        this.staffInputState.documentHandlers = [];
        this.staffInputState.boundSvg = null;
        this.staffInputState.boundTarget = null;
        this.staffInputState.originalTouchAction = null;
        if (this.staffInputState.activePointers) {
            this.staffInputState.activePointers.clear();
        }
        if (this.staffInputState.pointerNotes) {
            this.staffInputState.pointerNotes.clear();
        }
    }

    async function refreshStaffInputBindings() {
        if (!this.staffInputState || !this.staffInputState.enabled) return;
        if (this.staffInputState.strategy === 'interaction') return;
        const helpers = this.staffInputState.helpers || await this.ensureStaffInputHelpers?.();
        if (!helpers) return;
        if (!this.containerEl) return;
        const svg = this.containerEl.querySelector('svg');
        if (!svg) return;
        svg.style.pointerEvents = 'all';
        svg.setAttribute('pointer-events', 'all');
        this.staffInputState.boundSvg = svg;
        if (this.staffInputState.boundTarget === this.containerEl && this.staffInputState.handlers.length > 0) {
            return;
        }
        this.attachStaffInputListeners();
    }

    function attachTo(target) {
        if (!target) return;
        const proto = target.prototype || target;
        if (!proto) return;
        proto.ensureStaffInputHelpers = ensureStaffInputHelpers;
        proto.fallbackSvgCoords = fallbackSvgCoords;
        proto.determineInsertIndexFromCoords = determineInsertIndexFromCoords;
        proto.resolveStaffIndexFromTarget = resolveStaffIndexFromTarget;
        proto.resolveStaffIndexFromCoords = resolveStaffIndexFromCoords;
        proto.resolveStaffIndexFromEvent = resolveStaffIndexFromEvent;
        proto.handleStaffPointerEvent = handleStaffPointerEvent;
        proto.attachStaffInputListeners = attachStaffInputListeners;
        proto.detachStaffInputListeners = detachStaffInputListeners;
        proto.refreshStaffInputBindings = refreshStaffInputBindings;
    }

    const api = { attachTo };
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        globalScope.StaffInputBindings = api;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
