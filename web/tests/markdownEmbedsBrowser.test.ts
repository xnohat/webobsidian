import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,mkdir,cp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {build} from 'esbuild';
import {pdfAssetBase} from '../src/lib/pdfAssets';
import {scopePdfStyles} from '../scripts/pdfStyles';

import {menuPdf} from '../../tests/fixtures/embeds/pdf-menus.mjs';
import {chromePath} from './helpers/headlessChrome.mjs';



test('standard Markdown embeds have native widgets, paths and source actions in Live, Reading and Preview',{skip:chromePath?false:'Set CHROME_BIN for Markdown embed browser tests'},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'webo-md-embeds-'));
 try{
  await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx',contents:`
   import React from 'react';import {createRoot} from 'react-dom/client';import Editor from './src/components/Editor';import Preview from './src/components/Preview';
   import {api} from './src/lib/api';import {useStore} from './src/lib/store';import {getActiveEditor} from './src/lib/activeEditor';import {setLivePreviewImageDeleteHandler} from './src/lib/livePreview';import './src/styles/obsidian.css';
   const root=createRoot(document.querySelector('#root')),wait=()=>new Promise(r=>setTimeout(r,50)),calls=[],reads=[],raw=[],opened=[],deleted=[];let videoUrl='';
   const notes=new Map([['Lab/space note.md','# Space\\n\\n## Part\\nSELECTED_SPACE_BODY\\n\\n![](nested%2520%23one.pdf#page=2&height=160)\\n\\n## Other\\nUNWANTED_BODY'],['Lab/space%20note.md','# LITERAL_PERCENT_BODY'],['Lab/Board#one.canvas','{"nodes":[{"id":"a","type":"text","x":0,"y":0,"width":200,"height":100,"text":"Card"}],"edges":[]}']]);
   const paths=[...notes.keys(),'Lab/doc #one.pdf','Lab/nested%20#one.pdf','Lab/photo (1)#one.svg','Lab/photo%20one.svg','Lab/config#one.yaml'];
   const normalized=(target,from,kind)=>{let value=target.split('#')[0];if(kind==='markdown')try{value=decodeURIComponent(value)}catch{}const normalize=s=>{const parts=[];for(const x of s.split('/')){if(x==='..')parts.pop();else if(x&&x!=='.')parts.push(x)}return parts.join('/')};const near=normalize((from?.split('/').slice(0,-1).join('/')??'')+'/'+value);return paths.find(p=>p===(value.startsWith('/')?normalize(value):near))??paths.find(p=>p===normalize(value))??null};
   api.tags=async()=>({tags:[]});api.propertyTypes=async()=>({types:{}});api.putUiState=async()=>({});
   api.resolve=async(target,from,kind='wiki')=>{calls.push({target,from,kind});return {path:normalized(target,from,kind)}};
   api.read=async path=>{reads.push(path);if(!notes.has(path))throw Error('Must not read binary as Markdown: '+path);return {content:notes.get(path),version:'fixture'}};
   api.rawUrl=(target,from)=>{raw.push({target,from});return '/file?'+new URLSearchParams({path:target,...(from?{from}:{})})};
   const check=(ok,msg)=>{if(!ok)throw Error(msg)};const until=async(fn,msg)=>{for(let i=0;i<250&&!fn();i++)await wait();check(fn(),msg+': '+document.querySelector('#root')?.textContent)};
   const mount=async(mode,content)=>{root.render(React.createElement('div'));await wait();useStore.setState({activePath:'Lab/Host.md',content,viewMode:mode==='preview'?'reading':mode,showInlineTitle:false,locked:false,dirty:false,save:async()=>{},openWikilink:async(target,kind,from)=>{opened.push({target,kind,from})},openFile:async path=>{opened.push({path})}});root.render(React.createElement(mode==='preview'?Preview:Editor));await wait();await wait()};
   window.run=async()=>{
    window.debugStage='load video fixture';
    const recordedVideo=await(await fetch('/clip-fixture.webm')).blob();check(recordedVideo.size>500,'fixture video contains frames');check((await fetch('/video-fixture',{method:'POST',body:recordedVideo})).ok,'fixture video stored');const probe=document.createElement('video');probe.src='/file?path=clip%20one.webm&from=Lab/Host.md';probe.preload='metadata';document.body.append(probe);await until(()=>probe.readyState>=1||probe.error,'video fixture probe');check(!probe.error&&probe.duration>0,'video fixture metadata: '+probe.error?.code+' '+probe.duration);probe.remove();
    window.debugStage='multiline Live';
    await mount('live','# Multiline\\n\\n![image](\\n<photo (1)%23one.svg>\\n)\\n\\n**Bold outside**\\n\\n~~~md\\n![[space note]]\\n~~~');
    await until(()=>document.querySelector('img.image-embed')?.naturalWidth>0,'multiline embed keeps the editor plugin active');
    check(document.querySelector('.cm-h1')&&document.querySelector('.cm-strong'),'multiline embed preserves other syntax decorations');check(!document.querySelector('.cm-note-embed'),'fenced wiki embeds remain literal next to multiline images');
    document.querySelector('.cm-image-wrap [aria-label="Edit embed"]').click();await wait();{const v=getActiveEditor(),r=v.state.selection.main;check(v.state.doc.sliceString(r.from,r.to)==='photo (1)%23one.svg','multiline source selects the exact destination')}
    for(const mode of ['live','reading','preview']){window.debugStage=mode+': notes';
     const note='# Notes\\n\\n![](space%20note.md#Part)\\n\\n![](space%2520note.md)';await mount(mode,note);
     await until(()=>document.querySelector('#root').textContent.includes('SELECTED_SPACE_BODY')&&document.querySelector('#root').textContent.includes('LITERAL_PERCENT_BODY'),mode+': note transclusion');
     check(!document.querySelector('#root').textContent.includes('UNWANTED_BODY'),mode+': heading selected');
     await until(()=>document.querySelector('.pdf-reader[data-ready="true"]'),mode+': Markdown PDF inside Markdown note loaded');
     document.querySelector('.pdf-reader [data-pdf-action="file-menu"]').click();await until(()=>document.querySelector('.pdf-menu-panel'),'PDF file menu');
     document.querySelector('.pdf-menu-panel button').click();await wait();check(opened.at(-1)?.path==='Lab/nested%20#one.pdf',mode+': nested PDF opens exact decoded file');
     check(calls.some(c=>c.target==='nested%2520%23one.pdf#page=2&height=160'&&c.from==='Lab/space note.md'&&c.kind==='markdown'),mode+': PDF actions retain nested origin and Markdown semantics');
     document.querySelector('.markdown-embed-link').click();await wait();check(opened.at(-1).kind==='markdown',mode+': note source button uses Markdown kind');
     window.debugStage=mode+': assets';const assets='# Assets\\n\\n![doc](doc%20%23one.pdf#page=2&height=160)\\n\\n![clip|240x120](clip%20one.webm)\\n\\n![](sound.wav)\\n\\n![](config%23one.yaml)';await mount(mode,assets);
     await until(()=>document.querySelector('.pdf-reader[data-ready="true"]'),mode+': direct Markdown PDF loaded');
     const player=document.querySelector('video'),audio=document.querySelector('audio');await until(()=>player?.readyState>=1&&audio?.readyState>=1,mode+': real media metadata');
     check(player.width===240&&player.height===120&&player.controls&&audio.controls,mode+': media dimensions and controls');
     await player.play();check(!player.paused,mode+': video plays');player.pause();await audio.play();audio.pause();
     check(!document.querySelector('img:not(.cm-widgetBuffer)'),mode+': binary embeds are not images');
     check(document.querySelector('.file-embed').textContent==='config#one.yaml',mode+': generic file title decoded once');
     check(useStore.getState().content===assets,mode+': rendering preserves source');
     if(mode==='live'){document.querySelector('.pdf-reader [aria-label="Edit block"]').click();await wait();const v=getActiveEditor(),selection=v.state.selection.main;check(v.state.doc.sliceString(selection.from,selection.to)==='![doc](doc%20%23one.pdf#page=2&height=160)','PDF source action selects complete Markdown token')}
     window.debugStage=mode+': images';const pictures='# Images\\n\\n![ref][img]\\n\\n![literal|100](photo%2520one.svg)\\n\\n[img]: <photo (1)%23one.svg>';await mount(mode,pictures);
     await until(()=>document.querySelectorAll('img:not(.cm-widgetBuffer)').length===2&&[...document.querySelectorAll('img:not(.cm-widgetBuffer)')].every(i=>i.complete&&i.naturalWidth>0),mode+': reference and percent-literal images loaded');
     const images=[...document.querySelectorAll('img:not(.cm-widgetBuffer)')];check(new URL(images[0].src).searchParams.get('path')==='photo (1)#one.svg'&&new URL(images[1].src).searchParams.get('path')==='photo%20one.svg',mode+': image filenames not confused');
     if(mode==='live'){
      document.querySelector('.cm-image-wrap [aria-label="Edit embed"]').click();await wait();let v=getActiveEditor(),selection=v.state.selection.main;check(v.state.doc.sliceString(selection.from,selection.to)==='![ref][img]','reference source action selects whole token');
      const wrap=document.querySelector('.cm-image-wrap'),handle=wrap.querySelector('.cm-image-resize-right');handle.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,clientX:0}));window.dispatchEvent(new MouseEvent('mousemove',{clientX:60}));window.dispatchEvent(new MouseEvent('mouseup'));await wait();
      check(/!\\[ref\\|\\d+\\]\\[img\\]/.test(useStore.getState().content),'reference resize keeps definition identifier');check(useStore.getState().content.includes('[img]: <photo (1)%23one.svg>'),'resize preserves definition destination');
      setLivePreviewImageDeleteHandler(r=>{deleted.push({target:r.target,kind:r.kind});r.remove()});document.querySelector('.cm-image-delete').click();await wait();
      check(!/!\\[ref(?:\\||\\])/.test(useStore.getState().content)&&useStore.getState().content.includes('![literal|100](photo%2520one.svg)'),'delete removes only correct reference token');check(deleted.at(-1).kind==='markdown'&&deleted.at(-1).target==='photo (1)%23one.svg','delete resolves original encoded Markdown target');
     }
     await mount(mode,'# Canvas\\n\\n![](Board%23one.canvas)');await until(()=>document.querySelector('.canvas-embed[data-ready="true"]'),mode+': Markdown Canvas loaded');check(document.querySelector('.canvas-embed .embed-title').textContent==='Board#one',mode+': Canvas literal hash title');
     document.querySelector('.canvas-embed .embed-title').click();await wait();check(opened.at(-1).target==='Board%23one.canvas'&&opened.at(-1).kind==='markdown',mode+': Canvas opens encoded target with correct kind');
    }
    check(!reads.some(p=>/\\.(pdf|svg|wav|webm|yaml)$/.test(p)),'binary files never read as Markdown');root.unmount();URL.revokeObjectURL(videoUrl);return 'MARKDOWN_EMBEDS_BROWSER_PASS';
   };
  `},bundle:true,format:'iife',platform:'browser',tsconfigRaw:{compilerOptions:{useDefineForClassFields:false,jsx:'react-jsx'}},loader:{'.woff2':'file','.woff':'file','.ttf':'file','.svg':'file'},define:{'import.meta.env.DEV':'false'},outfile:join(dir,'fixture.js'),logLevel:'silent'});
  const assetDir=join(dir,pdfAssetBase.slice(1));await mkdir(assetDir,{recursive:true});
  const pkg=fileURLToPath(new URL('../../node_modules/pdfjs-dist/',import.meta.url));
  await cp(join(pkg,'build/pdf.worker.min.mjs'),join(assetDir,'pdf.worker.min.mjs'));
  await writeFile(join(assetDir,'pdf_viewer.css'),scopePdfStyles(await readFile(join(pkg,'web/pdf_viewer.css'),'utf8')));
  await cp(join(pkg,'web/images'),join(assetDir,'images'),{recursive:true});
  for(const name of ['cmaps','standard_fonts','wasm'])await cp(join(pkg,name),join(assetDir,name),{recursive:true});
  await mkdir(join(dir,'vault','Lab'),{recursive:true});
  for(const name of ['doc #one.pdf','nested%20#one.pdf'])await writeFile(join(dir,'vault','Lab',name),menuPdf());
  for(const name of ['photo (1)#one.svg','photo%20one.svg'])await writeFile(join(dir,'vault','Lab',name),'<svg xmlns="http://www.w3.org/2000/svg" width="160" height="80"><rect width="160" height="80" fill="red"/></svg>');
  const wav=Buffer.alloc(1644);wav.write('RIFF');wav.writeUInt32LE(1636,4);wav.write('WAVE',8);wav.write('fmt ',12);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(1600,40);await writeFile(join(dir,'vault','Lab','sound.wav'),wav);
  await writeFile(join(dir,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><body class="theme-dark"><div id="root" style="width:900px;height:1000px"></div><script src="fixture.js"></script>');

  const browserHelper=new URL('./helpers/headlessChrome.mjs',import.meta.url).href;
  await cp(fileURLToPath(new URL('../../tests/fixtures/embeds/clip.webm',import.meta.url)),join(dir,'clip-fixture.webm'));
  await writeFile(join(dir,'runner.cjs'),`const http=require('node:http'),fs=require('node:fs'),path=require('node:path');(async()=>{
   const {launchChrome}=await import(${JSON.stringify(browserHelper)}),dir=${JSON.stringify(dir)},server=http.createServer((req,res)=>{const url=new URL(req.url,'http://fixture'),name=decodeURIComponent(url.pathname);if(name==='/video-fixture'&&req.method==='POST'){const data=[];req.on('data',chunk=>data.push(chunk));req.on('end',()=>{fs.writeFileSync(path.join(dir,'vault','Lab','clip one.webm'),Buffer.concat(data));res.end('ok')});return}let p;if(name==='/file'||name==='/api/files/content'){const target=url.searchParams.get('path'),from=url.searchParams.get('from')||'';const near=path.posix.normalize(path.posix.dirname(from)+'/'+target);p=path.resolve(dir,'vault',near)}else p=path.resolve(dir,'.'+(name==='/'?'/index.html':name));if(!p.startsWith(dir+path.sep)){res.writeHead(403).end();return}try{res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self'; media-src 'self' blob:; connect-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; object-src 'none'");res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.pdf':'application/pdf','.svg':'image/svg+xml','.wav':'audio/wav','.webm':'video/webm','.html':'text/html'})[path.extname(p)]||'application/octet-stream');res.end(fs.readFileSync(p))}catch{res.writeHead(404).end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
   let browser;try{
    browser=await launchChrome(path.join(dir,'profile'),'http://127.0.0.1:'+server.address().port,{timeoutMs:45000});
    for(let i=0;i<100&&!await browser.evaluate('typeof window.run==="function"');i++)await new Promise(r=>setTimeout(r,50));
    await browser.evaluate('window.capturePreview='+Boolean(process.env.WEBO_PDF_PREVIEW));
    try{console.log(await browser.evaluate('window.run()'))}catch(error){console.error('ORIGINAL_BROWSER_ERROR',error);try{console.error(await browser.evaluate('JSON.stringify({stage:window.debugStage,url:location.href,title:document.title,text:document.querySelector("#root")?.textContent??document.body?.innerText})'))}catch(diagnostic){console.error('BROWSER_DIAGNOSTIC_ERROR',diagnostic)}throw error}
    if(process.env.WEBO_PDF_PREVIEW){const shot=await browser.call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(process.env.WEBO_PDF_PREVIEW,Buffer.from(shot.data,'base64'));await browser.evaluate('window.cleanup()')}
   }finally{await browser?.close();server.close()}
  })().catch(e=>{console.error(e);process.exitCode=1});`);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const {stdout}=await promisify(execFile)(process.execPath,[join(dir,'runner.cjs')],{env,windowsHide:true,timeout:90000});
  assert.match(stdout,/MARKDOWN_EMBEDS_BROWSER_PASS/);
 }finally{assert.ok(dir.startsWith(join(tmpdir(),'webo-md-embeds-')));await rm(dir,{recursive:true,force:true})}
});
