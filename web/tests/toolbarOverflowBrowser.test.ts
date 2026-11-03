import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { build } from 'esbuild';
test('browser: container resize partitions toolbar, preserves selection and exposes overflow groups', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'webo-overflow-'));
    try {
        await build({ stdin: { resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'tsx', contents: `
 import React from 'react';import {createRoot} from 'react-dom/client';
 import {EditorView} from '@codemirror/view';import {EditorState} from '@codemirror/state';
 import {setActiveEditor} from './src/lib/activeEditor';import FormatToolbar from './src/components/FormatToolbar';
 import './src/styles/obsidian.css';
 window.run=async()=>{
 document.body.innerHTML='<div class="theme-dark"><div id="container" style="width:1200px"><div id="toolbar"></div></div><div id="editor"></div></div>';
 const view=new EditorView({parent:document.querySelector('#editor'),state:EditorState.create({doc:'hello world'})});setActiveEditor(view);view.dispatch({selection:{anchor:0,head:5}});
 const root=createRoot(document.querySelector('#toolbar'));root.render(<FormatToolbar/>);
 const wait=()=>new Promise(r=>setTimeout(r,250));await wait();
 const check=(v,m)=>{if(!v)throw Error(m)};
 for(const width of [1200,768,480,320,240,40,1200]){
 document.querySelector('#container').style.width=width+'px';
 const bar=document.querySelector('.format-toolbar > .toolbar-surface');
 const fits=()=>{const rect=bar.getBoundingClientRect();return Array.from(bar.children).filter(n=>!n.classList.contains('toolbar-measure')).every(n=>{const r=n.getBoundingClientRect();return r.right<=rect.right+1&&r.top<rect.top+10;});};
 const deadline=performance.now()+4000;do{await wait();}while(!fits()&&performance.now()<deadline);
 check(fits(),'buttons fit a single row at container width '+width);

 if(width===240){const more=bar.querySelector('[aria-label="More"]');check(more,'More present');more.click();await wait();check(document.querySelector('[role="menu"]'),'menu opens');check(view.state.selection.main.to===5,'selection preserved');const colors=document.querySelector('[role="menu"] [aria-label="Text color"]');check(colors,'overflow exposes colors');colors.click();await wait();check(document.querySelector('.color-palette'),'overflow palette remains mounted');document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await wait();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));}
 }
 root.unmount();view.destroy();setActiveEditor(null);return true;
 };` }, bundle: true, format: 'iife', platform: 'browser', define: { 'import.meta.env.DEV': 'false' }, outfile: join(dir, 'fixture.js'), logLevel: 'silent' });
        await writeFile(join(dir, 'index.html'), '<link rel="stylesheet" href="fixture.css"><script src="fixture.js"></script>');
        await writeFile(join(dir, 'runner.cjs'), `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(dir, 'profile'))});app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,width:1440,height:900,webPreferences:{backgroundThrottling:false}});await w.loadFile(${JSON.stringify(join(dir, 'index.html'))});await w.webContents.executeJavaScript('window.run()');console.log('OVERFLOW_PASS');w.destroy();app.quit()}).catch(e=>{console.error(e);app.exit(1)});`);
        const env = { ...process.env };
        delete env.ELECTRON_RUN_AS_NODE;
        const { stdout } = await promisify(execFile)(createRequire(import.meta.url)('electron'), [...(process.platform === 'linux' ? ['--ozone-platform=headless'] : []), join(dir, 'runner.cjs')], { env, windowsHide: true, timeout: 60000 });
        assert.match(stdout, /OVERFLOW_PASS/);
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
