import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const require = createRequire(import.meta.url);
// Exercise the actual transitive dependencies selected by the application install.
const proxyaddr = require('proxy-addr');
const { vulnerabilityCheck } = require('@simple-git/argv-parser');
const uri = require('fast-uri');
const qs = require('qs');
const { Address6 } = require('ip-address');
const desktopEsbuild = createRequire(new URL('../../../desktop/package.json', import.meta.url))('esbuild');

describe('dependency security boundaries', () => {
  for (const value of ['%6Aavascript:alert(1)', '%u006Aavascript:alert(1)']) {
    it(`does not normalize an encoded scheme into executable JavaScript: ${value}`, () => {
      expect(uri.normalize(value)).not.toMatch(/^javascript:/i);
    });
  }
  it('preserves ordinary URI normalization and schema-reference resolution', () => {
    expect(uri.normalize('https://EXAMPLE.COM/a')).toBe('https://example.com/a');
    expect(uri.resolve('https://example.com/schemas/base', 'child')).toBe('https://example.com/schemas/child');
  });
  it('serializes hostile comma-array elements without uncaught coercion errors', () => {
    for (const element of [{ toString: 'not-callable' }, Object.create(null)]) {
      for (const encodeValuesOnly of [false, true]) {
        expect(() => qs.stringify({ values: [element] }, { arrayFormat: 'comma', encodeValuesOnly })).not.toThrow();
      }
    }
  });
  it('preserves normal query parsing and comma-array serialization', () => {
    expect(qs.parse('folder=Notes&limit=10')).toEqual({ folder: 'Notes', limit: '10' });
    expect(qs.stringify({ values: ['one', 'two'] }, { arrayFormat: 'comma' })).toBe('values=one%2Ctwo');
  });
  for (const address of ['fe80:0:0:1::1', 'febf::1']) {
    it(`recognizes the full IPv6 link-local range: ${address}`, () => {
      expect(new Address6(address).isLinkLocal()).toBe(true);
    });
  }
  it('does not classify a public IPv6 address as link-local', () => {
    expect(new Address6('2001:4860:4860::8888').isLinkLocal()).toBe(false);
  });
  it('does not expose esbuild output to an unrelated website while ordinary requests work', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wo-esbuild-cors-'));
    let context;
    try {
      context = await desktopEsbuild.context({ stdin: { contents: 'export const answer = 42;' },
        outfile: path.join(root, 'fixture.js'), bundle: true, logLevel: 'silent' });
      const { port } = await context.serve({ host: '127.0.0.1', port: 0, servedir: root });
      const url = `http://127.0.0.1:${port}/fixture.js`;
      const normal = await fetch(url);
      expect(normal.status).toBe(200);
      expect(await normal.text()).toContain('42');
      const foreign = await fetch(url, { headers: { Origin: 'https://untrusted.invalid' } });
      await foreign.text();
      expect(foreign.headers.get('access-control-allow-origin')).not.toBe('*');
      expect(foreign.headers.get('access-control-allow-origin')).not.toBe('https://untrusted.invalid');
    } finally {
      await context?.dispose();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
  it('rejects an oversized bounded collection before validating its elements', () => {
    let visited = 0;
    const element = z.string().superRefine(() => { visited++; });
    expect(z.array(element).max(1).safeParse(['one', 'two', 'three']).success).toBe(false);
    expect(visited).toBe(0);
  });
  it('still validates elements of a collection within its size limit', () => {
    let visited = 0;
    const element = z.string().superRefine(() => { visited++; });
    expect(z.array(element).max(1).parse(['one'])).toEqual(['one']);
    expect(visited).toBe(1);
  });
  for (const subnet of ['::ffff:10.0.0.0/8', '::/1']) {
    it(`does not trust an external IPv4 peer through ${subnet}`, () => {
      expect(proxyaddr.compile(subnet)('203.0.113.9')).toBe(false);
    });
  }
  for (const subnet of ['10.0.0.0/8', '::ffff:10.0.0.0/104']) {
    it(`preserves legitimate proxy trust for ${subnet}`, () => {
      const trust = proxyaddr.compile(subnet);
      expect(trust('10.1.2.3')).toBe(true);
      expect(trust('203.0.113.9')).toBe(false);
    });
  }
  for (const editor of ['VISUAL', 'visual', 'EDITOR']) {
    it(`classifies ${editor} as an unsafe editor without launching it`, () => {
      expect(vulnerabilityCheck(['commit', '--amend'], { [editor]: 'test-editor' }))
        .toContainEqual(expect.objectContaining({ category: 'allowUnsafeEditor' }));
    });
  }
  it('preserves noninteractive Git commands without editor overrides', () => {
    expect(vulnerabilityCheck(['status', '--short'], {})).toEqual([]);
  });
});
