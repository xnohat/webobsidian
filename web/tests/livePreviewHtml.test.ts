import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { build } from 'esbuild';

// Exercise the actual CodeMirror decorations and widget DOM in Chromium. Node
// has no DOM, and a parser-only test would miss both Live Preview replacements.
interface Result {
  text: string;
  source: string;
  focusedText: string;
  restoredText: string;
  html: string;
  initialSource: string;
  changes: number;
  bodyColor: string;
  tagColor: string | null;
  openedLinks: string[];
}
let results: Record<string, Result>;
let matrix: Record<string, Result>;
let edits: Record<string, { changed: string; undone: string }>;
let modeResult: { source: string; live: string; reading: string; sameEditor: boolean; unchanged: boolean; readonly: boolean };
let publicResult: { initiallyCollapsed: boolean; clickOpened: boolean; keyboardClosed: boolean; content: string; styles: Record<string, string> };
const require = createRequire(import.meta.url);
const cases: Record<string, string> = JSON.parse(readFileSync(new URL('../../tests/fixtures/rendering/cases.json', import.meta.url), 'utf8'));
const fixtures = {
  inline: 'Начало\n\n<LS_BEN>-IS_BENEFIT1_APPROVE-IS_ASSIGNMENT_PARAMS\nIS_PERIOD\nFLAG_ACT',
  standalone: 'Начало\n\n<LS_BEN>\n\nКонец',
  indented: 'Начало\n\n  <LS_BEN>\n\nКонец',
  closing: 'Начало\n\n</LS_BEN>\n\nКонец',
  quote: 'Начало\n\n> <LS_BEN>\n\nКонец',
  list: 'Начало\n\n- <LS_BEN>\n\nКонец',
  mixed: cases.mixedHtml,
  middle: cases.middleHtml,
  escaped: 'Начало\n\n\\[[note]]',
  tableCode: cases.tableInCode,
  table: 'Начало\n\n| a | b |\n| --- | --- |\n| x | y |',
  quotedTable: 'Начало\n\n> | Quoted | Values |\n> | --- | --- |\n> | ==marked== | *italic* |',
  listedTable: 'Начало\n\n- | List | Values |\n  | --- | --- |\n  | ~~struck~~ | [[Target\\|alias]] |',
  emptyTable: 'Начало\n\n| | second |\n| --- | --- |\n| | retained |',
  escapedPipeTable: 'Начало\n\n| a | b |\n| --- | --- |\n| x' + '\\'.repeat(3) + '|y | keep |',
  tableFormat: 'Начало\n\n| Format | Value |\n| --- | --- |\n| ==marked== | ~~struck~~ |\n| **bold _italic_** | [[Target\\|alias]] |\n| escaped \\| pipe | `a\\|b` |',
  footnotes: 'Начало\n\nInline ^[Inline **note**]. Named [^named].\n\n[^named]: Named note.',
  complexYaml: '---\ntitle: Keep\nsummary: |\n  line one\n  line two\noptions:\n  nested: value\n---\n\nBody',
  nestedCallout: 'Начало\n\n> [!note]+ Outer\n> Text\n>\n> > [!warning] Nested\n> > Body',
  nestedFold: 'Начало\n\n> [!note]+ Outer\n> Text\n>\n> > [!warning]- Nested\n> > Hidden body\n>\n> Visible tail',
  calloutCode: 'Начало\n\n```md\n> [!note]- example\n> Literal body\n```',
  fragmentEmbed: 'Начало\n\n![[Target#Section]]',
  comments: cases.comments,
  tableComment: 'Начало\n\n| a | b |\n| --- | --- |\n| x %%secret%% | y |',
  inlineComment: 'Начало\n\nprefix <span>before %%secret%% after</span> suffix',
  tableBoundary: 'Начало\n\n| a | b |\n| --- | --- |\n| x | y |\n```pipe|lang\ncode\n```',
  html: 'Начало\n\n<u data-name="LS_BEN">Подчёркнуто</u>\n\n<div><strong>HTML</strong></div>',
  code: 'Начало\n\n`<LS_BEN>`\n\n```text\n<LS_BEN>\n```',
  contract: 'Начало\n\n' + readFileSync(new URL('../../tests/fixtures/rendering/Contract.md', import.meta.url), 'utf8'),
  contractGaps: 'Начало\n\n`\nIS_PERIOD-BEGIN\nIS_PERIOD-END\n\n<LS_BEN>-FIELD\nIS_PERIOD\nFLAG_ACT\n\nIS_GPH_CONTRACT`',
  propertyBacktick: '---\ntitle: "`"\n---\n\n# Heading\n\n`code`',
  commentBacktick: 'Начало\n\n%% a ` comment %%\n\n# Heading\n\n`code`',
  attributeBacktick: 'Начало\n\n<span title="`">HTML</span>\n\n# Heading\n\n`code`',
  formattedLinks: 'Начало\n\n[**AIDA64**](https://4pda.to/stat/go?u=https%3A%2F%2Fwww.aida64.com%2Fdownloads&e=123099703 "Ссылка") - Утилита\n\n[*HWiNFO*](https://example.com/info "Ссылка") - Датчики\n\n[`VLC`](https://example.com/vlc) - видеоплеер',
  nestedLinkTarget: 'Начало\n\n[**Article**](https://example.com/a_(b) "Title") - description',
  inlineLinkLabels: 'Начало\n\n[1. Overview](https://example.com/overview)\n\n[---](https://example.com/rule)\n\n[# Heading](https://example.com/heading)\n\n[https://label.example](https://target.example)',
};

