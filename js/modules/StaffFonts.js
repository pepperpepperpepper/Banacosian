/**
 * Shared music font helpers used by the main app and staff demos.
 */
const DEFAULT_FONT_ID = 'bravura';

const MUSIC_FONT_CHOICES = Object.freeze({
  bravura: Object.freeze({
    id: 'bravura',
    label: 'Bravura',
    stack: ['Bravura', 'Academico'],
  }),
  petaluma: Object.freeze({
    id: 'petaluma',
    label: 'Petaluma',
    stack: ['Petaluma', 'Petaluma Script'],
  }),
  leland: Object.freeze({
    id: 'leland',
    label: 'Leland',
    stack: ['Bravura', 'Academico'],
    fallback: true,
    warning: 'VexFlow does not bundle Leland; falling back to Bravura.',
  }),
});

function getFontChoice(fontId) {
  if (!fontId) return MUSIC_FONT_CHOICES[DEFAULT_FONT_ID];
  return MUSIC_FONT_CHOICES[fontId] || MUSIC_FONT_CHOICES[DEFAULT_FONT_ID];
}

function listFontOptions() {
  return Object.values(MUSIC_FONT_CHOICES);
}

async function configureVexflowFont(VexFlow, fontChoice) {
  if (!VexFlow) return;
  const choice = fontChoice || MUSIC_FONT_CHOICES[DEFAULT_FONT_ID];
  const stack = Array.isArray(choice?.stack) ? choice.stack.filter(Boolean) : [];
  if (stack.length === 0) return;
  try {
    await VexFlow.loadFonts(...stack);
    VexFlow.setFonts(...stack);
  } catch (error) {
    console.warn('[StaffFonts] Unable to configure VexFlow font stack', stack, error);
  }
}

const exportsObject = {
  DEFAULT_FONT_ID,
  MUSIC_FONT_CHOICES,
  getFontChoice,
  listFontOptions,
  configureVexflowFont,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exportsObject;
} else {
  window.StaffFonts = exportsObject;
}

export {
  DEFAULT_FONT_ID,
  MUSIC_FONT_CHOICES,
  getFontChoice,
  listFontOptions,
  configureVexflowFont,
};

export default exportsObject;
