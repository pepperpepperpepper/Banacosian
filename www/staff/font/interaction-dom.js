export const HAS_POINTER_EVENTS = typeof window !== 'undefined' && 'PointerEvent' in window;
const SVG_GRAPHICS_ELEMENT = typeof SVGGraphicsElement === 'undefined' ? null : SVGGraphicsElement;

export function collectNoteheadNodes(noteEl) {
  if (!noteEl?.hasChildNodes?.()) return [];
  const headNodes = [];
  const seen = new Set();
  const pushNode = (node) => {
    if (!node || seen.has(node)) return;
    seen.add(node);
    headNodes.push(node);
  };
  noteEl.childNodes.forEach((node) => {
    if (!node) return;
    if (SVG_GRAPHICS_ELEMENT && !(node instanceof SVG_GRAPHICS_ELEMENT)) return;
    const tag = node.tagName?.toLowerCase?.() || '';
    const className = node.className?.baseVal || node.className || '';
    const dataName = node.dataset?.name || '';
    const isNoteheadish = /\bnotehead\b/i.test(className) || /\bnotehead\b/i.test(dataName);
    if (tag === 'path' && isNoteheadish) {
      pushNode(node);
      return;
    }
    if (tag === 'g') {
      if (isNoteheadish) {
        pushNode(node);
        node.querySelectorAll?.('path, text, use').forEach((child) => pushNode(child));
      } else {
        node.querySelectorAll?.('[class*="notehead"], [data-name*="notehead"]').forEach((child) => pushNode(child));
      }
    }
    if (tag === 'text') {
      if (className.includes('vf-notehead') || dataName === 'notehead' || isNoteheadish) {
        pushNode(node);
      }
    }
    if (tag === 'use' && isNoteheadish) {
      pushNode(node);
    }
  });
  return headNodes;
}

export function collectStemNodes(noteEl) {
  if (!noteEl) return [];
  const nodes = [];
  const seen = new Set();
  noteEl.querySelectorAll('path, line, g').forEach((node) => {
    if (!node) return;
    const tag = node.tagName?.toLowerCase?.() || '';
    if (tag !== 'path' && tag !== 'line' && tag !== 'g') return;
    const className = node.className?.baseVal || node.className || '';
    const dataName = node.dataset?.name || '';
    if (/\bstem\b/i.test(className) || /\bstem\b/i.test(dataName)) {
      if (tag === 'g') {
        const childList = node.querySelectorAll?.('path, line') || [];
        childList.forEach((child) => {
          if (!child) return;
          if (!seen.has(child)) {
            seen.add(child);
            nodes.push(child);
          }
        });
        if (childList.length === 0 && !seen.has(node)) {
          seen.add(node);
          nodes.push(node);
        }
      } else {
        if (!seen.has(node)) {
          seen.add(node);
          nodes.push(node);
        }
      }
    } else if (tag === 'path' || tag === 'line') {
      // Some renders place stem segments under groups without explicit classes.
      const parent = node.parentNode;
      const parentClass = parent?.className?.baseVal || parent?.className || '';
      const parentData = parent?.dataset?.name || '';
      if ((/\bstem\b/i.test(parentClass) || /\bstem\b/i.test(parentData)) && !seen.has(node)) {
        seen.add(node);
        nodes.push(node);
      }
    }
  });
  return nodes;
}

export function normalizePointerEvent(event) {
  if (!event) return null;
  if (event.touches && event.touches.length > 0) {
    return event.touches[0];
  }
  if (event.changedTouches && event.changedTouches.length > 0) {
    return event.changedTouches[0];
  }
  return event;
}

export function convertToSvgCoords(pointerEvent, svg) {
  if (!pointerEvent || !svg || typeof svg.createSVGPoint !== 'function') return null;
  const point = svg.createSVGPoint();
  const clientX = pointerEvent.clientX ?? pointerEvent.pageX;
  const clientY = pointerEvent.clientY ?? pointerEvent.pageY;
  if (clientX == null || clientY == null) return null;
  point.x = clientX;
  point.y = clientY;
  const screenCTM = svg.getScreenCTM?.();
  if (!screenCTM) return null;
  const inverse = screenCTM.inverse?.();
  if (!inverse) return null;
  const transformed = point.matrixTransform(inverse);
  return { x: transformed.x, y: transformed.y };
}

export function collectLedgerLineNodes(noteEl) {
  if (!noteEl) return [];
  const nodes = [];
  const children = Array.from(noteEl.querySelectorAll(':scope > path'));
  const horizPathRe = /M\s*([\-\d\.]+)[ ,]([\-\d\.]+)\s*L\s*([\-\d\.]+)[ ,]([\-\d\.]+)/i;
  children.forEach((p) => {
    const d = p.getAttribute('d') || '';
    const m = horizPathRe.exec(d);
    if (!m) return;
    const y1 = parseFloat(m[2]);
    const y2 = parseFloat(m[4]);
    if (!Number.isFinite(y1) || !Number.isFinite(y2)) return;
    if (Math.abs(y1 - y2) < 0.001) {
      nodes.push(p);
    }
  });
  return nodes;
}

export function toAbsBBox(el, svgRoot, localBBox) {
  if (!el || !svgRoot || !localBBox) return null;
  try {
    const ctm = el.getScreenCTM?.();
    const rootCtm = svgRoot.getScreenCTM?.();
    if (!ctm || !rootCtm) return null;
    const inv = rootCtm.inverse?.();
    if (!inv) return null;
    const topLeft = svgRoot.createSVGPoint();
    topLeft.x = localBBox.x;
    topLeft.y = localBBox.y;
    const bottomRight = svgRoot.createSVGPoint();
    bottomRight.x = localBBox.x + localBBox.width;
    bottomRight.y = localBBox.y + localBBox.height;
    const globalTL = topLeft.matrixTransform(ctm).matrixTransform(inv);
    const globalBR = bottomRight.matrixTransform(ctm).matrixTransform(inv);
    return {
      x: globalTL.x,
      y: globalTL.y,
      width: globalBR.x - globalTL.x,
      height: globalBR.y - globalTL.y,
    };
  } catch (_err) {
    return null;
  }
}
