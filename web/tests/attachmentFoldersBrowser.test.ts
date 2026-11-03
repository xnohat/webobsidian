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

test('browser: attachment visibility checkbox changes the real explorer for old and configured folders', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'webo-attachment-folders-'));
  try {
    await build({ stdin: { resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'tsx', contents: `
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import Settings from './src/components/Settings'; import FileTree from './src/components/FileTree';
      import {useStore} from './src/lib/store'; import {api} from './src/lib/api';
      // Hidden Electron windows can suspend compositor frames on Linux. Keep
      // the real reveal handler and DOM assertions, using a fixture frame clock.
      window.requestAnimationFrame=callback=>window.setTimeout(()=>callback(performance.now()),0);
      window.cancelAnimationFrame=id=>window.clearTimeout(id);
      api.getSettings=async()=>({vault:{path:'/vault',deleteMode:'trash',trashRetentionDays:0}});
      api.indexStatus=async()=>{throw Error('isolated fixture')};
      const folder=(name,path,attachmentFolder,children=[])=>({name,path,type:'folder',attachmentFolder,children});
      const tree=folder('vault','',false,[folder('attachments','attachments',false),folder(' attachments',' attachments',false),folder('Media','Media',true),
        folder('Project','Project',false,[{name:'active.md',path:'Project/active.md',type:'file'}]),
        folder('Notes','Notes',false,[folder('attachments','Notes/attachments',false,[{name:'keep.md',path:'Notes/attachments/keep.md',type:'file'}])])]);
      useStore.setState({tree,settingsOpen:true,showAttachmentFolders:false,expanded:['Notes','Notes/attachments']});
      document.body.innerHTML='<div id="root"></div>';createRoot(document.querySelector('#root')).render(<><FileTree/><Settings/></>);
      const rows=()=>Array.from(document.querySelectorAll('.tree-row[data-path]')).map(e=>e.dataset.path).sort();
      const check=(ok,message)=>{if(!ok)throw Error(message+': '+JSON.stringify(rows()))};
      const settle=async(fn)=>{const until=Date.now()+3000;while(!fn()&&Date.now()<until)await new Promise(r=>setTimeout(r,10));check(fn(),'UI did not settle')};
      window.result=(async()=>{
        const checkbox=()=>Array.from(document.querySelectorAll('.setting-row')).find(e=>e.querySelector('.name')?.textContent==='Show attachment folders')?.querySelector('input');
        await settle(()=>!!checkbox()&&rows().includes('Notes/attachments/keep.md'));
        check(!rows().includes('attachments')&&!rows().includes(' attachments')&&!rows().includes('Media'),'initially hide media-only folders');
        checkbox().click();await settle(()=>rows().includes('attachments')&&rows().includes(' attachments')&&rows().includes('Media'));
        check(rows().includes('Notes/attachments/keep.md'),'notes must remain visible when enabled');
        checkbox().click();await settle(()=>!rows().includes('attachments')&&!rows().includes(' attachments')&&!rows().includes('Media'));
        check(rows().includes('Notes/attachments/keep.md'),'notes must remain visible when disabled');
        useStore.setState({activePath:'Project/active.md',autoReveal:false});
        check(!rows().includes('Project/active.md'),'auto reveal off leaves its folder collapsed');
        const reveal=Array.from(document.querySelectorAll('.setting-row')).find(e=>e.querySelector('.name')?.textContent==='Reveal active file in explorer').querySelector('input');
        reveal.click();await settle(()=>rows().includes('Project/active.md'));
        await settle(()=>document.querySelector('[data-path="Project/active.md"]').classList.contains('reveal-flash'));
        return 'ATTACHMENT_CHECKBOX_BROWSER_PASS';
      })();
    ` }, bundle: true, format: 'iife', platform: 'browser', define: {'import.meta.env.DEV':'false'}, outfile: join(dir,'fixture.js'), logLevel:'silent' });
    await writeFile(join(dir,'index.html'), '<body><script src="fixture.js"></script></body>');
    await writeFile(join(dir,'runner.cjs'), `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(dir,'profile'))});app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false}});await w.loadFile(${JSON.stringify(join(dir,'index.html'))});console.log(await w.webContents.executeJavaScript('window.result'));w.destroy();app.quit()}).catch(e=>{console.error(e);app.exit(1)});`);
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    const {stdout}=await promisify(execFile)(createRequire(import.meta.url)('electron'),[...(process.platform==='linux'?['--ozone-platform=headless']:[]),join(dir,'runner.cjs')],{env,windowsHide:true,timeout:30000});
    assert.match(stdout,/ATTACHMENT_CHECKBOX_BROWSER_PASS/);
  } finally {
    assert.ok(dir.startsWith(join(tmpdir(),'webo-attachment-folders-')));
    await rm(dir,{recursive:true,force:true});
  }
});
