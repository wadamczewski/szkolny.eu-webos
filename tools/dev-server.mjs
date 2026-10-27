// Preview the TV app in a desktop browser: serves app/ and the service methods over HTTP
// (POST /luna/<method>), using the same core as the TV. Open http://localhost:8790 at 1920×1080.
// Log in with "demo" to see synthetic data, or with your own Synergia account.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const client = require(join(root, 'core/client.js'));
const PORT = Number(process.env.PORT || 8790);
const METHODS = ['login', 'sync', 'timetable', 'messages', 'message'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };

async function bundleUI() {
  const result = await build({ entryPoints: [join(root, 'ui/main.js')], bundle: true, format: 'iife', target: 'chrome87', write: false, sourcemap: 'inline' });
  return result.outputFiles[0].text;
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => resolve(body));
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === 'POST' && url.pathname.startsWith('/luna/')) {
      const method = url.pathname.slice(6);
      let payload = {};
      try {
        payload = JSON.parse((await readBody(req)) || '{}');
      } catch (e) {
        payload = {};
      }
      let result;
      try {
        if (!METHODS.includes(method)) throw Object.assign(new Error(`Nieznana metoda ${method}`), { code: 'badRequest' });
        result = Object.assign({ returnValue: true }, await client[method](payload));
      } catch (e) {
        result = { returnValue: false, errorCode: e.code || 'error', errorText: e.message };
      }
      console.log(`${method} → ${result.returnValue ? 'ok' : result.errorCode}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }
    if (url.pathname === '/app.js') {
      res.writeHead(200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-store' });
      res.end(await bundleUI());
      return;
    }
    const path = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = normalize(join(root, 'app', path));
    if (!file.startsWith(join(root, 'app'))) throw new Error('forbidden');
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch (e) {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`Dziennik (podgląd): http://localhost:${PORT}`));