before(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'webobsidian-live-html-'));
  try {
    await build({
      stdin: {
        resolveDir: fileURLToPath(new URL('..', import.meta.url)),
        contents: `
          import { EditorState } from '@codemirror/state';
          import { EditorView } from '@codemirror/view';
          import { history, undo } from '@codemirror/commands';
          import React from 'react';
          import { createRoot } from 'react-dom/client';
          import Editor from './src/components/Editor';
          import { useStore } from './src/lib/store';
          import { api } from './src/lib/api';
          import { getActiveEditor } from './src/lib/activeEditor';
          import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
          import { syntaxHighlighting } from '@codemirror/language';
          import { obsidianHighlightStyle, literalAngleColors } from './src/lib/highlight';
          import { renderNoteHtml } from '../server/src/services/renderhtml';
          import { publicMarkdownScript } from '../server/src/services/publicMarkdown';
          import { livePreviewState, livePreviewReadonly, setLivePreviewEnabled,
            setLivePreviewReadonly, htmlBlockField, tableField, frontmatterField, calloutFoldState, calloutFoldDeco, livePreviewTheme, livePreviewPlugin } from './src/lib/livePreview';
          window.runFixture = (source, readonly, sourceMode = false) => {
            let changes = 0;
            const host = document.createElement('div');
            host.className = 'cm-host markdown-source-view cm-s-obsidian mod-cm6 is-readable-line-width';
            document.body.append(host);
            const view = new EditorView({ parent: host, state: EditorState.create({
              doc: source, extensions: [markdown({ base: markdownLanguage }), syntaxHighlighting(obsidianHighlightStyle), literalAngleColors, livePreviewState, livePreviewReadonly,
                htmlBlockField, tableField, frontmatterField, calloutFoldState, calloutFoldDeco, livePreviewTheme, livePreviewPlugin, EditorView.lineWrapping,
                EditorView.updateListener.of(update => { if (update.docChanged) changes++; })]
            }) });
            const initialSource = view.state.doc.toString();
            view.dispatch({ effects: [setLivePreviewEnabled.of(!sourceMode), setLivePreviewReadonly.of(readonly)] });
            const text = view.contentDOM.textContent;
            const html = view.contentDOM.innerHTML;
            const openedLinks = [];
            const originalOpen = window.open;
            try {
              window.open = url => { openedLinks.push(url); return null; };
              for (const anchor of view.contentDOM.querySelectorAll('.cm-md-link.external-link')) {
                (anchor.querySelector('a') ?? anchor).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));(anchor.querySelector('a') ?? anchor).click();
              }
            } finally { window.open = originalOpen; }
            view.dispatch({ selection: { anchor: source.includes('AIDA64') ? source.indexOf('AIDA64') : source.indexOf('<') + 1 } });
            const focusedText = view.contentDOM.textContent;
            view.dispatch({ selection: { anchor: 0 } });
            const result = { text, html, focusedText, restoredText: view.contentDOM.textContent,
              source: view.state.doc.toString(), initialSource, changes, openedLinks,
              bodyColor: getComputedStyle(view.contentDOM).color,
              tagColor: (() => { const el = [...view.contentDOM.querySelectorAll('span')].find(el => el.textContent === 'LS_BEN'); return el ? getComputedStyle(el).color : null; })() };
            view.destroy();
            host.remove();
            return result;
          };
          window.runPublicFixture = async () => {
            const host = document.createElement('div');
            host.className = 'markdown-preview';
            host.innerHTML = await renderNoteHtml('> [!note]- **Title**\\n> Body remains available.', p => p);
            host.innerHTML += await renderNoteHtml('# Measured heading\\n\\nMeasured paragraph\\n\\n| Header |\\n| --- |\\n| Cell |', p => p);
            document.body.append(host);
            const script = document.createElement('script');
            script.textContent = publicMarkdownScript('fixture').replace(/^<script[^>]*>/, '').replace(/<\\/script>$/, '');
            document.body.append(script);
            const callout = host.querySelector('.callout');
            const title = host.querySelector('.callout-title');
            const initiallyCollapsed = callout.classList.contains('is-collapsed');
            title.click();
            const clickOpened = !callout.classList.contains('is-collapsed') && title.getAttribute('aria-expanded') === 'true';
            title.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            const keyboardClosed = callout.classList.contains('is-collapsed');
            const heading = getComputedStyle(host.querySelector('h1'));
            const paragraph = getComputedStyle(host.querySelector(':scope > p'));
            const header = getComputedStyle(host.querySelector('th'));
            return { initiallyCollapsed, clickOpened, keyboardClosed, content: host.textContent,
              styles: { headingLineHeight: heading.lineHeight, paragraphMargin: paragraph.margin,
                headerPadding: header.padding, headerLineHeight: header.lineHeight } };
          };
          window.editTableFixture = (source, column = 0) => {
            const host = document.createElement('div'); document.body.append(host);
            const view = new EditorView({ parent: host, state: EditorState.create({ doc: source,
              extensions: [markdown({base:markdownLanguage}), history(), livePreviewState, livePreviewReadonly, tableField] }) });
            const cell = view.dom.querySelectorAll('tbody td')[column];
            if (!cell) throw Error('missing editable table');
            cell.dispatchEvent(new FocusEvent('focus'));
            cell.textContent = 'changed | value';
            cell.dispatchEvent(new FocusEvent('blur'));
            const changed = view.state.doc.toString();
            undo(view);
            const undone = view.state.doc.toString();
            view.destroy(); host.remove();
            return {changed,undone};
          };
          window.runEditorModes = async () => {
            const wait = () => new Promise(resolve => setTimeout(resolve, 80));
            api.tags = async () => ({tags:[]}); api.properties = async () => ({properties:[]});
            api.propertyTypes = async () => ({types:{}});
            const content = 'Start\\n\\n**bold** and _italic_ and ==marked==\\n\\n<LS_BEN>-FIELD';
            useStore.setState({activePath:'fixture.md',content,viewMode:'source',locked:false,showInlineTitle:false,save:async()=>{}});
            const host=document.createElement('div');document.body.append(host);
            const root=createRoot(host);root.render(React.createElement(Editor));await wait();
            const editor=getActiveEditor();if(!editor)throw Error('Editor did not mount');
            const source=editor.contentDOM.textContent;
            useStore.getState().setViewMode('live');await wait();
            const live=editor.contentDOM.textContent;
            useStore.getState().setViewMode('reading');await wait();
            const reading=editor.contentDOM.textContent;
            const result={source,live,reading,sameEditor:editor===getActiveEditor(),
              unchanged:editor.state.doc.toString()===content && useStore.getState().content===content,readonly:editor.state.readOnly};
            root.unmount();host.remove();return result;
          };
        `,
      },
      bundle: true,
      format: 'iife',
      platform: 'browser',
      loader: { '.css': 'empty' },
      define: { 'import.meta.env.DEV': 'false' },
      outfile: join(dir, 'fixture.js'),
      logLevel: 'silent',
    });
    await writeFile(join(dir, 'app.css'), readFileSync(new URL('../src/styles/obsidian.css', import.meta.url), 'utf8'));
    await writeFile(join(dir, 'index.html'), '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="app.css"><body class="theme-dark"><script src="fixture.js"></script>');
    // Electron is built in to its own runtime; the runner needs no Node modules.
    await writeFile(join(dir, 'runner.cjs'), `
      const { app, BrowserWindow } = require('electron');
      app.whenReady().then(async () => {
        const win = new BrowserWindow({ show: false, width: 1200, height: 1000,
          webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
        await win.loadFile(${JSON.stringify(join(dir, 'index.html'))});
        win.webContents.debugger.attach('1.3');
        const viewport=async(width,height)=>{
          win.setSize(width,height);
          await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',
            {width,height,deviceScaleFactor:1,mobile:false});
          const actual=await win.webContents.executeJavaScript('[innerWidth,innerHeight]');
          if(actual[0]!==width || actual[1]!==height)throw Error('Viewport mismatch '+JSON.stringify(actual));
        };
        await viewport(1200,1000);
        const fixtures = ${JSON.stringify(fixtures)};
        const results = {};
        for (const [name, source] of Object.entries(fixtures)) {
          for (const readonly of [false, true]) {
            results[name + (readonly ? ':reading' : ':live')] = await win.webContents.executeJavaScript(
              'window.runFixture(' + JSON.stringify(source) + ',' + readonly + ')');
          }
        }
        console.log('FIXTURE_RESULTS:' + JSON.stringify(results));
        console.log('PUBLIC_RESULT:' + JSON.stringify(await win.webContents.executeJavaScript('window.runPublicFixture()')));
        const matrix = {};
        for (const width of [390, 1200]) {
          await viewport(width, 1000);
          for (const theme of ['theme-light', 'theme-dark']) {
            await win.webContents.executeJavaScript('document.body.className = ' + JSON.stringify(theme));
            for (const ending of ['lf', 'crlf']) {
              const source = ending === 'lf' ? fixtures.inline : fixtures.inline.replace(/\\n/g, '\\r\\n');
              for (const mode of ['source', 'live', 'reading']) {
                matrix[[width,theme,ending,mode].join(':')] = await win.webContents.executeJavaScript(
                  'window.runFixture(' + JSON.stringify(source) + ',' + (mode === 'reading') + ',' + (mode === 'source') + ')');
              }
            }
          }
        }
        console.log('MATRIX_RESULT:' + JSON.stringify(matrix));
        const edits = {};
        for (const name of ['quotedTable','listedTable']) edits[name] = await win.webContents.executeJavaScript('window.editTableFixture(' + JSON.stringify(fixtures[name]) + ')');
        edits.escapedPipeTable = await win.webContents.executeJavaScript('window.editTableFixture(' + JSON.stringify(fixtures.escapedPipeTable) + ',1)');
        console.log('EDIT_RESULT:' + JSON.stringify(edits));
        console.log('MODE_RESULT:' + JSON.stringify(await win.webContents.executeJavaScript('window.runEditorModes()')));
        win.destroy();
        app.quit();
      }).catch(error => { console.error(error); app.exit(1); });
    `);
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const args = [...(process.platform === 'linux' ? ['--ozone-platform=headless'] : []), join(dir, 'runner.cjs')];
    const { stdout } = await promisify(execFile)(require('electron'), args, {
      env, timeout: 60_000, windowsHide: true, maxBuffer: 1024 * 1024,
    });
    const line = stdout.split(/\r?\n/).find(line => line.startsWith('FIXTURE_RESULTS:'));
    assert.ok(line, 'the hidden renderer must return fixture results');
    results = JSON.parse(line.slice('FIXTURE_RESULTS:'.length));
    publicResult = JSON.parse(stdout.split(/\r?\n/).find(line => line.startsWith('PUBLIC_RESULT:'))!.slice('PUBLIC_RESULT:'.length));
    matrix = JSON.parse(stdout.split(/\r?\n/).find(line => line.startsWith('MATRIX_RESULT:'))!.slice('MATRIX_RESULT:'.length));
    edits = JSON.parse(stdout.split(/\r?\n/).find(line => line.startsWith('EDIT_RESULT:'))!.slice('EDIT_RESULT:'.length));
    modeResult = JSON.parse(stdout.split(/\r?\n/).find(line => line.startsWith('MODE_RESULT:'))!.slice('MODE_RESULT:'.length));
  } finally {
    assert.ok(dir.startsWith(join(tmpdir(), 'webobsidian-live-html-')));
    await rm(dir, { recursive: true, force: true });
  }
});

