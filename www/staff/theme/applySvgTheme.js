import { readTokens } from './readTokens.js';

export function applyVexflowSvgTheme(svg, palette) {
  if (!svg) return;
  const colors = palette || readTokens();
  // Match legacy behavior: theme only ledger lines explicitly, then normalize
  // generic black strokes/fills to the staff stroke/fill colors.
  const ledgerLines = svg.querySelectorAll('[class*="ledgerline"]');
  ledgerLines.forEach((node) => {
    if (!node) return;
    if (colors.ledger) {
      node.setAttribute('stroke', colors.ledger);
      node.setAttribute('stroke-opacity', '1');
    }
    if (Number.isFinite(colors.ledgerWidth)) {
      node.setAttribute('stroke-width', String(colors.ledgerWidth));
      node.setAttribute('stroke-linecap', 'round');
      if (node.style) {
        node.style.strokeWidth = `${colors.ledgerWidth}px`;
        node.style.strokeLinecap = 'round';
      }
    }
    if (colors.ledger) {
      if (node.getAttribute('fill') && node.getAttribute('fill') !== 'none') {
        node.setAttribute('fill', colors.ledger);
        node.setAttribute('fill-opacity', '1');
      }
      if (node.style) {
        node.style.stroke = colors.ledger;
        node.style.strokeOpacity = '1';
        if (node.style.fill && node.style.fill !== 'none') {
          node.style.fill = colors.ledger;
          node.style.fillOpacity = '1';
        }
      }
    }
  });
  if (colors.stroke) {
    svg.querySelectorAll('[stroke]').forEach((node) => {
      const stroke = node.getAttribute('stroke');
      if (!stroke || /^#0{3,6}$/i.test(stroke) || stroke.toLowerCase() === 'black') {
        node.setAttribute('stroke', colors.stroke);
      }
    });
  }
  if (colors.fill) {
    svg.querySelectorAll('[fill]').forEach((node) => {
      const fill = node.getAttribute('fill');
      if (!fill || /^#0{3,6}$/i.test(fill) || fill.toLowerCase() === 'black') {
        if (fill !== 'none') {
          node.setAttribute('fill', colors.fill);
        }
      }
    });
  }
  if (svg.style && colors.stroke) {
    svg.style.color = colors.stroke;
  }
}

export function applyAbcjsSvgTheme(svg, palette) {
  if (!svg) return;
  const colors = palette || readTokens();
  const ledgerNodes = svg.querySelectorAll('[class*="ledger"], [data-name*="ledger"]');
  ledgerNodes.forEach((node) => {
    if (colors.ledger) {
      node.setAttribute('stroke', colors.ledger);
      node.setAttribute('stroke-opacity', '1');
      node.setAttribute('stroke-linecap', 'round');
      if (node.style) {
        node.style.stroke = colors.ledger;
        node.style.strokeOpacity = '1';
        node.style.strokeLinecap = 'round';
      }
    }
    if (Number.isFinite(colors.ledgerWidth)) {
      node.setAttribute('stroke-width', String(colors.ledgerWidth));
      if (node.style) node.style.strokeWidth = `${colors.ledgerWidth}px`;
    }
  });
  if (colors.stroke) {
    svg.querySelectorAll('[stroke]').forEach((node) => {
      const stroke = node.getAttribute('stroke');
      if (!stroke || /^#0{3,6}$/i.test(stroke) || stroke.toLowerCase() === 'black') {
        node.setAttribute('stroke', colors.stroke);
      }
    });
  }
  if (colors.fill) {
    svg.querySelectorAll('[fill]').forEach((node) => {
      const fill = node.getAttribute('fill');
      if (!fill || /^#0{3,6}$/i.test(fill) || fill.toLowerCase() === 'black') {
        if (fill !== 'none') {
          node.setAttribute('fill', colors.fill);
        }
      }
    });
  }
}

export default {
  applyVexflowSvgTheme,
  applyAbcjsSvgTheme,
};
