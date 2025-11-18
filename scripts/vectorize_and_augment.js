'use strict';

// Vectorize img/generated/ear/ear_only_04.png and augment with sunglasses + legs into SVG
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const potrace = require('potrace');

const SRC = path.join(__dirname, '..', 'img', 'generated', 'ear', 'ear_only_04.png');
const OUT_DIR = path.join(__dirname, '..', 'img', 'generated', 'ear', 'svg');
const OUT = path.join(OUT_DIR, 'ear_runner.svg');
const MANIFEST = path.join(__dirname, '..', 'intervals-runner', 'sprites.json');

function ensureDir(d){ fs.mkdirSync(d, { recursive: true }); }

async function vectorizePngToSvg(inputPng){
  const tmp = path.join(OUT_DIR, '__tmp_vec.png');
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

function addAugments(svg){
  // Try to extract width/height; default to 384 if missing
  const wMatch = svg.match(/width="(\d+(?:\.\d+)?)"/); const hMatch = svg.match(/height="(\d+(?:\.\d+)?)"/);
  let w = wMatch ? parseFloat(wMatch[1]) : 384;
  let h = hMatch ? parseFloat(hMatch[1]) : 384;
  const hNew = Math.round(h * 1.22);
  // Ensure viewBox exists
  let out = svg.replace(/<svg([^>]*?)>/, (m, attrs) => {
    if (!/viewBox=/.test(attrs)) attrs += ` viewBox=\"0 0 ${w} ${hNew}\"`;
    attrs = attrs.replace(/height=\"[^\"]*\"/, `height=\"${hNew}\"`);
    return `<svg${attrs}>`;
  });
  // Wrap original content for ordering
  out = out.replace(/<svg[^>]*?>/, m => m + `\n  <g id=\"ear-base\">`);
  out = out.replace(/<\/svg>/, `  </g>\n</svg>`);

  // Sunglasses group (two lenses + strap)
  const sx = 0.22 * w, sy = 0.32 * h, lw = 0.22 * w, lh = 0.17 * h, r = 0.06 * w;
  const leftX = sx, rightX = sx + lw + 0.05 * w;
  const strapY = sy + lh * 0.5;
  const glasses = `\n  <g id=\"sunglasses\" fill=\"#0b0e12\" stroke=\"none\">\n`+
    `    <rect x=\"${leftX.toFixed(1)}\" y=\"${sy.toFixed(1)}\" rx=\"${r.toFixed(1)}\" ry=\"${r.toFixed(1)}\" width=\"${lw.toFixed(1)}\" height=\"${lh.toFixed(1)}\"/>\n`+
    `    <rect x=\"${rightX.toFixed(1)}\" y=\"${sy.toFixed(1)}\" rx=\"${r.toFixed(1)}\" ry=\"${r.toFixed(1)}\" width=\"${lw.toFixed(1)}\" height=\"${lh.toFixed(1)}\"/>\n`+
    `    <path d=\"M ${0.10*w} ${strapY} H ${0.92*w}\" stroke=\"#111\" stroke-width=\"${Math.max(2,0.006*w)}\" stroke-linecap=\"round\" fill=\"none\"/>\n`+
    `    <ellipse cx=\"${(leftX+0.18*w*0.1).toFixed(1)}\" cy=\"${(sy+lh*0.35).toFixed(1)}\" rx=\"${(0.035*w).toFixed(1)}\" ry=\"${(0.02*h).toFixed(1)}\" fill=\"#fff\" fill-opacity=\"0.14\"/>\n`+
    `  </g>\n`;

  // Legs group (static pose under ear)
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

  // Insert augments before closing svg and after ear-base group
  out = out.replace(/<\/g>\s*<\/svg>/, (m) => `</g>\n${glasses}${legs}</svg>`);
  return out;
}

async function main(){
  ensureDir(OUT_DIR);
  if (!fs.existsSync(SRC)) throw new Error('Source not found: ' + SRC);
  console.log('[Vectorize] starting', SRC);
  const traced = await vectorizePngToSvg(SRC);
  const augmented = addAugments(traced);
  fs.writeFileSync(OUT, augmented);
  console.log('[Vectorize] wrote', OUT);
}

main().catch(err => { console.error(err); process.exit(1); });
