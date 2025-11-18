'use strict';

// Add runner-style legs to an existing ear SVG, adjusting the viewBox height.
// Usage: node scripts/add_legs.js <in.svg> <out.svg> [--over]
// Default insertion draws legs UNDER existing art (immediately after <svg ...>). Use --over to append.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const potrace = require('potrace');

function read(file) { return fs.readFileSync(file, 'utf8'); }
function write(file, str) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, str); }

function getViewBox(svg) {
  const m = svg.match(/viewBox=["']([\d\.\s-]+)["']/);
  if (m) {
    const [x,y,w,h] = m[1].split(/\s+/).map(Number);
    return { x, y, w, h };
  }
  const w = Number(svg.match(/width=["'](\d+(?:\.\d+)?)["']/)?.[1] || 1024);
  const h = Number(svg.match(/height=["'](\d+(?:\.\d+)?)["']/)?.[1] || 1024);
  return { x: 0, y: 0, w, h };
}

function ensureViewBoxAndHeight(svg, newH) {
  // Ensure <svg> has a viewBox; set/replace height to newH to include legs area.
  const vb = getViewBox(svg);
  const hasViewBox = /viewBox=/.test(svg);
  let out = svg.replace(/<svg([^>]*?)>/, (m, attrs) => {
    let a = attrs;
    if (!/viewBox=/.test(a)) a += ` viewBox=\"${vb.x} ${vb.y} ${vb.w} ${newH}\"`;
    a = a.replace(/height=\"[^\"]*\"/, ''); // drop existing height, we will re-add
    return `<svg${a} height=\"${newH}\">`;
  });
  if (hasViewBox) {
    out = out.replace(/viewBox=["']([\d\.\s-]+)["']/, (m, s) => {
      const [x,y,w] = s.split(/\s+/);
      return `viewBox=\"${x} ${y} ${w} ${newH}\"`;
    });
  }
  return out;
}

function buildLegsGroup(w, h) {
  // Geometry mirrors scripts/vectorize_and_augment.js, scaled by w/h of original art.
  const hipX = +(0.50 * w).toFixed(2);
  const hipY = +(0.86 * h).toFixed(2);
  const knee1x = +(0.60 * w).toFixed(2);
  const knee1y = +(0.96 * h).toFixed(2);
  const foot1x = +(0.65 * w).toFixed(2);
  const foot1y = +(1.10 * h).toFixed(2);
  const knee2x = +(0.42 * w).toFixed(2);
  const knee2y = +(0.96 * h).toFixed(2);
  const foot2x = +(0.36 * w).toFixed(2);
  const foot2y = +(1.10 * h).toFixed(2);
  const shoeRx = +(0.04 * w).toFixed(2);
  const shoeRy = +(0.025 * h).toFixed(2);
  const sw = Math.max(2, 0.008 * w).toFixed(2);
  return `\n  <g id=\"legs\" stroke-linecap=\"round\">\n` +
         `    <path d=\"M ${hipX} ${hipY} L ${knee1x} ${knee1y} L ${foot1x} ${foot1y}\" stroke=\"#152a39\" stroke-width=\"${sw}\" fill=\"none\"/>\n` +
         `    <path d=\"M ${hipX} ${hipY} L ${knee2x} ${knee2y} L ${foot2x} ${foot2y}\" stroke=\"#132433\" stroke-width=\"${sw}\" fill=\"none\"/>\n` +
         `    <ellipse cx=\"${foot1x}\" cy=\"${foot1y}\" rx=\"${shoeRx}\" ry=\"${shoeRy}\" fill=\"#5bd597\"/>\n` +
         `    <ellipse cx=\"${foot2x}\" cy=\"${foot2y}\" rx=\"${shoeRx}\" ry=\"${shoeRy}\" fill=\"#5bd597\"/>\n` +
         `  </g>\n`;
}

function insertLegs(svg, legsGroup, placeOver) {
  if (placeOver) {
    // Append before </svg> so legs draw on top (rarely desired)
    return svg.replace(/<\/svg>/, `${legsGroup}</svg>`);
  }
  // Insert immediately after opening <svg ...> so legs render UNDER existing art.
  return svg.replace(/<svg[^>]*>/, (m) => `${m}\n${legsGroup}`);
}

async function main() {
  const inFile = process.argv[2];
  const outFile = process.argv[3] || path.join(__dirname, '..', 'img', 'generated', 'ear', 'svg', 'ear_runner_from_input.svg');
  const placeOver = process.argv.includes('--over');
  const noLegs = process.argv.includes('--no-legs') || process.argv.includes('--nolegs') || process.argv.includes('--strip-legs');
  const doClean = process.argv.includes('--clean') || process.argv.includes('--clean-bg');
  const replaceWhiteArg = (process.argv.find(a => a.startsWith('--replace-white=')) || '').split('=')[1];
  if (!inFile) {
    console.error('Usage: node scripts/add_legs.js <in.svg> [out.svg] [--over]');
    process.exit(2);
  }
  let src = read(inFile);
  let vb = getViewBox(src);
  if (doClean) {
    const before = src;
    src = cleanWhiteBackgroundRects(src);
    if (replaceWhiteArg) src = replacePureWhiteFills(src, replaceWhiteArg);
    vb = getViewBox(src);
  }
  if (process.argv.includes('--clip-auto-bg') || process.argv.includes('--drop-bg-auto')) {
    try {
      src = await clipAutoBackground(src);
      vb = getViewBox(src);
      console.log('[AddLegs] applied auto background clip via raster mask');
    } catch (e) {
      console.warn('[AddLegs] auto background clip failed; continuing without it', e.message);
    }
  }
  if (process.argv.includes('--clip-contrast') || process.argv.includes('--clip-strong')) {
    try {
      const gammaArg = (process.argv.find(a => a.startsWith('--gamma=')) || '').split('=')[1];
      const morphArg = (process.argv.find(a => a.startsWith('--morph=')) || '').split('=')[1];
      const ringArg  = (process.argv.find(a => a.startsWith('--ring=')) || '').split('=')[1];
      src = await clipAutoBackgroundContrast(src, {
        gamma: gammaArg ? Number(gammaArg) : undefined,
        morph: morphArg ? Number(morphArg) : undefined,
        ring:  ringArg ? Number(ringArg)  : undefined,
      });
      vb = getViewBox(src);
      console.log('[AddLegs] applied contrast-based background clip', { gamma: gammaArg, morph: morphArg, ring: ringArg });
    } catch (e) {
      console.warn('[AddLegs] contrast-based clip failed; continuing without it', e.message);
    }
  }
  const hNew = Math.round(vb.h * 1.22);
  let out = ensureViewBoxAndHeight(src, hNew);
  // Remove any pre-existing legs groups to avoid duplicates
  out = out.replace(/<g[^>]*id=["']legs["'][\s\S]*?<\/g>/g, '');
  if (!noLegs) {
    const legs = buildLegsGroup(vb.w, vb.h);
    out = insertLegs(out, legs, placeOver);
  }
  write(outFile, out);
  console.log('[AddLegs] wrote', outFile);
}

main().catch(err => { console.error(err); process.exit(1); });

// --- helpers: background cleanup and recolor ---
function parseNum(val, fallback = NaN) {
  if (val == null) return fallback;
  const m = String(val).match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : fallback;
}

function isWhiteColor(str) {
  if (!str) return false;
  const s = String(str).trim().toLowerCase();
  if (s === 'white' || s === '#fff' || s === '#ffffff') return true;
  const m = s.match(/rgba?\(([^\)]+)\)/);
  if (m) {
    const parts = m[1].split(/[,\s]+/).filter(Boolean).map(Number);
    const [r,g,b,a] = [parts[0],parts[1],parts[2], parts.length>3?parts[3]:1];
    if (a === 0) return false;
    return r>=250 && g>=250 && b>=250;
  }
  return false;
}

function cleanWhiteBackgroundRects(svg) {
  const vb = getViewBox(svg);
  return svg.replace(/<rect\b[^>]*>/gi, (tag) => {
    const fill = (tag.match(/\bfill=(["'])(.*?)\1/i)?.[2]) || (tag.match(/style=(["'])(.*?)\1/i)?.[2].match(/fill\s*:\s*([^;]+)/i)?.[1]);
    if (!isWhiteColor(fill)) return tag; // keep
    const w = parseNum(tag.match(/\bwidth=(["'])(.*?)\1/i)?.[2]);
    const h = parseNum(tag.match(/\bheight=(["'])(.*?)\1/i)?.[2]);
    const x = parseNum(tag.match(/\bx=(["'])(.*?)\1/i)?.[2], 0);
    const y = parseNum(tag.match(/\by=(["'])(.*?)\1/i)?.[2], 0);
    const wPct = String(tag.match(/\bwidth=(["'])(.*?)\1/i)?.[2]||'').includes('%');
    const hPct = String(tag.match(/\bheight=(["'])(.*?)\1/i)?.[2]||'').includes('%');
    const isFullPercent = wPct && hPct;
    const areaClose = (Math.abs(w - vb.w) <= vb.w*0.02) && (Math.abs(h - vb.h) <= vb.h*0.02);
    const posClose = Math.abs(x - vb.x) <= Math.max(1, vb.w*0.01) && Math.abs(y - vb.y) <= Math.max(1, vb.h*0.01);
    if (isFullPercent || (areaClose && posClose)) {
      return ''; // drop background rect
    }
    return tag;
  });
}

function replacePureWhiteFills(svg, hexColor) {
  // Replace explicit white fills on shapes with provided color (e.g., skin tone)
  const replaceFillAttr = (m, q, val) => ` fill=${q}${hexColor}${q}`;
  const out1 = svg.replace(/\bfill=(['"])\s*(?:#fff(?:fff)?|white)\s*\1/gi, replaceFillAttr);
  // Also handle inline style fill:white
  const out2 = out1.replace(/style=(['"])([^'"]*?)\bfill\s*:\s*(?:#fff(?:fff)?|white)\b([^'"]*?)\1/gi, (m, q, pre, post) => {
    return `style=${q}${pre}fill:${hexColor}${post}${q}`;
  });
  // Replace rgb(255,255,255)
  const out3 = out2.replace(/\bfill=(['"])\s*rgba?\(\s*255\s*,\s*255\s*,\s*255\s*(?:,[^\)]*)?\)\s*\1/gi, replaceFillAttr);
  return out3;
}

async function clipAutoBackground(svg) {
  const vb = getViewBox(svg);
  const w = Math.max(256, Math.min(2048, Math.round(vb.w || 1024)));
  const h = Math.max(256, Math.min(2048, Math.round(vb.h || 1024)));
  // Rasterize SVG at viewBox scale for stable coordinates
  const { data } = await sharp(Buffer.from(svg)).resize({ width: w, height: h, fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = 4; const N = w * h;
  const idx = (x,y) => (y*w + x) * ch;
  const visited = new Uint8Array(N);
  const bgMask = new Uint8Array(N); // 1=background
  // Get seed colors from 4 corners
  const seeds = [ [0,0], [w-1,0], [0,h-1], [w-1,h-1] ].map(([x,y]) => {
    const i = idx(x,y); return [data[i], data[i+1], data[i+2]];
  });
  const near = (p, cs) => cs.some(c => Math.abs(p[0]-c[0])<=18 && Math.abs(p[1]-c[1])<=18 && Math.abs(p[2]-c[2])<=18);
  const qx = new Uint32Array(N); const qy = new Uint32Array(N);
  let qs = 0, qe = 0;
  function push(x,y){ qx[qe]=x; qy[qe]=y; qe++; }
  function pop(){ const x=qx[qs], y=qy[qs]; qs++; return [x,y]; }
  // BFS from corners (skip if already visited)
  [[0,0],[w-1,0],[0,h-1],[w-1,h-1]].forEach(([sx,sy]) => {
    let i = sy*w + sx; if (visited[i]) return;
    push(sx,sy);
    while (qs<qe){
      const [x,y] = pop(); const j = y*w + x; if (visited[j]) continue; visited[j]=1;
      const k = j*ch; const p = [data[k], data[k+1], data[k+2]];
      if (!near(p, seeds)) continue;
      bgMask[j]=1;
      if (x>0) push(x-1,y);
      if (x+1<w) push(x+1,y);
      if (y>0) push(x,y-1);
      if (y+1<h) push(x,y+1);
    }
  });
  // Convert to binary mask PNG: ear region = black, background = white
  const mask = Buffer.alloc(w*h);
  for (let i=0;i<N;i++){ mask[i] = bgMask[i]?255:0; }
  const tmpPng = path.join(require('os').tmpdir(), `ear_bgmask_${Date.now()}.png`);
  await sharp(mask, { raw: { width: w, height: h, channels: 1 } }).png().toFile(tmpPng);
  const svgMask = await new Promise((resolve, reject) => potrace.trace(tmpPng, { turdSize: 50, optCurve: true, turnPolicy: potrace.Potrace.TURNPOLICY_MINORITY }, (err, s) => err?reject(err):resolve(s)));
  try { fs.unlinkSync(tmpPng); } catch {}
  // Extract <path ...> from traced SVG
  const inner = svgMask.replace(/^[\s\S]*?<svg[^>]*>/,'').replace(/<\/svg>[\s\S]*$/,'');
  const defs = `\n  <defs>\n    <clipPath id=\"earClip\">\n${inner.replace(/\n/g,'\n      ')}\n    </clipPath>\n  </defs>\n`;
  // Ensure we wrap the original content in a group and apply the clip-path
  let out = svg.replace(/<svg([^>]*?)>/, (m, attrs) => `<svg${attrs}>${defs}<g id=\"ear-base\" clip-path=\"url(#earClip)\">`);
  out = out.replace(/<\/svg>/, '</g></svg>');
  return out;
}

async function clipAutoBackgroundContrast(svg, opts={}) {
  const vb = getViewBox(svg);
  const w = Math.max(256, Math.min(2048, Math.round(vb.w || 1024)));
  const h = Math.max(256, Math.min(2048, Math.round(vb.h || 1024)));
  const gamma = Number(opts.gamma ?? 1.6);           // amplify contrast in delta space
  const ring = Number(opts.ring ?? Math.max(2, Math.round(Math.min(w,h) * 0.01))); // border thickness to sample bg
  const morph = Number(opts.morph ?? 2);             // iterations for closing

  const { data } = await sharp(Buffer.from(svg)).resize({ width: w, height: h, fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const N = w*h; const ch=3;
  const idx = (x,y)=> (y*w + x)*ch;

  // Sample background color from a border ring (robust median per channel)
  const Rs=[], Gs=[], Bs=[];
  for (let y=0;y<h;y++) {
    for (let x=0;x<w;x++) {
      if (x<ring || x>=w-ring || y<ring || y>=h-ring) {
        const i=idx(x,y); Rs.push(data[i]); Gs.push(data[i+1]); Bs.push(data[i+2]);
      }
    }
  }
  const med = arr => { const a=arr.slice().sort((a,b)=>a-b); return a[Math.floor(a.length/2)]|0; };
  const bg=[med(Rs), med(Gs), med(Bs)];

  // Compute color distance to background and histogram (0..255)
  const dist = new Uint8Array(N);
  const hist = new Uint32Array(256);
  for (let y=0;y<h;y++){
    for (let x=0;x<w;x++){
      const i = idx(x,y);
      let dr = data[i]-bg[0]; let dg = data[i+1]-bg[1]; let db = data[i+2]-bg[2];
      let d = Math.sqrt(dr*dr + dg*dg + db*db) / 441.6729559; // normalize to [0,1]
      if (gamma && gamma !== 1) d = Math.pow(d, gamma);
      const v = Math.max(0, Math.min(255, Math.round(d*255)));
      dist[(y*w + x)] = v; hist[v]++;
    }
  }

  // Otsu threshold
  let sum=0; for (let t=0;t<256;t++) sum += t*hist[t];
  let sumB=0, wB=0, wF=0, varMax=-1, thr=128;
  for (let t=0;t<256;t++){
    wB += hist[t]; if (wB === 0) continue;
    wF = N - wB; if (wF === 0) break;
    sumB += t*hist[t];
    const mB = sumB / wB; const mF = (sum - sumB)/wF;
    const between = wB*wF*(mB-mF)*(mB-mF);
    if (between>varMax){ varMax=between; thr=t; }
  }
  // Build binary mask (ear=1)
  const mask = new Uint8Array(N);
  for (let i=0;i<N;i++) mask[i] = dist[i] > thr ? 1 : 0;

  // Keep largest component (the ear), fill holes
  keepLargestComponent(mask, w, h);
  fillHoles(mask, w, h);

  // Morphological closing to smooth edges
  for (let k=0;k<morph;k++) dilate3x3(mask, w, h);
  for (let k=0;k<morph;k++) erode3x3(mask, w, h);

  // Export mask to PNG then trace to SVG path
  const buf = Buffer.alloc(N); for (let i=0;i<N;i++) buf[i] = mask[i]?0:255; // background white, ear black
  const tmp = path.join(require('os').tmpdir(), `ear_mask_${Date.now()}.png`);
  await sharp(buf, { raw: { width: w, height: h, channels: 1 } }).png().toFile(tmp);
  const traced = await new Promise((resolve,reject)=>potrace.trace(tmp, { turdSize: 50, optCurve:true, turnPolicy: potrace.Potrace.TURNPOLICY_MINORITY }, (e,s)=>e?reject(e):resolve(s)));
  try { fs.unlinkSync(tmp); } catch {}
  const inner = traced.replace(/^[\s\S]*?<svg[^>]*>/,'').replace(/<\/svg>[\s\S]*$/,'');
  const defs = `\n  <defs>\n    <clipPath id=\"earClip\">\n${inner.replace(/\n/g,'\n      ')}\n    </clipPath>\n  </defs>\n`;
  let out = svg.replace(/<svg([^>]*?)>/, (m, attrs) => `<svg${attrs}>${defs}<g id=\"ear-base\" clip-path=\"url(#earClip)\">`);
  out = out.replace(/<\/svg>/, '</g></svg>');
  return out;
}

function dilate3x3(mask, w, h){
  const out = mask.slice();
  for (let y=1;y<h-1;y++){
    for (let x=1;x<w-1;x++){
      const i=y*w+x;
      if (mask[i]) { out[i]=1; continue; }
      let on=0;
      for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++) if (mask[(y+dy)*w + (x+dx)]) { on=1; break; }
      out[i]=on;
    }
  }
  mask.set(out);
}
function erode3x3(mask, w, h){
  const out = mask.slice();
  for (let y=1;y<h-1;y++){
    for (let x=1;x<w-1;x++){
      const i=y*w+x; if (!mask[i]) { out[i]=0; continue; }
      let all=1;
      for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++) if (!mask[(y+dy)*w + (x+dx)]) { all=0; break; }
      out[i]=all;
    }
  }
  mask.set(out);
}
function keepLargestComponent(mask, w, h){
  const seen = new Uint8Array(mask.length);
  let bestStart=-1, bestArea=0;
  const qx=[]; const qy=[];
  for (let y=0;y<h;y++) for (let x=0;x<w;x++){
    const s=y*w+x; if (seen[s]||!mask[s]) continue;
    let area=0; qx.length=0; qy.length=0; qx.push(x); qy.push(y); seen[s]=1;
    for (let qi=0; qi<qx.length; qi++){
      const cx=qx[qi], cy=qy[qi]; area++; const base=cy*w+cx;
      const nbr=(nx,ny)=>{ const i=ny*w+nx; if (!seen[i] && mask[i]){ seen[i]=1; qx.push(nx); qy.push(ny);} };
      if (cx>0) nbr(cx-1,cy); if (cx+1<w) nbr(cx+1,cy); if (cy>0) nbr(cx,cy-1); if (cy+1<h) nbr(cx,cy+1);
    }
    if (area>bestArea){ bestArea=area; bestStart=s; }
  }
  // Build keep map by flood from bestStart
  const keep = new Uint8Array(mask.length);
  if (bestStart>=0){
    const sx=bestStart%w, sy=(bestStart/w)|0; qx.length=0; qy.length=0; qx.push(sx); qy.push(sy); keep[bestStart]=1;
    for (let qi=0; qi<qx.length; qi++){
      const cx=qx[qi], cy=qy[qi]; const base=cy*w+cx;
      const nbr=(nx,ny)=>{ const i=ny*w+nx; if (!keep[i] && mask[i]){ keep[i]=1; qx.push(nx); qy.push(ny);} };
      if (cx>0) nbr(cx-1,cy); if (cx+1<w) nbr(cx+1,cy); if (cy>0) nbr(cx,cy-1); if (cy+1<h) nbr(cx,cy+1);
    }
  }
  for (let i=0;i<mask.length;i++) mask[i]=keep[i];
}
function fillHoles(mask, w, h){
  const seen=new Uint8Array(mask.length); const out=mask.slice();
  const qx=[]; const qy=[];
  // Flood from border on inverted mask to find exterior, then invert back
  function flood(x,y){ qx.length=0; qy.length=0; qx.push(x); qy.push(y); seen[y*w+x]=1; while(qx.length){ const cx=qx.shift(), cy=qy.shift(); const base=cy*w+cx; out[base]=0; const step=(nx,ny)=>{ const i=ny*w+nx; if (!seen[i] && !mask[i]){ seen[i]=1; qx.push(nx); qy.push(ny);} }; if (cx>0) step(cx-1,cy); if (cx+1<w) step(cx+1,cy); if (cy>0) step(cx,cy-1); if (cy+1<h) step(cx,cy+1);} }
  for (let x=0;x<w;x++){ if (!mask[x] && !seen[x]) flood(x,0); const b=(h-1)*w+x; if (!mask[b] && !seen[b]) flood(x,h-1); }
  for (let y=0;y<h;y++){ const l=y*w; if (!mask[l] && !seen[l]) flood(0,y); const r=y*w+(w-1); if (!mask[r] && !seen[r]) flood(w-1,y); }
  // Any remaining 1s in inverted space are holes; set them to foreground
  for (let i=0;i<mask.length;i++) if (!out[i]) out[i]=1; mask.set(out);
}
