import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const consumers = [
  ['web', require('katex')],
] as const;

for (const [consumer, katex] of consumers) {
  test(`${consumer}: inherited trust cannot enable a JavaScript link`, () => {
    const options = Object.assign(Object.create({ trust: true }), { throwOnError: false });
    const html = katex.renderToString('\\href{javascript:alert(1)}{fixture}', options);
    assert.doesNotMatch(html, /\bhref\s*=\s*["']\s*javascript:/i);
  });
  test(`${consumer}: inherited trust cannot enable an external image`, () => {
    const options = Object.assign(Object.create({ trust: true }), { throwOnError: false });
    const html = katex.renderToString('\\includegraphics{https://untrusted.invalid/fixture.png}', options);
    assert.doesNotMatch(html, /<img\b/i);
  });
  test(`${consumer}: global prototype trust cannot affect ordinary renderer options`, () => {
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, 'trust');
    let html: string;
    try {
      Object.defineProperty(Object.prototype, 'trust', { value: true, writable: true, configurable: true });
      html = katex.renderToString('\\href{javascript:alert(1)}{fixture}', { throwOnError: false });
    } finally {
      if (previous) Object.defineProperty(Object.prototype, 'trust', previous);
      else delete (Object.prototype as { trust?: unknown }).trust;
    }
    assert.doesNotMatch(html!, /\bhref\s*=\s*["']\s*javascript:/i);
  });
  test(`${consumer}: ordinary fractions still render HTML and MathML`, () => {
    const html = katex.renderToString('\\frac{a}{b}', { throwOnError: false });
    assert.match(html, /class="katex"/);
    assert.match(html, /<mfrac>/);
  });
  test(`${consumer}: an explicitly trusted HTTPS link remains supported`, () => {
    const html = katex.renderToString('\\href{https://example.com}{fixture}', { trust: true, throwOnError: false });
    assert.match(html, /href="https:\/\/example\.com"/);
  });
}
