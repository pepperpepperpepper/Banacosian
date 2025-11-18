'use strict';

// Overlay AI-vectorized round glasses onto ear SVG (round variant) at proportional position.
const fs = require('fs');
const path = require('path');

// Use the 'round' geometry variant as the base, but we will remove any existing sunglasses group first
const EAR_IN = process.argv[3] || path.join(__dirname, '..', 'img', 'generated', 'ear', 'svg', 'ear_runner_round.svg');
const GLASSES_IN = process.argv[2] || path.join(__dirname, '..', 'img', 'generated', 'ear', 'svg', 'glasses_round_ai.svg');
const OUT = process.argv[4] || path.join(__dirname, '..', 'img', 'generated', 'ear', 'svg', 'ear_runner_round_ai.svg');

function read(file){ return fs.readFileSync(file, 'utf8'); }

function getViewBox(svg) {
  const m = svg.match(/viewBox=["']([\d\.\s-]+)["']/);
  if (m) {
    const [x,y,w,h] = m[1].split(/\s+/).map(Number); return { x,y,w,h };
  }
  const w = Number(svg.match(/width=["'](\d+(?:\.\d+)?)["']/)?.[1] || 1024);
  const h = Number(svg.match(/height=["'](\d+(?:\.\d+)?)["']/)?.[1] || 1024);
  return { x:0,y:0,w,h };
}

function getContentBBox(svg) {
  // Extract numbers from path data to estimate bounds
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>[\s\S]*$/, '');
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const push = (x, y) => { if (!isFinite(x) || !isFinite(y)) return; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); };
  // Paths
  const pathRe = /<path[^>]*\sd=["']([^"']+)["'][^>]*>/g;
  let m;
  while ((m = pathRe.exec(inner))) {
    const seq = m[1].match(/-?\d+\.?\d*/g) || [];
    for (let i = 0; i + 1 < seq.length; i += 2) {
      const x = parseFloat(seq[i]);
      const y = parseFloat(seq[i + 1]);
      push(x, y);
    }
  }
  // Circles / Ellipses
  const circRe = /<(circle|ellipse)[^>]*>/g;
  while ((m = circRe.exec(inner))) {
    const tag = m[0];
    const cx = parseFloat(tag.match(/cx=["']([^"']+)/)?.[1] || 'NaN');
    const cy = parseFloat(tag.match(/cy=["']([^"']+)/)?.[1] || 'NaN');
    const rx = parseFloat(tag.match(/rx=["']([^"']+)/)?.[1] || tag.match(/r=["']([^"']+)/)?.[1] || '0');
    const ry = parseFloat(tag.match(/ry=["']([^"']+)/)?.[1] || tag.match(/r=["']([^"']+)/)?.[1] || '0');
    push(cx - rx, cy - ry); push(cx + rx, cy + ry);
  }
  // Rects
  const rectRe = /<rect[^>]*>/g;
  while ((m = rectRe.exec(inner))) {
    const tag = m[0];
    const x = parseFloat(tag.match(/x=["']([^"']+)/)?.[1] || '0');
    const y = parseFloat(tag.match(/y=["']([^"']+)/)?.[1] || '0');
    const w = parseFloat(tag.match(/width=["']([^"']+)/)?.[1] || '0');
    const h = parseFloat(tag.match(/height=["']([^"']+)/)?.[1] || '0');
    push(x, y); push(x + w, y + h);
  }
  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
    // fallback to viewBox
    const vb = getViewBox(svg);
    return { minX: vb.x, minY: vb.y, maxX: vb.x + vb.w, maxY: vb.y + vb.h };
  }
  return { minX, minY, maxX, maxY };
}

function stripExistingSunglasses(svg) {
  // Remove any previous sunglasses groups (geom or prior AI overlay)
  return svg
    .replace(/<g[^>]*id=["']sunglasses-ai["'][\s\S]*?<\/g>/g, '')
    .replace(/<g[^>]*id=["']sunglasses["'][\s\S]*?<\/g>/g, '');
}

function insertGlassesBeforeLegs(svg, content) {
  // Prefer to insert before the legs group to keep layering consistent
  if (/id=["']legs["']/.test(svg)) {
    return svg.replace(/<g[^>]*id=["']legs["'][\s\S]*$/m, m => `${content}\n${m}`);
  }
  // Fallback: inject before </svg>
  return svg.replace(/<\/svg>/, () => `${content}\n</svg>`);
}

function main(){
  const ear = read(EAR_IN);
  const glasses = read(GLASSES_IN);
  const vbEar = getViewBox(ear);
  const bbox = getContentBBox(glasses);
  const w = vbEar.w, h = vbEar.h;
  // Larger, ear-width-aligned round frames (content-based scaling)
  const targetW = 0.64 * w;
  const targetH = 0.34 * h;
  const targetX = 0.18 * w;
  const targetY = 0.28 * h;
  const contentW = Math.max(1, bbox.maxX - bbox.minX);
  const contentH = Math.max(1, bbox.maxY - bbox.minY);
  const s = Math.min(targetW / contentW, targetH / contentH);
  const tx = targetX - bbox.minX * s;
  const ty = targetY - bbox.minY * s;
  let inner = glasses.replace(/^[\s\S]*?<svg[^>]*>/,'').replace(/<\/svg>[\s\S]*$/,'');
  // strip any rects (backgrounds/highlights) and filters to avoid shadows
  inner = inner.replace(/<rect[^>]*>/g, '');
  inner = inner.replace(/<filter[\s\S]*?<\/filter>/g, '');
  inner = inner.replace(/filter=\"[^\"]*\"/g, '');
  inner = inner.replace(/<defs[\s\S]*?<\/defs>/g, '');
  const wrapped = `\n  <g id=\"sunglasses-ai\" transform=\"translate(${tx.toFixed(2)},${ty.toFixed(2)}) scale(${s.toFixed(4)})\" fill=\"#0b0e12\" stroke=\"none\">\n`+
                 inner.replace(/\n/g,'\n    ')
               + `\n  </g>`;
  const stripped = stripExistingSunglasses(ear);
  const outSvg = insertGlassesBeforeLegs(stripped, wrapped);
  fs.writeFileSync(OUT, outSvg);
  console.log('[Overlay] wrote', OUT);
}

main();
