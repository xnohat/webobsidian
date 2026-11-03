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

test('opening successive articles keeps exactly one formatting toolbar and external-change notice', async () => {
 const dir=await mkdtemp(join(tmpdir(),'webo-toolbar-navigation-'));
 try {
  await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx',contents:`
   import React from 'react';import {createRoot} from 'react-dom/client';
   import Workspace from './src/components/Workspace';
   import {api} from './src/lib/api';import {useStore,documentSessions} from './src/lib/store';
   import {getActiveEditor} from './src/lib/activeEditor';
   import './src/styles/obsidian.css';
   api.draftScope=async()=>({scopeId:'toolbar-navigation'});api.tags=async()=>({tags:[]});
   api.propertyTypes=async()=>({types:{}});api.getSettings=async()=>({ui:{}});
   let external=false;api.read=async(path)=>({content:(external?'external ':'')+'Body of '+path,version:external?'v2':'v1'});
   const wait=ms=>new Promise(r=>setTimeout(r,ms??100));const check=(v,m)=>{if(!v)throw Error(m)};
   const settle=async(ready,label)=>{const deadline=performance.now()+4000;while(!ready()&&performance.now()<deadline)await wait(50);check(ready(),label);};
   window.run=async()=>{
    check(innerWidth===1440&&!matchMedia('(max-width:768px)').matches,'explicit desktop viewport');
    useStore.setState({authed:true,activePath:null,content:'',dirty:false,showInlineTitle:false,viewMode:'live'});
    const root=createRoot(document.querySelector('#root'));root.render(<React.StrictMode><Workspace/></React.StrictMode>);await wait();
    for(const path of ['first.md','second.md','third.md','first.md','fourth.markdown','first.md']){
     await useStore.getState().openFile(path);
     await settle(()=>getActiveEditor()?.state.doc.toString()==='Body of '+path,'article editor mounted for '+path);
     const bars=document.querySelectorAll('.format-toolbar');
     check(bars.length===1,'exactly one toolbar after opening '+path+', got '+bars.length);
     check(document.querySelectorAll('.cm-editor').length===1,'one editor after navigation');
     check(getActiveEditor().state.doc.toString()==='Body of '+path,'correct active article');
     external=true;window.dispatchEvent(new CustomEvent('wo-fs',{detail:{path,event:'change'}}));
     await settle(()=>!!document.querySelector('.external-note-notice'),'external change rendered');
     check(document.querySelectorAll('.external-note-notice').length===1,'exactly one external-change notice');
     external=false;
    }
    useStore.getState().setViewMode('reading');await settle(()=>!document.querySelector('.format-toolbar'),'reading hides toolbar');
    await useStore.getState().openFile('reading.md');await wait();check(!document.querySelector('.format-toolbar'),'reading navigation does not leave old toolbars');
    useStore.getState().setViewMode('source');await settle(()=>document.querySelectorAll('.format-toolbar').length===1,'source restores one toolbar');
    useStore.getState().setViewMode('live');await wait();check(document.querySelectorAll('.format-toolbar').length===1,'live keeps one toolbar');
    root.unmount();check(!document.querySelector('.format-toolbar'),'unmount leaves no toolbar');
    for(const s of documentSessions.values())s.dispose();return true;
   };
  `},bundle:true,format:'iife',platform:'browser',loader:{'.woff2':'file','.woff':'file','.ttf':'file'},define:{'import.meta.env.DEV':'false'},outfile:join(dir,'fixture.js'),logLevel:'silent'});
  await writeFile(join(dir,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><div id="root"></div><script src="fixture.js"></script>');
  await writeFile(join(dir,'runner.cjs'),`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(dir,'profile'))});app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,width:1440,height:900,webPreferences:{backgroundThrottling:false}});await w.loadFile(${JSON.stringify(join(dir,'index.html'))});w.webContents.debugger.attach('1.3');await w.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});const result=await w.webContents.executeJavaScript('window.run().catch(e=>({failure:e.stack}))');if(result?.failure)throw Error(result.failure);console.log('NAVIGATION_PASS');w.destroy();app.quit();}).catch(e=>{console.error(e);app.exit(1)});`);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const {stdout}=await promisify(execFile)(createRequire(import.meta.url)('electron'),[...(process.platform==='linux'?['--ozone-platform=headless']:[]),join(dir,'runner.cjs')],{env,windowsHide:true,timeout:60000});
  assert.match(stdout,/NAVIGATION_PASS/);
 }finally{assert.ok(dir.startsWith(join(tmpdir(),'webo-toolbar-navigation-')));await rm(dir,{recursive:true,force:true});}
});
