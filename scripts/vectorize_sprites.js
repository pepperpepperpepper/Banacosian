'use strict';

// Vectorize generated sprites to SVG using node-potrace (posterize) for clean shapes
const fs = require('fs');
const path = require('path');
const potrace = require('potrace');
const sharp = require('sharp');

const IN_DIR = path.join(__dirname, '..', 'img', 'generated', 'ear');
const OUT_DIR = path.join(__dirname, '..', 'img', 'generated', 'ear', 'svg');
const MANIFEST = path.join(__dirname, '..', 'intervals-runner', 'sprites.json');

function ensureDir(dir){ fs.mkdirSync(dir, { recursive: true }); }

async function vectorizeOne(file) {
  const input = path.join(IN_DIR, file);
  const base = path.parse(file).name + '.svg';
  const output = path.join(OUT_DIR, base);
  // Downscale to speed up posterization and improve path simplicity
  const tmpPng = path.join(OUT_DIR, '__tmp__' + path.parse(file).name + '.png');
  await sharp(input).resize(512, 512, { fit: 'contain', background: { r:255,g:255,b:255,alpha:1 } }).flatten({ background: '#ffffff' }).png().toFile(tmpPng);
  await new Promise((resolve, reject) => {
    const tracer = new potrace.Posterizer({ steps: 4, turdSize: 2, optCurve: true, optTolerance: 0.4 });
    tracer.loadImage(tmpPng, (err) => {
      if (err) return reject(err);
      tracer.getSVG((err2, svg) => {
        if (err2) return reject(err2);
        fs.writeFileSync(output, svg);
        try { fs.unlinkSync(tmpPng); } catch {}
        resolve();
      });
    });
  });
  return { svg: `/img/generated/ear/svg/${base}` };
}

async function main(){
  ensureDir(OUT_DIR);
  const files = fs.readdirSync(IN_DIR).filter(f => /\.png$/i.test(f));
  const out = [];
  for (const f of files) {
    console.log('[Vectorize]', f);
    try { out.push({ file: f, ...(await vectorizeOne(f)) }); }
    catch (e) { console.warn('Failed to vectorize', f, e.message); }
  }
  // Update manifest to include SVGs if present
  try {
    const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    const byPng = new Map(out.map(o => [o.file, o.svg]));
    for (const item of m.items || []) {
      const png = path.parse(item.file).base;
      if (byPng.has(png)) item.svg = byPng.get(png);
    }
    fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
    console.log('[Manifest updated]', MANIFEST);
  } catch {}
}

main().catch(err => { console.error(err); process.exit(1); });