test('public: folded callouts open by mouse and keyboard without dropping their content', () => {
  assert.equal(publicResult.initiallyCollapsed, true);
  assert.equal(publicResult.clickOpened, true);
  assert.equal(publicResult.keyboardClosed, true);
  assert.match(publicResult.content, /Body remains available/);
});

test('real Editor switches Source to Live and Reading without changing note text', () => {
  assert.match(modeResult.source, /\*\*bold\*\*/);
  assert.doesNotMatch(modeResult.live, /\*\*bold\*\*|==marked==/);
  assert.doesNotMatch(modeResult.reading, /\*\*bold\*\*|==marked==/);
  assert.match(modeResult.live, /<LS_BEN>-FIELD/);
  assert.equal(modeResult.sameEditor, true);
  assert.equal(modeResult.unchanged, true);
  assert.equal(modeResult.readonly, true);
});

test('preview typography matches measured Obsidian paragraph, H1 and table styles', () => {
  const original = JSON.parse(readFileSync(new URL('../../tests/fixtures/rendering/obsidian-structures-styles.json', import.meta.url), 'utf8'));
  assert.equal(publicResult.styles.headingLineHeight, original['.markdown-preview-view h1'].lineHeight);
  assert.equal(publicResult.styles.paragraphMargin, original['.markdown-preview-view p'].margin);
  assert.equal(publicResult.styles.headerPadding, original['.markdown-preview-view th'].padding);
  assert.equal(publicResult.styles.headerLineHeight, original['.markdown-preview-view th'].lineHeight);
});

