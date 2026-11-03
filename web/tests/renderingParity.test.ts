import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { editableFrontmatter } from '../../server/src/services/frontmatterPolicy';
import { test } from 'node:test';
import { renderMarkdown } from '../src/lib/markdown';
import { renderNoteHtml, metaDescription, firstImage } from '../../server/src/services/renderhtml';

const cases: Record<string, string> = JSON.parse(readFileSync(new URL('../../tests/fixtures/rendering/cases.json', import.meta.url), 'utf8'));
const rawUrl = (p: string) => `/raw/${encodeURIComponent(p)}`;

test('YAML embeds remain file cards instead of parsing configuration as Markdown',async()=>{
  const html=await renderMarkdown('![[my.yaml]]',{rawUrl,resolveEmbed:async()=>({path:'my.yaml',content:'secret: do-not-render\n# YAML comment'})});
  assert.match(html,/file-embed mod-generic/);
  assert.match(html,/data-wikilink="my.yaml"/);
  assert.doesNotMatch(html,/secret:|YAML comment/);
  const ordinary=await renderMarkdown('[[my.yaml]]',{rawUrl});
  assert.doesNotMatch(ordinary,/file-embed/);
});
test('rendered Markdown links retain their encoded target and declare their syntax kind',async()=>{
 const html=await renderMarkdown('[Space](shot%20one.md) [[shot%20one]]',{rawUrl});
 assert.match(html,/href="shot%20one.md"[^>]*data-link-kind="markdown"|data-link-kind="markdown"[^>]*href="shot%20one.md"/);
 assert.match(html,/data-wikilink="shot%20one"/);
});
for (const [name, render] of [
  ['preview', (src: string) => renderMarkdown(src, { rawUrl })],
  ['public', (src: string) => renderNoteHtml(src, rawUrl)],
] as const) {
  for (const [kind, src] of [
    ['indented', cases.indentedCode],
    ['long fence', cases.longFence],
    ['unclosed fence', cases.unclosedFence],
    ['inline multiple backticks', cases.inlineBackticks],
  ]) {
    test(`${name}: ${kind} code retains literal wikilinks`, async () => {
      const html = await render(src);
      assert.ok(html.includes('[[note]]'), html);
      assert.doesNotMatch(html, /internal-link|data-wikilink/);
      assert.match(html, /<code>/);
    });
  }
  test(`${name}: escaped wikilink is literal`, async () => {
    const html = await render(cases.escapedWiki);
    assert.match(html, /\[\[note\]\]/);
    assert.doesNotMatch(html, /internal-link|data-wikilink/);
  });
  test(`${name}: wikilinks outside code still work`, async () => {
    assert.match(await render('[[note|label]]'), /data-wikilink="note"[^>]*>label<\/a>/);
  });
  test(`${name}: HTML attributes are not parsed as Markdown tags`, async () => {
    const html = await render(cases.htmlAttribute);
    assert.doesNotMatch(html, /class="tag"|internal-link|data-wikilink/);
    assert.match(html, /<span\b[^>]*>red<\/span>/);
  });
  test(`${name}: comments hidden but code examples retained`, async () => {
    const html = await render('before %%secret [[note]]%% after\n\n%%\nhidden\n%%\n\n`%%literal%%`');
    assert.doesNotMatch(html, /secret|hidden|internal-link/);
    assert.match(html, /%%literal%%/);
  });
}

for (const src of ['`![[note]]`', '    ![[note]]', '````\n```\n![[note]]\n```\n````', '\\![[note]]']) {
  test(`preview: no embed resolution inside protected text ${JSON.stringify(src)}`, async () => {
    const calls: string[] = [];
    const html = await renderMarkdown(src, { rawUrl, resolveEmbed: async target => {
      calls.push(target);
      return { path: 'note.md', content: '# Secret fixture' };
    } });
    assert.deepEqual(calls, []);
    assert.doesNotMatch(html, /Secret fixture|embed-note/);
  });
}

test('preview: attachment path is retained and decoded once', async () => {
  const paths: string[] = [];
  await renderMarkdown(cases.attachmentPath, { rawUrl: p => { paths.push(p); return rawUrl(p); } });
  assert.deepEqual(paths, ['folder/sub/image one.png']);
});

test('preview: nested protected escapes survive math and link labels', async () => {
  const math = await renderMarkdown('$\\{x\\}$', { rawUrl });
  assert.match(math, /data-tex="\\\{x\\\}"/);
  assert.doesNotMatch(math, /[\uE000\uE001]/);
  const link = await renderMarkdown('[[note|label \\*]]', { rawUrl });
  assert.doesNotMatch(link, /[\uE000\uE001]/);
});

