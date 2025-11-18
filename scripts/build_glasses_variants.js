'use strict';

// Build sunglasses style variants for the vector ear runner sprite.
// Outputs:
//  - img/generated/ear/svg/ear_runner_wayfarer.svg
//  - img/generated/ear/svg/ear_runner_round.svg
//  - img/generated/ear/svg/ear_runner_aviator.svg
// Also updates intervals-runner/sprites.json to include these SVGs.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const potrace = require('potrace');

const SRC = path.join(__dirname, '..', 'img', 'generated', 'ear', 'ear_only_04.png');
const OUT_DIR = path.join(__dirname, '..', 'img', 'generated', 'ear', 'svg');
const MANIFEST = path.join(__dirname, '..', 'intervals-runner', 'sprites.json');

function ensureDir(d){ fs.mkdirSync(d, { recursive: true }); }

async function vectorizePngToSvg(inputPng){
  const tmp = path.join(OUT_DIR, '__tmp_vec_build.png');
  await sharp(inputPng)
    .resize(384, 384, { fit: 'inside', background: { r:255, g:255, b:255, alpha:1 } })
    .flatten({ background: '#ffffff' })
    .png()
    .toFile(tmp);
  const svg = await new Promise((resolve, reject) => {
    potrace.posterize(tmp, { steps: 4, turdSize: 2, optCurve: true, optTolerance: 0.4 }, (err, svgStr) => {
      if (err) return reject(err);
      resolve(svgStr);
    });
  });
  try { fs.unlinkSync(tmp); } catch {}
  return svg;
}

function ensureDefs(svg, content) {
  if (/<defs[\s>]/.test(svg)) return svg.replace(/<defs[^>]*>/, m => m + content);
  return svg.replace(/<svg[^>]*?>/, m => m + `\n  <defs>${content}</defs>`);
}

