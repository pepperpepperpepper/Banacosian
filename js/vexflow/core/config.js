import {
    parsePositiveNumber,
    readPositiveDatasetNumber,
    calculateStaffPadding,
} from '/js/shared/utils.js';
import { readTokens, applyVexflowSvgTheme } from '/staff/shared/theme.js';

export const DEFAULT_STAFF_SCALE = 1.8;

export const DEFAULT_STAFF_SIZING = Object.freeze({
    minWidth: null,
    maxWidth: null,
    targetWidth: null,
    baseHeight: 200,
});

export const DEFAULT_STAFF_PADDING = Object.freeze({
    horizontalRatio: 0.02,
    verticalRatio: 0.08,
    minHorizontal: 18,
    minVertical: 16,
});

export function normalizeStaffSizing(source = {}, defaults = DEFAULT_STAFF_SIZING) {
    const candidate = typeof source === 'object' && source !== null ? source : {};
    const normalized = {
        minWidth: parsePositiveNumber(candidate.minWidth ?? defaults.minWidth),
        maxWidth: parsePositiveNumber(candidate.maxWidth ?? defaults.maxWidth),
        targetWidth: parsePositiveNumber(candidate.targetWidth ?? defaults.targetWidth),
        baseHeight: parsePositiveNumber(candidate.baseHeight ?? defaults.baseHeight),
    };
    if (normalized.maxWidth && normalized.minWidth && normalized.maxWidth < normalized.minWidth) {
        normalized.maxWidth = null;
    }
    return normalized;
}

export function readStaffSizingFromDataset(dataset, defaults = DEFAULT_STAFF_SIZING) {
    if (!dataset || typeof dataset !== 'object') {
        return normalizeStaffSizing({}, defaults);
    }
    return normalizeStaffSizing({
        minWidth: readPositiveDatasetNumber(dataset, 'staffMinWidth'),
        maxWidth: readPositiveDatasetNumber(dataset, 'staffMaxWidth'),
        targetWidth: readPositiveDatasetNumber(dataset, 'staffTargetWidth'),
        baseHeight: readPositiveDatasetNumber(dataset, 'staffBaseHeight'),
    }, defaults);
}

export function readStaffConfigFromDataset(dataset, defaults = {}) {
    const sizingDefaults = defaults?.sizing || DEFAULT_STAFF_SIZING;
    const scaleDefault = defaults?.scale ?? null;
    const sizing = readStaffSizingFromDataset(dataset, sizingDefaults);
    const scale = parsePositiveNumber(
        dataset && typeof dataset === 'object'
            ? dataset.staffScale ?? scaleDefault
            : scaleDefault,
    );
    return {
        sizing,
        scale: scale && scale > 0 ? scale : null,
    };
}

export function applyStaffSizingToState(state, sizing = {}) {
    if (!state || typeof state !== 'object') return state;
    const normalized = normalizeStaffSizing(sizing);
    state.minWidth = normalized.minWidth;
    state.maxWidth = normalized.maxWidth;
    state.targetWidth = normalized.targetWidth;
    state.baseHeight = normalized.baseHeight;
    return state;
}

export function resolveStaffScale(renderState, { defaultScale = DEFAULT_STAFF_SCALE } = {}) {
    const fromState = Number.isFinite(renderState?.staffScale) && renderState.staffScale > 0
        ? renderState.staffScale
        : null;
    const globalOverride = (typeof window !== 'undefined' && Number.isFinite(window.__VEXFLOW_STAFF_SCALE))
        ? window.__VEXFLOW_STAFF_SCALE
        : null;
    const scale = fromState || globalOverride || defaultScale;
    if (renderState && Number.isFinite(scale) && scale > 0) {
        renderState.staffScale = scale;
    }
    return scale;
}

export function calculateDefaultStaffPadding(baseWidth, baseHeight, options = {}) {
    const merged = {
        ...DEFAULT_STAFF_PADDING,
        ...(options || {}),
    };
    return calculateStaffPadding(baseWidth, baseHeight, merged);
}

export function getStaffTheme() {
    return readTokens();
}

export function applyVexflowTheme(container, palette) {
    if (!container) return;
    const svg = container.querySelector?.('svg');
    if (!svg) return;
    const colors = palette || getStaffTheme();
    applyVexflowSvgTheme(svg, colors);
}
