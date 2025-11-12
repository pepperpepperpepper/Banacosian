const DEFAULT_LOG_PRECISION = 3;

function formatStructuredValue(value, precision) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number(value.toFixed(precision));
  }
  return value;
}

export function logStructured(label, data, precision = DEFAULT_LOG_PRECISION) {
  try {
    const replacer = (_key, value) => formatStructuredValue(value, precision);
    console.log(`${label}: ${JSON.stringify(data, replacer)}`);
  } catch (error) {
    console.log(label, data);
  }
}

export const LOG_PRECISION = DEFAULT_LOG_PRECISION;

export function debounce(fn, delay = 100) {
  if (typeof fn !== 'function') {
    throw new TypeError('debounce requires a function argument.');
  }
  let timerId = null;
  const timerHost = typeof window !== 'undefined' ? window : globalThis;
  return (...args) => {
    if (timerId) {
      timerHost.clearTimeout(timerId);
    }
    timerId = timerHost.setTimeout(() => {
      timerId = null;
      fn(...args);
    }, delay);
  };
}

export function parsePositiveNumber(value) {
  if (value === null || value === undefined) return null;
  const source = typeof value === 'string' ? value.trim() : value;
  if (source === '') return null;
  const numeric = typeof source === 'number' ? source : Number.parseFloat(source);
  if (!Number.isFinite(numeric)) return null;
  return numeric > 0 ? numeric : null;
}

export function readPositiveDatasetNumber(dataset, key) {
  if (!dataset || typeof dataset !== 'object' || typeof key !== 'string') {
    return null;
  }
  return parsePositiveNumber(dataset[key]);
}

export function calculateStaffPadding(baseWidth, baseHeight, options = {}) {
  const {
    horizontalRatio = 0.02,
    verticalRatio = 0.018,
    minHorizontal = 10,
    minVertical = 3,
  } = options;
  const width = parsePositiveNumber(baseWidth) ?? 0;
  const height = parsePositiveNumber(baseHeight) ?? 0;
  const horizontal = Math.max(
    minHorizontal,
    Math.round(width > 0 ? width * horizontalRatio : minHorizontal),
  );
  const vertical = Math.max(
    minVertical,
    Math.round(height > 0 ? height * verticalRatio : minVertical),
  );
  return { horizontal, vertical };
}

export function normalizeDomRect(rect) {
  if (!rect || typeof rect !== 'object') return null;
  const resolve = (primary, fallback) => {
    if (Number.isFinite(primary)) return primary;
    if (Number.isFinite(fallback)) return fallback;
    return null;
  };
  const x = resolve(rect.x, rect.left);
  const y = resolve(rect.y, rect.top);
  const width = Number.isFinite(rect.width) ? rect.width : null;
  const height = Number.isFinite(rect.height) ? rect.height : null;
  if (x == null && y == null && width == null && height == null) return null;
  return {
    x: x ?? 0,
    y: y ?? 0,
    width: width ?? 0,
    height: height ?? 0,
  };
}
