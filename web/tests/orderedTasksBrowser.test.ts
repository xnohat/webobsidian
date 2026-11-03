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

test('ordered tasks retain numbers, status, nesting and hanging text in live and reading modes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'webo-ordered-tasks-'));
  try {
    await build({
      stdin: { resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'tsx', contents: `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import Editor from './src/components/Editor';
        import { useStore } from './src/lib/store';
        import { api } from './src/lib/api';
        import { getActiveEditor } from './src/lib/activeEditor';
        import { renderMarkdown } from './src/lib/markdown';
        import './src/styles/obsidian.css';
        api.tags = async () => ({tags: []});
        api.propertyTypes = async () => ({types: {}});
        const wait = () => new Promise(r => setTimeout(r, 80));
        const check = (ok, message) => { if (!ok) throw Error(message); };
        const lines = ['# Tasks', '1. Parent', '\\t1. [?] Custom status', '\\t2. [x] Completed',
          '\\t3. [X] Completed uppercase', '2. [ ] Pending', '3.   [?] Spaced',
          '10) [ ] Wrapped ' + 'words '.repeat(40), '- [x] Bullet', ''];
        const doc = lines.join('\\n');
        const title = 'HR-685 Изменить начисление СВ по международным соглашениям';
        const root = createRoot(document.querySelector('#root'));
        window.run = async () => {
          for (const mode of ['live', 'reading', 'source']) {
            useStore.setState({activePath: mode + '/' + title + '.md', content: doc, viewMode: mode,
              showInlineTitle: true, locked: false, dirty: false, save: async () => {}});
            root.render(<Editor/>); await wait(); await wait();
            const view = getActiveEditor();
            check(view.state.doc.toString() === doc, mode + ': rendering preserves source');
            if (mode === 'source') {
              check(!view.dom.querySelector('.cm-task-checkbox'), 'source has no checkboxes');
              continue;
            }
            check(view.dom.querySelector('.cm-inline-title')?.textContent === title, 'filename title keeps original hyphen and letter case');
            const tasks = [...view.dom.querySelectorAll('.HyperMD-task-line')];
            check(tasks.length === 7, mode + ': all ordered tasks become checkboxes; found ' + tasks.length);
            check(tasks.map(el => el.dataset.task).join('') === '?xX ? x', 'statuses preserved');
            check(tasks.map(el => el.querySelector('input')?.checked).join() === 'true,true,true,false,true,false,true', 'checked states');
            check(tasks.slice(0, 6).map(el => el.querySelector('.cm-ol-marker')?.textContent).join() === '1.,2.,3.,2.,3.,10)', 'numbers retained');
            for (const [i, line] of tasks.entries()) {
              check(getComputedStyle(line).textDecorationLine.includes('line-through') === [1,2,6].includes(i), 'only x/X struck through');
              const number = line.querySelector('.cm-ol-marker');
              if (number) check(getComputedStyle(number).textDecorationLine.includes('line-through') === [1,2].includes(i), mode + ': completed task number is struck through');
              check(!/\\[[?xX ]\\]/.test(line.textContent), 'raw status hidden');
            }
            const marker = tasks[0].querySelector('.cm-ol-marker');
            const swatch = document.createElement('span'); swatch.style.color = 'var(--text-faint)'; marker.append(swatch);
            check(getComputedStyle(marker.firstElementChild || marker).color === getComputedStyle(swatch).color, 'number uses muted list color');
            swatch.remove();
            check(tasks[0].querySelector('input').getBoundingClientRect().left > tasks[3].querySelector('input').getBoundingClientRect().left + 20, 'nested tasks indented');
            const wrapped = tasks[5];
            const walker = document.createTreeWalker(wrapped, NodeFilter.SHOW_TEXT);
            let text; while (walker.nextNode()) if (walker.currentNode.textContent.includes('Wrapped')) text = walker.currentNode;
            check(text, 'wrapped task text found');
            const range = document.createRange(); range.selectNodeContents(text);
            const rects = [...range.getClientRects()].filter(r => r.width > 0);
            check(rects.length > 1, 'task wraps');
            check(Math.abs(rects[0].left - rects[1].left) < 2, 'wrapped text aligns after number and checkbox: ' + rects.map(r => r.left));
            if (mode === 'live') {
              tasks[4].querySelector('input').dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
              check(view.state.doc.toString() === doc.replace('3.   [?] Spaced', '3.   [ ] Spaced'), 'toggle changes only status after multiple spaces');
              view.dispatch({selection: {anchor: view.state.doc.line(6).from + 4}}); view.focus(); await wait();
              check(view.contentDOM.textContent.includes('2. [ ] Pending'), 'active prefix exposes editable Markdown');
            }
          }
          api.resolve=async()=>({path:'Lab/Opencode.md'});
          api.read=async()=>({content:'# Opencode\\nEmbedded note body',version:'fixture'});
          useStore.setState({activePath:'note-host.md',content:'# Host\\n\\n![[Opencode]]\\n\\nAfter note',viewMode:'live',showInlineTitle:false});
          await wait();await wait();
          check(getActiveEditor().dom.querySelector('.cm-note-embed .markdown-embed-content')?.textContent.includes('Embedded note body'),'note embed resolves Opencode content');
          let noteView=getActiveEditor();noteView.dispatch({selection:{anchor:noteView.state.doc.line(3).to}});noteView.focus();await wait();await wait();
          check(noteView.contentDOM.textContent.includes('![[Opencode]]'),'note embed source is editable');
          check(noteView.dom.querySelector('.cm-note-embed .markdown-embed-content')?.textContent.includes('Embedded note body'),'note remains embedded while cursor edits its source');
          useStore.setState({viewMode:'source'});await wait();await wait();
          check(!getActiveEditor().dom.querySelector('.cm-note-embed'),'source mode only shows Markdown');
          let opened='';
          for(const mode of ['live','reading','source']){
            useStore.setState({activePath:'yaml-embed.md',content:'# Embed\\n\\n![[my.yaml]]',viewMode:mode,showInlineTitle:false,openWikilink:async target=>{opened=target}});
            await wait();await wait();
            const view=getActiveEditor(),card=view.dom.querySelector('.file-embed.mod-generic');
            if(mode==='source'){check(!card&&view.contentDOM.textContent.includes('![[my.yaml]]'),'source keeps YAML embed syntax');continue;}
            check(card?.textContent==='my.yaml',mode+': YAML embed is a file card');
            check(card.getBoundingClientRect().width>400,'file card spans the note width');
            card.click();await wait();
            check(opened==='my.yaml','file card opens YAML target');
          }
          useStore.setState({activePath:'2026-05-04.md',content:'',viewMode:'reading',showInlineTitle:true});
          await wait(); await wait();
          check(getActiveEditor().dom.querySelector('.cm-inline-title')?.textContent==='2026-05-04','empty date note keeps hyphens in its actual heading');
          const preview = document.createElement('div'); preview.className = 'markdown-preview';
          preview.innerHTML = await renderMarkdown(doc, {rawUrl: p => p}); document.body.append(preview);
          const ordered = [...preview.querySelectorAll('ol > li.task-list-item')];
          check(ordered.length === 6, 'HTML preview renders ordered tasks');
          check(ordered.every(el => getComputedStyle(el).listStyleType === 'decimal'), 'HTML preview retains ordered task numbers');
          root.unmount(); return 'ORDERED_TASKS_PASS';
        };
      ` },
      bundle: true, format: 'iife', platform: 'browser',
      loader: {'.woff2': 'file', '.woff': 'file', '.ttf': 'file'},
      define: {'import.meta.env.DEV': 'false'}, outfile: join(dir, 'fixture.js'), logLevel: 'silent',
    });
    await writeFile(join(dir, 'index.html'), '<meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><body class="theme-dark"><div id="root" style="width:560px;height:1000px"></div><script src="fixture.js"></script>');
    await writeFile(join(dir, 'runner.cjs'), `
      const {app, BrowserWindow} = require('electron');
      app.setPath('userData', ${JSON.stringify(join(dir, 'profile'))});
      app.whenReady().then(async () => {
        const win = new BrowserWindow({show: false, width: 800, height: 1200, webPreferences: {backgroundThrottling: false}});
        await win.loadFile(${JSON.stringify(join(dir, 'index.html'))});
        console.log(await win.webContents.executeJavaScript('window.run()'));
        win.destroy(); app.quit();
      }).catch(error => {console.error(error); app.exit(1)});
    `);
    const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
    const {stdout} = await promisify(execFile)(createRequire(import.meta.url)('electron'),
      [...(process.platform === 'linux' ? ['--ozone-platform=headless'] : []), join(dir, 'runner.cjs')],
      {env, windowsHide: true, timeout: 60_000});
    assert.match(stdout, /ORDERED_TASKS_PASS/);
  } finally {
    assert.ok(dir.startsWith(join(tmpdir(), 'webo-ordered-tasks-')));
    await rm(dir, {recursive: true, force: true});
  }
});
