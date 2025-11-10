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

function getFontChoice(fontIdOrChoice) {
  if (!fontIdOrChoice) return MUSIC_FONT_CHOICES[DEFAULT_FONT_ID];
  if (typeof fontIdOrChoice === 'string') {
    return MUSIC_FONT_CHOICES[fontIdOrChoice] || MUSIC_FONT_CHOICES[DEFAULT_FONT_ID];
  }
  if (typeof fontIdOrChoice === 'object' && fontIdOrChoice !== null) {
    const { id } = fontIdOrChoice;
    if (id && MUSIC_FONT_CHOICES[id]) return MUSIC_FONT_CHOICES[id];
    return fontIdOrChoice;
  }
  return MUSIC_FONT_CHOICES[DEFAULT_FONT_ID];
}

function listFontOptions() {
  return Object.values(MUSIC_FONT_CHOICES);
}

function dedupeWarnings(warnings) {
  if (!Array.isArray(warnings)) return [];
  return [...new Set(warnings.filter(Boolean))];
}

async function configureVexflowFont(VexFlow, fontChoiceOrId) {
  const choice = getFontChoice(fontChoiceOrId);
  const warnings = [];

  if (!choice) return { choice: MUSIC_FONT_CHOICES[DEFAULT_FONT_ID], stack: [], warnings };

  let stack = Array.isArray(choice.stack) ? choice.stack.filter(Boolean) : [];

  if (choice.warning) warnings.push(choice.warning);

  if (stack.length === 0 && choice.id !== DEFAULT_FONT_ID) {
    const fallbackChoice = MUSIC_FONT_CHOICES[DEFAULT_FONT_ID];
    const fallbackStack = Array.isArray(fallbackChoice?.stack)
      ? fallbackChoice.stack.filter(Boolean)
      : [];
    if (fallbackStack.length > 0) {
      stack = fallbackStack;
      warnings.push(`Falling back to ${fallbackChoice.label || fallbackChoice.id} music font stack.`);
    }
  }

  if (!VexFlow || stack.length === 0) {
    return { choice, stack, warnings: dedupeWarnings(warnings) };
  }

  try {
    await VexFlow.loadFonts(...stack);
    VexFlow.setFonts(...stack);
  } catch (error) {
    warnings.push(`Unable to load music font stack: ${stack.join(', ')}`);
    console.warn('[StaffFonts] Unable to configure VexFlow font stack', stack, error);
  }

  return {
    choice,
    stack,
    warnings: dedupeWarnings(warnings),
  };
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
