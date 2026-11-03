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

test('ordinary URLs stay compact and clickable in Live, Reading and split preview', async () => {
 const dir=await mkdtemp(join(tmpdir(),'webo-bare-links-'));
 try {
  await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx',contents:`
   import React from 'react';import {createRoot} from 'react-dom/client';
   import {EditorState} from '@codemirror/state';import {EditorView} from '@codemirror/view';
   import {markdown,markdownLanguage} from '@codemirror/lang-markdown';
   import {livePreviewState,livePreviewReadonly,livePreviewPlugin,livePreviewTheme} from './src/lib/livePreview';
   import Preview from './src/components/Preview';import {api} from './src/lib/api';
   import './src/styles/obsidian.css';
   const urls=['https://opencode.ai/','https://github.com/anomalyco/opencode/blob/dev/README.ru.md','https://openchamber.dev/','https://github.com/tufantunc/ssh-mcp'];
   const source='Start\\n\\n'+urls[0]+'\\n\\nInstallation\\n'+urls[1]+'\\nUse '+urls[2]+' as a shell.\\nInstall MCP '+urls[3]+' and configure it.\\n\\n[Named link](https://example.com)\\n\\nLiteral: '+String.fromCharCode(96)+urls[2]+String.fromCharCode(96);
   const wait=()=>new Promise(r=>setTimeout(r,100));const check=(v,m)=>{if(!v)throw Error(m)};
   let metadata=0;api.linkPreview=async(url)=>{metadata++;return {url,title:'Unexpected card title',description:'card',domain:'example.com'};};
   window.run=async()=>{
    for(const reading of [false,true]){
     let edits=0;const host=document.createElement('div');document.body.append(host);
     const view=new EditorView({parent:host,state:EditorState.create({doc:source,extensions:[markdown({base:markdownLanguage}),livePreviewState,livePreviewReadonly.init(()=>reading),livePreviewPlugin,livePreviewTheme,EditorView.lineWrapping,EditorView.updateListener.of(u=>{if(u.docChanged)edits++;})]})});
     await wait();await wait();
     check(!host.querySelector('.link-preview,.link-preview-card'),'ordinary URL must not become a card');
     const anchors=urls.map(url=>Array.from(host.querySelectorAll('a')).find(a=>a.textContent===url));
     check(anchors.every(Boolean),'standalone and inline URL anchors exist');
     const opened=[];const originalOpen=window.open;window.open=(url)=>{opened.push(url);return null;};
     try{for(const anchor of anchors){check(anchor.href===anchor.textContent,'original URL preserved');anchor.click();}}finally{window.open=originalOpen;}
     check(JSON.stringify(opened)===JSON.stringify(urls),'one click opens each exact URL once');
     check(host.querySelectorAll('a').length===5,'inline code is not clickable and named link remains');
     check(!host.querySelector('.cm-url .cm-external-icon'),'bare URLs have no appended external glyph');
     check(view.state.doc.toString()===source&&edits===0,'rendering and clicks do not edit the article');
     view.dispatch({selection:{anchor:source.indexOf(urls[2])+5}});await wait();
     check(view.contentDOM.textContent.includes(urls[2]),'editing keeps the literal URL');
     const activeUrl=Array.from(host.querySelectorAll('.cm-url')).find(el=>el.textContent===urls[2]);
     const caretClicks=[];window.open=url=>{caretClicks.push(url);return null;};
     try{activeUrl.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));}finally{window.open=originalOpen;}
     check(JSON.stringify(caretClicks)===JSON.stringify([urls[2]]),'URL also opens once with the caret inside its text');
     check(view.state.doc.toString()===source&&edits===0,'active URL click preserves the article');
     view.destroy();host.remove();
    }
    const host=document.createElement('div');document.body.append(host);const root=createRoot(host);root.render(<Preview source={source}/>);await wait();await wait();await wait();
    check(!host.querySelector('.link-preview,.link-preview-card'),'split preview retains ordinary URL text');
    for(const url of urls)check(Array.from(host.querySelectorAll('a')).some(a=>a.textContent===url&&a.href===url),'split preview URL remains a link');
    check(metadata===0,'ordinary URLs never request preview metadata');root.unmount();host.remove();return true;
   };
  `},bundle:true,format:'iife',platform:'browser',loader:{'.woff2':'file','.woff':'file','.ttf':'file'},define:{'import.meta.env.DEV':'false'},outfile:join(dir,'fixture.js'),logLevel:'silent'});
  await writeFile(join(dir,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><script src="fixture.js"></script>');
  await writeFile(join(dir,'runner.cjs'),`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(dir,'profile'))});app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{backgroundThrottling:false}});await w.loadFile(${JSON.stringify(join(dir,'index.html'))});const r=await w.webContents.executeJavaScript('window.run().catch(e=>({failure:e.stack}))');if(r?.failure)throw Error(r.failure);console.log('BARE_LINKS_PASS');w.destroy();app.quit();}).catch(e=>{console.error(e);app.exit(1)});`);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const {stdout}=await promisify(execFile)(createRequire(import.meta.url)('electron'),[...(process.platform==='linux'?['--ozone-platform=headless']:[]),join(dir,'runner.cjs')],{env,windowsHide:true,timeout:60000});assert.match(stdout,/BARE_LINKS_PASS/);
 }finally{assert.ok(dir.startsWith(join(tmpdir(),'webo-bare-links-')));await rm(dir,{recursive:true,force:true});}
});
