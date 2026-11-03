import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { build } from 'esbuild';

test('long notes render tables after parsing on navigation and hydration without toggling modes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'webo-live-parsing-'));
  try {
    await build({
      stdin: {
        resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'tsx', contents: `
          import React from 'react';
          import { createRoot } from 'react-dom/client';
          import { flushSync } from 'react-dom';
          import { EditorView } from '@codemirror/view';
          import { forceParsing, syntaxTree } from '@codemirror/language';
          import Editor from './src/components/Editor';
          import { useStore } from './src/lib/store';
          import { api } from './src/lib/api';
          import { getActiveEditor } from './src/lib/activeEditor';
          import { tableField } from './src/lib/livePreview';
          import './src/styles/obsidian.css';
          api.tags = async () => ({ tags: [] });
          api.propertyTypes = async () => ({ types: {} });
          const wait = () => new Promise(resolve => setTimeout(resolve, 50));
          const check = (value, message) => { if (!value) throw Error(message); };
          const table = '| Device | Network |\\n| --- | --- |\\n| raspberry3 | Ethernet |';
          const source = '# Long note\\n\\n' + 'Paragraph before the table.\\n\\n'.repeat(3000) + table;
          const tableFrom = source.indexOf('| Device');
          const root = createRoot(document.querySelector('#root'));
          window.run = async () => {
            const results = [];
            for (const mode of ['live', 'reading', 'source']) {
              for (const opening of ['navigation', 'hydration']) {
                flushSync(() => useStore.setState({ activePath: 'previous.md', content: 'Previous note',
                  viewMode: mode, showInlineTitle: false, locked: false, dirty: false, save: async () => {} }));
                flushSync(() => root.render(<Editor />));
                flushSync(() => useStore.setState({ activePath: mode + '-' + opening + '.md',
                  content: opening === 'hydration' ? '' : source }));
                if (opening === 'hydration') flushSync(() => useStore.setState({ content: source }));
                const view = getActiveEditor();
                const deferred = syntaxTree(view.state).length < tableFrom;
                const selection = view.state.selection.toJSON();
                // Complete the real incremental parser deterministically, without a
                // document edit, selection change, or Source -> Live workaround.
                check(forceParsing(view, source.length, 3000), 'long note parsing completed');
                const tableWidgets = view.state.field(tableField).size;
                view.dispatch({ effects: EditorView.scrollIntoView(tableFrom, { y: 'start' }) });
                await wait(); await wait();
                const rendered = !!view.dom.querySelector('.cm-table');
                const cells = Array.from(view.dom.querySelectorAll('.cm-table th, .cm-table td'), el => el.textContent);
                check(view.state.doc.toString() === source, 'rendering preserves Markdown');
                check(JSON.stringify(view.state.selection.toJSON()) === JSON.stringify(selection), 'rendering preserves selection');
                // Capture the user's workaround too, to identify a rendering refresh bug.
                flushSync(() => useStore.setState({ viewMode: 'source' }));
                flushSync(() => useStore.setState({ viewMode: 'live' }));
                view.dispatch({ effects: EditorView.scrollIntoView(tableFrom, { y: 'start' }) });
                await wait();
                results.push({ mode, opening, deferred, tableWidgets, rendered, cells,
                  afterToggle: !!view.dom.querySelector('.cm-table') });
              }
            }
            root.unmount();
            return results;
          };
        `,
      },
      bundle: true, format: 'iife', platform: 'browser',
      loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file' },
      define: { 'import.meta.env.DEV': 'false' },
      outfile: join(dir, 'fixture.js'), logLevel: 'silent',
    });
    await writeFile(join(dir, 'index.html'), '<meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><body class="theme-dark"><div id="root" style="height:600px"></div><script src="fixture.js"></script>');
    await writeFile(join(dir, 'runner.cjs'), `
      const { app, BrowserWindow } = require('electron');
      app.setPath('userData', ${JSON.stringify(join(dir, 'profile'))});
      app.whenReady().then(async () => {
        const win = new BrowserWindow({ show: false, width: 1100, height: 800,
          webPreferences: { backgroundThrottling: false } });
        await win.loadFile(${JSON.stringify(join(dir, 'index.html'))});
        const result = await win.webContents.executeJavaScript('window.run()');
        console.log('RESULT:' + JSON.stringify(result));
        win.destroy(); app.quit();
      }).catch(error => { console.error(error); app.exit(1); });
    `);
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const { stdout } = await promisify(execFile)(createRequire(import.meta.url)('electron'),
      [...(process.platform === 'linux' ? ['--ozone-platform=headless'] : []), join(dir, 'runner.cjs')],
      { env, windowsHide: true, timeout: 60_000 });
    const line = stdout.split(/\r?\n/).find(line => line.startsWith('RESULT:'));
    assert.ok(line, 'browser returned results');
    const results = JSON.parse(line.slice('RESULT:'.length));
    for (const result of results) {
      const label = `${result.mode}/${result.opening}`;
      if (result.opening === 'navigation') assert.equal(result.deferred, true, `${label}: table starts beyond the initial parse`);
      assert.equal(result.afterToggle, true, `${label}: manual mode switch renders the table`);
      assert.equal(result.tableWidgets, result.mode === 'source' ? 0 : 1, `${label}: parsed table receives a widget`);
      assert.equal(result.rendered, result.mode !== 'source', `${label}: table refreshes after parsing`);
      if (result.mode !== 'source') assert.deepEqual(result.cells, ['Device', 'Network', 'raspberry3', 'Ethernet'], label);
    }
  } finally {
    assert.ok(dir.startsWith(join(tmpdir(), 'webo-live-parsing-')));
    await rm(dir, { recursive: true, force: true });
  }
});
