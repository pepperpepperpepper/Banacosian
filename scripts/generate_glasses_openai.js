'use strict';

// Generate a round sunglasses frame (front view) via OpenAI Images API.
// Output: img/generated/ear/glasses/glasses_round_ai_01.png

const fs = require('fs');
const path = require('path');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY');
  process.exit(1);
}

const OUT_DIR = path.join(__dirname, '..', 'img', 'generated', 'ear', 'glasses');

async function openaiJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) { throw new Error(`OpenAI ${res.status}: ${await res.text()}`); }
  return res.json();
}

async function generate(prompt) {
  const body = { model: 'dall-e-3', prompt, size: '1024x1024', n: 1, style: 'vivid' };
  const json = await openaiJson('https://api.openai.com/v1/images/generations', body);
  const url = json?.data?.[0]?.url;
  if (!url) throw new Error('No image URL in response');
  const r = await fetch(url);
  if (!r.ok) throw new Error('Failed to fetch image ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  return buf;
}

async function main(){
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const prompt = 'black round sunglasses frame, front view, minimal logo-ready vector style, bold frame thickness, no reflections, centered, high contrast on white background, no text';
  console.log('[Gen] request to OpenAI');
  const buf = await generate(prompt);
  const file = path.join(OUT_DIR, 'glasses_round_ai_01.png');
  fs.writeFileSync(file, buf);
  console.log('[Gen] wrote', file, buf.length, 'bytes');
}

main().catch(e => { console.error(e); process.exit(1); });

