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

test('workspace note source buttons reveal headings and native block references without editing documents',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'webo-note-fragments-'));
 try{
  await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx',contents:`
   import React from 'react';import {createRoot} from 'react-dom/client';
   import Editor from './src/components/Editor';import Preview from './src/components/Preview';
   import {useStore} from './src/lib/store';import {api} from './src/lib/api';
   import './src/styles/obsidian.css';
   import {getActiveEditor} from './src/lib/activeEditor';
   import {foldEffect,foldedRanges} from '@codemirror/language';
   import {noteFragmentRange} from '../server/src/services/markdownContext';
   import {initUrlSync,restoreWorkspaceFromUrl} from './src/lib/urlsync';
   const filler=Array.from({length:45},(_,i)=>'Filler paragraph '+i).join('\\n\\n');
   const files={'Host.md':'# Host\\n\\n![[Target#Parent#Section]]\\n\\n![[Target#^task]]\\n\\n![[Target#^callout]]\\n\\n![[Target#^quote]]','Target.md':'# Target\\n\\n'+filler+'\\n\\n## Parent\\n\\n### **Section**\\n\\nSECTION_BODY\\n\\n'+filler+'\\n\\n- [x] TASK_BODY ^task\\n\\n'+filler+'\\n\\n> [!note] Title\\n> CALLOUT_BODY ^callout\\n\\n'+filler+'\\n\\n> QUOTE_BODY ^quote\\n\\n'+filler};
   api.tags=async()=>({tags:[]});api.propertyTypes=async()=>({types:{}});api.draftScope=async()=>({scopeId:'fixture-note-fragments'});

   let writes=0;api.read=async path=>({content:files[path]??'',version:'fixture'});api.write=async()=>{writes++;return {ok:true}};api.putUiState=async()=>({ok:true});
   const root=createRoot(document.querySelector('#root'));
   const wait=()=>new Promise(r=>setTimeout(r,50)),check=(ok,msg)=>{if(!ok)throw Error(msg)};
   const until=async(fn,msg)=>{for(let i=0;i<160;i++){if(fn())return;await wait()}throw Error(msg+' '+JSON.stringify({path:useStore.getState().activePath,nav:useStore.getState().noteNavigation,position:getActiveEditor()?.state.selection.main.head,scroll:getActiveEditor()?.scrollDOM.scrollTop,body:document.body.innerText.slice(-300)}))};
   window.run=async()=>{
    for(const mode of ['live','reading','source','preview']){
     useStore.setState({activePath:'Host.md',content:files['Host.md'],viewMode:mode==='preview'?'reading':mode,showInlineTitle:false,locked:false,dirty:false,noteNavigation:null});
     root.render(mode==='preview'?<Preview/>:<Editor/>);
     for(const [index,fragment] of ['Parent#Section','^task','^callout','^quote'].entries()){
      if(mode==='source')await useStore.getState().openWikilink('Target#'+fragment);
      else{
       if(useStore.getState().activePath!=='Host.md')await useStore.getState().openFile('Host.md');
       await until(()=>document.querySelectorAll('button[aria-label="Open embedded note"]').length===4,mode+': source buttons');
       document.querySelectorAll('button[aria-label="Open embedded note"]')[index].click();
      }
      await until(()=>useStore.getState().activePath==='Target.md',mode+': source opens');
      const range=noteFragmentRange(files['Target.md'],fragment);check(!!range,'fixture reference range');
      await until(()=>{
       if(mode==='preview'){
        const e=fragment.startsWith('^')?[...document.querySelectorAll('[data-block-id]')].find(e=>e.dataset.blockId===fragment.slice(1)&&!e.closest('.embed-note')):[...document.querySelectorAll('h3')].find(e=>e.textContent==='Section');
        const r=e?.getBoundingClientRect(),scroller=document.querySelector('.markdown-preview');return r&&r.top>=-2&&r.top<100&&scroller.scrollTop>100;
       }
       const v=getActiveEditor(),r=v?.coordsAtPos(range.from),box=v?.scrollDOM.getBoundingClientRect();return v?.state.selection.main.head===range.from&&v.scrollDOM.scrollTop>100&&r&&r.top>=box.top-2&&r.bottom<=box.bottom+2;
      },mode+': reveal '+fragment);
      check(useStore.getState().content===files['Target.md'],mode+': source unchanged');
     }
     await useStore.getState().openWikilink('Target#Parent#Section');await wait();
     if(mode!=='preview')await until(()=>getActiveEditor().state.selection.main.head===noteFragmentRange(files['Target.md'],'Parent#Section').from,mode+': repeated same-file reference');
     await useStore.getState().openWikilink('#^quote');await until(()=>useStore.getState().noteNavigation?.fragment==='^quote'&&(mode==='preview'||getActiveEditor()?.state.selection.main.head===noteFragmentRange(files['Target.md'],'^quote').from),mode+': fragment-only source navigation');
     root.render(<div/>);await wait();
    }
    useStore.setState({activePath:'Host.md',content:files['Host.md'],viewMode:'live',noteNavigation:null});root.render(<Editor/>);await wait();history.replaceState(null,'','/note/Host.md');initUrlSync();
    await useStore.getState().openWikilink('Target');await until(()=>location.hash===''&&getActiveEditor()?.state.selection.main.head===0,'unfragmented note starts at top');
    await useStore.getState().openWikilink('Target#Parent#Section');await until(()=>location.hash==='#Parent%23Section'&&getActiveEditor()?.state.selection.main.head===noteFragmentRange(files['Target.md'],'Parent#Section').from,'URL retains note heading');
    history.back();await until(()=>location.hash===''&&getActiveEditor()?.state.selection.main.head===0&&getActiveEditor()?.scrollDOM.scrollTop<5,'Back to empty fragment returns to top');history.forward();await until(()=>location.hash==='#Parent%23Section'&&getActiveEditor()?.state.selection.main.head===noteFragmentRange(files['Target.md'],'Parent#Section').from,'Forward returns from empty fragment');
    {const v=getActiveEditor(),heading=noteFragmentRange(files['Target.md'],'Parent#Section');v.dispatch({effects:foldEffect.of({from:v.state.doc.lineAt(heading.from).to,to:v.state.doc.length})})}
    await useStore.getState().openWikilink('Target#^task');await until(()=>location.hash==='#%5Etask'&&getActiveEditor()?.state.selection.main.head===noteFragmentRange(files['Target.md'],'^task').from,'URL retains block');
    check(foldedRanges(getActiveEditor().state).size===0,'navigation unfolds a containing section');
    history.back();await until(()=>location.hash==='#Parent%23Section'&&useStore.getState().noteNavigation?.fragment==='Parent#Section'&&getActiveEditor()?.state.selection.main.head===noteFragmentRange(files['Target.md'],'Parent#Section').from,'real Back reveals previous heading');
    history.forward();await until(()=>location.hash==='#%5Etask'&&useStore.getState().noteNavigation?.fragment==='^task'&&getActiveEditor()?.state.selection.main.head===noteFragmentRange(files['Target.md'],'^task').from,'real Forward reveals block');
    location.hash='^quote';await until(()=>useStore.getState().noteNavigation?.fragment==='^quote'&&getActiveEditor()?.state.selection.main.head===noteFragmentRange(files['Target.md'],'^quote').from,'direct hash navigation reveals note block');
    useStore.setState({viewMode:'reading'});root.render(<Preview/>);await useStore.getState().openWikilink('Target');await until(()=>document.querySelector('h3')?.textContent==='Section'&&document.querySelector('.markdown-preview')?.scrollTop===0,'HTML Preview starts at top');
    await useStore.getState().openWikilink('Target#Parent#Section');await until(()=>document.querySelector('.markdown-preview')?.scrollTop>100,'HTML Preview reveals heading');history.back();await until(()=>location.hash===''&&useStore.getState().noteNavigation?.fragment===''&&document.querySelector('.markdown-preview')?.scrollTop===0,'HTML Preview Back to empty fragment returns to top');
    await useStore.getState().openWikilink('Target#^quote');await until(()=>location.hash==='#%5Equote','prepare block permalink for reload');
    check(writes===0,'navigation must not save changed source');
    return 'READY';
   };
   window.restore=async()=>{
    root.render(<Editor/>);await restoreWorkspaceFromUrl(async()=>{useStore.setState({activePath:'Host.md',content:files['Host.md'],viewMode:'live',noteNavigation:null})});
    await until(()=>useStore.getState().activePath==='Target.md'&&getActiveEditor()?.state.selection.main.head===noteFragmentRange(files['Target.md'],'^quote').from,'reload honors note fragment over restored workspace');return 'RESTORED';
   };
  `},bundle:true,format:'iife',platform:'browser',tsconfigRaw:{compilerOptions:{useDefineForClassFields:false,jsx:'react-jsx'}},
   loader:{'.woff2':'file','.woff':'file','.ttf':'file'},define:{'import.meta.env.DEV':'false'},outfile:join(dir,'fixture.js'),logLevel:'silent'});
  await build({entryPoints:[fileURLToPath(new URL('../../server/src/services/fileReferences.ts',import.meta.url))],outfile:join(dir,'resolver.cjs'),bundle:true,platform:'node',format:'cjs',logLevel:'silent'});
  await writeFile(join(dir,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"><body class="theme-dark"><div id="root" style="width:700px;height:650px;display:flex;flex-direction:column"></div><script src="/fixture.js"></script>');
  await writeFile(join(dir,'runner.cjs'),`
   const {app,BrowserWindow}=require('electron'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
   const dir=${JSON.stringify(dir)},resolveReference=require(${JSON.stringify(join(dir,'resolver.cjs'))}).resolveReference;
   app.setPath('userData',${JSON.stringify(join(dir,'profile'))});
   app.whenReady().then(async()=>{
    const win=new BrowserWindow({show:false,width:800,height:1200,webPreferences:{backgroundThrottling:false}});
    win.webContents.on('console-message',(_e,_level,message)=>{if(_level>=2)console.error(message)});
    const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://fixture');if(url.pathname==='/api/resolve'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({path:resolveReference(url.searchParams.get('target')??'',url.searchParams.get('from')??'',['Host.md','Target.md'],url.searchParams.get('kind')==='markdown'?'markdown':'wiki')}));return}const name=url.pathname.startsWith('/note/')||url.pathname==='/'?'index.html':path.basename(url.pathname);try{res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(path.join(dir,name)))}catch{res.writeHead(404).end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
    await win.loadURL('http://127.0.0.1:'+server.address().port);
    win.webContents.focus();
    await win.webContents.executeJavaScript('window.run().catch(e=>{console.error(e.stack);throw e})');
    const loaded=new Promise(r=>win.webContents.once('did-finish-load',r));win.reload();await loaded;await win.webContents.executeJavaScript('window.restore()');
    console.log('NOTE_EMBED_PASS');server.close();win.destroy();app.quit();
   }).catch(e=>{console.error(e);app.exit(1)});
  `);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const {stdout}=await promisify(execFile)(createRequire(import.meta.url)('electron'),[...(process.platform==='linux'?['--ozone-platform=headless']:[]),join(dir,'runner.cjs')],{env,windowsHide:true,timeout:120_000});
  assert.match(stdout,/NOTE_EMBED_PASS/);
 }finally{
  assert.ok(dir.startsWith(join(tmpdir(),'webo-note-fragments-')));await rm(dir,{recursive:true,force:true});
 }
});
