import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {build} from 'esbuild';

test('browser: active search refresh, stale replies, reconnect, and index errors',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'webo-search-refresh-'));
 try{
  await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import SearchPanel from './src/components/SearchPanel';import {api,ApiError} from './src/lib/api';
import {useStore} from './src/lib/store';import {applyIndexStatus,refreshIndexStatus,resetIndexStatus} from './src/lib/indexStatus';
window.run=async()=>{
 const check=(v,m)=>{if(!v)throw Error(m)};const wait=(ms=300)=>new Promise(r=>setTimeout(r,ms));
 const ready={phase:'ready',available:true,initialScanComplete:true,generation:'vault',revision:1,watcherMode:'polling',indexedNotes:1,pendingPaths:0,errorCount:0,lastReconcileAt:null,lastHashAuditAt:null,persistenceError:false};
 resetIndexStatus();applyIndexStatus(ready);api.indexStatus=async()=>ready;
 let releaseOld;let searches=[];let fail=false;let title='ЕЦП initial';let releaseContext;
 api.search=async(q)=>{searches.push(q);if(q==='old')return new Promise(r=>{releaseOld=r});if(fail)throw new ApiError('INDEX_NOT_READY',503);return {hits:[{path:'ЕЦП.md',title,score:1,tags:[],snippet:'fresh snippet'}]}};
 let contexts=0;api.searchMatches=async()=>{contexts++;if(contexts===1)return new Promise(r=>{releaseContext=r});return {matches:[{path:'ЕЦП.md',count:1,contexts:[{text:'fresh context',ranges:[],pre:false,post:false}]}]}};
 document.body.innerHTML='<div id="root"></div>';const root=createRoot(document.querySelector('#root'));useStore.setState({searchQuery:'old'});root.render(<SearchPanel/>);await wait();
 check(!!releaseOld,'old query is pending');useStore.setState({searchQuery:'ЕЦП'});await wait();
 check(document.body.textContent.includes('ЕЦП initial'),'new query returned');
 releaseOld({hits:[{path:'old.md',title:'WRONG OLD RESULT',score:1,tags:[],snippet:''}]});await wait();
 check(!document.body.textContent.includes('WRONG OLD RESULT'),'late query response ignored');
 title='ЕЦП external';applyIndexStatus({...ready,revision:2});await wait();
 check(document.body.textContent.includes('ЕЦП external'),'external revision refreshes unchanged query');
 releaseContext({matches:[{path:'ЕЦП.md',count:1,contexts:[{text:'WRONG OLD CONTEXT',ranges:[],pre:false,post:false}]}]});await wait();
 check(!document.body.textContent.includes('WRONG OLD CONTEXT'),'old snippet cannot reappear after revision');
 const n=searches.length;api.indexStatus=async()=>({...ready,revision:2});await refreshIndexStatus();await wait();check(searches.length>n,'reconnect rechecks current query');
 fail=true;applyIndexStatus({...ready,revision:3,phase:'starting',available:false,initialScanComplete:false});await wait();
 check(document.querySelector('[role="alert"]')?.textContent.includes('Indexing'),'index not ready explained');
 check(!document.querySelector('.search-meta'),'error is not shown as zero notes');
 applyIndexStatus({...ready,generation:'other-vault',revision:0,phase:'starting',available:false,initialScanComplete:false});await wait();
 check(!document.body.textContent.includes('ЕЦП external'),'vault switch removes previous vault results immediately');
 // Link resolution errors never create duplicates, including daily notes.
 let creates=0;api.resolve=async()=>{throw new ApiError('INDEX_NOT_READY',503)};api.write=async()=>{creates++;return {ok:true}};
 await useStore.getState().openWikilink('existing');await useStore.getState().openDailyNote();check(creates===0,'unready resolution cannot create notes');
 root.unmount();return true;
};`},bundle:true,format:'iife',platform:'browser',define:{'import.meta.env.DEV':'false'},outfile:join(dir,'fixture.js'),logLevel:'silent'});
  await writeFile(join(dir,'index.html'),'<script src="fixture.js"></script>');
  await writeFile(join(dir,'runner.cjs'),`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(dir,'profile'))});app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false}});await w.loadFile(${JSON.stringify(join(dir,'index.html'))});await w.webContents.executeJavaScript('window.run()');console.log('SEARCH_REFRESH_PASS');w.destroy();app.quit()}).catch(e=>{console.error(e);app.exit(1)});`);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const {stdout}=await promisify(execFile)(createRequire(import.meta.url)('electron'),[...(process.platform==='linux'?['--ozone-platform=headless']:[]),join(dir,'runner.cjs')],{env,windowsHide:true,timeout:60000});
  assert.match(stdout,/SEARCH_REFRESH_PASS/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