test('source/live/reading: themes, widths and line endings preserve literal text without edit transactions', () => {
  assert.equal(Object.keys(matrix).length, 24);
  for (const [context, result] of Object.entries(matrix)) {
    assert.ok(result.text.includes('<LS_BEN>-IS_BENEFIT1_APPROVE-IS_ASSIGNMENT_PARAMS'), context);
    assert.equal(result.source, result.initialSource, context);
    assert.equal(result.changes, 0, context);
    assert.ok(result.tagColor, `missing highlighted identifier: ${context}`);
    assert.equal(result.tagColor, result.bodyColor, context);
  }
});

test('table edit and undo preserve quote/list prefixes and escape pasted pipes', () => {
  for (const name of ['quotedTable','listedTable'] as const) {
    assert.equal(edits[name].undone, fixtures[name]);
    assert.ok(edits[name].changed.includes('changed \\| value'), edits[name].changed);
    const tableLines = edits[name].changed.split('\n').slice(2);
    if (name === 'quotedTable') assert.ok(tableLines.every(line => line.startsWith('> |')));
    else {
      assert.ok(tableLines[0].startsWith('- |'));
      assert.ok(tableLines.slice(1).every(line => line.startsWith('  |')));
    }
  }
  assert.ok(edits.escapedPipeTable.changed.includes('x' + '\\'.repeat(3) + '|y'), edits.escapedPipeTable.changed);
  assert.equal(edits.escapedPipeTable.undone, fixtures.escapedPipeTable);
});

