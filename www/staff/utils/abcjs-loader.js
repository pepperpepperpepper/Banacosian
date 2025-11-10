const DEFAULT_INTERVAL_MS = 100;
const DEFAULT_MAX_ATTEMPTS = 40;

const cache = new Map();

function hasRequiredApi(abcjs, requireMethod) {
  if (!abcjs) return false;
  if (!requireMethod) return true;
  const candidate = abcjs[requireMethod];
  return typeof candidate === 'function';
}

export function waitForAbcjs({ requireMethod } = {}) {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('ABCJS loader requires a browser environment.'));
  }

  const cacheKey = requireMethod || '__default__';
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const promise = new Promise((resolve, reject) => {
    if (hasRequiredApi(window.ABCJS, requireMethod)) {
      resolve(window.ABCJS);
      return;
    }
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (hasRequiredApi(window.ABCJS, requireMethod)) {
        window.clearInterval(timer);
        resolve(window.ABCJS);
        return;
      }
      if (attempts >= DEFAULT_MAX_ATTEMPTS) {
        window.clearInterval(timer);
        reject(new Error('ABCJS failed to load.'));
      }
    }, DEFAULT_INTERVAL_MS);
  });

  cache.set(cacheKey, promise);
  return promise;
}
