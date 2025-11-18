'use strict';

// Generate ear-only (no sunglasses) sprites using OpenAI Images API and append them to the sprite manifest

const fs = require('fs');
const path = require('path');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY in environment.');
  process.exit(1);
}

const OUT_DIR = path.join(__dirname, '..', 'img', 'generated', 'ear');
const MANIFEST = path.join(__dirname, '..', 'intervals-runner', 'sprites.json');

async function openaiJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`OpenAI HTTP ${res.status}: ${t}`);
  }
  return res.json();
}

async function generate(prompt) {
  const body = {
    model: 'dall-e-3',
    prompt,
    size: '1024x1024',
    n: 1,
    style: 'vivid'
  };
  const json = await openaiJson('https://api.openai.com/v1/images/generations', body);
  return (json.data || []).map(d => d.url).filter(Boolean);
}

function ensureDir(dir){ fs.mkdirSync(dir, { recursive: true }); }

function readManifest(){
  try { return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch { return { items: [] }; }
}

async function main(){
  ensureDir(OUT_DIR);
  const prompts = [
    'A clean, minimalist mascot logo of a human ear (no sunglasses), side profile, simple vector shapes, flat colors, no text, high contrast, centered, white background',
    'Stylized cartoon ear (without sunglasses), charming and bold logo mark, smooth curves, vector flat design, no text, centered, white background',
    'Kawaii cute ear mascot only, bold outline, flat vector colors, side profile, no text, centered, white background'
  ];

  const manifest = readManifest();
  let nextIndex = manifest.items.length + 1;

  for (const p of prompts) {
    console.log('[OpenAI] Generating ear-only for prompt:', p);
    const urls = await generate(p);
    for (const url of urls) {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch image: ' + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      const filename = `ear_only_${String(nextIndex).padStart(2,'0')}.png`;
      const file = path.join(OUT_DIR, filename);
      fs.writeFileSync(file, buf);
      console.log('[Save]', file, buf.length, 'bytes');
      manifest.items.push({ file: `/img/generated/ear/${filename}`, prompt: p });
      nextIndex += 1;
    }
  }

  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  console.log('[Manifest appended]', MANIFEST, 'now has', manifest.items.length, 'items');
}

main().catch(err => { console.error(err); process.exit(1); });

