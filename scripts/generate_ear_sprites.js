'use strict';

// Generate a small gallery of "ear with sunglasses" images via Stable Horde and save them under img/generated/ear/
// Anonymous key is used by default (slow but works). You can set AI_HORDE_API_KEY env var to use your own key.

const fs = require('fs');
const path = require('path');

const API = 'https://aihorde.net/api/v2';
const API_KEY = process.env.AI_HORDE_API_KEY || '00000000-0000-0000-0000-000000000000';

const OUT_DIR = path.join(__dirname, '..', 'img', 'generated', 'ear');
const MANIFEST = path.join(__dirname, '..', 'intervals-runner', 'sprites.json');

async function hordeJson(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'apikey': API_KEY,
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${t}`);
  }
  return res.json();
}

async function submitJob(prompt, n = 2) {
  const body = {
    prompt,
    params: {
      n,
      width: 512,
      height: 512,
      steps: 22,
      sampler_name: 'k_euler_a',
      cfg_scale: 6.5,
      seed: 'random',
      tiling: false,
    },
    models: ['SDXL 1.0'],
    nsfw: false,
    censor_nsfw: true,
    r2: true,
  };
  const json = await hordeJson(`${API}/generate/async`, { method: 'POST', body: JSON.stringify(body) });
  return json.id;
}

async function waitForJob(id) {
  const started = Date.now();
  while (true) {
    const json = await hordeJson(`${API}/generate/status/${id}`, { method: 'GET' });
    if (json.done && Array.isArray(json.generations) && json.generations.length) return json.generations;
    if ((Date.now() - started) > 6 * 60 * 1000) throw new Error('Timeout waiting for generation');
    await new Promise(r => setTimeout(r, 3500));
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function main() {
  ensureDir(OUT_DIR);
  const prompts = [
    // Aim for clean logo-style art; small variations to get options
    'cute stylized ear wearing sunglasses, profile mascot logo, minimalist vector flat colors, simple shapes, clean outline, no text, centered, white background',
    'cartoon ear with cool sunglasses, side profile, logo icon, flat vector design, thick outline, high contrast, no text, centered, white background',
    'mascot ear with shades, simple geometric shapes, flat color palette, vector illustration, smooth curves, logo mark, no text, centered, white background',
  ];

  const results = [];
  for (const prompt of prompts) {
    console.log('[Gen] Submitting:', prompt);
    const id = await submitJob(prompt, 2);
    console.log('[Gen] Job id:', id);
    const gens = await waitForJob(id);
    console.log('[Gen] Received', gens.length, 'images');
    results.push({ prompt, gens });
  }

  const manifest = [];
  let idx = 1;
  for (const { prompt, gens } of results) {
    for (const g of gens) {
      const b64 = g.img; // data is base64 (no prefix)
      const buf = Buffer.from(b64, 'base64');
      const filename = `ear_${String(idx).padStart(2, '0')}.png`;
      const file = path.join(OUT_DIR, filename);
      fs.writeFileSync(file, buf);
      console.log('[Save]', file, buf.length, 'bytes');
      manifest.push({ file: `/img/generated/ear/${filename}`, prompt });
      idx += 1;
    }
  }

  fs.writeFileSync(MANIFEST, JSON.stringify({ items: manifest }, null, 2));
  console.log('[Manifest]', MANIFEST, 'written with', manifest.length, 'items');
}

main().catch(err => { console.error(err); process.exit(1); });
