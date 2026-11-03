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

test('real editor: Tab, Shift-Tab, visible folding and undo work in live and source modes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'webo-structure-'));
 try {
  await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx',contents:`
   import React from 'react';import {createRoot} from 'react-dom/client';
   import Editor from './src/components/Editor';import {useStore,documentSessions} from './src/lib/store';
   import {DocumentSession} from './src/lib/drafts/session';
   import {api} from './src/lib/api';import {getActiveEditor} from './src/lib/activeEditor';
   import {foldCode,unfoldAll,foldedRanges,forceParsing} from '@codemirror/language';
   import {undo} from '@codemirror/commands';import './src/styles/obsidian.css';
   api.tags=async()=>({tags:[]});api.propertyTypes=async()=>({types:{}});
   const wait=()=>new Promise(r=>setTimeout(r,100));const check=(v,m)=>{if(!v)throw Error(m)};
   const fence=String.fromCharCode(96).repeat(3);
   const doc=['# Title','body','','- parent','\\t- child','\\t\\t- grandchild','- sibling','','plain','\\tchild','','code',fence+'abap','ZCL_3409_BADI_PRP-GET_INSURED_INFO','\\tzcl_3409_helper=>convert_date( EXPORTING iv_date = start_dt','\\t\\tIMPORTING ev_date = begin ).','','\\tzcl_3409_helper=>convert_date( EXPORTING iv_date = finish_dt','\\t\\tIMPORTING ev_date = end ).',fence,'','# Next','end'].join('\\n');
   let root;
   window.prepare=async (mode,scope='structure-test')=>{
    root?.unmount();document.body.className='theme-dark';document.body.innerHTML='<div class="cm-s-obsidian" id="root"></div>';
    documentSessions.set(mode+'.md',new DocumentSession({scopeId:scope,path:mode+'.md',writerId:'fixture',content:doc,version:'base'},{put:async()=>{},remove:async()=>true,write:async()=>({version:'new'})}));
    useStore.setState({activePath:mode+'.md',content:doc,dirty:false,viewMode:mode,showInlineTitle:false,locked:false,save:async()=>{}});
    root=createRoot(document.querySelector('#root'));root.render(<Editor/>);await wait();await wait();
    const v=getActiveEditor();check(v,'editor mounted');
    check(!v.dom.querySelector('.cm-foldGutter'),'no separate gutter');check(v.contentDOM.querySelector('.cm-fold-indicator'),'inline controls visible');
    check(v.dom.querySelector('.cm-code-indent-guide'),'code indentation guides visible');
    v.dispatch({selection:{anchor:v.state.doc.line(4).from}});v.focus();await wait();
   };
   window.foldParent=async()=>{
    const v=getActiveEditor();check(foldCode(v),'parent folds');await wait();
    check(foldedRanges(v.state).size===1,'parent fold retained');check(v.state.doc.toString()===doc,'fold does not edit Markdown');
    check(v.dom.querySelector('.cm-foldPlaceholder'),'collapsed placeholder visible');
   };
   window.indented=async()=>{
    const v=getActiveEditor();await wait();check(v.state.doc.line(4).text==='\\t- parent','Tab indents parent');
    check(v.state.doc.line(5).text==='\\t\\t- child','Tab indents hidden child');
    check(foldedRanges(v.state).size===1,'Tab preserves fold');
   };
   window.outdented=async()=>{
    const v=getActiveEditor();await wait();check(v.state.doc.toString()===doc,'Shift-Tab restores whole subtree');
    undo(v);check(v.state.doc.line(5).text==='\\t\\t- child','undo reverts one complete outdent');undo(v);
    check(v.state.doc.toString()===doc,'undo restores original');unfoldAll(v);await wait();
    const heading=v.contentDOM.querySelector('.cm-outline-collapse');
    check(heading,'clickable fold arrow');const r=heading.getBoundingClientRect();
    heading.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.left+3,clientY:r.top+3,button:0}));await wait();
    check(foldedRanges(v.state).size>0,'arrow click folds section');unfoldAll(v);await wait();
    check(v.state.doc.toString()===doc,'click folding does not change text');
   };
   window.nestedCode=async()=>{
    const v=getActiveEditor();unfoldAll(v);v.dispatch({selection:{anchor:v.state.doc.line(15).from}});await wait();
    const clickLine=async n=>{
     const line=v.state.doc.line(n),block=v.lineBlockAt(line.from),y=v.documentTop+block.top+block.height/2;
     const marker=Array.from(v.contentDOM.querySelectorAll('.cm-fold-indicator')).find(e=>v.state.doc.lineAt(v.posAtDOM(e)).number===n)?.querySelector('button');
     check(marker,'nested ABAP fold arrow on line '+n);const r=marker.getBoundingClientRect();
     const parentPos=v.posAtDOM(marker.parentElement);check(parentPos-line.from===line.text.match(/^[\\t ]*/)[0].length,'arrow at start of text after indentation');
     marker.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.left+3,clientY:y,button:0}));await wait();
    };
    await clickLine(15);
    check(foldedRanges(v.state).size===1,'first call continuation folds');
    check(!v.contentDOM.textContent.includes('IMPORTING ev_date = begin'),'first continuation hidden');
    check(v.contentDOM.textContent.includes('IMPORTING ev_date = end'),'sibling continuation stays visible');
    check(v.contentDOM.textContent.includes('ZCL_3409'),'enclosing block stays open');
    await clickLine(15);check(foldedRanges(v.state).size===0,'same arrow unfolds continuation');
    check(v.contentDOM.textContent.includes('IMPORTING ev_date = begin'),'continuation restored');
    await clickLine(18);const folds=[];foldedRanges(v.state).between(0,v.state.doc.length,(from,to)=>folds.push([from,to]));check(!v.contentDOM.textContent.includes('IMPORTING ev_date = end'),'second continuation folds independently '+JSON.stringify({folds,line18:v.state.doc.line(18).to,line19:v.state.doc.line(19).to,text:v.contentDOM.textContent}));
    await clickLine(18);check(foldedRanges(v.state).size===0,'second continuation unfolds');
    check(v.state.doc.toString()===doc,'fold/unfold round trip preserves original code');
   };
   window.persistence=async mode=>{
    let v=getActiveEditor();v.dispatch({selection:{anchor:v.state.doc.line(15).from}});foldCode(v);await wait();
    check(foldedRanges(v.state).size===1,'fold before reopening');
    await window.prepare(mode);v=getActiveEditor();check(foldedRanges(v.state).size===1,'fold restored after editor recreation');
    check(v.contentDOM.querySelector('.cm-fold-indicator.is-collapsed'),'collapsed inline indicator restored');
    await window.prepare(mode,'other-vault');check(foldedRanges(getActiveEditor().state).size===0,'folds isolated by vault');
    await window.prepare(mode);check(foldedRanges(getActiveEditor().state).size===1,'original vault folds retained');
    unfoldAll(getActiveEditor());
   };
   window.longHydration=async()=>{
    const text='# Start\\n'+'text\\n'.repeat(5000)+'# Deep\\nbody\\n## Child\\nbody\\n# End';
    api.draftScope=async()=>({scopeId:'structure-test'});api.read=async()=>({content:text,version:'long-version'});
    useStore.setState({dirty:false,viewMode:'source'});await useStore.getState().openFile('long.md');await wait();await wait();
    let v=getActiveEditor();check(forceParsing(v,text.length,1000),'parse deep heading for initial fold');
    v.dispatch({selection:{anchor:v.state.doc.line(5002).from}});check(foldCode(v),'deep heading folds');await wait();
    check(foldedRanges(v.state).size===1,'one deep fold before reload');
    root.unmount();documentSessions.delete('long.md');useStore.setState({content:'',activePath:'long.md',dirty:false});
    root=createRoot(document.querySelector('#root'));root.render(<Editor/>);await wait();
    check(!documentSessions.has('long.md'),'editor first mounts before document hydration');
    await useStore.getState().openFile('long.md');
    const end=performance.now()+3000;do{await wait();v=getActiveEditor();}while(foldedRanges(v.state).size!==1&&performance.now()<end);
    check(foldedRanges(v.state).size===1,'deep fold restored after actual asynchronous document hydration');
    check(v.state.doc.toString()===text,'restoring fold never edits long document');
   };
  `},bundle:true,format:'iife',platform:'browser',loader:{'.woff2':'file','.woff':'file','.ttf':'file'},define:{'import.meta.env.DEV':'false','import.meta.url':JSON.stringify('file:///fixture.js')},outfile:join(dir,'fixture.js'),logLevel:'silent'});
  await writeFile(join(dir,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><script src="fixture.js"></script>');
  await writeFile(join(dir,'runner.cjs'),`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(dir,'profile'))});app.whenReady().then(async()=>{
   const w=new BrowserWindow({show:false,width:1100,height:1000,webPreferences:{backgroundThrottling:false}});w.webContents.on('console-message',(_event,level,message)=>{if(level>=2)console.error(message)});await w.loadFile(${JSON.stringify(join(dir,'index.html'))});
   const evaluate=async code=>{const result=await w.webContents.executeJavaScript('(async()=>{try{return await '+code+'}catch(e){return {failure:e.stack||String(e)}}})()');if(result?.failure)throw Error(result.failure);};
   for(const mode of ['live','source']){
    await evaluate('window.prepare('+JSON.stringify(mode)+')');await evaluate('window.foldParent()');
    w.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});w.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'});
    await evaluate('window.indented()');
    w.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab',modifiers:['shift']});w.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab',modifiers:['shift']});
    await evaluate('window.outdented()');await evaluate('window.nestedCode()');await evaluate('window.persistence('+JSON.stringify(mode)+')');
   }await evaluate('window.longHydration()');console.log('STRUCTURE_PASS');w.destroy();app.quit();}).catch(e=>{console.error(e);app.exit(1)});`);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const {stdout}=await promisify(execFile)(createRequire(import.meta.url)('electron'),[...(process.platform==='linux'?['--ozone-platform=headless']:[]),join(dir,'runner.cjs')],{env,windowsHide:true,timeout:60000});
  assert.match(stdout,/STRUCTURE_PASS/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
