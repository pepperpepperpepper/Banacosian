/**
 * SettingsStore - tiny persistence helper for settings + a simple hash
 * Backed by localStorage so it works in browser and Android WebView.
 */
(function () {
  const SETTINGS_KEY = 'md:settings:v1';
  const HASH_KEY = 'md:hash:v1';

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }

  function safeSet(key, value) {
    try { localStorage.setItem(key, value); } catch {}
  }

  const SettingsStore = {
    load() {
      try {
        const raw = safeGet(SETTINGS_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    save(settings) {
      const payload = {
        ...settings,
        _meta: { v: 1, updatedAt: new Date().toISOString() }
      };
      safeSet(SETTINGS_KEY, JSON.stringify(payload));
      return payload;
    },
    getHash() {
      return safeGet(HASH_KEY);
    },
    setHash(hash) {
      safeSet(HASH_KEY, String(hash || ''));
    },
    clear() {
      try { localStorage.removeItem(SETTINGS_KEY); } catch {}
      try { localStorage.removeItem(HASH_KEY); } catch {}
    },
    async sha256Hex(input) {
      try {
        if (!window.crypto || !window.crypto.subtle) return null;
        const enc = new TextEncoder().encode(String(input));
        const buf = await crypto.subtle.digest('SHA-256', enc);
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      } catch {
        return null;
      }
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SettingsStore;
  } else {
    window.SettingsStore = SettingsStore;
  }
})();

