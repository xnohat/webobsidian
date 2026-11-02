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

test('embedded notes expose an accessible open button in live, reading and HTML preview',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'webo-note-embed-'));
 try{
  await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx',contents:`
   import React from 'react';import {createRoot} from 'react-dom/client';
   import Editor from './src/components/Editor';import Preview from './src/components/Preview';
   import {useStore} from './src/lib/store';import {api} from './src/lib/api';
   import './src/styles/obsidian.css';
   api.tags=async()=>({tags:[]});api.propertyTypes=async()=>({types:{}});
   api.resolve=async target=>({path:target.endsWith('.md')?target:'Lab/'+target.split('#')[0]+'.md'});
   api.read=async path=>({content:path==='Lab/Parent.md'?'![[#Section]]\\n\\n# Section\\nNested note body':'# Section\\nEmbedded note body',version:'fixture'});
   const root=createRoot(document.querySelector('#root'));
   const wait=()=>new Promise(r=>setTimeout(r,60));
   const check=(ok,msg)=>{if(!ok)throw Error(msg)};
   const until=async(fn,msg)=>{for(let i=0;i<60&&!fn();i++)await wait();check(fn(),msg)};
   const source='# Host\\n\\n![[Opencode]]\\n\\n![[Other#Section]]';
   let opened=[];
   const open=async(target,kind)=>{opened.push([target,kind])};
   window.run=async()=>{
    const resolve=api.resolve;api.resolve=async()=>({path:null});
    for(const mode of ['live','reading']){
     const missing='# Host\\n\\n![[Missing]]\\n\\n![[Missing#Section]]';
     useStore.setState({activePath:'Missing-host.md',content:missing,viewMode:mode,showInlineTitle:false,locked:false,dirty:false,save:async()=>{},openWikilink:open});root.render(<Editor/>);
     await until(()=>document.querySelectorAll('.cm-note-embed.is-unresolved').length===2,mode+': missing note placeholders mounted');
     const placeholders=[...document.querySelectorAll('.cm-note-embed.is-unresolved')];
     check(placeholders.every(e=>!!e.querySelector('button[aria-label="Open embedded note"]')),mode+': unresolved note and heading retain source buttons');
     check(placeholders[0].querySelector('.markdown-embed-title').textContent==='Missing'&&placeholders[1].textContent.includes('Section'),mode+': native missing-note and missing-heading labels');
     opened=[];placeholders[1].querySelector('button').click();await wait();check(JSON.stringify(opened)===JSON.stringify([['Missing#Section','wiki']]),mode+': unresolved heading opens its actual target');
     check(useStore.getState().content===missing,mode+': unresolved note display and actions preserve source');root.render(<div/>);await wait();
    }
    api.resolve=resolve;
    for(const mode of ['live','reading','preview']){
     useStore.setState({activePath:'Host.md',content:source,viewMode:mode==='preview'?'reading':mode,showInlineTitle:false,locked:false,dirty:false,save:async()=>{},openWikilink:open});
     root.render(mode==='preview'?<Preview/>:<Editor/>);
     await until(()=>document.body.textContent.includes('Embedded note body'),'note bodies loaded');
     const buttons=[...document.querySelectorAll('button[aria-label="Open embedded note"]')];
     check(buttons.length===2,mode+': each embedded note has its open button');
     for(const button of buttons){
      const css=getComputedStyle(button),rect=button.getBoundingClientRect();
      check(css.visibility==='visible'&&Number(css.opacity)>0&&rect.width>=20&&rect.height>=20,mode+': button visible without hover');
      check(button.tabIndex===0&&button.type==='button',mode+': native keyboard button');
      const svg=button.querySelector('svg'),icon=svg.getBoundingClientRect(),bounds=svg.getBBox(),vb=svg.viewBox.baseVal;
      check(icon.width===16&&icon.height===16&&icon.left>=rect.left&&icon.right<=rect.right&&icon.top>=rect.top&&icon.bottom<=rect.bottom,mode+': whole icon fits inside its button');
      check(bounds.x>=vb.x&&bounds.y>=vb.y&&bounds.x+bounds.width<=vb.x+vb.width&&bounds.y+bounds.height<=vb.y+vb.height,mode+': complete arrow paths fit inside SVG viewport');
      for(const [x,y] of [[icon.left+3,icon.top+3],[icon.right-3,icon.top+3],[icon.left+3,icon.bottom-3],[icon.right-3,icon.bottom-3]])check(button.contains(document.elementFromPoint(x,y)),mode+': all icon corners stay above embed content '+JSON.stringify({x,y,hit:document.elementFromPoint(x,y)?.outerHTML,icon:icon.toJSON(),viewport:{width:innerWidth,height:innerHeight}}));

     }
     opened=[];buttons[1].click();await wait();
     check(JSON.stringify(opened)===JSON.stringify([[mode==='preview'?'Lab/Other.md#Section':'Other#Section','wiki']]),mode+': opens the clicked fragment exactly once');
     opened=[];buttons[0].click();await wait();
     check(JSON.stringify(opened)===JSON.stringify([[mode==='preview'?'Lab/Opencode.md':'Opencode','wiki']]),mode+': opens the correct note exactly once');
     check(useStore.getState().content===source,mode+': opening preserves source');
     root.render(<div/>);await wait();
    }
    for(const mode of ['live','reading','preview']){
     useStore.setState({activePath:'Host.md',content:'# Host\\n\\n![[Opencode.md]]',viewMode:mode==='preview'?'reading':mode,openWikilink:open});
     root.render(mode==='preview'?<Preview/>:<Editor/>);
     await until(()=>document.body.textContent.includes('Embedded note body'),mode+': explicit .md embeds note content');
     check(document.querySelectorAll('button[aria-label="Open embedded note"]').length===1,mode+': .md embed has open button');
     root.render(<div/>);await wait();
    }
    for(const mode of ['live','reading','preview']){
     useStore.setState({activePath:'Host.md',content:'# Host\\n\\n![[Parent]]',viewMode:mode==='preview'?'reading':mode,openWikilink:open});
     root.render(mode==='preview'?<Preview/>:<Editor/>);
     await until(()=>document.querySelectorAll('button[aria-label="Open embedded note"]').length===2,'nested note buttons mounted');
     opened=[];document.querySelectorAll('button[aria-label="Open embedded note"]')[1].click();await wait();
     check(JSON.stringify(opened)===JSON.stringify([['Lab/Parent.md#Section','wiki']]),mode+': nested local fragment opens its own source note');
     root.render(<div/>);await wait();
    }
    const read=api.read;api.read=async()=>({content:'> This block is marked and used for transclusion and block links. ^quote',version:'fixture'});
    for(const mode of ['live','reading','preview'])for(const fontSize of [12,16,19]){
     const quoteSource='# Host\\n\\n![[Quote#^quote]]';useStore.setState({activePath:'Host.md',content:quoteSource,viewMode:mode==='preview'?'reading':mode,openWikilink:open});root.render(mode==='preview'?<Preview/>:<Editor/>);
     await until(()=>document.querySelector('blockquote')?.textContent.includes('This block'),'quoted block mounted');const button=document.querySelector('.markdown-embed-link'),box=button.closest('.cm-note-embed,.embed-note');box.style.fontSize=fontSize+'px';await wait();
     const icon=button.querySelector('svg').getBoundingClientRect();for(const [x,y] of [[icon.left+3,icon.top+3],[icon.right-3,icon.top+3],[icon.left+3,icon.bottom-3],[icon.right-3,icon.bottom-3]])check(button.contains(document.elementFromPoint(x,y)),mode+': quoted block icon stays fully exposed at '+fontSize+'px');
     opened=[];button.click();await wait();check(opened.length===1,mode+': quote source opens once');check(useStore.getState().content===quoteSource,mode+': quote action preserves source');root.render(<div/>);await wait();
    }
    const host=document.querySelector('#root');host.style.cssText='width:900px;height:900px;display:flex;flex-direction:column';
    const wide='# Host'+String.fromCharCode(10).repeat(35)+'![[Quote#^quote]]'+String.fromCharCode(10).repeat(35)+'## After';
    useStore.setState({activePath:'Wide.md',content:wide,viewMode:'live',openWikilink:open});root.render(<Editor/>);await until(()=>!!document.querySelector('.cm-note-embed blockquote'),'wide quote mounted');await wait();
    const icon=document.querySelector('.cm-note-embed .markdown-embed-link svg'),scroll=document.querySelector('.cm-scroller'),rail=document.querySelector('.doc-outline');let ir=icon.getBoundingClientRect(),rr=rail.getBoundingClientRect();scroll.scrollTop+=ir.y+ir.height/2-(rr.y+rr.height/2);await wait();ir=icon.getBoundingClientRect();
    for(const [x,y] of [[ir.left+1,ir.top+1],[ir.right-1,ir.top+3],[ir.left+1,ir.bottom-3],[ir.right-1,ir.bottom-1]])check(icon.closest('button').contains(document.elementFromPoint(x,y)),'outline does not cover wide quote icon: '+JSON.stringify({x,y,hit:document.elementFromPoint(x,y)?.outerHTML,icon:{x:ir.x,y:ir.y,width:ir.width,height:ir.height},rail:rail.getBoundingClientRect().toJSON()}));
    root.render(<div/>);await wait();host.style.cssText='width:600px;height:1000px';api.read=read;
    useStore.setState({activePath:'Host.md',content:source,viewMode:'live',openWikilink:open});root.render(<Editor/>);
    await until(()=>document.querySelector('button[aria-label="Open embedded note"]'),'keyboard button mounted');
    opened=[];document.querySelector('button[aria-label="Open embedded note"]').focus();
    window.verifyKeyboard=()=>{check(JSON.stringify(opened)===JSON.stringify([['Opencode','wiki']]),'Enter opens focused embed once: '+JSON.stringify({opened,focus:document.activeElement?.outerHTML?.slice(0,220),content:useStore.getState().content}));check(useStore.getState().content===source,'keyboard action preserves source')};
    return 'READY';
   };
  `},bundle:true,format:'iife',platform:'browser',tsconfigRaw:{compilerOptions:{useDefineForClassFields:false,jsx:'react-jsx'}},
   loader:{'.woff2':'file','.woff':'file','.ttf':'file'},define:{'import.meta.env.DEV':'false'},outfile:join(dir,'fixture.js'),logLevel:'silent'});
  await writeFile(join(dir,'index.html'),'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><body class="theme-dark"><div id="root" style="width:600px;height:1000px"></div><script src="fixture.js"></script>');
  await writeFile(join(dir,'runner.cjs'),`
   const {app,BrowserWindow}=require('electron');
   app.setPath('userData',${JSON.stringify(join(dir,'profile'))});
   app.whenReady().then(async()=>{
    const win=new BrowserWindow({show:false,width:1000,height:1200,webPreferences:{backgroundThrottling:false}});
    win.webContents.on('console-message',(_e,_level,message)=>{if(message.includes('crashed'))console.error(message)});
    await win.loadFile(${JSON.stringify(join(dir,'index.html'))});
    win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:1000,height:1200,deviceScaleFactor:1,mobile:false});
    win.webContents.focus();
    await win.webContents.executeJavaScript('window.run()');
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});win.webContents.sendInputEvent({type:'char',keyCode:String.fromCharCode(13)});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});
    await win.webContents.executeJavaScript('new Promise(r=>setTimeout(r,100)).then(()=>window.verifyKeyboard())');
    console.log('NOTE_EMBED_PASS');win.destroy();app.quit();
   }).catch(e=>{console.error(e);app.exit(1)});
  `);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const {stdout}=await promisify(execFile)(createRequire(import.meta.url)('electron'),[...(process.platform==='linux'?['--ozone-platform=headless']:[]),join(dir,'runner.cjs')],{env,windowsHide:true,timeout:60_000});
  assert.match(stdout,/NOTE_EMBED_PASS/);
 }finally{
  assert.ok(dir.startsWith(join(tmpdir(),'webo-note-embed-')));await rm(dir,{recursive:true,force:true});
 }
});
