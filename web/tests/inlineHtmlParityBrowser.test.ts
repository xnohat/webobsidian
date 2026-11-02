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

test('native note typography, inline HTML, callouts and math render without changing source',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'webo-inline-html-parity-'));
 try{
  await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx',contents:`
   import React from 'react';import {createRoot} from 'react-dom/client';
   import Editor from './src/components/Editor';import Preview from './src/components/Preview';
   import {useStore} from './src/lib/store';import {api} from './src/lib/api';
   import './src/styles/obsidian.css';
   import {defaultVaultPreferences} from './src/lib/vaultPreferences';
   import {getActiveEditor} from './src/lib/activeEditor';
   api.tags=async()=>({tags:[]});api.propertyTypes=async()=>({types:{}});
   window.fetch=async()=>new Response(JSON.stringify({values:{...defaultVaultPreferences,baseFontSize:19},sources:{},warnings:[],vaultPath:'/fixture'}));
   const source='# HTML\\n\\n<span style="color: #e63946; font-weight: bold;">Red</span>\\n\\n<span style="color: #2a9d8f; background-color: #264653; padding: 2px 6px; border-radius: 4px;">Green</span>\\n\\n<font color="royalblue">Blue</font>\\n\\n<mark style="background: #ffbe0b; color: #000;">Marked</mark>\\n\\n<kbd>Ctrl</kbd> + <kbd>P</kbd>\\n\\n<span onclick="window.compromised=true" style="color:red;position:fixed;background:url(https://invalid.example/x)">Safe</span>';
   const root=createRoot(document.querySelector('#root')),wait=()=>new Promise(r=>setTimeout(r,50));
   const check=(ok,msg)=>{if(!ok)throw Error(msg)},until=async(fn,msg)=>{for(let i=0;i<100;i++){if(fn())return;await wait()}throw Error(msg)};
   const leaf=text=>[...document.querySelectorAll('span,mark,font,kbd')].filter(e=>e.textContent===text).at(-1);
   window.run=async()=>{
    for(const mode of ['live','reading','preview','source']){
     useStore.setState({activePath:'HTML.md',content:source,viewMode:mode==='preview'?'reading':mode,dirty:false,locked:false,showInlineTitle:false,save:async()=>{}});root.render(mode==='preview'?<Preview/>:<Editor/>);
     await until(()=>{const el=document.querySelector('.cm-content')??document.querySelector('.markdown-preview');return el&&getComputedStyle(el).fontSize==='19px'},mode+': imported font size');
     if(mode==='source'){check(!document.querySelector('.cm-html-inline,.cm-html-block'),'Source stays literal');check(document.querySelector('.cm-content').textContent.includes('<font color='),'Source preserves font markup')}
     else{
      await until(()=>!!leaf('Green')&&!!leaf('Blue'),mode+': inline HTML loaded');
      check(getComputedStyle(leaf('Red')).color==='rgb(230, 57, 70)'&&getComputedStyle(leaf('Red')).fontWeight==='700',mode+': mixed color and weight');
      const green=getComputedStyle(leaf('Green'));check(green.color==='rgb(42, 157, 143)'&&green.backgroundColor==='rgb(38, 70, 83)'&&green.padding==='2px 6px'&&green.borderRadius==='4px',mode+': background and bounded spacing');
      check(getComputedStyle(leaf('Blue')).color==='rgb(65, 105, 225)',mode+': legacy font color');
      check(getComputedStyle(leaf('Marked')).backgroundColor==='rgb(255, 190, 11)'&&getComputedStyle(leaf('Marked')).color==='rgb(0, 0, 0)',mode+': custom mark');
      const kbd=getComputedStyle(leaf('Ctrl'));check(kbd.backgroundColor!=='rgba(0, 0, 0, 0)'&&kbd.borderRadius==='4px'&&parseFloat(kbd.paddingLeft)>0,mode+': native keyboard key shape');
      check(!leaf('Safe').hasAttribute('onclick')&&getComputedStyle(leaf('Safe')).position==='static'&&getComputedStyle(leaf('Safe')).backgroundImage==='none',mode+': unsafe styles and handlers stripped');
      if(mode==='live'){const v=getActiveEditor();v.dispatch({selection:{anchor:source.indexOf('Red')}});await wait();check(document.querySelector('.cm-content').textContent.includes('font-weight: bold'),'moving caret exposes editable source')}
     }
     check(useStore.getState().content===source,mode+': note bytes unchanged');root.render(<div/>);await wait();
    }
    const typography='# Typography\\n\\n> [!note] Note\\n> Body\\n\\n| Column | Other |\\n| --- | --- |\\n| Cell | Value |\\n\\n$x^2$\\n\\n$$\\n\\\\frac{a}{b}\\n$$';
    for(const mode of ['live','reading','preview']){
     useStore.setState({activePath:'Typography.md',content:typography,viewMode:mode==='preview'?'reading':mode,dirty:false,locked:false,showInlineTitle:false,save:async()=>{}});root.render(mode==='preview'?<Preview/>:<Editor/>);
     await until(()=>!!document.querySelector('.katex')&&!!document.querySelector('td'),mode+': math and table rendered');
     check(!document.querySelector('.katex-error'),mode+': valid math is typeset');
     check([...document.querySelectorAll('.katex')].every(el=>getComputedStyle(el).fontSize==='19px'),mode+': math uses native text scale');
     check(getComputedStyle(document.querySelector('td')).fontSize==='19px',mode+': table inherits imported text size');
     const callout=document.querySelector('.callout'),first=document.querySelector('.cm-callout-first'),last=document.querySelector('.cm-callout-last');
     const height=callout?callout.getBoundingClientRect().height:first.getBoundingClientRect().height+last.getBoundingClientRect().height;
     check(Math.abs(height-115.2)<2,mode+': native single-paragraph callout height '+height);
     check(useStore.getState().content===typography,mode+': typography source unchanged');root.render(<div/>);await wait();
    }
    return 'READY';
   };
  `},bundle:true,format:'iife',platform:'browser',tsconfigRaw:{compilerOptions:{useDefineForClassFields:false,jsx:'react-jsx'}},
   loader:{'.woff2':'file','.woff':'file','.ttf':'file'},define:{'import.meta.env.DEV':'false'},outfile:join(dir,'fixture.js'),logLevel:'silent'});
  await writeFile(join(dir,'index.html'),'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><body class="theme-dark"><div id="root" style="width:800px;height:800px;display:flex;flex-direction:column"></div><script src="fixture.js"></script>');
  await writeFile(join(dir,'runner.cjs'),`
   const {app,BrowserWindow}=require('electron');
   app.setPath('userData',${JSON.stringify(join(dir,'profile'))});
   app.whenReady().then(async()=>{
    const win=new BrowserWindow({show:false,width:800,height:1200,webPreferences:{backgroundThrottling:false}});
    win.webContents.on('console-message',(_e,_level,message)=>{if(message.includes('crashed'))console.error(message)});
    await win.loadFile(${JSON.stringify(join(dir,'index.html'))});
    win.webContents.focus();
    await win.webContents.executeJavaScript('window.run()');
    console.log('NOTE_EMBED_PASS');win.destroy();app.quit();
   }).catch(e=>{console.error(e);app.exit(1)});
  `);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const {stdout}=await promisify(execFile)(createRequire(import.meta.url)('electron'),[...(process.platform==='linux'?['--ozone-platform=headless']:[]),join(dir,'runner.cjs')],{env,windowsHide:true,timeout:60_000});
  assert.match(stdout,/NOTE_EMBED_PASS/);
 }finally{
  assert.ok(dir.startsWith(join(tmpdir(),'webo-inline-html-parity-')));await rm(dir,{recursive:true,force:true});
 }
});
