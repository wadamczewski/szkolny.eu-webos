// Builds the webOS package: UI bundle + service bundle → dist/pl.prywatny.dziennik_<ver>_all.ipk.
// Does not connect to a TV.

import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'build');
const dist = join(root, 'dist');

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'service'), { recursive: true });
mkdirSync(dist, { recursive: true });

// UI: one classic script (ES modules don't load from file:// on the TV). chrome87 = webOS 22,
// the oldest engine with everything style.css uses (flex gap, inset).
await build({
  entryPoints: [join(root, 'ui/main.js')],
  bundle: true,
  format: 'iife',
  target: 'chrome87',
  minify: true,
  outfile: join(out, 'app/app.js'),
  logLevel: 'warning',
});
for (const file of ['index.html', 'style.css', 'appinfo.json', 'icon.png', 'largeIcon.png']) {
  cpSync(join(root, 'app', file), join(out, 'app', file));
}

// Service: the core and its dependencies in one CommonJS file for the TV's Node.js.
// node12 is a safe floor for the Node runtime of recent webOS versions.
await build({
  entryPoints: [join(root, 'service/src/index.js')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node12',
  external: ['webos-service'],
  outfile: join(out, 'service/service.js'),
  logLevel: 'warning',
});
for (const file of ['package.json', 'services.json']) {
  cpSync(join(root, 'service', file), join(out, 'service', file));
}

const version = JSON.parse(readFileSync(join(root, 'app/appinfo.json'), 'utf8')).version;
execFileSync(join(root, 'node_modules/.bin/ares-package'), [join(out, 'app'), join(out, 'service'), '-o', dist, '--no-minify'], {
  stdio: 'inherit',
});
console.log(`\nGotowe: dist/pl.prywatny.dziennik_${version}_all.ipk`);
