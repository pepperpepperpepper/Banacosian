'use strict';

// Vectorize generated glasses PNG to SVG (silhouette) using potrace.trace
const fs = require('fs');
const path = require('path');
const potrace = require('potrace');
const sharp = require('sharp');

const IN = process.argv[2] || path.join(__dirname, '..', 'img', 'generated', 'ear', 'glasses', 'glasses_round_ai_01.png');
const OUT_DIR = path.join(__dirname, '..', 'img', 'generated', 'ear', 'svg');
const OUT = process.argv[3] || path.join(OUT_DIR, 'glasses_round_ai.svg');

function ensureDir(d){ fs.mkdirSync(d, { recursive: true }); }

async function preprocess(input) {
  const tmp = path.join(OUT_DIR, '__tmp_glasses.png');
  // 1) Trim white margins to get tight bbox
  // 2) Convert to grayscale, boost contrast, threshold-ish via gamma
  // 3) Ensure white background
  const img = sharp(input)
    .grayscale()
    .gamma(1.1)
    .normalize()
    .threshold(240)   // push to crisp black silhouette
    .trim()           // now trimming is aggressive since edges are pure white
    .flatten({ background: '#ffffff' })
    .png();
  await img.toFile(tmp);
  return tmp;
}

async function main(){
  ensureDir(OUT_DIR);
  if (!fs.existsSync(IN)) throw new Error('Missing input: ' + IN);
  const tmp = await preprocess(IN);
  const svg = await new Promise((resolve, reject) => {
    potrace.trace(tmp, { turdSize: 20, optCurve: true, optTolerance: 0.4, color: 'black' }, (err, svgStr) => {
      if (err) return reject(err);
      resolve(svgStr);
    });
  });
  try { fs.unlinkSync(tmp); } catch {}
  fs.writeFileSync(OUT, svg);
  console.log('[Vectorize] wrote', OUT);
}

main().catch(e => { console.error(e); process.exit(1); });
