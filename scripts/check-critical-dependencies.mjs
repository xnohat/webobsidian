// Guard every nested lockfile copy against the advisories remediated in October 2026.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const floors = {
  '@simple-git/argv-parser': '2.0.1', 'simple-git': '4.0.2',
  dompurify: '3.4.17', 'proxy-addr': '2.0.8', 'shell-quote': '1.11.0',
  tar: '7.5.22', tinypool: '2.1.2', vitest: '4.1.12', concurrently: '9.2.5',
  '@modelcontextprotocol/sdk': '1.32.0', 'body-parser': '1.20.9',
  browserslist: '4.29.5', electron: '42.11.16', 'extract-zip': null,
  multer: '2.5.0', vite: '6.4.5', zod: '4.6.6',
  '@hono/node-server': '2.1.3', hono: '4.13.11', 'fast-uri': '3.1.9',
  'ip-address': '10.7.4', qs: '6.16.1', esbuild: '0.25.0',
  katex: '0.18.2', mermaid: '12.2.0',
  minimatch: '11.0.1', '@electron/asar': '4.3.1', '@electron/universal': '3.0.6', glob: '7.2.3',
};
const compare = (actual, minimum) => {
  assert.match(actual, /^\d+\.\d+\.\d+$/, `Unexpected dependency version: ${actual}`);
  const a = actual.split('.').map(Number), b = minimum.split('.').map(Number);
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
};
const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
assert.equal(lock.lockfileVersion, 3);
const failures = [];
let checked = 0;
for (const [location, entry] of Object.entries(lock.packages)) {
  for (const [name, minimum] of Object.entries(floors)) {
    if (!`/${location}`.endsWith(`/node_modules/${name}`)) continue;
    checked++;
    if (minimum === null) {
      failures.push(`${location}: unsupported vulnerable package must be removed`);
      continue;
    }
    // concurrently 10.0.0–10.0.5 reintroduced a vulnerable shell-quote dependency.
    const vulnerableNextMajor = name === 'concurrently' && entry.version.startsWith('10.0.')
      && compare(entry.version, '10.0.6') < 0;
    const vulnerableBodyParser2 = name === 'body-parser' && entry.version.startsWith('2.')
      && compare(entry.version, '2.4.0') < 0;
    const vulnerableFastUri4 = name === 'fast-uri' && entry.version.startsWith('4.')
      && compare(entry.version, '4.2.3') < 0;
    const vulnerableModernGlob = name === 'glob' && compare(entry.version, '9.0.0') >= 0
      && compare(entry.version, '14.0.2') < 0;
    if (compare(entry.version, minimum) < 0 || vulnerableNextMajor || vulnerableBodyParser2 || vulnerableFastUri4 || vulnerableModernGlob) {
      failures.push(`${location}: ${entry.version} (minimum secure baseline ${minimum})`);
    }
  }
}
assert.ok(checked > 0, 'No protected dependencies found; check the lockfile format');
assert.deepEqual(failures, [], 'Known vulnerable dependency versions remain in the lockfile');
const desktop = JSON.parse(await readFile(new URL('../desktop/package.json', import.meta.url), 'utf8'));
assert.equal(desktop.devDependencies.electron, desktop.build.electronVersion, 'Electron install and packaging pins must match');
assert.equal(lock.packages['node_modules/electron'].version, desktop.build.electronVersion);
console.log(`PASS: ${checked} dependency copies satisfy the remediated advisory baselines`);
