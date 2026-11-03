import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {build} from 'esbuild';

test('native Canvas shapes and generic file cards work in live, reading and HTML preview',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'webo-canvas-embed-'));
 const board=await readFile(new URL('../../tests/fixtures/embeds/Board.canvas',import.meta.url),'utf8');
 try{
  await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx',contents:`
   import React from 'react';import {createRoot} from 'react-dom/client';
   import Editor from './src/components/Editor';import Preview from './src/components/Preview';
   import {useStore} from './src/lib/store';import {api} from './src/lib/api';import './src/styles/obsidian.css';
   const board=${JSON.stringify(board)};let reads=[],opened=[];
   api.tags=async()=>({tags:[]});api.propertyTypes=async()=>({types:{}});
   api.resolve=async target=>({path:target==='Child'?'Lab/Child.md':'Lab/'+target});
   api.read=async path=>{reads.push(path);return {content:path.endsWith('.canvas')?board:path.endsWith('.md')?'![[Board.canvas]]': 'FILE CONTENT MUST STAY HIDDEN',version:'fixture'}};
   const root=createRoot(document.querySelector('#root')),wait=()=>new Promise(r=>setTimeout(r,50));
   const check=(ok,msg)=>{if(!ok)throw Error(msg)};
   const until=async(fn,msg)=>{for(let i=0;i<100&&!fn();i++)await wait();check(fn(),msg+': '+document.body.textContent)};
   const mount=async(mode,source)=>{root.render(<div/>);await wait();opened=[];reads=[];
    useStore.setState({activePath:'Host.md',content:source,viewMode:mode==='preview'?'reading':mode,showInlineTitle:false,locked:false,dirty:false,save:async()=>{},openWikilink:async(target,kind,from)=>{opened.push({target,kind,from})}});
    root.render(mode==='preview'?<Preview/>:<Editor/>);await wait();await wait();
   };
   window.run=async()=>{
    const failures=[];
    for(const part of ['canvas','cards'])try{
     for(const mode of ['live','reading','preview']){
      if(part==='canvas'){
       const source='# Host\\n\\n![[Board.canvas]]';await mount(mode,source);
       await until(()=>document.querySelector('.canvas-embed svg.canvas-minimap'),mode+': canvas minimap loaded');
       const embed=document.querySelector('.canvas-embed'),svg=embed.querySelector('svg.canvas-minimap');
       check(svg.getAttribute('viewBox')==='-76.5 -76.5 803 413',mode+': native reference bounds and padding');
       check(svg.querySelectorAll('rect').length===3&&svg.querySelectorAll('path').length===1,mode+': group, cards and connecting edge rendered');
       check(!svg.querySelector('text,image,foreignObject')&&!embed.textContent.includes('First card')&&!embed.textContent.includes('Connection'),mode+': minimap shows shapes without card text');
       const group=svg.querySelector('rect');check(group.getAttribute('x')==='-40',mode+': negative canvas coordinates preserved');
       const title=embed.querySelector('button[aria-label="Open canvas"]');check(title?.textContent.trim()==='Board',mode+': native canvas title opens full canvas');
       title.click();await wait();check(opened.length===1&&opened[0].target==='Board.canvas'&&opened[0].from==='Host.md',mode+': title opens canvas exactly once with context');
       opened=[];svg.dispatchEvent(new MouseEvent('click',{bubbles:true}));await wait();check(opened.length===1,mode+': minimap opens canvas once');
       check(useStore.getState().content===source,mode+': opening canvas preserves source');
       await mount(mode,'# Host\\n\\n![[Child]]');await until(()=>document.querySelector('.canvas-embed svg.canvas-minimap'),'nested canvas loaded');
       document.querySelector('.canvas-embed [aria-label="Open canvas"]').click();await wait();
       check(opened.length===1&&opened[0].from==='Lab/Child.md',mode+': nested canvas keeps origin');
      }else{
       const source='# Files\\n\\n![[config.yaml]]\\n\\n![[table.csv]]\\n\\n![[archive.zip]]\\n\\n![[config.properties]]\\n\\n![[data.sqlite]]';await mount(mode,source);
       await until(()=>document.querySelectorAll('.file-embed.mod-generic').length===5,mode+': all generic files are cards, including long extensions');
       check(!document.body.textContent.includes('FILE CONTENT MUST STAY HIDDEN')&&reads.length===0,mode+': generic file bytes are not transcluded');
       const cards=[...document.querySelectorAll('.file-embed.mod-generic')];check(cards.map(c=>c.textContent).join(',')==='config.yaml,table.csv,archive.zip,config.properties,data.sqlite',mode+': card labels match filenames');
       cards[2].click();await wait();check(opened.length===1&&opened[0].target==='archive.zip',mode+': file card click opens once');
       check(cards.every(c=>c.tabIndex===0),mode+': generic cards keyboard accessible');
      }
     }
    }catch(error){failures.push(part+': '+error.message)}
    if(failures.length)throw Error(failures.join('; '));
    for(const mode of ['live','reading','preview']){
     let finish;api.resolve=()=>new Promise(resolve=>{finish=resolve});
     await mount(mode,'# Host\\n\\n![[Board.canvas]]');await until(()=>finish&&document.querySelector('.canvas-embed'),'pending canvas load started');
     root.render(<div/>);await wait();reads=[];finish({path:'Lab/Board.canvas'});await wait();
     check(reads.length===0&&!document.querySelector('.canvas-embed'),mode+': removing pending canvas avoids stale file reads');
    }
    api.resolve=async target=>({path:target==='Child'?'Lab/Child.md':'Lab/'+target});
    await mount('live','# Host\\n\\n![[Board.canvas]]');await until(()=>document.querySelector('.canvas-embed[data-ready="true"] [aria-label="Open canvas"]'),'keyboard canvas loaded');
    opened=[];document.querySelector('.canvas-embed [aria-label="Open canvas"]').focus();
    window.verifyKeyboard=()=>{check(opened.length===1&&opened[0].target==='Board.canvas','Enter opens focused canvas')};window.cleanup=()=>root.unmount();
   };
  `},bundle:true,format:'iife',platform:'browser',tsconfigRaw:{compilerOptions:{useDefineForClassFields:false,jsx:'react-jsx'}},loader:{'.woff2':'file','.woff':'file','.ttf':'file'},define:{'import.meta.env.DEV':'false'},outfile:join(dir,'fixture.js'),logLevel:'silent'});
  await writeFile(join(dir,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><body class="theme-dark"><div id="root" style="width:780px;height:1000px"></div><script src="fixture.js"></script>');
  await writeFile(join(dir,'runner.cjs'),`
   const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(dir,'profile'))});
   app.whenReady().then(async()=>{const win=new BrowserWindow({show:false,width:1200,height:1000,webPreferences:{backgroundThrottling:false}});await win.loadFile(${JSON.stringify(join(dir,'index.html'))});
    win.webContents.focus();await win.webContents.executeJavaScript('window.run()');
    if(process.env.WEBO_CANVAS_PREVIEW)require('node:fs').writeFileSync(process.env.WEBO_CANVAS_PREVIEW,(await win.webContents.capturePage()).toPNG());
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});win.webContents.sendInputEvent({type:'char',keyCode:String.fromCharCode(13)});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});
    await win.webContents.executeJavaScript('new Promise(r=>setTimeout(r,100)).then(()=>window.verifyKeyboard())');await win.webContents.executeJavaScript('window.cleanup()');console.log('CANVAS_EMBED_PASS');win.destroy();app.quit();
   }).catch(e=>{console.error(e);app.exit(1)});
  `);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const {stdout}=await promisify(execFile)(createRequire(import.meta.url)('electron'),[...(process.platform==='linux'?['--ozone-platform=headless']:[]),join(dir,'runner.cjs')],{env,windowsHide:true,timeout:60000});assert.match(stdout,/CANVAS_EMBED_PASS/);
 }finally{assert.ok(dir.startsWith(join(tmpdir(),'webo-canvas-embed-')));await rm(dir,{recursive:true,force:true})}
});