function addAugments(svg, style) {
  // Dimensions
  const wMatch = svg.match(/width=\"(\d+(?:\.\d+)?)\"/); const hMatch = svg.match(/height=\"(\d+(?:\.\d+)?)\"/);
  let w = wMatch ? parseFloat(wMatch[1]) : 384;
  let h = hMatch ? parseFloat(hMatch[1]) : 384;
  const hNew = Math.round(h * 1.22);
  let out = svg.replace(/<svg([^>]*?)>/, (m, attrs) => {
    if (!/viewBox=/.test(attrs)) attrs += ` viewBox=\"0 0 ${w} ${hNew}\"`;
    attrs = attrs.replace(/height=\"[^\"]*\"/, `height=\"${hNew}\"`);
    return `<svg${attrs}>`;
  });
  out = out.replace(/<svg[^>]*?>/, m => m + `\n  <g id=\"ear-base\">`);
  out = out.replace(/<\/svg>/, `  </g>\n</svg>`);

  // Gradient
  const gradId = `lensGrad_${style}`;
  const grad = `\n    <linearGradient id=\"${gradId}\" x1=\"0\" x2=\"0\" y1=\"0\" y2=\"1\">\n`+
               `      <stop offset=\"0%\" stop-color=\"#9fb3c8\" stop-opacity=\"0.55\"/>\n`+
               `      <stop offset=\"60%\" stop-color=\"#0b0e12\" stop-opacity=\"0.95\"/>\n`+
               `      <stop offset=\"100%\" stop-color=\"#06080b\" stop-opacity=\"1\"/>\n`+
               `    </linearGradient>\n`;
  out = ensureDefs(out, grad);

  // Glasses
  const sx = 0.22 * w, sy = 0.32 * h, lw = 0.22 * w, lh = 0.17 * h, r = 0.06 * w;
  const leftX = sx, rightX = sx + lw + 0.05 * w;
  const strapY = sy + lh * 0.5;
  const strokeW = Math.max(2, 0.006 * w);
  let lenses = '';
  if (style === 'round') {
    const rx = 0.11 * w, ry = 0.11 * w;
    const cxL = sx + rx, cxR = rightX + rx, cy = sy + ry * 0.9;
    lenses = `    <ellipse cx=\"${cxL}\" cy=\"${cy}\" rx=\"${rx}\" ry=\"${ry}\" fill=\"url(#${gradId})\" stroke=\"#0b0e12\" stroke-width=\"${strokeW}\"/>\n`+
             `    <ellipse cx=\"${cxR}\" cy=\"${cy}\" rx=\"${rx}\" ry=\"${ry}\" fill=\"url(#${gradId})\" stroke=\"#0b0e12\" stroke-width=\"${strokeW}\"/>\n`+
             `    <path d=\"M ${cxL+rx} ${cy} L ${cxR-rx} ${cy}\" stroke=\"#0b0e12\" stroke-width=\"${strokeW}\" stroke-linecap=\"round\"/>\n`;
  } else if (style === 'aviator') {
    const bx = lw, by = lh;
    const pathLens = (x, y) => `M ${x} ${y+0.2*by} c ${0.3*bx} ${-0.25*by}, ${0.7*bx} ${-0.25*by}, ${bx} 0 c ${0.18*bx} ${0.24*by}, ${-0.18*bx} ${0.52*by}, ${-0.5*bx} ${0.55*by} c ${-0.32*bx} ${-0.03*by}, ${-0.50*bx} ${-0.30*by}, ${-0.5*bx} ${-0.55*by} z`;
    lenses = `    <path d=\"${pathLens(leftX, sy)}\" fill=\"url(#${gradId})\" stroke=\"#0b0e12\" stroke-width=\"${strokeW}\"/>\n`+
             `    <path d=\"${pathLens(rightX, sy)}\" fill=\"url(#${gradId})\" stroke=\"#0b0e12\" stroke-width=\"${strokeW}\"/>\n`+
             `    <path d=\"M ${leftX+lw} ${sy+0.28*lh} L ${rightX} ${sy+0.28*lh}\" stroke=\"#0b0e12\" stroke-width=\"${strokeW}\" stroke-linecap=\"round\"/>\n`;
  } else {
    // wayfarer
    lenses = `    <rect x=\"${leftX.toFixed(1)}\" y=\"${sy.toFixed(1)}\" rx=\"${(r*0.6).toFixed(1)}\" ry=\"${(r*0.6).toFixed(1)}\" width=\"${lw.toFixed(1)}\" height=\"${lh.toFixed(1)}\" fill=\"url(#${gradId})\" stroke=\"#0b0e12\" stroke-width=\"${strokeW}\"/>\n`+
             `    <rect x=\"${rightX.toFixed(1)}\" y=\"${sy.toFixed(1)}\" rx=\"${(r*0.6).toFixed(1)}\" ry=\"${(r*0.6).toFixed(1)}\" width=\"${lw.toFixed(1)}\" height=\"${lh.toFixed(1)}\" fill=\"url(#${gradId})\" stroke=\"#0b0e12\" stroke-width=\"${strokeW}\"/>\n`+
             `    <path d=\"M ${leftX} ${sy} H ${rightX+lw}\" stroke=\"#0b0e12\" stroke-width=\"${Math.max(3,0.008*w)}\" stroke-linecap=\"round\"/>\n`;
  }
  const glasses = `\n  <g id=\"sunglasses\">\n`+
    `    <path d=\"M ${0.10*w} ${strapY} H ${0.92*w}\" stroke=\"#111\" stroke-width=\"${strokeW}\" stroke-linecap=\"round\" fill=\"none\"/>\n`+
    lenses +
    `  </g>\n`;

  // Legs (static)
  const hipX = 0.50 * w, hipY = 0.86 * h;
  const knee1x = 0.60 * w, knee1y = 0.96 * h;
  const foot1x = 0.65 * w, foot1y = 1.10 * h;
  const knee2x = 0.42 * w, knee2y = 0.96 * h;
  const foot2x = 0.36 * w, foot2y = 1.10 * h;
  const shoeRx = 0.04 * w, shoeRy = 0.025 * h;
  const legs = `\n  <g id=\"legs\" stroke-linecap=\"round\">\n`+
    `    <path d=\"M ${hipX} ${hipY} L ${knee1x} ${knee1y} L ${foot1x} ${foot1y}\" stroke=\"#152a39\" stroke-width=\"${Math.max(2,0.008*w)}\" fill=\"none\"/>\n`+
    `    <path d=\"M ${hipX} ${hipY} L ${knee2x} ${knee2y} L ${foot2x} ${foot2y}\" stroke=\"#132433\" stroke-width=\"${Math.max(2,0.008*w)}\" fill=\"none\"/>\n`+
    `    <ellipse cx=\"${foot1x}\" cy=\"${foot1y}\" rx=\"${shoeRx}\" ry=\"${shoeRy}\" fill=\"#5bd597\"/>\n`+
    `    <ellipse cx=\"${foot2x}\" cy=\"${foot2y}\" rx=\"${shoeRx}\" ry=\"${shoeRy}\" fill=\"#5bd597\"/>\n`+
    `  </g>\n`;

  out = out.replace(/<\/g>\s*<\/svg>/, () => `</g>\n${glasses}${legs}</svg>`);
  return out;
}

async function main(){
  ensureDir(OUT_DIR);
  if (!fs.existsSync(SRC)) throw new Error('Source not found: ' + SRC);
  console.log('[Build] vectorizing', SRC);
  const traced = await vectorizePngToSvg(SRC);
  const variants = [
    { style: 'wayfarer', file: path.join(OUT_DIR, 'ear_runner_wayfarer.svg') },
    { style: 'round',    file: path.join(OUT_DIR, 'ear_runner_round.svg') },
    { style: 'aviator',  file: path.join(OUT_DIR, 'ear_runner_aviator.svg') },
  ];
  for (const v of variants) {
    const svg = addAugments(traced, v.style);
    fs.writeFileSync(v.file, svg);
    console.log('[Build] wrote', v.file);
  }
  // update manifest
  try {
    const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    const pushIf = (file, label) => { if (!m.items.some(it => it.file === file)) m.items.push({ file, prompt: label }); };
    pushIf('/img/generated/ear/svg/ear_runner_wayfarer.svg', 'vector ear with sunglasses (wayfarer)');
    pushIf('/img/generated/ear/svg/ear_runner_round.svg', 'vector ear with sunglasses (round)');
    pushIf('/img/generated/ear/svg/ear_runner_aviator.svg', 'vector ear with sunglasses (aviator)');
    fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
    console.log('[Build] manifest updated');
  } catch (e) {
    console.warn('[Build] manifest update skipped:', e.message);
  }
}

main().catch(err => { console.error(err); process.exit(1); });

