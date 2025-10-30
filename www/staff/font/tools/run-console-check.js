#!/usr/bin/env node

/**
 * Headless diagnostic runner that serves /var/www/staff, opens /font/ in Chromium,
 * and streams console/network errors to stdout so remote debugging is easier.
 *
 * Usage: node font/tools/run-console-check.js [path=/font/] [waitMs=6000]
 */

const http = require('http');
const path = require('path');
const fs = require('fs/promises');
const { chromium } = require('playwright');

const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');
const TARGET_ARG = process.argv[2];
const DEFAULT_PATH = TARGET_ARG || '/staff/font/';
const WAIT_MS = Number.isFinite(Number(process.argv[3])) ? Number(process.argv[3]) : 6000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
};

function getMime(ext) {
  return MIME_TYPES[ext.toLowerCase()] || 'application/octet-stream';
}

function sanitizePath(urlPath) {
  let relPath = decodeURIComponent(urlPath || '/');
  if (relPath.includes('\0')) {
    throw new Error('Bad path');
  }
  if (relPath.startsWith('/')) {
    relPath = relPath.slice(1);
  }
  if (!relPath || relPath.endsWith('/')) {
    relPath = path.join(relPath, 'index.html');
  }
  const resolved = path.resolve(ROOT_DIR, relPath);
  if (!resolved.startsWith(ROOT_DIR)) {
    throw new Error('Forbidden');
  }
  return resolved;
}

async function serveFile(filePath, res) {
  const data = await fs.readFile(filePath);
  const ext = path.extname(filePath);
  res.writeHead(200, {
    'Content-Type': getMime(ext),
    'Cache-Control': 'no-cache',
  });
  res.end(data);
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const targetPath = sanitizePath(new URL(req.url, 'http://localhost').pathname);
        await serveFile(targetPath, res);
      } catch (err) {
        if (err.code === 'ENOENT') {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Not found');
        } else if (err.message === 'Forbidden' || err.message === 'Bad path') {
          res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Forbidden');
        } else {
          console.error('[server] error', err);
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Internal server error');
        }
      }
    });
    server.on('error', reject);
    server.listen(0, () => {
      const address = server.address();
      if (!address) {
        reject(new Error('Unable to bind server'));
        return;
      }
      resolve({ server, port: address.port });
    });
  });
}

async function captureConsole(page) {
  page.on('console', (msg) => {
    const type = msg.type();
    console.log(`[console:${type}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    console.error('[pageerror]', err);
  });
  page.on('requestfailed', (request) => {
    console.warn(`[requestfailed] ${request.url()} :: ${request.failure()?.errorText || 'unknown error'}`);
  });
  page.on('response', (response) => {
    if (!response.ok()) {
      console.warn(`[response ${response.status()}] ${response.url()}`);
    }
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await captureConsole(page);

  let server = null;
  let targetUrl = DEFAULT_PATH;
  if (/^https?:\/\//i.test(DEFAULT_PATH)) {
    console.log(`[page] navigating to ${targetUrl}`);
  } else {
    const serverInfo = await startServer();
    server = serverInfo.server;
    targetUrl = `http://127.0.0.1:${serverInfo.port}${DEFAULT_PATH}`;
    console.log(`[server] listening on http://127.0.0.1:${serverInfo.port}`);
    console.log(`[page] navigating to ${targetUrl}`);
  }

  try {
    const response = await page.goto(targetUrl, { waitUntil: 'load', timeout: 30000 });
    if (!response || !response.ok()) {
      console.warn('[page] initial navigation returned status', response?.status());
    }
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(WAIT_MS);
    console.log('[page] wait complete');
  } finally {
    await context.close();
    await browser.close();
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      console.log('[server] closed');
    }
  }
}

main().catch((err) => {
  console.error('[runner] fatal error', err);
  process.exitCode = 1;
});
