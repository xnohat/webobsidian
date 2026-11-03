import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {build} from 'esbuild';

test('browser zoom and keyboard viewport keep toolbar, draft status, menus and palettes reachable',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'webo-viewport-'));
 try{
 await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx',contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';
 import {EditorView} from '@codemirror/view';import {EditorState} from '@codemirror/state';
 import {setActiveEditor} from './src/lib/activeEditor';import FormatToolbar from './src/components/FormatToolbar';
 import DraftRecovery from './src/components/DraftRecovery';import {useStore} from './src/lib/store';import {api} from './src/lib/api';import {putDraft} from './src/lib/drafts/storage';
 import {getDefaultToolbarConfig} from './src/lib/toolbar/config';
 import './src/styles/obsidian.css';
 api.draftScope=async()=>({scopeId:'viewport'});api.getSettings=async()=>({ui:{}});
 const wait=()=>new Promise(r=>setTimeout(r,60));const check=(v,m)=>{if(!v)throw Error(m)};
 let root,view,fake;
 const settle=async(fn)=>{const end=performance.now()+4000;do{await wait()}while(!fn()&&performance.now()<end);check(fn(),'layout did not settle: '+JSON.stringify({viewport:[innerWidth,innerHeight],visual:visualViewport?{width:visualViewport.width,height:visualViewport.height,offsetTop:visualViewport.offsetTop}:null,predicate:String(fn)}))};
 const inside=(element)=>{if(!element)return false;const r=element.getBoundingClientRect(),v=window.visualViewport;return r.left>=v.offsetLeft-1&&r.right<=v.offsetLeft+v.width+1&&r.top>=v.offsetTop-1&&r.bottom<=v.offsetTop+v.height+1};
 window.setup=async(mobile)=>{
 root?.unmount();view?.destroy();
 document.body.innerHTML='<div class="theme-dark"><div id="pane" style="width:calc(100vw - 220px);margin-left:210px"><div id="bar"></div></div><div id="editor"></div><div id="drafts"></div></div>';
 if(mobile)document.querySelector('#pane').style.cssText='width:100%;margin:0';
 view=new EditorView({parent:document.querySelector('#editor'),state:EditorState.create({doc:'hello world'})});setActiveEditor(view);view.dispatch({selection:{anchor:0,head:5}});
 useStore.setState({authed:true,activePath:null});root=createRoot(document.querySelector('#bar'));root.render(<><FormatToolbar mobile={mobile}/><DraftRecovery/></>);await settle(()=>!!document.querySelector(mobile?'.mobile-toolbar .toolbar-surface':'.format-toolbar .toolbar-surface'));await wait();
 };
 window.checkDesktop=async(sidebar=220)=>{
 document.querySelector('#pane').style.width='calc(100vw - '+(sidebar+12)+'px)';document.querySelector('#pane').style.marginLeft=sidebar+'px';
 const bar=document.querySelector('.format-toolbar > .toolbar-surface');
 await document.fonts.ready;
 // ResizeObserver can replace the overflow contents even while both the old
 // and new rows fit. Wait for stable geometry and commands before opening More.
 let previousLayout,stableSamples=0;
 await settle(()=>{
  const children=Array.from(bar.children).filter(n=>!n.classList.contains('toolbar-measure'));
  const bounds=bar.getBoundingClientRect();
  const layout=JSON.stringify([bounds.toJSON(),children.map(n=>[n.getAttribute('aria-label'),n.getBoundingClientRect().toJSON()])]);
  stableSamples=layout===previousLayout?stableSamples+1:0;previousLayout=layout;
  return stableSamples>=2&&children.every(n=>n.getBoundingClientRect().right<=bounds.right+1);
 });
 check(inside(bar),'desktop toolbar bounds '+JSON.stringify({sidebar,viewport:[innerWidth,innerHeight],visual:{width:visualViewport.width,height:visualViewport.height},rect:bar.getBoundingClientRect().toJSON()}));
 const more=bar.querySelector('[aria-label="More"]');if(more){more.click();await settle(()=>!!document.querySelector('[role="menu"]'));check(inside(document.querySelector('[role="menu"]')),'zoom menu bounds');document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));}
 check(view.state.selection.main.to===5,'zoom keeps selection');
 return {sidebar,width:innerWidth,dpr:devicePixelRatio};
 };
 window.fixed=async()=>{
 const cfg=getDefaultToolbarConfig();cfg.layouts.fixed.enabled=true;cfg.layouts.fixed.position={x:.95,y:.95};api.getSettings=async()=>({ui:{editingToolbar:cfg}});window.dispatchEvent(new Event('editing-toolbar-config'));await settle(()=>!!document.querySelector('.fixed-format-toolbar .toolbar-surface'));await wait();
 const bar=document.querySelector('.fixed-format-toolbar .toolbar-surface');check(inside(bar),'fixed toolbar outside viewport');check(Array.from(bar.children).filter(n=>!n.classList.contains('toolbar-measure')).every(n=>n.getBoundingClientRect().right<=bar.getBoundingClientRect().right+1),'fixed handle counted in overflow');
 };
 window.setupMobile=async()=>{
 fake=new EventTarget();Object.assign(fake,{width:390,height:844,offsetLeft:0,offsetTop:0,scale:1});Object.defineProperty(window,'visualViewport',{configurable:true,value:fake});
 await putDraft({scopeId:'viewport',path:'kbd.md',writerId:'old',revision:1,schemaVersion:1,updatedAt:Date.now(),baseVersion:'v1',baseContent:'base',content:'mine',kind:'text',state:'dirty'});
 await window.setup(true);await settle(()=>!!document.querySelector('.draft-status'));
 };
 window.conflictKeyboard=async()=>{
 await putDraft({scopeId:'viewport',path:'kbd.md',writerId:'old',revision:1,schemaVersion:1,updatedAt:Date.now(),baseVersion:'v1',baseContent:'base',content:'mine',kind:'text',state:'dirty'});
 api.read=async()=>({content:'remote',version:'v2'});await wait();
 const button=text=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes(text));button('Recover unsaved text').click();await settle(()=>!!button('Review text'));button('Review text').click();await settle(()=>!!document.querySelector('.draft-dialog'));
 check(inside(document.querySelector('.draft-dialog')),'conflict dialog hidden by keyboard');
 const copy=document.querySelector('[aria-label="Recovered copy path"]');copy.focus();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await wait();
 check(!document.querySelector('.draft-dialog'),'Escape postpones safely');
 };
 window.keyboard=async(height,offsetTop=0)=>{
 Object.assign(fake,{height,offsetTop});fake.dispatchEvent(new Event('resize'));fake.dispatchEvent(new Event('scroll'));await wait();
 await settle(()=>inside(document.querySelector('.mobile-toolbar')));
 check(inside(document.querySelector('.draft-status')),'draft status hidden by keyboard');
 const more=document.querySelector('.mobile-toolbar [aria-label="More"]');more.click();await settle(()=>!!document.querySelector('[role="menu"]'));
 check(inside(document.querySelector('[role="menu"]')),'keyboard menu bounds');
 const color=document.querySelector('[role="menu"] [aria-label="Text color"]');check(color,'color in menu');color.click();await settle(()=>!!document.querySelector('.color-palette'));
 check(inside(document.querySelector('.color-palette')),'keyboard palette bounds');
 document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await wait();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 check(view.state.selection.main.to===5,'keyboard keeps selection');return {height,offsetTop,layoutHeight:innerHeight};
 };`},bundle:true,format:'iife',platform:'browser',define:{'import.meta.env.DEV':'false'},outfile:join(dir,'fixture.js'),logLevel:'silent'});
 await writeFile(join(dir,'index.html'),'<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="fixture.css"><script src="fixture.js"></script>');
 await writeFile(join(dir,'runner.cjs'),`
 const {app,BrowserWindow}=require('electron');const fs=require('fs');app.setPath('userData',${JSON.stringify(join(dir,'profile'))});
 app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,width:1440,height:900,webPreferences:{backgroundThrottling:false}});await w.loadFile(${JSON.stringify(join(dir,'index.html'))});
 const page=async(code)=>{const r=await w.webContents.executeJavaScript('Promise.resolve().then(()=>('+code+')).catch(e=>({failure:e.stack}))');if(r?.failure)throw Error(r.failure);return r;};
 w.webContents.debugger.attach('1.3');
 // Hidden Ozone windows have no reliable native surface (sometimes 1x1).
 // Preserve each zoom's effective CSS viewport and wait for its asynchronous layout.
 const viewport=async(width,height)=>{await w.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});const factor=w.webContents.getZoomFactor();const expected=[Math.round(width/factor),Math.round(height/factor)];const deadline=Date.now()+4000;let actual;do{actual=await w.webContents.executeJavaScript('[innerWidth,innerHeight]');if(actual[0]===expected[0]&&actual[1]===expected[1])return;await new Promise(resolve=>setTimeout(resolve,10));}while(Date.now()<deadline);throw Error('Viewport mismatch '+JSON.stringify({actual,expected,factor}));};
 const results={zoom:[],keyboard:[]};
 for(const factor of [1,1.25,1.5,2]){w.webContents.setZoomFactor(factor);await viewport(1440,900);await page('window.setup(false)');for(const sidebar of [0,220,420]){const r=await page('window.checkDesktop('+sidebar+')');if(Math.abs(w.webContents.getZoomFactor()-factor)>0.01)throw Error('Zoom mismatch');results.zoom.push({factor,...r});}}
 w.webContents.setZoomFactor(1);await viewport(1440,900);await page('window.fixed()');await w.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await w.webContents.debugger.sendCommand('Emulation.setTouchEmulationEnabled',{enabled:true});
 await page('window.setupMobile()');for(const args of [[844,0],[480,0],[280,120],[844,0]])results.keyboard.push(await page('window.keyboard('+args.join(',')+')'));
 await page('window.keyboard(280,120)');await page('window.conflictKeyboard()');
 await w.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:390,height:480,screenHeight:844,deviceScaleFactor:1,mobile:true});results.keyboard.push({...await page('window.keyboard(480,0)'),mode:'layout-resize'});
 console.log('VIEWPORT_RESULTS:'+JSON.stringify(results));w.destroy();app.quit();}).catch(e=>{console.error(e);app.exit(1)});`);
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const {stdout}=await promisify(execFile)(createRequire(import.meta.url)('electron'),[...(process.platform==='linux'?['--ozone-platform=headless']:[]),join(dir,'runner.cjs')],{env,windowsHide:true,timeout:60000});
 assert.match(stdout,/VIEWPORT_RESULTS:/);process.stdout.write(stdout);
 }finally{assert.ok(dir.startsWith(join(tmpdir(),'webo-viewport-')));await rm(dir,{recursive:true,force:true});}
});
