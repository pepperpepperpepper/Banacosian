(function initStaffDisplayRuntime(globalScope) {
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
                const config = typeof readStaffConfigFromDataset === 'function'
                    ? readStaffConfigFromDataset(dataset)
                    : { sizing: { minWidth: null, maxWidth: null, targetWidth: null, baseHeight: null }, scale: null };
                const sizing = config?.sizing || { minWidth: null, maxWidth: null, targetWidth: null, baseHeight: null };
                const staffScale = config?.scale ?? null;
                const staffPack = config?.pack ?? null;
                if (runtime) {
                    runtime.update({
                        keySig: this.keySignature,
                        minWidth: sizing.minWidth,
                        maxWidth: sizing.maxWidth,
                        targetWidth: sizing.targetWidth,
                        baseHeight: sizing.baseHeight,
                        staffScale: staffScale ?? runtime.state.staffScale,
                        staffPack: staffPack ?? runtime.state.staffPack,
                    });
                }
                const display = new DisplayCtor({
                    container: this.containerEl,
                    statusEl: this.statusEl,
                    clef: this.clef,
                    keySignature: this.keySignature,
                    fontId: this.fontPreference,
                    minWidth: sizing.minWidth ?? undefined,
                    maxWidth: sizing.maxWidth ?? undefined,
                    targetWidth: sizing.targetWidth ?? undefined,
                    baseHeight: sizing.baseHeight ?? undefined,
                    staffScale: staffScale ?? undefined,
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
