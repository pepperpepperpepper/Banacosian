const DEFAULT_PRECISION = 3;

function formatValue(value, precision) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number(value.toFixed(precision));
  }
  return value;
}

export function logStructured(label, data, precision = DEFAULT_PRECISION) {
  try {
    const replacer = (_key, value) => formatValue(value, precision);
    console.log(`${label}: ${JSON.stringify(data, replacer)}`);
  } catch (error) {
    console.log(label, data);
  }
}

export const LOG_PRECISION = DEFAULT_PRECISION;
