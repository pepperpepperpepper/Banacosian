export const DURATION_DENOMS = [1, 2, 4, 8, 16, 32, 64];

export const DURATION_CODES = {
  1: 'w',
  2: 'h',
  4: 'q',
  8: '8',
  16: '16',
  32: '32',
  64: '64',
};

export const MAX_DOTS = 3;
export const DURATION_TOLERANCE = 1e-6;

export function durationFromDenom(denom, dots) {
  let value = 1 / denom;
  let addition = value;
  for (let i = 0; i < dots; i += 1) {
    addition /= 2;
    value += addition;
  }
  return value;
}

export function resolveDuration(value) {
  let bestMatch = null;
  DURATION_DENOMS.forEach((denom) => {
    const baseCode = DURATION_CODES[denom];
    if (!baseCode) return;
    for (let dots = 0; dots <= MAX_DOTS; dots += 1) {
      const total = durationFromDenom(denom, dots);
      const diff = Math.abs(total - value);
      const exact = diff <= DURATION_TOLERANCE;
      if (!bestMatch || diff < bestMatch.diff) {
        bestMatch = {
          code: baseCode,
          base: denom,
          dots,
          diff,
          exact,
        };
      }
      if (exact) {
        return;
      }
    }
  });
  return bestMatch;
}
