import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { it, expect } from 'vitest';

const require = createRequire(import.meta.url);

it('packages and extracts ASAR files with native-module unpack globs using the installed desktop toolchain', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webo-asar-'));
  try {
    const src = path.join(root, 'app');
    await fs.mkdir(src);
    await fs.writeFile(path.join(src, 'index.js'), 'module.exports=42');
    await fs.writeFile(path.join(src, 'native.node'), 'fixture-native-bytes');
    const asar = require('@electron/asar');
    const archive = path.join(root, 'app.asar');
    await asar.createPackageWithOptions(src, archive, { unpack: '**/*.node' });
    expect(asar.extractFile(archive, 'index.js').toString()).toBe('module.exports=42');
    expect(await fs.readFile(path.join(archive + '.unpacked', 'native.node'), 'utf8')).toBe('fixture-native-bytes');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