for (const source of ['<div><LS_BEN>-FIELD</div>', '<u><LS_BEN>-FIELD</u>']) {
  test(`preview: literal angle identifiers survive surrounding HTML ${source}`, async () => {
    const html = await renderMarkdown(source, { rawUrl });
    assert.match(html, /(?:&#x3C;|&lt;)LS_BEN/);
    assert.doesNotMatch(html, /<ls_ben/i);
  });
}

test('preview: heading embed includes its subsections but not the next sibling', async () => {
  const html = await renderMarkdown(cases.headingEmbed, { rawUrl, resolveEmbed: async () => ({
    path: 'folder/note.md', content: '# Before\nbefore\n# Section\nselected\n## Child\nchild\n# Other\nother',
  }) });
  assert.match(html, /selected/);
  assert.match(html, /child/);
  assert.doesNotMatch(html, /before|other/i);
});

test('preview: a missing fragment never falls back to the entire note', async () => {
  const html = await renderMarkdown('![[note#Missing]]', { rawUrl, resolveEmbed: async () => ({
    path: 'note.md', content: '# Unrelated\nprivate fixture',
  }) });
  assert.doesNotMatch(html, /private fixture/);
  assert.match(html, /Missing/);
});

test('preview: nested images use the embedded note as their source', async () => {
  const paths: unknown[] = [];
  const html = await renderMarkdown('![[note]]', {
    rawUrl: (p, from) => { paths.push([p, from]); return '/fixture.png'; },
    resolveEmbed: async () => ({ path: 'folder/note.md', content: '![x](attachments/image.png)' }),
  });
  assert.deepEqual(paths, [['attachments/image.png', 'folder/note.md']]);
  assert.match(html, /<img /);
});

test('preview: an embed cannot consume Markdown on the next line', async () => {
  const html = await renderMarkdown('![[note]]\n[[other]]\n\n**bold**', {
    rawUrl, resolveEmbed: async () => ({ path: 'note.md', content: 'content' }),
  });
  assert.match(html, /data-wikilink="other"/);
  assert.match(html, /<strong>bold<\/strong>/);
});

for (const [kind, source] of [['image', '![x](foo\\_bar.png)'], ['wiki image', '![[foo\\_bar.png]]']]) {
  test(`preview: ${kind} callback receives a file target, not a protection token`, async () => {
    const targets: string[] = [];
    await renderMarkdown(source, { rawUrl: p => { targets.push(p); return rawUrl(p); } });
    assert.deepEqual(targets, [kind==='image'?'foo_bar.png':'foo\\_bar.png']);
  });
}

test('preview: embed resolver receives original escaped target', async () => {
  const targets: string[] = [];
  await renderMarkdown('![[foo\\_bar]]', { rawUrl, resolveEmbed: async p => { targets.push(p); return null; } });
  assert.deepEqual(targets, ['foo\\_bar']);
});

test('public: hidden comments cannot become the description or image preview', () => {
  const source = 'Visible %%secret ![[hidden.png]]%% text\n\n`![[example.png]]`\n\n![[visible.png]]';
  assert.doesNotMatch(metaDescription(source), /secret|hidden/);
  assert.deepEqual(firstImage(source), { vault: 'visible.png' });
});

test('public: image metadata restores protected target characters', () => {
  assert.deepEqual(firstImage('![[foo\\_bar.png]]'), { vault: 'foo\\_bar.png' });
  assert.deepEqual(firstImage('![x](https://example.test/foo\\_bar.png)'), {
    url: 'https://example.test/foo\\_bar.png',
  });
});

for (const [name, render] of [
  ['preview', (src: string) => renderMarkdown(src, { rawUrl })],
  ['public', (src: string) => renderNoteHtml(src, rawUrl)],
] as const) {
  test(`${name}: Obsidian highlight and custom tasks`, async () => {
    const html = await render('==marked==\n\n- [/] partial');
    assert.match(html, /<mark>marked<\/mark>/);
    assert.match(html, /data-task="\/"/);
    assert.match(html, /type="checkbox"/);
  });
  test(`${name}: nested callouts preserve formatted titles and folding`, async () => {
    const html = await render('> [!note]- **Title**\n> Body\n>\n> > [!tip] Child\n> > Nested');
    assert.match(html, /data-callout-fold="-"/);
    assert.match(html, /<strong>Title<\/strong>/);
    assert.match(html, /data-callout="tip"/);
    assert.doesNotMatch(html, /\[!tip\]|\*\*Title\*\*/);
    assert.match(html, /Nested/);
  });
  test(`${name}: inline and named footnotes share reference numbering`, async () => {
    const html = await render('Inline ^[Inline **note**]. Named [^named].\n\n[^named]: Named note.');
    assert.doesNotMatch(html, /\^\[Inline/);
    assert.match(html, /data-footnote-ref/g);
    assert.match(html, /<strong>note<\/strong>/);
    assert.match(html, /data-footnotes/);
    assert.equal((html.match(/data-footnote-ref/g) ?? []).length, 2);
    assert.match(html, />\[1\]<\/a>/);
  });
  test(`${name}: safe spaced color style survives but executable HTML does not`, async () => {
    const html = await render('<span style="color: #ff0000" onclick="alert(1)">red</span><script>bad()</script>');
    assert.match(html, /style="color: #ff0000"/);
    assert.doesNotMatch(html, /onclick|<script/);
  });
  test(`${name}: default soft line break matches Obsidian reading`, async () => {
    assert.match(await render('first\nsecond'), /first<br>\nsecond/);
  });
}

test('preview: paragraph and list block embeds select only the requested block', async () => {
  const content = 'Before.\n\nSelected **paragraph**. ^para\n\n- First\n- Second\n\n^list\n\nAfter.';
  const opts = { rawUrl, resolveEmbed: async () => ({ path: 'Target.md', content }) };
  const paragraph = await renderMarkdown('![[Target#^para]]', opts);
  assert.match(paragraph, /Selected <strong>paragraph<\/strong>/);
  assert.doesNotMatch(paragraph, /Before|After|First|\^para<\/p>/);
  const list = await renderMarkdown('![[Target#^list]]', opts);
  assert.match(list, /<li>First<\/li>/);
  assert.match(list, /<li>Second<\/li>/);
  assert.doesNotMatch(list, /Before|After|Selected/);
});

test('preview: strict line breaks retain hard breaks but suppress soft breaks', async () => {
  const html = await renderMarkdown('first\nsecond  \nthird', { rawUrl, strictLineBreaks: true });
  assert.match(html, /first\nsecond<br>\nthird/);
});

test('preview: nested embed resolution receives the embedded source path', async () => {
  const calls: unknown[] = [];
  await renderMarkdown('![[child]]', { rawUrl, sourcePath: 'folder/root.md', resolveEmbed: async (target, from) => {
    calls.push([target, from]);
    return target === 'child' ? { path: 'folder/child.md', content: '![[next]]' } : null;
  } });
  assert.deepEqual(calls, [['child', 'folder/root.md'], ['next', 'folder/child.md']]);
});

test('preview: complex frontmatter values are preserved visibly', async () => {
  const html = await renderMarkdown('---\nsummary: |\n  line one\n  line two\noptions:\n  nested: value\n---\n\nBody', { rawUrl });
  assert.match(html, /line one/);
  assert.match(html, /nested: value/);
});

test('properties: nested sequences never enter the lossy simple editor', () => {
  for (const yaml of ['title: Original\nitems:\n  - [a, b]', 'items: [[a, b], [c, d]]', 'items:\n  - - a\n    - b']) {
    assert.equal(editableFrontmatter(yaml), false, yaml);
  }
  assert.equal(editableFrontmatter('title: Keep\ntags: [a, b]'), true);
});

for (const [name, render] of [
  ['preview', (src: string) => renderMarkdown(src, { rawUrl })],
  ['public', (src: string) => renderNoteHtml(src, rawUrl)],
] as const) {
  test(`${name}: footnote references and backlinks point to existing IDs`, async () => {
    const html = await render('Note [^a]. Again [^a].\n\n[^a]: text');
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
    for (const match of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.has(match[1]), `missing target ${match[1]}`);
  });
}

test('preview: nested footnotes are rendered once and use distinct IDs', async () => {
  const html = await renderMarkdown('Parent [^x].\n\n[^x]: parent\n\n![[child]]\n\n![[child]]', {
    rawUrl, resolveEmbed: async () => ({ path: 'child.md', content: 'Child [^x].\n\n[^x]: child' }),
  });
  assert.doesNotMatch(html, /\[\[1\]\]/);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'separate embeds must not share IDs');
  for (const match of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(match[1]));
});

test('public: angle-wrapped image targets retain their actual filename', async () => {
  const targets: string[] = [];
  await renderNoteHtml('![x](<folder/my image.png>)', p => { targets.push(p); return rawUrl(p); });
  assert.deepEqual(targets, ['folder/my image.png']);
});

test('preview: fragment embeds omit the extra filename title like Obsidian', async () => {
  const html = await renderMarkdown('![[Target#Section]]', {
    rawUrl, resolveEmbed: async () => ({ path: 'Target.md', content: '# Section\nSelected' }),
  });
  assert.doesNotMatch(html, /class="embed-title"/);
});

test('preview: compound heading paths select the child under the named parent', async () => {
  const content = '# Other\n## Child\nwrong\n# Section\n## Child\nselected\n### Grandchild\nkept\n## Next\nexcluded';
  const html = await renderMarkdown('![[Target#Section#Child]]', { rawUrl, resolveEmbed: async () => ({ path: 'Target.md', content }) });
  assert.match(html, /selected/);
  assert.match(html, /kept/);
  assert.doesNotMatch(html, /wrong|excluded|could not/);
});

test('preview: recursive embeds stop at the six-level limit observed in Obsidian', async () => {
  let calls = 0;
  const html = await renderMarkdown('![[Cycle]]', { rawUrl, resolveEmbed: async () => {
    calls++; return { path: 'Cycle.md', content: '# Cycle\n\n![[Cycle]]' };
  } });
  assert.equal(calls, 6);
  assert.equal((html.match(/class="embed-note"/g) ?? []).length, 6);
  assert.match(html, /data-wikilink="Cycle"/);
});
