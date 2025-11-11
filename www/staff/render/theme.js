import {
  DEFAULT_STAFF_SCALE,
  getStaffTheme as coreGetStaffTheme,
  applyVexflowTheme as coreApplyVexflowTheme,
  resolveStaffScale,
} from '/js/vexflow/core/config.js';

export function resolveSelectedFont(fontSelect, fontChoices) {
  if (!fontSelect) return fontChoices?.bravura;
  const value = fontSelect.value;
  return fontChoices?.[value] || fontChoices?.bravura;
}

export function computeStaffScale(renderState) {
  return resolveStaffScale(renderState, { defaultScale: DEFAULT_STAFF_SCALE });
}

export function getStaffTheme() {
  return coreGetStaffTheme();
}

export function applyVexflowTheme(container, palette) {
  coreApplyVexflowTheme(container, palette);
}

export { DEFAULT_STAFF_SCALE };
