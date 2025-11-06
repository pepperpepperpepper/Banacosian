const SAMPLE_ABC = `X:1
T:SMuFL Glyph Swap
M:4/4
L:1/4
K:C
C D E F | G A B c |
^C _D =E ^F |
_G ^A _B =c |]`;

if (typeof window !== 'undefined') {
  window.__SMUFL_SAMPLE_ABC = SAMPLE_ABC;
}

const staffContainer = document.getElementById('staff-container');
const statusEl = document.getElementById('status');
const defaultBtn = document.getElementById('render-default');
const refreshBtn = document.getElementById('render-smufl');
const fontSelect = document.getElementById('font-select');
const errorLogEl = document.getElementById('error-log');

const state = {
  abcjsPromise: null,
};

import { readTokens } from '/staff/theme/readTokens.js';
import { applyAbcjsSvgTheme } from '/staff/theme/applySvgTheme.js';

const THEME_VAR_MAP = {
  stroke: '--staff-stroke-color',
  fill: '--staff-fill-color',
  ledger: '--staff-ledger-color',
  ledgerWidth: '--staff-ledger-thickness',
  accent: '--color-accent',
  surface: '--color-surface',
  background: '--color-background',
  text: '--color-text-primary',
  secondaryText: '--color-text-secondary',
};

let themeRefreshTimer = null;

if (typeof window !== 'undefined') {
  window.setNotationTheme = function setNotationTheme(theme = {}) {
    const rootStyle = document.documentElement.style;
    Object.entries(theme).forEach(([key, value]) => {
      const cssVar = THEME_VAR_MAP[key];
      if (!cssVar || value == null) return;
      rootStyle.setProperty(cssVar, String(value));
    });
    scheduleNotationRefresh();
  };
}

initialize();

function initialize() {
  if (defaultBtn) {
    defaultBtn.addEventListener('click', () => {
      renderAbc().catch((error) => {
        logError('Unable to render staff.', error);
      });
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      renderAbc().catch((error) => {
        logError('Unable to render staff.', error);
      });
      triggerVexflowRefresh();
    });
  }

  if (fontSelect) {
    fontSelect.addEventListener('change', () => {
      triggerVexflowRefresh();
    });
  }

  renderAbc().catch((error) => {
    logError('Unable to render staff.', error);
  });
}

function scheduleNotationRefresh() {
  if (themeRefreshTimer) {
    window.clearTimeout(themeRefreshTimer);
  }
  themeRefreshTimer = window.setTimeout(() => {
    themeRefreshTimer = null;
    const abcPromise = renderAbc();
    if (abcPromise?.catch) {
      abcPromise.catch((error) => {
        logError('Unable to render staff.', error);
      });
    }
    triggerVexflowRefresh();
  }, 120);
}

function triggerVexflowRefresh() {
  if (typeof window === 'undefined') return;
  const render = window.requestVexflowRender;
  if (typeof render === 'function') {
    try {
      const maybePromise = render();
      if (maybePromise?.catch) {
        maybePromise.catch((error) => {
          console.error('[VexFlow] Refresh failed.', error);
        });
      }
    } catch (error) {
      console.error('[VexFlow] Unable to refresh renderer.', error);
    }
  }
}

function getStaffTheme() { return readTokens(); }

function applyThemeToSvg(svg, palette) { applyAbcjsSvgTheme(svg, palette); }

function logError(message, detail) {
  if (!errorLogEl) return;
  const entry = document.createElement('div');
  entry.className = 'error-log-entry error';
  const summary = document.createElement('div');
  summary.textContent = message;
  entry.appendChild(summary);
  if (detail) {
    const more = document.createElement('pre');
    more.textContent = detail instanceof Error ? detail.stack || detail.message : String(detail);
    entry.appendChild(more);
  }
  errorLogEl.appendChild(entry);
  errorLogEl.classList.add('active');
}

function clearErrorLog() {
  if (!errorLogEl) return;
  errorLogEl.innerHTML = '';
  errorLogEl.classList.remove('active');
}

async function waitForABCJS() {
  if (state.abcjsPromise) return state.abcjsPromise;
  state.abcjsPromise = new Promise((resolve, reject) => {
    if (window.ABCJS?.renderAbc) {
      resolve(window.ABCJS);
      return;
    }
    let attempts = 0;
    const maxAttempts = 40;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (window.ABCJS?.renderAbc) {
        window.clearInterval(timer);
        resolve(window.ABCJS);
      } else if (attempts >= maxAttempts) {
        window.clearInterval(timer);
        reject(new Error('ABCJS failed to load.'));
      }
    }, 100);
  });
  return state.abcjsPromise;
}

async function renderAbc() {
  clearErrorLog();
  if (!statusEl) return;
  statusEl.textContent = 'Rendering…';

  try {
    const ABCJS = await waitForABCJS();
    if (!staffContainer) return;
    staffContainer.innerHTML = '';
    ABCJS.renderAbc(staffContainer, SAMPLE_ABC, {
      add_classes: true,
      responsive: 'resize',
      staffwidth: window.innerWidth < 640 ? undefined : 720,
    });
    const theme = getStaffTheme();
    staffContainer.querySelectorAll('svg').forEach((svg) => applyThemeToSvg(svg, theme));
    statusEl.textContent = 'Rendered with ABCJS glyphs.';
  } catch (error) {
    logError('Unable to render staff.', error);
    statusEl.textContent = 'Unable to render staff.';
    throw error;
  }
}
