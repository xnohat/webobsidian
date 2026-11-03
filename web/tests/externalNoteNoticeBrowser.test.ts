import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { build } from 'esbuild';

test('external note indicator detects remote edits and safely refreshes or compares without writing', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'webo-external-note-'));
 try {
  await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx',contents:`
   import React from 'react';import {createRoot} from 'react-dom/client';
   import ExternalNoteNotice from './src/components/ExternalNoteNotice';
   import Workspace from './src/components/Workspace';
   import {useStore,documentSessions,loadDraftScope,resetDraftScope} from './src/lib/store';
   import {DocumentSession} from './src/lib/drafts/session';
   import {putDraft,deleteDraftIfRevision,listDrafts} from './src/lib/drafts/storage';
   import {api,ApiError} from './src/lib/api';
   import './src/styles/obsidian.css';
   const wait=ms=>new Promise(r=>setTimeout(r,ms??100));
   const check=(v,m)=>{if(!v)throw Error(m)};
   window.run=async()=>{
    let remote={content:'base',version:'v1'},pending=null,fail=false,writes=0,reads=0;
    api.draftScope=async()=>({scopeId:'external-scope'});await loadDraftScope();
    api.read=async()=>{reads++;if(fail)throw Error('offline');if(pending)return pending;return {...remote};};
    const make=(path,content='base',version='v1')=>{
     const session=new DocumentSession({scopeId:'external-scope',path,writerId:path,content,version},
      {put:putDraft,remove:deleteDraftIfRevision,write:async(p,text)=>{writes++;remote={content:text,version:'own-save'};return {version:remote.version};}},
      ()=>window.dispatchEvent(new Event('draft-status')));
     documentSessions.set(path,session);return session;
    };
    const a=make('a.md');useStore.setState({activePath:'a.md',content:'base',dirty:false,authed:true});
    const root=createRoot(document.querySelector('#root'));root.render(<ExternalNoteNotice/>);await wait(450);
    const notice=()=>document.querySelector('.external-note-notice');
    const button=text=>Array.from(document.querySelectorAll('button')).find(el=>el.textContent.includes(text));
    const fs=path=>window.dispatchEvent(new CustomEvent('wo-fs',{detail:{type:'fs',path,event:'change'}}));
    check(!notice(),'initial and identical file do not show indicator');
    remote={content:'external',version:'v2'};fs('other.md');await wait(450);check(!notice(),'unrelated file ignored');
    fs('a.md');await wait(450);check(notice(),'external edit shows indicator');
    check(useStore.getState().content==='base','notification never replaces visible text');
    remote={content:'latest external',version:'v3'};button('Reload note').click();await wait(200);
    check(useStore.getState().content==='latest external','refresh re-reads latest server content');
    check(a.baseVersion==='v3'&&!notice(),'refresh updates acknowledged version and clears banner');
    check(writes===0,'refresh does not write files');
    useStore.getState().setContent('my save');await useStore.getState().save();fs('a.md');await wait(450);
    check(!notice(),'own successful save does not show indicator');
    remote={content:'changed while away',version:'v4'};window.dispatchEvent(new Event('focus'));await wait(450);
    check(notice(),'returning to tab checks missed filesystem events');
    fail=true;button('Reload note').click();await wait(150);
    check(document.querySelector('[role="alert"]'),'refresh failure is visible');
    check(useStore.getState().content==='my save'&&notice(),'failed refresh preserves text and indicator');fail=false;
    let resolve;pending=new Promise(r=>{resolve=r;});button('Reload note').click();await wait(50);
    useStore.getState().setContent('typed during refresh');resolve({...remote});pending=null;await wait(180);
    check(useStore.getState().content==='typed during refresh','typing during refresh is never overwritten');
    check(button('Compare changes'),'local changes switch refresh to comparison');
    button('Compare changes').click();await wait(250);
    check(document.querySelector('[role="dialog"]'),'existing comparison dialog opens');
    check(useStore.getState().content==='typed during refresh'&&writes===1,'comparison does not write or discard local text');
    check((await listDrafts('external-scope')).some(r=>r.content==='typed during refresh'),'local edits backed up before comparison');
    root.unmount();await wait();
    // Ignore stale replies after switching documents, including a same-path reopen.
    const root2=createRoot(document.querySelector('#root'));root2.render(<ExternalNoteNotice/>);await wait(450);
    pending=new Promise(r=>{resolve=r;});fs('a.md');await wait(400);
    make('b.md');useStore.setState({activePath:'b.md',content:'base',dirty:false});await wait(50);
    pending=null;remote={content:'base',version:'v1'};resolve({content:'late a',version:'late'});await wait(450);
    check(!notice()&&useStore.getState().content==='base','late previous-file reply ignored');
    remote={content:'b externally edited',version:'b2'};fs('b.md');await wait(450);check(notice(),'new active file monitored');
    resetDraftScope();await wait(100);check(!notice(),'vault scope invalidation removes old notice');
    root2.unmount();await loadDraftScope();
    api.tags=async()=>({tags:[]});api.propertyTypes=async()=>({types:{}});
    make('wired.md');remote={content:'base',version:'v1'};
    useStore.setState({activePath:'wired.md',content:'base',dirty:false,viewMode:'live'});
    const interval=window.setInterval;let poll;
    window.setInterval=(callback,ms,...args)=>{if(ms===30000)poll=callback;return interval(callback,ms,...args);};
    const root3=createRoot(document.querySelector('#root'));root3.render(<Workspace/>);await wait(500);
    window.setInterval=interval;check(poll,'visible-tab fallback poll registered');
    remote={content:'updated in real editor',version:'wired2'};poll();await wait(450);
    check(notice(),'real workspace shows notice even without a filesystem event');
    check(document.querySelector('.cm-content').textContent.includes('base'),'real editor retains open text before refresh');
    button('Reload note').click();await wait(250);
    check(document.querySelector('.cm-content').textContent.includes('updated in real editor'),'real editor displays refreshed article');
    check(!notice()&&writes===1,'real refresh clears notice without server write');
    root3.unmount();for(const s of documentSessions.values())s.dispose();return true;
   };
  `},bundle:true,format:'iife',platform:'browser',loader:{'.woff2':'file','.woff':'file','.ttf':'file'},define:{'import.meta.env.DEV':'false'},outfile:join(dir,'fixture.js'),logLevel:'silent'});
  await writeFile(join(dir,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><div id="root"></div><script src="fixture.js"></script>');
  await writeFile(join(dir,'runner.cjs'),`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(dir,'profile'))});app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,width:1100,height:800,webPreferences:{backgroundThrottling:false}});await w.loadFile(${JSON.stringify(join(dir,'index.html'))});const result=await w.webContents.executeJavaScript('window.run().catch(e=>({failure:e.stack}))');if(result?.failure)throw Error(result.failure);console.log('EXTERNAL_NOTE_PASS');w.destroy();app.quit();}).catch(e=>{console.error(e);app.exit(1)});`);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const {stdout}=await promisify(execFile)(createRequire(import.meta.url)('electron'),[...(process.platform==='linux'?['--ozone-platform=headless']:[]),join(dir,'runner.cjs')],{env,windowsHide:true,timeout:60000});
  assert.match(stdout,/EXTERNAL_NOTE_PASS/);
 }finally{assert.ok(dir.startsWith(join(tmpdir(),'webo-external-note-')));await rm(dir,{recursive:true,force:true});}
});
