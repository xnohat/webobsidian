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

const samples=[
 {lang:'js',code:['function calculateVelocity(distance, time) {','  if (time <= 0) throw new Error("Time must be positive");','  const velocity = distance / time;','  console.log(`Speed: ${velocity} m/s`);','  return velocity;','}'],tokens:[
  [0,'function','pink'],[0,'calculateVelocity','normal'],[0,'distance','normal'],[0,'time','normal'],
  [1,'time','cyan'],[1,'0','purple'],[1,'Error','cyan'],[1,'Time must be positive','green'],
  [2,'velocity','normal'],[2,'distance','cyan'],[2,'/','red'],[3,'console','cyan'],[3,'log','yellow'],[3,'velocity','cyan'],[3,'${','green'],[4,'velocity','cyan'],
 ]},
 {lang:'python',code:['class Node:','    def __init__(self, key: str, value: int):','        self.key = key','        self.value = value','    def __repr__(self) -> str:','        return f"Node({self.key!r}, {self.value})"'],tokens:[
  [0,'class','pink'],[0,'Node','normal'],[1,'__init__','normal'],[1,'self','cyan'],[1,'key','cyan'],[1,'str','yellow'],[1,'int','yellow'],[2,'self','cyan'],[2,'key','yellow'],[3,'value','yellow'],[4,'__repr__','normal'],[4,'->','red'],[4,'str','yellow'],[5,'return','pink'],[5,'Node(','green'],[5,'{','normal'],[5,'self','cyan'],[5,'key','yellow'],[5,'!','red'],[5,'!r','cyan',1],
 ]},
 {lang:'yml',code:['# YAML','server:','  host: 127.0.0.1','  port: 8080','  ssl:','    enabled: true'],tokens:[
  [0,'# YAML','faint'],[1,'server','normal'],[1,':','faint'],[2,'host','normal'],[2,'127.0.0.1','purple'],[3,'8080','purple'],[4,'ssl','normal'],[5,'enabled','normal'],[5,'true','pink'],
 ]},
];

test('fenced JS, Python and YAML tokens match native editor colors in both themes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'webo-native-code-colors-'));
 try{
  await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx',contents:`
   import React from 'react';import {createRoot} from 'react-dom/client';
   import Editor from './src/components/Editor';import {useStore} from './src/lib/store';
   import {api} from './src/lib/api';import {getActiveEditor} from './src/lib/activeEditor';
   import {forceParsing} from '@codemirror/language';import './src/styles/obsidian.css';
   api.tags=async()=>({tags:[]});api.propertyTypes=async()=>({types:{}});
   const samples=${JSON.stringify(samples)},root=createRoot(document.querySelector('#root')),wait=()=>new Promise(r=>setTimeout(r,80)),issues=[];
   const expected=role=>{const el=document.createElement('span');el.style.color=role==='normal'?'var(--text-normal)':role==='faint'?'var(--text-faint)':'var(--color-'+role+')';document.body.append(el);const value=getComputedStyle(el).color;el.remove();return value};
   let mounted=0;window.run=async()=>{
    for(const mode of ['live','reading','source'])for(const theme of ['theme-dark','theme-light'])for(const sample of samples){
     document.body.className=theme;const nl=String.fromCharCode(10),fence=String.fromCharCode(96).repeat(3),prefix='# Host'+nl+nl+fence+sample.lang+nl;
     const source=prefix+sample.code.join(nl)+nl+fence+nl+nl+'Outside text';
     useStore.setState({activePath:'Colors.md',content:source,viewMode:mode,dirty:false,locked:false,showInlineTitle:false,save:async()=>{}});root.render(<Editor key={++mounted}/>);await wait();await wait();
     const view=getActiveEditor();forceParsing(view,source.length,1000);await wait();await document.fonts.ready;
     for(const [line,word,role,offset] of sample.tokens){
      const at=prefix.length+sample.code.slice(0,line).reduce((n,s)=>n+s.length+1,0)+sample.code[line].indexOf(word)+(offset??Math.floor(word.length/2));
      const {node}=view.domAtPos(at),el=node.nodeType===Node.TEXT_NODE?node.parentElement:node;
      const color=getComputedStyle(el).color,want=expected(role);
      if(color!==want)issues.push(mode+'/'+theme+'/'+sample.lang+' line '+line+' '+word+': '+color+' expected '+role+' '+want);
     }
     const at=source.indexOf('Outside text')+2,{node}=view.domAtPos(at),el=node.nodeType===Node.TEXT_NODE?node.parentElement:node;
     if(getComputedStyle(el).color!==expected('normal'))issues.push('Code palette leaks into ordinary text');
     if(view.state.doc.toString()!==source||useStore.getState().content!==source)issues.push('Source changed');
    }
    root.unmount();if(issues.length)throw Error(JSON.stringify(issues));return 'NATIVE_CODE_COLORS_PASS';
   };
  `},bundle:true,format:'iife',platform:'browser',tsconfigRaw:{compilerOptions:{useDefineForClassFields:false,jsx:'react-jsx'}},loader:{'.woff2':'file','.woff':'file','.ttf':'file'},define:{'import.meta.env.DEV':'false'},outfile:join(dir,'fixture.js'),logLevel:'silent'});
  await writeFile(join(dir,'index.html'),'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><body class="theme-dark"><div id="root" style="width:850px;height:900px;display:flex;flex-direction:column"></div><script src="fixture.js"></script>');
  await writeFile(join(dir,'runner.cjs'),`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(dir,'profile'))});app.whenReady().then(async()=>{const win=new BrowserWindow({show:false,width:1000,height:1100,webPreferences:{backgroundThrottling:false}});await win.loadFile(${JSON.stringify(join(dir,'index.html'))});win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:1000,height:1100,deviceScaleFactor:1,mobile:false});console.log(await win.webContents.executeJavaScript('window.run()'));win.destroy();app.quit()}).catch(e=>{console.error(e);app.exit(1)});`);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const {stdout}=await promisify(execFile)(createRequire(import.meta.url)('electron'),[...(process.platform==='linux'?['--ozone-platform=headless']:[]),join(dir,'runner.cjs')],{env,windowsHide:true,timeout:45_000});assert.match(stdout,/NATIVE_CODE_COLORS_PASS/);
 }finally{assert.ok(dir.startsWith(join(tmpdir(),'webo-native-code-colors-')));await rm(dir,{recursive:true,force:true})}
});
