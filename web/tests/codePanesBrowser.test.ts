import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {build} from 'esbuild';

test('mixed panes: focus returns to Markdown and disabling code never renders source as Markdown',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'webo-code-panes-'));
 try{
  await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';import Workspace from './src/components/Workspace';import {useStore} from './src/lib/store';import {api} from './src/lib/api';import {getActiveEditor} from './src/lib/activeEditor';import {captureContext,executeCommand} from './src/lib/toolbar/registry';import './src/styles/obsidian.css';
const wait=()=>new Promise(r=>setTimeout(r,100));const check=(v,m)=>{if(!v)throw Error(m)};
api.draftScope=async()=>({scopeId:'mixed-pane'});api.tags=async()=>({tags:[]});api.propertyTypes=async()=>({types:{}});api.getSettings=async()=>({ui:{}});api.putSettings=async()=>({});api.read=async path=>({content:'Main text',version:'v1'});api.readCode=async path=>({kind:'text',path,content:'# literal code',highlightAllowed:true});
window.run=async()=>{
 useStore.setState({authed:true,activePath:null,content:'',dirty:false,showInlineTitle:false,viewMode:'source'});
 const host=document.createElement('div');host.style.cssText='height:900px;width:1200px';document.body.append(host);const root=createRoot(host);root.render(<Workspace/>);await wait();await useStore.getState().openFile('main.md');await wait();await wait();const main=getActiveEditor();check(main,'main editor exists');
 await useStore.getState().openToSide('split.py');await wait();await wait();const code=host.querySelector('.split-pane .cm-content');check(code,'code pane exists');code.dispatchEvent(new FocusEvent('focus'));await wait();check(getActiveEditor()!==main,'code pane receives active commands');
 main.contentDOM.dispatchEvent(new FocusEvent('focus'));await wait();check(getActiveEditor()===main,'returning focus restores main editor');check((await executeCommand('underline',captureContext(main))).status==='applied','main commands work after returning from code');
 useStore.setState({dirty:false});let finish;api.read=()=>new Promise(r=>{finish=r;});const settings=useStore.getState().applyCodeFileViewerSettings({...useStore.getState().codeFileViewer,enabled:false});await wait();
 check(!host.querySelector('.split-pane .markdown-preview'),'unsupported split source never enters Markdown during pending main reload');check(host.querySelector('.split-pane').textContent.includes('Download'),'unsupported split offers download');finish({content:'Main text',version:'v2'});await settings;await wait();root.unmount();host.remove();return true;
};
`},bundle:true,format:'iife',platform:'browser',loader:{'.woff2':'file','.woff':'file','.ttf':'file'},define:{'import.meta.env.DEV':'false'},outfile:join(dir,'fixture.js'),logLevel:'silent'});
  await writeFile(join(dir,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><script src="fixture.js"></script>');
  await writeFile(join(dir,'runner.cjs'),`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(dir,'profile'))});app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{backgroundThrottling:false}});await w.loadFile(${JSON.stringify(join(dir,'index.html'))});const r=await w.webContents.executeJavaScript('window.run().catch(e=>({failure:e.stack}))');if(r?.failure)throw Error(r.failure);console.log('CODE_PANES_PASS');w.destroy();app.quit();}).catch(e=>{console.error(e);app.exit(1)});`);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const {stdout}=await promisify(execFile)(createRequire(import.meta.url)('electron'),[...(process.platform==='linux'?['--ozone-platform=headless']:[]),join(dir,'runner.cjs')],{env,windowsHide:true,timeout:60000});assert.match(stdout,/CODE_PANES_PASS/);
 }finally{assert.ok(dir.startsWith(join(tmpdir(),'webo-code-panes-')));await rm(dir,{recursive:true,force:true});}
});
