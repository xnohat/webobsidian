import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { build } from 'esbuild';

test('real browser: selection toolbar colors, reset, focus, Escape, undo, locks and viewport bounds', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'webobsidian-toolbar-'));
  try {
    await build({ stdin: { resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'tsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { EditorState, Compartment } from '@codemirror/state';
      import { EditorView } from '@codemirror/view';
      import { history, undo } from '@codemirror/commands';
      import { markdown } from '@codemirror/lang-markdown';
      import { selectionToolbar } from './src/lib/selectionToolbar';
      import { setActiveEditor } from './src/lib/activeEditor';
      import FormatToolbar from './src/components/FormatToolbar';
      import {api} from './src/lib/api';
      import {getDefaultToolbarConfig} from './src/lib/toolbar/config';
      const legacyConfig=getDefaultToolbarConfig();legacyConfig.appearance.overflow='scroll';api.getSettings=async()=>({ui:{editingToolbar:legacyConfig}});
      import { livePreviewState, livePreviewReadonly, setLivePreviewReadonly, htmlBlockField, livePreviewPlugin } from './src/lib/livePreview';
      import './src/styles/obsidian.css';
      const wait = () => new Promise(r => setTimeout(r, 80));
      window.runFixture = async (mobile) => {
        const results = [];
        const check = (ok, message) => { if (!ok) throw Error(message); results.push(message); };
        document.body.innerHTML = '<div class="theme-ctp-mocha"><div id="bar"></div><div id="editor" style="margin:80px 12px;width:calc(100% - 24px)"></div><button id="outside">Outside</button></div>';
        const lock = new Compartment();
        const view = new EditorView({parent: document.querySelector('#editor'), state: EditorState.create({
          doc:'hello world\\n\\nend', extensions:[markdown(), history(), selectionToolbar, lock.of([]),
            livePreviewState, livePreviewReadonly, htmlBlockField, livePreviewPlugin, EditorView.lineWrapping]
        })});
        setActiveEditor(view);
        const root = createRoot(document.querySelector('#bar'));
        root.render(<FormatToolbar mobile={mobile}/>);
        view.focus(); view.dispatch({selection:{anchor:0,head:5}}); await wait();
        const click = async (selector) => {
          const button = document.querySelector(selector);
          if (!button) throw Error('Missing control '+selector);
          const prevented = !button.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true,cancelable:true}));
          if (!prevented) button.focus();
          button.click(); await wait();
        };
        const floating = () => document.querySelector('.floating-format-toolbar');
        check(!!floating(), 'nonempty selection shows floating toolbar');
        // CodeMirror initially parks tooltips at -10000px until its asynchronous
        // measurement runs. A fixed 80ms delay races that pass on Linux/headless.
        const positionedBy = performance.now() + 2500;
        while (floating()?.style.top === '-10000px' && performance.now() < positionedBy) await wait();
        let rect = floating().getBoundingClientRect();
        check(rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
          'floating toolbar stays inside viewport: '+JSON.stringify({mobile,viewport:[innerWidth,innerHeight],rect:rect.toJSON()}));
        await click('[aria-label="Editing"]');
        check(document.querySelectorAll('.toolbar-popover [role="menuitem"]').length===5, 'editing popup has five actions');
        check(view.state.sliceDoc(view.state.selection.main.from,view.state.selection.main.to)==='hello', 'menu opening preserves selection');
        const menuRect=document.querySelector('.toolbar-popover').getBoundingClientRect();
        check(menuRect.left>=0 && menuRect.right<=innerWidth && menuRect.bottom<=innerHeight, 'editing popup stays in viewport '+JSON.stringify({mobile,viewport:[innerWidth,innerHeight],rect:menuRect.toJSON()}));
        document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await wait();
        check(!document.querySelector('.toolbar-popover'), 'Escape closes popup');
        await click('.floating-format-toolbar [aria-label="Text color"]');
        check(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)==='hello', 'opening palette preserves selection');
        rect = document.querySelector('.color-palette').getBoundingClientRect();
        check(rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight, 'palette stays inside viewport');
        check(getComputedStyle(document.querySelector('.color-palette')).backgroundColor !== 'rgba(0, 0, 0, 0)', 'palette inherits Catppuccin theme');
        await click('.color-palette [aria-label="Red"]');
        check(view.state.doc.toString().includes('color:#e03131'), 'text color applies through real controls');
        check(document.activeElement===view.contentDOM, 'applying color restores editor focus');
        await click('.floating-format-toolbar [aria-label="Text color"]');
        await click('.color-palette [aria-label="Green"]');
        check((view.state.doc.toString().match(/<span/g)||[]).length===1 && view.state.doc.toString().includes('#2f9e44'), 'recolor updates existing span');
        undo(view); await wait();
        check(view.state.doc.toString().includes('#e03131'), 'Undo restores the previous color in one action');
        await click('.floating-format-toolbar [aria-label="Highlight color"]');
        await click('.color-palette [aria-label="Yellow"]');
        check(view.state.doc.toString().includes('background-color:#ffd43b'), 'background color applies');
        await click('.floating-format-toolbar [aria-label="Text color"]');
        await click('.color-reset');
        check(!view.state.doc.toString().includes('color:#e03131') && view.state.doc.toString().includes('background-color:#ffd43b'), 'reset retains background');
        await click('.floating-format-toolbar [aria-label="Bold"]');
        check(view.state.doc.toString().includes('**hello**'), 'floating bold keeps and formats the selected text');
        view.contentDOM.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true})); await wait();
        check(!floating(), 'Escape dismisses the selection toolbar');
        view.dispatch({selection:{anchor:view.state.doc.length}}); await wait();
        check(!floating(), 'collapsed selection hides the toolbar');
        const painted = view.contentDOM.querySelector('span[style*="background-color"]');
        check(!!painted && getComputedStyle(painted).backgroundColor==='rgb(255, 212, 59)', 'Live Preview renders saved background color: '+view.contentDOM.innerHTML);
        view.dispatch({selection:{anchor:0,head:5}}); await wait();
        await click('.floating-format-toolbar [aria-label="Text color"]');
        const source = view.state.doc.toString();
        view.dispatch({effects:lock.reconfigure(EditorState.readOnly.of(true))}); await wait();
        check(!floating() && !document.querySelector('.color-palette'), 'locking removes floating toolbar and its palette');
        await click((mobile?'.mobile-toolbar':'.format-toolbar')+' [aria-label="Bold"]');
        check(view.state.doc.toString()===source, 'toolbar cannot write to locked editor');
        view.dispatch({effects:lock.reconfigure([]),selection:{anchor:0,head:5}}); view.focus(); await wait();
        const outside = document.querySelector('#outside'); outside.focus();
        // Hidden BrowserWindows change activeElement without emitting native focus events.
        view.contentDOM.dispatchEvent(new FocusEvent('focusout',{bubbles:true,relatedTarget:outside})); await wait();
        check(!floating(), 'moving focus outside editor dismisses toolbar');
        for (const prefix of ['', 'Before ']) for (const reading of [false,true]) {
          const source = prefix+'<span style="color:#e03131">hello '+String.fromCharCode(96)+'code'+String.fromCharCode(96)+' **bold**</span>\\n\\nend';
          view.dispatch({changes:{from:0,to:view.state.doc.length,insert:source},selection:{anchor:source.length},effects:setLivePreviewReadonly.of(reading)}); await wait();
          check(!!view.contentDOM.querySelector('span[style*="color:"]') && view.contentDOM.textContent.includes(prefix+'hello code bold'), 'colors compose with inline code and bold in '+(reading?'reading':'live')+' mode '+prefix);
        }
        const literal = String.fromCharCode(96)+'<span style="color:#e03131">literal</span>'+String.fromCharCode(96)+'\\n\\nend';
        view.dispatch({changes:{from:0,to:view.state.doc.length,insert:literal},selection:{anchor:literal.length},effects:setLivePreviewReadonly.of(false)}); await wait();
        check(!view.contentDOM.querySelector('span[style*="color:"]') && view.contentDOM.textContent.includes('<span style='), 'color HTML inside code remains literal');
        root.unmount(); setActiveEditor(null); view.destroy(); await wait();
        check(!floating() && !document.querySelector('.color-palette'), 'unmount cleans up floating UI');
        return results;
      };
    ` }, bundle: true, format: 'iife', platform: 'browser', loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file' }, define: { 'import.meta.env.DEV': 'false' },
      outfile: join(dir, 'fixture.js'), logLevel: 'silent' });
    await writeFile(join(dir, 'index.html'), '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><script src="fixture.js"></script>');
    await writeFile(join(dir, 'runner.cjs'), `
      const {app,BrowserWindow}=require('electron');
      app.setPath('userData',${JSON.stringify(join(dir,'profile'))});app.whenReady().then(async()=>{
        const win=new BrowserWindow({show:false,width:1200,height:800,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
        await win.loadFile(${JSON.stringify(join(dir, 'index.html'))});
        // Ozone headless may leave a hidden BrowserWindow at 1x1 CSS pixels.
        // Emulate the requested viewport explicitly rather than relying on a
        // native surface, which hidden/headless windows do not have.
        win.webContents.debugger.attach('1.3');
        const viewport=async(width,height)=>{
          win.setSize(width,height);
          await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',
            {width,height,deviceScaleFactor:1,mobile:false});
          const actual=await win.webContents.executeJavaScript('[innerWidth,innerHeight]');
          if(actual[0]!==width || actual[1]!==height)throw Error('Viewport mismatch '+JSON.stringify(actual));
        };
        await viewport(1200,800);
        const results={};
        results.desktop=await win.webContents.executeJavaScript('window.runFixture(false)');
        await viewport(390,844);
        results.mobile=await win.webContents.executeJavaScript('window.runFixture(true)');
        console.log('TOOLBAR_RESULTS:'+JSON.stringify(results));win.destroy();app.quit();
      }).catch(e=>{console.error(e);app.exit(1)});
    `);
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const args = [...(process.platform === 'linux' ? ['--ozone-platform=headless'] : []), join(dir, 'runner.cjs')];
    const { stdout } = await promisify(execFile)(createRequire(import.meta.url)('electron'), args,
      { env, timeout: 60_000, windowsHide: true, maxBuffer: 1024 * 1024 });
    const result = stdout.split(/\r?\n/).find(line => line.startsWith('TOOLBAR_RESULTS:'));
    assert.ok(result, stdout);
    const results = JSON.parse(result.slice('TOOLBAR_RESULTS:'.length));
    assert.equal(results.desktop.length, 28);
    assert.equal(results.mobile.length, 28);
  } finally {
    assert.ok(dir.startsWith(join(tmpdir(), 'webobsidian-toolbar-')));
    await rm(dir, { recursive: true, force: true });
  }
});
