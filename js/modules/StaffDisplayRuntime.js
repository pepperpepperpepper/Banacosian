(function initStaffDisplayRuntime(globalScope) {
    function cloneDataset(source) {
        if (!source || typeof source !== 'object') return null;
        return { ...source };
    }

    function resolveResponsiveDataset(dataset) {
        if (!dataset) return dataset;
        if (typeof window === 'undefined') return dataset;
        const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 0;
        if (!viewportWidth) return dataset;
        const breakpoint = Number.parseInt(dataset.staffBreakpoint, 10) || 900;
        const isMobile = viewportWidth <= breakpoint;
        const suffix = isMobile ? 'Mobile' : 'Desktop';
        const responsiveKeys = [
            'staffScale',
            'staffScaleY',
            'staffMinWidth',
            'staffMaxWidth',
            'staffTargetWidth',
            'staffBaseHeight',
        ];
        const clone = cloneDataset(dataset);
        let changed = false;
        responsiveKeys.forEach((key) => {
            const responsiveKey = `${key}${suffix}`;
            const overrideValue = clone[responsiveKey];
            if (overrideValue != null) {
                clone[key] = overrideValue;
                changed = true;
            }
        });
        return changed ? clone : dataset;
    }
    function ensureRenderRuntime() {
        if (this.renderRuntime) {
            this.renderRuntime.update({ keySig: this.keySignature });
            return Promise.resolve(this.renderRuntime);
        }
        if (this.renderRuntimePromise) {
            return this.renderRuntimePromise.then((runtime) => {
                if (runtime) runtime.update({ keySig: this.keySignature });
                return runtime;
            });
        }
        this.renderRuntimePromise = import('/js/vexflow/core/seeds.js')
            .then((module) => {
                const factory = module?.createRenderRuntime;
                if (typeof factory !== 'function') {
                    throw new Error('createRenderRuntime export missing.');
                }
                const runtime = factory({
                    initialState: {
                        interactionEnabled: false,
                        keySig: this.keySignature,
                    },
                });
                this.renderRuntime = runtime;
                return runtime;
            })
            .catch((error) => {
                console.error('[StaffModule] failed to load render runtime.', error);
                this.renderRuntimePromise = null;
                return null;
            });
        return this.renderRuntimePromise.then((runtime) => {
            if (runtime) runtime.update({ keySig: this.keySignature });
            return runtime;
        });
    }

    function initializeDisplay() {
        if (this.displayPromise) return this.displayPromise;
        this.displayPromise = (async () => {
            if (typeof window === 'undefined') {
                return null;
            }
            if (!this.containerEl) {
                console.warn('[StaffModule] staff container not found.');
                if (this.statusEl) this.statusEl.textContent = 'Staff unavailable.';
                return null;
            }
            try {
                const [displayModule, configModule, runtime] = await Promise.all([
                    import('/js/vexflow/StaffDisplay.js'),
                    import('/js/vexflow/core/config.js'),
                    this.ensureRenderRuntime(),
                ]);
                const DisplayCtor = displayModule?.VexflowStaffDisplay || displayModule?.default;
                if (!DisplayCtor) {
                    throw new Error('VexflowStaffDisplay export missing.');
                }
                const { readStaffConfigFromDataset } = configModule || {};
                const dataset = this.containerEl.dataset || null;
                const responsiveDataset = resolveResponsiveDataset(dataset);
                const config = typeof readStaffConfigFromDataset === 'function'
                    ? readStaffConfigFromDataset(responsiveDataset || dataset)
                    : { sizing: { minWidth: null, maxWidth: null, targetWidth: null, baseHeight: null }, scale: null };
                const sizing = config?.sizing || { minWidth: null, maxWidth: null, targetWidth: null, baseHeight: null };
                const staffScale = config?.scale ?? null;
                const staffScaleY = config?.scaleY ?? null;
                const staffPack = config?.pack ?? null;
                if (runtime) {
                    runtime.update({
                        keySig: this.keySignature,
                        minWidth: sizing.minWidth,
                        maxWidth: sizing.maxWidth,
                        targetWidth: sizing.targetWidth,
                        baseHeight: sizing.baseHeight,
                        staffScale: staffScale ?? runtime.state.staffScale,
                        staffScaleY: staffScaleY ?? runtime.state.staffScaleY,
                        staffPack: staffPack ?? runtime.state.staffPack,
                    });
                }
                const display = new DisplayCtor({
                    container: this.containerEl,
                    statusEl: this.statusEl,
                    clef: this.clef,
                    keySignature: this.keySignature,
                    meter: this.timeSignature || undefined,
                    fontId: this.fontPreference,
                    minWidth: sizing.minWidth ?? undefined,
                    maxWidth: sizing.maxWidth ?? undefined,
                    targetWidth: sizing.targetWidth ?? undefined,
                    baseHeight: sizing.baseHeight ?? undefined,
                    staffScale: staffScale ?? undefined,
                    staffScaleY: staffScaleY ?? undefined,
                });
                await display.initialize();
                await this.refreshStaffInputBindings();
                this.updateFontIndicator(display);
                if (Array.isArray(this.noteEntries) && this.noteEntries.length > 0) {
                    await display.setSequence(this.noteEntries);
                }
                this.displayInstance = display;
                return display;
            } catch (error) {
                console.error('[StaffModule] failed to initialize staff.', error);
                if (this.statusEl) this.statusEl.textContent = 'Unable to load staff.';
                return null;
            }
        })();
        return this.displayPromise;
    }

    async function ensureDisplay() {
        if (!this.displayPromise) {
            await this.initializeDisplay();
        }
        if (this.displayPromise) {
            const display = await this.displayPromise;
            if (display && !this.displayInstance) {
                this.displayInstance = display;
            }
            return display;
        }
        return null;
    }

    function tagStaffNoteElements() {
        if (!this.containerEl) return;
        const svg = this.containerEl.querySelector('svg');
        if (!svg) return;
        const noteEls = svg.querySelectorAll ? svg.querySelectorAll('.vf-stavenote') : [];
        if (!noteEls || noteEls.length === 0) return;
        let assigned = 0;
        noteEls.forEach((el) => {
            if (!el || typeof el.setAttribute !== 'function') return;
            if (assigned < this.noteEntries.length) {
                el.setAttribute('data-staff-index', `${assigned}`);
                assigned += 1;
            } else {
                el.removeAttribute?.('data-staff-index');
            }
        });
    }

    function updateFontIndicator(display) {
        if (!this.fontIndicatorEl || !display) return;
        const label = display.getFontLabel();
        this.fontIndicatorEl.textContent = label ? `Font: ${label}` : '';
    }

    function enqueue(task) {
        return this.ensureRenderRuntime()
            .then((runtime) => {
                if (!runtime) return null;
                return runtime.enqueue(async () => {
                    const display = await this.ensureDisplay();
                    if (!display) return;
                    await task(display, runtime.state);
                    this.updateFontIndicator(display);
                    if (typeof this.afterRenderRefresh === 'function') {
                        await this.afterRenderRefresh(display);
                    } else {
                        this.tagStaffNoteElements?.();
                        await this.refreshStaffInputBindings?.();
                    }
                });
            })
            .catch((error) => {
                console.error('[StaffModule] operation failed', error);
                return null;
            });
    }

    function attachTo(target) {
        if (!target) return;
        const proto = target.prototype || target;
        if (!proto) return;
        proto.ensureRenderRuntime = ensureRenderRuntime;
        proto.initializeDisplay = initializeDisplay;
        proto.ensureDisplay = ensureDisplay;
        proto.tagStaffNoteElements = tagStaffNoteElements;
        proto.updateFontIndicator = updateFontIndicator;
        proto.enqueue = enqueue;
    }

    const api = { attachTo };
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        globalScope.StaffDisplayRuntime = api;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
