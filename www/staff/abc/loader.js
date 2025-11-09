import { createSmuflRenderer } from '../font/vendor/smufl-shim.js';

/**
 * Waits for the ABCJS global to expose renderAbc/engraver, polling in case
 * the CDN script is still loading. Resolves with the ABCJS namespace.
 */
export function waitForABCJS({ maxAttempts = 20, intervalMs = 100 } = {}) {
  return new Promise((resolve, reject) => {
    if (window.ABCJS?.renderAbc) {
      resolve(window.ABCJS);
      return;
    }

    let attempts = 0;
    const interval = window.setInterval(() => {
      attempts += 1;
      if (window.ABCJS?.renderAbc) {
        window.clearInterval(interval);
        resolve(window.ABCJS);
      } else if (attempts >= maxAttempts) {
        window.clearInterval(interval);
        reject(new Error('ABCJS failed to load.'));
      }
    }, intervalMs);
  });
}

/**
 * Convenience for creating a SMuFL renderer with our default configuration.
 */
export function createDefaultSmuflRenderer(options = {}) {
  const defaults = { fontKey: 'bravura' };
  return createSmuflRenderer({ ...defaults, ...options });
}

export { createSmuflRenderer };
