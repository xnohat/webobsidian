import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderMarkdown } from '../src/lib/markdown';

// FR-21: `![[x.pdf]]` in the Reading view / split-pane preview. The renderer
// cannot emit the frame itself (rehype-sanitize drops iframes and the schema is
// deliberately not widened), so it emits an inert link carrying the target and
// Preview.tsx swaps it for the viewer in its post-render pass.
const opts = { rawUrl: (p: string) => `/api/files/content?path=${encodeURIComponent(p)}` };

test('a pdf embed becomes a pdf-embed link carrying the target', async () => {
  const html = await renderMarkdown('![[relats/raw/documents/report.pdf]]', opts);
  assert.match(
    html,
    /<a class="pdf-embed" data-href="relats\/raw\/documents\/report\.pdf" href="\/api\/files\/content\?path=relats%2Fraw%2Fdocuments%2Freport\.pdf">report\.pdf<\/a>/,
  );
  // …and it is no longer the generic embed fallback that resolves as a wikilink.
  assert.doesNotMatch(html, /internal-link embed/);
});

test('a pdf embed label is the alias, else the file name', async () => {
  const aliased = await renderMarkdown('![[relats/raw/documents/report.pdf|Hoshin ebook]]', opts);
  assert.match(aliased, />Hoshin ebook<\/a>/);
});

test('a pdf embed never transcludes the file bytes as markdown', async () => {
  const html = await renderMarkdown('![[report.pdf]]', {
    ...opts,
    resolveEmbed: async () => ({ path: 'report.pdf', content: 'PDF BYTES AS TEXT' }),
  });
  assert.doesNotMatch(html, /PDF BYTES AS TEXT/);
});

test('image and media embeds keep their elements', async () => {
  const html = await renderMarkdown('![[pic.png]]\n\n![[clip.mp4]]', opts);
  assert.match(html, /<img src="\/api\/files\/content\?path=pic\.png" alt="pic\.png"/);
  assert.match(html, /<video class="media-embed" src="\/api\/files\/content\?path=clip\.mp4"/);
});

test('a plain wikilink to a pdf stays a wikilink (it opens the file view)', async () => {
  const html = await renderMarkdown('[[relats/raw/documents/report.pdf|the report]]', opts);
  assert.match(html, /<a class="internal-link" data-wikilink="relats\/raw\/documents\/report\.pdf"/);
});
test('PDF viewer options stay outside the file API path', async () => {
  const html = await renderMarkdown('![[report.pdf#page=3]]', opts);
  assert.match(html, /data-href="report\.pdf"/);
  assert.match(html, /href="\/api\/files\/content\?path=report\.pdf#page=3"/);
  assert.doesNotMatch(html, /path=[^"]*%23/);
});
