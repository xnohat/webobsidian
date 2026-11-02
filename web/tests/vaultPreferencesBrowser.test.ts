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

test('browser: saved vault settings survive reload; failed settings revert; readable width follows app changes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'webo-vault-preferences-'));
 try{
  await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import Settings from './src/components/Settings';import Editor from './src/components/Editor';import Preview from './src/components/Preview';
import {api} from './src/lib/api';import {useStore} from './src/lib/store';
import {defaultVaultPreferences,getVaultPreferences,resetVaultPreferences} from './src/lib/vaultPreferences';import './src/styles/obsidian.css';
import {getDefaultToolbarConfig} from './src/lib/toolbar/config';
window.run=async()=>{
 const check=(v,m)=>{if(!v)throw Error(m)};const wait=(ms=150)=>new Promise(r=>setTimeout(r,ms));
 let saved={vault:{path:'/fixture/vault',deleteMode:'trash',followObsidianDeletion:false,trashRetentionDays:0},ui:{},git:{},auth:{}};
 const initialToolbar=getDefaultToolbarConfig();initialToolbar.layouts.mobile.items=[];saved.ui.editingToolbar=initialToolbar;
 let fontSize=19;let fail=true,puts=0;let readable=true;let failReload=false;let uploadsBlocked=false;
 api.getSettings=async()=>{if(failReload)throw Error('fixture reload failed');return structuredClone(saved)};api.putSettings=async(patch)=>{puts++;if(fail)throw Error('fixture settings write failed');saved={...saved,vault:{...saved.vault,...patch.vault},ui:{...saved.ui,...patch.ui}};return structuredClone(saved)};
 api.indexStatus=async()=>({phase:'ready',available:true,initialScanComplete:true,generation:'fixture',revision:1,indexedNotes:1,pendingPaths:0,watcherMode:'polling'});
 api.tags=async()=>({tags:[]});api.propertyTypes=async()=>({types:{}});
 window.fetch=async()=>new Response(JSON.stringify({values:{...defaultVaultPreferences,baseFontSize:fontSize,readableLineLength:readable,mobileToolbarCommands:['editor:toggle-bold','unknown:plugin'],trashOption:'none',deleteMode:saved.vault.followObsidianDeletion?'permanent':saved.vault.deleteMode},sources:{...Object.fromEntries(Object.keys(defaultVaultPreferences).map(k=>[k,'default'])),readableLineLength:'obsidian',deleteMode:'webobsidian'},warnings:[],blocked:uploadsBlocked?{attachmentUpload:'Invalid app.json. Uploads blocked.'}:{},vaultPath:saved.vault.path}),{status:200,headers:{'content-type':'application/json'}});
 const render=()=>{document.body.innerHTML='<div id="root"></div>';const r=createRoot(document.querySelector('#root'));r.render(<Settings/>);return r};
 useStore.setState({settingsOpen:true,save:async()=>{},activePath:'note.md',content:'Note body',viewMode:'source',dirty:false});
 let root=render();await wait();await wait();
 const row=(name)=>Array.from(document.querySelectorAll('.setting-row')).find(e=>e.querySelector('.name')?.textContent===name);
 let select=row('When deleting a file').querySelector('select');select.value='permanent';select.dispatchEvent(new Event('change',{bubbles:true}));await wait();
 check(row('When deleting a file').querySelector('select').value==='trash','failed delete mode reverts');check(document.querySelector('[role="alert"]')?.textContent.includes('failed'),'write error visible');
 let retention=row('Trash retention (days)').querySelector('input');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(retention,'7');retention.dispatchEvent(new Event('input',{bubbles:true}));await wait();const retentionPuts=puts;retention.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));await wait();check(puts===retentionPuts+1,'retention was submitted');check(retention.value==='0','failed retention reverts');
 fail=false;failReload=true;select=row('When deleting a file').querySelector('select');select.value='permanent';select.dispatchEvent(new Event('change',{bubbles:true}));await wait();check(row('When deleting a file').querySelector('select').value==='permanent','successful save is confirmed even when reload fails');failReload=false;
 root.unmount();root=render();await wait();await wait();check(row('When deleting a file').querySelector('select').value==='permanent','fresh mount reads persisted delete mode');
 select=row('When deleting a file').querySelector('select');select.value='trash';select.dispatchEvent(new Event('change',{bubbles:true}));await wait();
 document.querySelector('[aria-label="Follow Obsidian deletion"]').click();await wait();check(saved.vault.followObsidianDeletion===true,'follow deletion is explicit and persisted');check(saved.vault.deleteMode==='trash','following preserves saved WebObsidian selection');check(row('When deleting a file').querySelector('select').disabled,'saved selection disabled while following');check(document.body.textContent.includes('Effective deletion: permanently delete'),'effective imported deletion shown');
 document.querySelector('[aria-label="Follow Obsidian deletion"]').click();await wait();check(saved.vault.followObsidianDeletion===false,'can disable follow');check(document.body.textContent.includes('Effective deletion: move to .trash'),'saved recoverable choice restored');
 Array.from(document.querySelectorAll('summary')).find(b=>b.textContent==='Import Obsidian mobile toolbar commands').click();Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Add supported Obsidian mobile commands').click();await wait();check(saved.ui.editingToolbar.layouts.mobile.items.at(-1).commandId==='editing-toolbar:toggle-bold','supported mobile command explicitly imported');check(document.body.textContent.includes('Unsupported'),'unknown commands clearly reported');
 const pathInput=row('Vault path').querySelector('input');set.call(pathInput,'   ');pathInput.dispatchEvent(new Event('input',{bubbles:true}));await wait();const before=puts;Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Save vault path').click();await wait();check(puts===before,'blank path rejected before request');check(useStore.getState().activePath==='note.md','failed path save preserves open note');
 set.call(pathInput,'/fixture/other');pathInput.dispatchEvent(new Event('input',{bubbles:true}));useStore.setState({save:async()=>{throw Error('fixture note save failed')}});await wait();Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Save vault path').click();await wait();check(puts===before,'note save failure prevents changing vault');check(useStore.getState().activePath==='note.md','note save failure keeps open note');useStore.setState({save:async()=>{}});
 check(document.body.textContent.includes('Effective vault preferences'),'effective sources are visible');check(document.body.textContent.includes('obsidian'),'Obsidian source is shown');
 uploadsBlocked=true;await getVaultPreferences();await wait();const attachmentRow=Array.from(document.querySelectorAll('.vault-preferences-table tr')).find(r=>r.firstElementChild?.textContent==='attachmentFolderPath');check(attachmentRow.textContent.includes('Unavailable — uploads blocked'),'invalid attachment rule is not displayed as active fallback');check(!attachmentRow.textContent.includes('./attachments'),'blocked attachment fallback hidden');uploadsBlocked=false;
 root.unmount();useStore.setState({settingsOpen:false});document.body.innerHTML='<div id="root" style="width:1100px"></div>';root=createRoot(document.querySelector('#root'));root.render(<><Editor/><Preview/></>);await wait();await getVaultPreferences();await wait();
 check(getComputedStyle(document.querySelector('.cm-content')).fontSize==='19px'&&getComputedStyle(document.querySelector('.markdown-preview')).fontSize==='19px','appearance font applies to mounted note views');fontSize=22;await getVaultPreferences();await wait();check(getComputedStyle(document.querySelector('.cm-content')).fontSize==='22px'&&getComputedStyle(document.querySelector('.markdown-preview')).fontSize==='22px','appearance changes update both views');
 const narrow=document.querySelector('.preview-inner').getBoundingClientRect().width;check(document.querySelector('.markdown-source-view').classList.contains('is-readable-line-width'),'readable editor');
 readable=false;await getVaultPreferences();await wait();check(!document.querySelector('.markdown-source-view').classList.contains('is-readable-line-width'),'external app change updates mounted editor');check(document.querySelector('.preview-inner').getBoundingClientRect().width>narrow,'external app change expands reading width');
 document.querySelector('#root').style.width='340px';await wait();check(document.querySelector('.preview-inner').getBoundingClientRect().width<=340,'narrow reading view fits');
 root.unmount();resetVaultPreferences('/other-vault');return true;
};`},bundle:true,format:'iife',platform:'browser',loader:{'.woff2':'file','.woff':'file','.ttf':'file'},define:{'import.meta.env.DEV':'false','import.meta.url':JSON.stringify('file:///fixture.js')},outfile:join(dir,'fixture.js'),logLevel:'silent'});
  await writeFile(join(dir,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><script src="fixture.js"></script>');
  await writeFile(join(dir,'runner.cjs'),`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(dir,'profile'))});app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,width:1200,height:900,webPreferences:{backgroundThrottling:false}});await w.loadFile(${JSON.stringify(join(dir,'index.html'))});const result=await w.webContents.executeJavaScript('window.run().catch(e=>({failure:e.stack}))');if(result?.failure)throw Error(result.failure);console.log('VAULT_PREFERENCES_PASS');w.destroy();app.quit()}).catch(e=>{console.error(e);app.exit(1)});`);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const {stdout}=await promisify(execFile)(createRequire(import.meta.url)('electron'),[...(process.platform==='linux'?['--ozone-platform=headless']:[]),join(dir,'runner.cjs')],{env,windowsHide:true,timeout:60000});
  assert.match(stdout,/VAULT_PREFERENCES_PASS/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
