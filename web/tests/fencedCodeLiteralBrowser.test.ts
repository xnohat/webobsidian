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

test('shorter fence examples inside code stay visible, including an unclosed outer fence',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'webo-fence-literals-'));
 try{
  await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx',contents:`
   import React from 'react';import {createRoot} from 'react-dom/client';
   import Editor from './src/components/Editor';import {useStore} from './src/lib/store';
   import {api} from './src/lib/api';import {getActiveEditor} from './src/lib/activeEditor';
   import {forceParsing} from '@codemirror/language';import './src/styles/obsidian.css';
   api.tags=async()=>({tags:[]});api.propertyTypes=async()=>({types:{}});
   const root=createRoot(document.querySelector('#root')),wait=()=>new Promise(r=>setTimeout(r,70));
   const check=(ok,message)=>{if(!ok)throw Error(message)};
   const tick=String.fromCharCode(96),nl=String.fromCharCode(10);
   const cases=[
    {open:tick.repeat(4)+'markdown',body:[tick.repeat(3)+'js','console.log(1);',tick.repeat(3)],close:tick.repeat(4)},
    {open:'~~~~markdown',body:['~~~js','console.log(1);','~~~'],close:'~~~~'},
    {open:tick.repeat(4)+'markdown',body:['Unclosed example',tick.repeat(3)],close:null},
   ];let mounted=0;
   window.run=async()=>{
    for(const mode of ['live','reading'])for(const [index,example] of cases.entries()){
     const source=['# Host','',example.open,...example.body,...(example.close?[example.close]:[])].join(nl);
     useStore.setState({activePath:'Fence.md',content:source,viewMode:mode,dirty:false,locked:false,showInlineTitle:false,save:async()=>{}});
     root.render(<Editor key={++mounted}/>);await wait();await wait();
     const view=getActiveEditor();check(forceParsing(view,source.length,1000),'parser completes');await wait();
     for(const text of example.body){
      const line=[...view.contentDOM.querySelectorAll('.HyperMD-codeblock-bg')].find(e=>{const copy=e.cloneNode(true);copy.querySelectorAll('.cm-fold-indicator').forEach(n=>n.remove());return copy.textContent===text});
      check(line&&parseFloat(getComputedStyle(line).fontSize)>0&&line.getBoundingClientRect().height>0,mode+'/'+index+': literal code line remains painted: '+text);
     }
     check(view.state.doc.toString()===source&&useStore.getState().content===source,mode+'/'+index+': rendering preserves source');
    }
    root.unmount();return 'FENCE_LITERALS_PASS';
   };
  `},bundle:true,format:'iife',platform:'browser',tsconfigRaw:{compilerOptions:{useDefineForClassFields:false,jsx:'react-jsx'}},loader:{'.woff2':'file','.woff':'file','.ttf':'file'},define:{'import.meta.env.DEV':'false'},outfile:join(dir,'fixture.js'),logLevel:'silent'});
  await writeFile(join(dir,'index.html'),'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><body class="theme-dark"><div id="root" style="width:800px;height:900px;display:flex;flex-direction:column"></div><script src="fixture.js"></script>');
  await writeFile(join(dir,'runner.cjs'),`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(dir,'profile'))});app.whenReady().then(async()=>{const win=new BrowserWindow({show:false,width:1000,height:1100,webPreferences:{backgroundThrottling:false}});await win.loadFile(${JSON.stringify(join(dir,'index.html'))});console.log(await win.webContents.executeJavaScript('window.run()'));win.destroy();app.quit()}).catch(e=>{console.error(e);app.exit(1)});`);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const {stdout}=await promisify(execFile)(createRequire(import.meta.url)('electron'),[...(process.platform==='linux'?['--ozone-platform=headless']:[]),join(dir,'runner.cjs')],{env,windowsHide:true,timeout:30_000});assert.match(stdout,/FENCE_LITERALS_PASS/);
 }finally{assert.ok(dir.startsWith(join(tmpdir(),'webo-fence-literals-')));await rm(dir,{recursive:true,force:true})}
});