for (const mode of ['live', 'reading']) {
  test(`${mode}: link labels stay inline and clicking a URL label opens only its destination`, () => {
    const result = results[`inlineLinkLabels:${mode}`];
    assert.match(result.text, /1\. Overview/);
    assert.match(result.text, /---/);
    assert.match(result.text, /# Heading/);
    assert.match(result.text, /https:\/\/label\.example/);
    assert.doesNotMatch(result.html, /<(?:ol|ul|hr|h[1-6])\b/);
    assert.equal((result.html.match(/<a\b/g) ?? []).length, 4);
    assert.deepEqual(result.openedLinks, ['https://example.com/overview', 'https://example.com/rule', 'https://example.com/heading', 'https://target.example']);
    assert.equal(result.source, fixtures.inlineLinkLabels);
  });
  test(`${mode}: formatted link labels conceal the URL and title and keep the external icon`, () => {
    const result = results[`formattedLinks:${mode}`];
    assert.equal((result.html.match(/class="cm-md-link external-link"/g) ?? []).length, 3);
    assert.equal((result.html.match(/class="cm-external-icon"/g) ?? []).length, 3);
    assert.match(result.html, /<strong>AIDA64<\/strong>/);
    assert.match(result.html, /<em>HWiNFO<\/em>/);
    assert.match(result.html, /<code[^>]*>VLC<\/code>/);
    assert.doesNotMatch(result.text, /https:|Ссылка|\*\*|\]\(/);
    assert.match(result.text, /AIDA64 - Утилита/);
    assert.match(result.html, /title="https:\/\/4pda\.to\/stat\/go\?u=https%3A%2F%2Fwww\.aida64\.com%2Fdownloads&amp;e=123099703"/);
    if (mode === 'live') assert.match(result.focusedText, /\[\*\*AIDA64\*\*\]\(https:/);
    else assert.doesNotMatch(result.focusedText, /https:|Ссылка/);
    assert.equal(result.restoredText, result.text);
    assert.equal(result.source, fixtures.formattedLinks);
    assert.equal(result.changes, 0);
  });
  test(`${mode}: formatted link with parentheses in the destination is replaced completely`, () => {
    const result = results[`nestedLinkTarget:${mode}`];
    assert.match(result.html, /title="https:\/\/example\.com\/a_\(b\)"/);
    assert.match(result.text, /Article - description/);
    assert.doesNotMatch(result.text, /https:|Title|\*\*|\]\(/);
    assert.equal(result.source, fixtures.nestedLinkTarget);
  });
  test(`${mode}: backticks in properties/comments/HTML do not consume later Markdown`, () => {
    for (const name of ['propertyBacktick','commentBacktick','attributeBacktick'] as const) {
      const result=results[`${name}:${mode}`];
      assert.match(result.html, /HyperMD-header-1/);
      assert.match(result.html, /class="cm-inline-code cm-code"/);
      assert.equal(result.source, fixtures[name]);
    }
  });
  if (mode === 'live') test('live: multiline backticks conceal delimiters and preserve plain body lines like Obsidian', () => {
    for (const name of ['contract', 'contractGaps'] as const) {
      const result=results[`${name}:live`];
      assert.doesNotMatch(result.text, /`/);
      assert.doesNotMatch(result.html, /class="cm-inline-code cm-code"/);
      assert.match(result.text, /<LS_BEN>/);
      // CodeMirror normalizes line endings when creating its initial document.
      // Compare before/after editor state even when Git checked out the fixture as CRLF.
      assert.equal(result.source, result.initialSource);
    }
  });
  for (const name of ['inline', 'standalone', 'indented', 'closing', 'quote', 'list', 'code', 'mixed'] as const) {
    test(`${mode}: ${name} angle-bracket text stays visible without changing the note`, () => {
      const result = results[`${name}:${mode}`];
      const token = name === 'closing' ? '</LS_BEN>' : '<LS_BEN>';
      assert.ok(result.text.includes(token), `missing ${token}: ${result.text}`);
      assert.ok(result.focusedText.includes(token));
      assert.ok(result.restoredText.includes(token), 'moving the caret away must keep the token visible');
      assert.equal(result.source, fixtures[name]);
    });
  }
  test(`${mode}: inline HTML renders in the middle of text`, () => {
    const result = results[`middle:${mode}`];
    assert.match(result.html, /<u(?:\s[^>]*)?>x<\/u>/);
    assert.ok(result.text.includes('prefix x suffix'));
    assert.equal(result.source, fixtures.middle);
  });
  test(`${mode}: escaped wikilink stays literal`, () => {
    const result = results[`escaped:${mode}`];
    assert.ok(result.text.includes('[[note]]'));
    assert.doesNotMatch(result.html, /<a\b/);
    assert.equal(result.source, fixtures.escaped);
  });
  test(`${mode}: code cannot become an editable table`, () => {
    const result = results[`tableCode:${mode}`];
    assert.doesNotMatch(result.html, /<table\b/);
    assert.ok(result.text.includes('| a | b |'));
    assert.equal(result.source, fixtures.tableCode);
    assert.match(results[`table:${mode}`].html, /<table\b/);
  });
  test(`${mode}: table cells render nested formatting like Obsidian`, () => {
    const result = results[`tableFormat:${mode}`];
    assert.match(result.html, /<mark>marked<\/mark>/);
    assert.match(result.html, /<del>struck<\/del>/);
    assert.match(result.html, /<strong>bold <em>italic<\/em><\/strong>/);
    assert.match(result.text, /alias/);
    assert.match(result.text, /escaped \| pipe/);
    assert.ok(result.text.includes('a\\|b'), 'Obsidian retains the escape inside a table code span');
    assert.equal(result.source, fixtures.tableFormat);
  });
  test(`${mode}: quoted and listed tables retain their container and source`, () => {
    for (const name of ['quotedTable', 'listedTable'] as const) {
      const result = results[`${name}:${mode}`];
      assert.match(result.html, /<table\b/);
      assert.equal(result.source, fixtures[name]);
      assert.equal(result.changes, 0);
      assert.doesNotMatch(result.text, /==marked==|~~struck~~/);
    }
  });
  test(`${mode}: empty table columns preserve their positions`, () => {
    const result = results[`emptyTable:${mode}`];
    assert.match(result.html, /<th[^>]*data-raw=""[^>]*>/);
    assert.match(result.html, /<td[^>]*data-raw=""[^>]*>/);
    assert.match(result.text, /second.*retained/);
    assert.equal(result.source, fixtures.emptyTable);
  });
  test(`${mode}: footnotes follow the original mode semantics`, () => {
    const result = results[`footnotes:${mode}`];
    if (mode === 'reading') {
      assert.doesNotMatch(result.text, /\^\[Inline|\[\^named\]/);
      assert.match(result.html, /data-footnote-ref/);
      assert.match(result.html, /data-footnotes/);
    } else assert.match(result.text, /\^\[Inline/);
    assert.equal(result.source, fixtures.footnotes);
  });
  test(`${mode}: complex YAML remains visible without a destructive properties editor`, () => {
    const result = results[`complexYaml:${mode}`];
    assert.match(result.text, /line one/);
    assert.match(result.text, /nested: value/);
    assert.doesNotMatch(result.html, /class="cm-properties"/);
    assert.equal(result.source, fixtures.complexYaml);
  });
  test(`${mode}: nested callouts get their own title`, () => {
    const result = results[`nestedCallout:${mode}`];
    assert.doesNotMatch(result.text, /\[!warning\]/);
    assert.match(result.html, /class="cm-callout-title"[^>]*>Nested/);
    assert.equal(result.source, fixtures.nestedCallout);
  });
  test(`${mode}: fragment embed has no filename heading`, () => {
    assert.doesNotMatch(results[`fragmentEmbed:${mode}`].html, /class="markdown-embed-title"/);
  });
  test(`${mode}: nested folding hides only the nested callout`, () => {
    const result = results[`nestedFold:${mode}`];
    assert.doesNotMatch(result.text, /Hidden body/);
    assert.match(result.text, /Visible tail/);
    assert.equal(result.source, fixtures.nestedFold);
    assert.match(results[`calloutCode:${mode}`].text, /Literal body/);
  });
  test(`${mode}: comments are literal while editing and hidden while reading`, () => {
    const result = results[`comments:${mode}`];
    if (mode === 'reading') {
      assert.doesNotMatch(result.text, /secret|hidden/);
    } else {
      assert.ok(result.text.includes('secret [[note]]'));
      assert.ok(result.text.includes('| hidden | text |'));
    }
    assert.ok(result.text.includes('%%literal%%'));
    assert.doesNotMatch(result.html, /<table\b|<a\b/);
    assert.equal(result.source, fixtures.comments);
  });
  test(`${mode}: a comment inside a table does not disable the table`, () => {
    const result = results[`tableComment:${mode}`];
    assert.match(result.html, /<table\b/);
    if (mode === 'reading') assert.doesNotMatch(result.text, /secret/);
    assert.equal(result.source, fixtures.tableComment);
  });
  test(`${mode}: a comment inside inline HTML does not disable that HTML`, () => {
    const result = results[`inlineComment:${mode}`];
    assert.doesNotMatch(result.text, /<span>|<\/span>/);
    assert.match(result.text, /prefix before/);
    if (mode === 'reading') assert.doesNotMatch(result.text, /secret/);
    assert.equal(result.source, fixtures.inlineComment);
  });
  test(`${mode}: table replacement ends at the syntax tree boundary`, () => {
    const result = results[`tableBoundary:${mode}`];
    const table = result.html.match(/<table\b[\s\S]*?<\/table>/)?.[0];
    assert.ok(table);
    assert.doesNotMatch(table, /pipe|lang|```/);
    assert.equal(result.source, fixtures.tableBoundary);
  });
  test(`${mode}: ordinary inline and block HTML still renders`, () => {
    const result = results[`html:${mode}`];
    assert.match(result.html, /<u data-name="LS_BEN">Подчёркнуто<\/u>/);
    assert.match(result.html, /<strong>HTML<\/strong>/);
    assert.equal(result.source, fixtures.html);
  });
}
