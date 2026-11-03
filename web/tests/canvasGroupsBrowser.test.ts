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

test('canvas: selected groups do not intercept editing and opening contained cards',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'webo-canvas-groups-'));
 try{
  await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import CanvasView from './src/components/CanvasView';import {useStore} from './src/lib/store';import {api} from './src/lib/api';import './src/styles/obsidian.css';
const wait=()=>new Promise(r=>setTimeout(r,100));const check=(v,m)=>{if(!v)throw Error(m)};
const nodes=[{id:'outer',type:'group',label:'Outer',x:0,y:0,width:700,height:700},{id:'inner',type:'group',label:'Inner',x:100,y:120,width:450,height:480},{id:'text',type:'text',text:'Editable card',x:140,y:200,width:300,height:100},{id:'file',type:'file',file:'linked.md',x:140,y:370,width:300,height:120}];
const original=JSON.stringify({nodes,edges:[]});let opened=[];let saves=0;
api.read=async()=>({content:'# Linked note',version:'v1'});useStore.setState({activePath:'fixture.canvas',content:original,dirty:false,save:async()=>{saves++;},openFile:async path=>{opened.push(path);}});
window.run=async()=>{
 check(innerWidth===1440&&innerHeight===1000,'explicit canvas test viewport');
 const host=document.createElement('div');host.style.cssText='height:900px;width:1200px';document.body.classList.add('theme-dark');document.body.append(host);const root=createRoot(host);root.render(<CanvasView/>);await wait();await wait();await wait();
 const groupNodes=[...host.querySelectorAll('.canvas-group')];const text=host.querySelector('.canvas-text');const file=host.querySelector('.canvas-file');const vp=host.querySelector('.canvas-view');
 const center=el=>{const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};};
 const press=el=>{const p=center(el);el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:1,clientX:p.x,clientY:p.y}));vp.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0,pointerId:1,clientX:p.x,clientY:p.y}));};
 for(const group of groupNodes){
  press(group);await wait();check(group.classList.contains('selected'),'group selected');
  for(const card of [text,file]){const p=center(card);const target=document.elementFromPoint(p.x,p.y);check(target?.closest('.canvas-node')===card,'selected group intercepts contained '+card.className+' viewport='+innerWidth+'x'+innerHeight+' point='+JSON.stringify(p)+' target='+target?.outerHTML?.slice(0,300));}
 }
 const before=JSON.parse(useStore.getState().content);check(JSON.stringify(before)===original,'selection must not modify canvas');
 press(text);await wait();text.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));await wait();const ta=text.querySelector('textarea');check(ta,'nested text card enters edit mode');
 const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;setter.call(ta,'Edited inside group');ta.dispatchEvent(new Event('input',{bubbles:true}));ta.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));await wait();
 const after=JSON.parse(useStore.getState().content);check(after.nodes.find(n=>n.id==='text').text==='Edited inside group','nested edit commits to canvas');check(JSON.stringify(after.nodes.filter(n=>n.id!=='text'))===JSON.stringify(nodes.filter(n=>n.id!=='text')),'other nodes preserved');
 press(groupNodes[0]);await wait();const p=center(file);const target=document.elementFromPoint(p.x,p.y);target.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));await wait();check(JSON.stringify(opened)===JSON.stringify(['linked.md']),'contained file opens once');
 root.unmount();host.remove();return true;
};
`},bundle:true,format:'iife',platform:'browser',loader:{'.woff2':'file','.woff':'file','.ttf':'file'},define:{'import.meta.env.DEV':'false'},outfile:join(dir,'fixture.js'),logLevel:'silent'});
  await writeFile(join(dir,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><script src="fixture.js"></script>');
  await writeFile(join(dir,'runner.cjs'),`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(dir,'profile'))});app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{backgroundThrottling:false}});await w.loadFile(${JSON.stringify(join(dir,'index.html'))});w.webContents.debugger.attach('1.3');await w.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});const deadline=Date.now()+4000;while(!(await w.webContents.executeJavaScript('innerWidth===1440&&innerHeight===1000'))){if(Date.now()>deadline)throw Error('Canvas viewport did not settle');await new Promise(r=>setTimeout(r,20));}const r=await w.webContents.executeJavaScript('window.run().catch(e=>({failure:e.stack}))');if(r?.failure)throw Error(r.failure);console.log('CANVAS_GROUPS_PASS');w.destroy();app.quit();}).catch(e=>{console.error(e);app.exit(1)});`);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const {stdout}=await promisify(execFile)(createRequire(import.meta.url)('electron'),[...(process.platform==='linux'?['--ozone-platform=headless']:[]),join(dir,'runner.cjs')],{env,windowsHide:true,timeout:60000});assert.match(stdout,/CANVAS_GROUPS_PASS/);
 }finally{assert.ok(dir.startsWith(join(tmpdir(),'webo-canvas-groups-')));await rm(dir,{recursive:true,force:true});}
});
