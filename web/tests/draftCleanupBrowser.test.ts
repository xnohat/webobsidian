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

test('recovery automatically removes only browser copies that still match saved files', async () => {
 const dir=await mkdtemp(join(tmpdir(),'webo-draft-cleanup-'));
 try {
  await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx',contents:`
   import React from 'react';import {createRoot} from 'react-dom/client';
   import DraftRecovery from './src/components/DraftRecovery';
   import {api,ApiError} from './src/lib/api';
   import {useStore,documentSessions,resetDraftScope,loadDraftScope} from './src/lib/store';
   import {DocumentSession} from './src/lib/drafts/session';
   import {putDraft,listDrafts,deleteDraftIfRevision} from './src/lib/drafts/storage';
   const wait=ms=>new Promise(r=>setTimeout(r,ms??100));
   const check=(v,m)=>{if(!v)throw Error(m)};
   const record=(path,content='saved',writerId='old')=>({scopeId:'cleanup',path,writerId,schemaVersion:1,
    revision:1,updatedAt:1,baseVersion:'base',baseContent:'base',content,kind:'text',state:'dirty'});
   window.run=async()=>{
    api.draftScope=async()=>({scopeId:'cleanup'});await loadDraftScope();
    const reads=[];let writes=0;api.write=async()=>{writes++;throw Error('cleanup must never write a server file')};
    api.read=async(path,scope)=>{check(scope==='cleanup','read uses captured vault scope');reads.push(path);
     if(path==='missing.md')throw new ApiError('not_found',404);if(path==='offline.md')throw Error('offline');
     return {content:'saved',version:'saved-version'};
    };
    for(const r of [record('same.md'),record('same.md','saved','second-tab'),record('different.md','different'),
     record('spaces.md','saved '),record('lines.md','saved\\r\\n'),record('missing.md'),record('offline.md'),
     {...record('foreign.md'),scopeId:'other-vault'}])await putDraft(r);
    useStore.setState({authed:true,activePath:null,dirty:false});
    const root=createRoot(document.querySelector('#root'));root.render(<DraftRecovery/>);await wait(600);
    let rows=await listDrafts('cleanup');
    check(!rows.some(r=>r.path==='same.md'),'identical saved copies are automatically removed');
    check(rows.length===5,'different, whitespace, deleted and unavailable copies retained');
    check((await listDrafts('other-vault')).length===1,'another vault is untouched');
    check(reads.filter(p=>p==='same.md').length===1,'copies of the same file share one read');
    check(document.body.textContent.includes('Recover unsaved text (5)'),'recovery count refreshes after cleanup');
    const count=reads.length;window.dispatchEvent(new Event('local-drafts-changed'));await wait(200);
    check(reads.length===count,'ordinary list updates do not repeatedly read vault files');
    window.dispatchEvent(new CustomEvent('wo-fs',{detail:{path:'unrelated.md',event:'change'}}));await wait(450);
    check(reads.length===count,'unrelated filesystem events do not reread recovery files');
    api.read=async(path)=>({content:path==='different.md'?'different':'saved',version:'new'});
    window.dispatchEvent(new CustomEvent('wo-fs',{detail:{path:'different.md',event:'change'}}));await wait(600);
    check(!(await listDrafts('cleanup')).some(r=>r.path==='different.md'),'later external save clears a matching copy');
    root.unmount();
    for(const r of await listDrafts('cleanup'))await deleteDraftIfRevision(r,r.revision);
    // A newer revision written while the server read was pending must survive.
    let resolve;api.read=()=>new Promise(r=>{resolve=r;});await putDraft(record('racing.md'));
    const second=createRoot(document.querySelector('#root'));second.render(<DraftRecovery/>);await wait(200);
    await putDraft({...record('racing.md'),revision:2,content:'new unsaved',updatedAt:2});
    resolve({content:'saved',version:'remote'});await wait(400);
    check((await listDrafts('cleanup')).some(r=>r.content==='new unsaved'),'newer browser revision survives stale comparison');
    second.unmount();for(const r of await listDrafts('cleanup'))await deleteDraftIfRevision(r,r.revision);
    // Same-revision rewrites are permitted by IndexedDB: compare content as well.
    await putDraft(record('same-revision.md'));const third=createRoot(document.querySelector('#root'));third.render(<DraftRecovery/>);await wait(200);
    await putDraft({...record('same-revision.md'),content:'rewritten at same revision'});
    resolve({content:'saved',version:'remote'});await wait(400);
    check((await listDrafts('cleanup')).some(r=>r.content==='rewritten at same revision'),'same-revision changed text is retained');
    third.unmount();for(const r of await listDrafts('cleanup'))await deleteDraftIfRevision(r,r.revision);
    // Keep a copy while its comparison dialog is open; clean after it closes.
    await putDraft(record('review.md'));api.read=async()=>({content:'different remote',version:'review1'});
    const review=createRoot(document.querySelector('#root'));review.render(<DraftRecovery/>);await wait(300);
    const button=text=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes(text));
    button('Recover unsaved text').click();await wait();button('Review text').click();await wait(150);
    check(document.querySelector('[aria-label="Resolve conflict"]'),'comparison opened');
    api.read=async()=>({content:'saved',version:'review2'});window.dispatchEvent(new Event('focus'));await wait(450);
    check((await listDrafts('cleanup')).some(r=>r.path==='review.md'),'copy under active review is retained');
    button('Later').click();await wait(300);
    check(!(await listDrafts('cleanup')).some(r=>r.path==='review.md'),'matching review copies cleaned after closing comparison');
    review.unmount();
    // Do not clean an in-progress editor draft using an older persisted snapshot.
    const active=record('active.md','saved','current');await putDraft(active);
    const session=new DocumentSession({...active,version:'base'}, {put:putDraft,remove:deleteDraftIfRevision,write:async()=>({version:'new'})});
    documentSessions.set('active.md',session);session.edit('not flushed yet');
    api.read=async()=>({content:'saved',version:'saved'});
    const fourth=createRoot(document.querySelector('#root'));fourth.render(<DraftRecovery/>);await wait(400);
    check((await listDrafts('cleanup')).some(r=>r.path==='active.md'),'active unsaved editor draft is retained');
    fourth.unmount();session.dispose();documentSessions.clear();
    for(const r of await listDrafts('cleanup'))await deleteDraftIfRevision(r,r.revision);
    // A previous vault's pending read must not delete its browser copy after switching.
    await putDraft(record('scope.md'));api.read=()=>new Promise(r=>{resolve=r;});
    const fifth=createRoot(document.querySelector('#root'));fifth.render(<DraftRecovery/>);await wait(200);
    api.draftScope=async()=>({scopeId:'new-scope'});resetDraftScope();resolve({content:'saved',version:'remote'});await wait(400);
    check((await listDrafts('cleanup')).some(r=>r.path==='scope.md'),'scope invalidation preserves old-vault copies');
    fifth.unmount();check(writes===0,'automatic cleanup never writes a saved file');return true;
   };
  `},bundle:true,format:'iife',platform:'browser',define:{'import.meta.env.DEV':'false'},outfile:join(dir,'fixture.js'),logLevel:'silent'});
  await writeFile(join(dir,'index.html'),'<meta charset="utf-8"><div id="root"></div><script src="fixture.js"></script>');
  await writeFile(join(dir,'runner.cjs'),`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(dir,'profile'))});app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false}});await w.loadFile(${JSON.stringify(join(dir,'index.html'))});const result=await w.webContents.executeJavaScript('window.run().catch(e=>({failure:e.stack}))');if(result?.failure)throw Error(result.failure);console.log('CLEANUP_PASS');w.destroy();app.quit();}).catch(e=>{console.error(e);app.exit(1)});`);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const {stdout}=await promisify(execFile)(createRequire(import.meta.url)('electron'),[...(process.platform==='linux'?['--ozone-platform=headless']:[]),join(dir,'runner.cjs')],{env,windowsHide:true,timeout:60000});
  assert.match(stdout,/CLEANUP_PASS/);
 }finally{assert.ok(dir.startsWith(join(tmpdir(),'webo-draft-cleanup-')));await rm(dir,{recursive:true,force:true});}
});
