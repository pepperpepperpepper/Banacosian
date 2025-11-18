'use strict';

// Generate ear-with-sunglasses sprites using OpenAI Images API and write a sprites manifest

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

async function generate(prompt, n=1) {
  const body = {
    model: 'dall-e-3',
    prompt,
    size: '1024x1024',
    n,
    style: 'vivid'
  };
  const json = await openaiJson('https://api.openai.com/v1/images/generations', body);
  return json.data || [];
}

function ensureDir(dir){ fs.mkdirSync(dir, { recursive: true }); }

async function main(){
  ensureDir(OUT_DIR);
  const prompts = [
    'A clean, minimalist mascot logo of a human ear wearing dark sunglasses, side profile, simple vector shapes, flat colors, no text, high contrast, centered, white background',
    'Stylized cartoon ear with sunglasses, charming and bold logo mark, smooth curves, vector flat design, no text, centered, white background',
    'Kawaii cute ear mascot with black sunglasses, bold outline, flat vector colors, side profile, no text, centered, white background'
  ];

  const manifest = [];
  let idx = 1;
  for (const p of prompts) {
    console.log('[OpenAI] Generating for prompt:', p);
    const items = await generate(p, 1);
    for (const it of items) {
      const url = it.url;
      if (!url) continue;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch image: ' + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      const filename = `ear_openai_${String(idx).padStart(2,'0')}.png`;
      const file = path.join(OUT_DIR, filename);
      fs.writeFileSync(file, buf);
      console.log('[Save]', file, buf.length, 'bytes');
      manifest.push({ file: `/img/generated/ear/${filename}`, prompt: p });
      idx += 1;
    }
  }

  fs.writeFileSync(MANIFEST, JSON.stringify({ items: manifest }, null, 2));
  console.log('[Manifest]', MANIFEST, 'written with', manifest.length, 'items');
}

main().catch(err => { console.error(err); process.exit(1); });
