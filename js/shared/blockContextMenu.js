// Disable the browser context menu (right‑click) globally.
// Also prevent default on secondary-button pointer/mouse down to avoid stray triggers.
(function disableContextMenuGlobally() {
  try {
    const prevent = (e) => e.preventDefault();
    window.addEventListener('contextmenu', prevent, { capture: true });
    window.addEventListener('pointerdown', (e) => { if (e.button === 2) e.preventDefault(); }, { capture: true });
    window.addEventListener('mousedown', (e) => { if (e.button === 2) e.preventDefault(); }, { capture: true });
  } catch (_) {
    // No-op: best-effort only
  }
})();

