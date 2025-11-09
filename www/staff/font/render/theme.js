import { readTokens, applyVexflowSvgTheme } from '../../shared/theme.js';

export const DEFAULT_STAFF_SCALE = 1.8;

export function getStaffTheme() {
  return readTokens();
}

export function applyVexflowTheme(container, palette) {
  if (!container) return;
  const svg = container.querySelector('svg');
  if (!svg) return;
  const colors = palette || getStaffTheme();
  applyVexflowSvgTheme(svg, colors);
}

export function resolveSelectedFont(fontSelect, fontChoices) {
  if (!fontSelect) return fontChoices?.bravura;
  const value = fontSelect.value;
  return fontChoices?.[value] || fontChoices?.bravura;
}

export function computeStaffScale(renderState) {
  const staffScaleOverride = Number.isFinite(renderState.staffScale) && renderState.staffScale > 0
    ? renderState.staffScale
    : null;
  const globalScaleOverride = (typeof window !== 'undefined' && Number.isFinite(window.__VEXFLOW_STAFF_SCALE))
    ? window.__VEXFLOW_STAFF_SCALE
    : null;
  const staffScale = staffScaleOverride || globalScaleOverride || DEFAULT_STAFF_SCALE;
  renderState.staffScale = staffScale;
  return staffScale;
}
