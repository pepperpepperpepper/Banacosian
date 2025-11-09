import { createDefaultSmuflRenderer } from './loader.js';
import { configureRenderContext, renderSelection } from './render.js';
import { setActiveKey } from './state.js';

export function initStaffDemo() {
  const staffContainer = document.getElementById('staff-container');
  const keySelect = document.getElementById('key-select');
  const statusEl = document.getElementById('staff-status');

  if (!staffContainer || !keySelect) {
    console.warn('[StaffDemo] required DOM nodes not found; aborting init');
    return;
  }

  const smuflRenderer = createDefaultSmuflRenderer({ fontKey: 'bravura' });
  configureRenderContext({ staffContainer, keySelect, statusEl, smuflRenderer });

  const handleKeyChange = (event) => {
    const nextKey = event?.target?.value;
    if (!nextKey) return;
    setActiveKey(nextKey);
    renderSelection(nextKey, { useExisting: true });
  };

  keySelect.addEventListener('change', handleKeyChange);

  const initialKey = keySelect.value || 'C';
  setActiveKey(initialKey);
  renderSelection(initialKey, { useExisting: true });
}
