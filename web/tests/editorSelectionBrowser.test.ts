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

test('Live code block selection paints over the block background, including wrapped and active lines', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'webobsidian-selection-'));
  try {
    await build({ stdin: { resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts', contents: `
      import { EditorState } from '@codemirror/state';
      import { EditorView, drawSelection, highlightActiveLine } from '@codemirror/view';
      import { markdown } from '@codemirror/lang-markdown';
      import { livePreviewState, livePreviewPlugin, livePreviewTheme } from './src/lib/livePreview';
      import './src/styles/obsidian.css';
      const fence = String.fromCharCode(96).repeat(3);
      const doc = ['Before', '', fence+'abap', 'first code line', 'wrapped code '.repeat(15), '', 'last code line', fence, '', 'After'].join('\\n');
      let view;
      const settle = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.prepare = async (theme, width) => {
        view?.destroy();
        document.body.className = theme;
        document.body.innerHTML = '<div class="cm-host cm-s-obsidian markdown-source-view is-readable-line-width is-live-preview" style="height:650px;width:'+width+'px"></div>';
        view = new EditorView({parent:document.body.firstChild, state:EditorState.create({doc,
          selection:{anchor:doc.indexOf('first code')},
          extensions:[markdown(), drawSelection(), highlightActiveLine(), EditorView.lineWrapping,
            livePreviewState, livePreviewPlugin, livePreviewTheme]})});
        view.focus(); await document.fonts.ready; await settle();
        const lines = [...view.contentDOM.querySelectorAll('.HyperMD-codeblock-bg')];
        const point = (line, bottom=false) => {
          const r = line.getBoundingClientRect();
          return {x:Math.floor(r.right-8), y:Math.floor(bottom?r.bottom-4:r.top+4)};
        };
        const active = point(lines[4]); active.x = Math.floor(lines[4].getBoundingClientRect().left+20);
        const emptyRect = lines[3].getBoundingClientRect();
        const swatch = document.createElement('span');
        swatch.style.backgroundColor = 'var(--background-primary-alt)'; view.dom.append(swatch);
        const backgroundPixel = getComputedStyle(swatch).backgroundColor.match(/\\d+/g).slice(0,3).map(Number).reverse();
        swatch.remove();
        return {wrapped:point(lines[2], true), empty:point(lines[3]), active, outside:point(lines[0]),
          leftMargin:{x:Math.floor(emptyRect.left-8),y:Math.floor(emptyRect.top+4)},
          rightMargin:{x:Math.floor(emptyRect.right+8),y:Math.floor(emptyRect.top+4)},
          blockLeft:emptyRect.left, blockWidth:emptyRect.width,
          clientWidth:view.scrollDOM.clientWidth,
          backgroundPixel, wrappedHeight:lines[2].getBoundingClientRect().height, lineHeight:lines[1].getBoundingClientRect().height};
      };
      window.selectCode = async (points) => {
        view.dispatch({selection:{anchor:doc.indexOf('first code'), head:doc.indexOf('last code line')+'last code line'.length}});
        // Wait for CodeMirror's measured selection rectangles, not just for a
        // decoration node to exist. Hidden Linux surfaces can paint later.
        const deadline=performance.now()+4000;
        let covered=false;
        do {
          await settle();
          const rects=[...view.dom.querySelectorAll('.cm-selectionBackground')].map(el=>el.getBoundingClientRect());
          covered=['wrapped','empty','active'].every(key=>rects.some(r=>points[key].x>=r.left&&points[key].x<r.right&&points[key].y>=r.top&&points[key].y<r.bottom));
        } while(!covered&&performance.now()<deadline);
        if (!covered) throw Error('Selection geometry did not cover the code sample points');
        if (!view.contentDOM.querySelector('.HyperMD-codeblock-bg.cm-activeLine')) throw Error('Missing active code line');
      };
    ` }, bundle: true, format: 'iife', platform: 'browser', loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file' }, define: { 'import.meta.env.DEV': 'false' },
      outfile: join(dir, 'fixture.js'), logLevel: 'silent' });
    await writeFile(join(dir, 'index.html'), '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><script src="fixture.js"></script>');
    await writeFile(join(dir, 'runner.cjs'), `
      const {app,BrowserWindow}=require('electron');
      app.setPath('userData',${JSON.stringify(join(dir,'profile'))});
      app.whenReady().then(async()=>{
        const win=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
        await win.loadFile(${JSON.stringify(join(dir, 'index.html'))});
        win.webContents.debugger.attach('1.3');
        await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {width:1000,height:800,deviceScaleFactor:1,mobile:false});
        const deadline=Date.now()+4000;
        let size;
        do {
          size=await win.webContents.executeJavaScript('[innerWidth,innerHeight]');
          if(size[0]===1000&&size[1]===800)break;
          await new Promise(resolve=>setTimeout(resolve,10));
        }while(Date.now()<deadline);
        if(size[0]!==1000||size[1]!==800)throw Error('Viewport mismatch '+JSON.stringify(size));
        const results=[];
        for(const theme of ['theme-light','theme-dark','theme-ctp-mocha']) for(const width of [900,390]) {
          const points=await win.webContents.executeJavaScript('window.prepare('+JSON.stringify(theme)+','+width+')');
          const pixel=async(p)=>Array.from((await win.webContents.capturePage({x:p.x,y:p.y,width:1,height:1},{stayHidden:true,stayAwake:true})).toBitmap()).slice(0,3);
          const before={}; for(const key of ['wrapped','empty','active','outside','leftMargin','rightMargin']) before[key]=await pixel(points[key]);
          await win.webContents.executeJavaScript('window.selectCode('+JSON.stringify(points)+')');
          // DOM geometry is necessary but the compositor may still hold the
          // previous frame. Keep the pixel regression strict, with a bounded
          // wait for the selected frame rather than accepting a stale capture.
          let after={};const paintDeadline=Date.now()+4000;
          do {
            for(const key of ['wrapped','empty','active','outside','leftMargin','rightMargin']) after[key]=await pixel(points[key]);
            if(['wrapped','empty','active'].every(key=>JSON.stringify(after[key])!==JSON.stringify(before[key])))break;
            await new Promise(resolve=>setTimeout(resolve,16));
          }while(Date.now()<paintDeadline);
          results.push({theme,width,before,after,backgroundPixel:points.backgroundPixel,blockLeft:points.blockLeft,blockWidth:points.blockWidth,clientWidth:points.clientWidth,wrappedHeight:points.wrappedHeight,lineHeight:points.lineHeight});
        }
        console.log('SELECTION_RESULTS:'+JSON.stringify(results));win.destroy();app.quit();
      }).catch(e=>{console.error(e);app.exit(1)});
    `);
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const { stdout } = await promisify(execFile)(createRequire(import.meta.url)('electron'),
      [...(process.platform === 'linux' ? ['--ozone-platform=headless'] : []), join(dir, 'runner.cjs')],
      { env, timeout: 60_000, windowsHide: true, maxBuffer: 1024 * 1024 });
    const output = stdout.split(/\r?\n/).find(line => line.startsWith('SELECTION_RESULTS:'));
    assert.ok(output, stdout);
    const results = JSON.parse(output.slice('SELECTION_RESULTS:'.length));
    assert.equal(results.length, 6);
    for (const result of results) {
      const label = `${result.theme} at ${result.width}px`;
      const expectedWidth = Math.min(636, result.clientWidth - 64);
      assert.equal(result.blockWidth, expectedWidth, `${label}: preserve the readable width and 32px note margins, allowing for a scrollbar`);
      assert.equal(result.blockLeft, (result.clientWidth - expectedWidth) / 2, `${label}: preserve centered note margins`);
      assert.ok(result.wrappedHeight > result.lineHeight, `${label}: fixture must wrap`);
      assert.deepEqual(result.before.outside, result.backgroundPixel, `${label}: code background must retain its theme color`);
      for (const key of ['wrapped', 'empty', 'active']) {
        assert.notDeepEqual(result.after[key], result.before[key], `${label}: selection hidden behind ${key} code line background`);
      }
      assert.deepEqual(result.after.outside, result.before.outside, `${label}: selection must not tint unselected code`);
      for (const key of ['leftMargin', 'rightMargin']) {
        assert.deepEqual(result.after[key], result.before[key], `${label}: selection must stay inside the code block's ${key}`);
      }
    }
  } finally {
    assert.ok(dir.startsWith(join(tmpdir(), 'webobsidian-selection-')));
    await rm(dir, { recursive: true, force: true });
  }
});
