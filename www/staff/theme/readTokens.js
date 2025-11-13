export function readTokens() {
  if (typeof window === 'undefined' || !window.getComputedStyle) {
    // No user styles available; do not provide visual defaults here.
    return {
      stroke: undefined,
      fill: undefined,
      ledger: undefined,
      ledgerWidth: undefined,
      accent: undefined,
      selection: undefined,
      correct: undefined,
      incorrect: undefined,
      answer: undefined,
      correction: undefined,
    };
  }
  const rootStyle = getComputedStyle(document.documentElement);
  const read = (names, fallback) => {
    const list = Array.isArray(names) ? names : [names];
    for (const varName of list) {
      const value = rootStyle.getPropertyValue(varName);
      if (value && value.trim() !== '') return value.trim();
    }
    return fallback;
  };
  const stroke = read(['--notation-staff-stroke', '--staff-stroke-color'], undefined);
  const fill = read(['--notation-staff-fill', '--staff-fill-color'], undefined);
  const ledger = read(['--notation-ledger-color', '--staff-ledger-color'], undefined);
  const ledgerWidthRaw = read(['--notation-ledger-thickness', '--staff-ledger-thickness'], undefined);
  const ledgerWidth = ledgerWidthRaw != null && ledgerWidthRaw !== '' ? Number.parseFloat(ledgerWidthRaw) : undefined;
  const accent = read(['--notation-accent', '--color-accent'], undefined);
  const selection = read(['--notation-selection', '--staff-selection-color'], undefined);
  const correct = read(['--notation-correct', '--staff-correct-color', '--app-success'], undefined);
  const incorrect = read(['--notation-incorrect', '--staff-incorrect-color', '--app-danger'], undefined);
  const answer = read(['--notation-answer', '--staff-answer-color', '--app-warning'], undefined);
  const correction = read(['--notation-correction', '--staff-correction-color'], undefined);
  return { stroke, fill, ledger, ledgerWidth, accent, selection, correct, incorrect, answer, correction };
}

export default readTokens;
