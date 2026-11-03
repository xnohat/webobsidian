import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {build} from 'esbuild';

test('browser: new note directories, actual suggester insertion, excluded ranking and supported explorer files',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'webo-vault-links-'));
 try{
  await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';import {EditorState} from '@codemirror/state';import {EditorView} from '@codemirror/view';
import FileTree from './src/components/FileTree';import CommandPalette from './src/components/CommandPalette';
import Preview from './src/components/Preview';import {livePreviewPlugin,livePreviewState,livePreviewReadonly,setLivePreviewLinkHandler} from './src/lib/livePreview';
import {useStore} from './src/lib/store';import {api} from './src/lib/api';import {suggesterPlugin,setLinkSuggestFiles} from './src/lib/suggest';
import {getVaultPreferences,defaultVaultPreferences} from './src/lib/vaultPreferences';
window.run=async()=>{
 const check=(v,m)=>{if(!v)throw Error(m)};const wait=()=>new Promise(r=>setTimeout(r,100));
 let preferences={...defaultVaultPreferences,showUnsupportedFiles:false,userIgnoreFilters:['Archive'],newFileLocation:'current'};
 window.fetch=async()=>Response.json({values:preferences,sources:{},warnings:[],vaultPath:'/fixture'});
 api.vaultPreferences=getVaultPreferences;api.getSettings=async()=>({ui:{},vault:{path:'/fixture'}});api.indexStatus=async()=>{throw Error('fixture')};api.tags=async()=>({tags:[]});
 let written='';api.write=async(path)=>{written=path;return {ok:true}};
 const file=(path)=>({name:path.split('/').pop(),path,type:'file'}),folder=(path,children)=>({name:path,path,type:'folder',children});
 const tree=folder('',[folder('Notes',[file('Notes/Source.md')]),folder('Deep',[folder('Deep/A',[file('Deep/A/Target.md')])]),folder('Else',[file('Else/Target.md')]),folder('Archive',[file('Archive/Target.md')]),file('supported.docx'),file('custom.unknown')]);
 useStore.setState({tree,activePath:'Notes/Source.md',dirty:false,loadTree:async()=>{},paletteOpen:false,showAttachmentFolders:true,expanded:['Archive','Notes']});
 for(const [mode,expected] of [['root','Untitled.md'],['current','Notes/Untitled.md'],['folder','Configured/Untitled.md']]){preferences={...preferences,newFileLocation:mode,newFileFolderPath:'Configured'};await useStore.getState().newNote();check(written===expected,'new note '+mode+': '+written);}
 await useStore.getState().newNote('');check(written==='Untitled.md','explicit root wins');
 document.body.innerHTML='<div id="root"></div><div id="editor"></div>';const root=createRoot(document.querySelector('#root'));root.render(<><FileTree/><CommandPalette/></>);await getVaultPreferences();await wait();
 check(!!document.querySelector('[data-path="supported.docx"]'),'supported docs remain visible');check(!document.querySelector('[data-path="custom.unknown"]'),'unknown type hidden');check(!!document.querySelector('[data-path="Archive/Target.md"]'),'excluded note stays in explorer');
 useStore.setState({paletteOpen:true,paletteMode:'files'});await wait();const items=[...document.querySelectorAll('.palette-item')].map(e=>e.textContent);check(items.findIndex(s=>s.includes('Else/Target.md'))<items.findIndex(s=>s.includes('Archive/Target.md')),'excluded quick switcher results rank lower');check(!items.some(s=>s.includes('custom.unknown')),'quick switcher hides unknown file');
 useStore.setState({paletteOpen:false});await wait();setLinkSuggestFiles(()=>['Deep/A/Target.md','Else/Target.md','Archive/Target.md']);
 // The fixture window stays hidden; supply focus status while retaining the real activeElement.
 Object.defineProperty(document,'hasFocus',{value:()=>true,configurable:true});
 window.requestAnimationFrame=callback=>window.setTimeout(()=>callback(performance.now()),0);window.cancelAnimationFrame=id=>clearTimeout(id);
 const view=new EditorView({state:EditorState.create({extensions:[suggesterPlugin]}),parent:document.querySelector('#editor')});
 for(const markdown of [false,true])for(const format of ['shortest','relative','absolute']){
  preferences={...preferences,useMarkdownLinks:markdown,newLinkFormat:format};await getVaultPreferences();view.focus();view.dispatch({changes:{from:0,to:view.state.doc.length,insert:'[[Deep/A/Tar'},selection:{anchor:12}});await wait();
  const item=document.querySelector('.suggestion-item');check(item,'suggestion exists '+format+' focus='+view.hasFocus+' active='+document.activeElement?.className+' doc='+view.state.doc.toString());item.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true}));await wait();
  const text=view.state.doc.toString();const p=format==='shortest'?'A/Target':format==='relative'?'../Deep/A/Target':'/Deep/A/Target';const expected=markdown?'[Target]('+p+'.md)':'[['+p+']]';check(text===expected,'insert '+markdown+' '+format+': '+text+' expected '+expected);
 }
 view.destroy();root.unmount();
 const source='start\\n\\n[[shot%20one]]\\n\\n[Space](shot%20one.md)\\n\\n[Hash](shot%20%231.md)';
 const calls=[];const expected=[['shot%20one','wiki'],['shot%20one.md','markdown'],['shot%20%231.md','markdown']];
 setLivePreviewLinkHandler((target,kind='wiki')=>calls.push([target,kind]));
 const lp=new EditorView({state:EditorState.create({doc:source,extensions:[livePreviewState,livePreviewReadonly,livePreviewPlugin]}),parent:document.querySelector('#editor')});await wait();
 const widgets=[...document.querySelectorAll('.cm-wikilink,.cm-md-link')];check(widgets.length===3,'LP link widgets render');for(const anchor of widgets){anchor.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true}));anchor.click();}
 check(JSON.stringify(calls)===JSON.stringify(expected),'LP click preserves syntax and encoded target: '+JSON.stringify(calls));calls.length=0;for(const anchor of widgets)anchor.click();check(JSON.stringify(calls)===JSON.stringify(expected),'keyboard-generated click opens links exactly once');lp.destroy();calls.length=0;
 useStore.setState({openWikilink:(target,kind='wiki')=>calls.push([target,kind])});
 const previewRoot=createRoot(document.querySelector('#root'));previewRoot.render(<Preview source={source}/>);await wait();await wait();
 const anchors=[...document.querySelectorAll('.preview-inner a[data-wikilink],.preview-inner a[data-link-kind="markdown"]')];check(anchors.length===3,'Preview link anchors render');for(const anchor of anchors)anchor.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
 check(JSON.stringify(calls)===JSON.stringify(expected),'Preview click preserves syntax and encoded target: '+JSON.stringify(calls));previewRoot.unmount();return true;
};`},bundle:true,format:'iife',platform:'browser',loader:{'.woff2':'file','.woff':'file','.ttf':'file'},define:{'import.meta.env.DEV':'false','import.meta.url':JSON.stringify('file:///fixture.js')},outfile:join(dir,'fixture.js'),logLevel:'silent'});
  await writeFile(join(dir,'index.html'),'<meta charset="utf-8"><script src="fixture.js"></script>');
  await writeFile(join(dir,'runner.cjs'),`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(dir,'profile'))});app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,width:1200,height:900,webPreferences:{backgroundThrottling:false}});await w.loadFile(${JSON.stringify(join(dir,'index.html'))});const result=await w.webContents.executeJavaScript('window.run().catch(e=>({failure:e.stack}))');if(result?.failure)throw Error(result.failure);console.log('VAULT_LINKS_PASS');w.destroy();app.quit()}).catch(e=>{console.error(e);app.exit(1)});`);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const {stdout}=await promisify(execFile)(createRequire(import.meta.url)('electron'),[...(process.platform==='linux'?['--ozone-platform=headless']:[]),join(dir,'runner.cjs')],{env,windowsHide:true,timeout:30000});
  assert.match(stdout,/VAULT_LINKS_PASS/);
 }finally{assert.ok(dir.startsWith(join(tmpdir(),'webo-vault-links-')));await rm(dir,{recursive:true,force:true});}
});
