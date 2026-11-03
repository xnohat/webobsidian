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

import {fragmentPdf} from '../../tests/fixtures/embeds/pdf-fragments.mjs';
import {chromePath} from './helpers/headlessChrome.mjs';



test('PDF fragment targets highlight text and annotations, survive zoom and remain isolated',{skip:chromePath?false:'Set CHROME_BIN for Markdown embed browser tests'},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'webo-pdf-fragments-'));
 try{
  await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx',contents:`

   import React from 'react';import {createRoot} from 'react-dom/client';import Editor from './src/components/Editor';import Preview from './src/components/Preview';import PdfFileView from './src/components/PdfFileView';import {api} from './src/lib/api';import {initUrlSync} from './src/lib/urlsync';import {useStore} from './src/lib/store';
   import {createPdfViewer,destroyPdfViewer} from './src/lib/pdfViewer';import './src/styles/obsidian.css';
   const root=document.querySelector('#root'),wait=()=>new Promise(r=>setTimeout(r,40)),readers=[];
   const check=(ok,msg)=>{if(!ok)throw Error(msg)};const until=async(fn,msg)=>{for(let i=0;i<250&&!fn();i++)await wait();check(fn(),msg)};
   const mount=async fragment=>{const r=createPdfViewer('/sample.pdf#'+fragment+'&height=340','fragment.pdf');r.style.width='700px';root.append(r);readers.push(r);await until(()=>r.dataset.ready==='true','PDF ready');return r};
   const discard=r=>{destroyPdfViewer(r);r.remove()};
   const geometry=(r,node)=>{const box=r.querySelector('.pdf-reader-scroll').getBoundingClientRect(),rect=node.getBoundingClientRect();check(rect.top>=box.top-1&&rect.bottom<=box.bottom+1,'fragment target scrolls inside its own viewer')};
   window.run=async()=>{
    window.debugStage='selection';const r=await mount('page=2&selection=0,0,0,6');
    await until(()=>r.querySelector('.pdf-fragment-selection')?.textContent==='Second','native text selection is highlighted');
    check(r.querySelector('input').value==='2','selection page');geometry(r,r.querySelector('.pdf-fragment-selection'));
    check(!getSelection()?.toString(),'fragment must not replace user DOM selection');const tail=document.createRange();tail.selectNodeContents(r.querySelector('.pdf-fragment-selection').nextSibling);check(tail.getBoundingClientRect().left>=r.querySelector('.pdf-fragment-selection').getBoundingClientRect().right-1,'highlight preserves text layout');
    check(Math.abs(Number(getComputedStyle(r.querySelector('.textLayer')).opacity)-0.2)<0.01,'native text layer opacity preserves visible PDF glyphs under the highlight');
    const original=r.querySelector('.textLayer').textContent;const marker=r.querySelector('.pdf-fragment-selection'),before=marker.getBoundingClientRect().width;
    r.querySelector('[data-pdf-action="zoom-in"]').click();await until(()=>r.querySelector('.pdf-fragment-selection')?.getBoundingClientRect().width>before,'text highlight follows zoom');
    check(r.querySelectorAll('.pdf-fragment-selection').length===1,'zoom creates no duplicate highlight');
    r.querySelector('.pdf-reader-scroll').scrollTop=0;await wait();r.querySelector('[data-pdf-action="zoom-in"]').click();await wait();check(r.querySelector('.pdf-reader-scroll').scrollTop<200,'zoom does not force fragment navigation again');
    discard(r);
    window.debugStage='annotation';const a=await mount('page=2&annotation=8R&selection=0,0,0,6');
    await until(()=>a.querySelector('.pdf-fragment-annotation'),'annotation target is focused');check(!a.querySelector('.pdf-fragment-selection'),'annotation wins over selection');geometry(a,a.querySelector('.pdf-fragment-annotation'));
    const width=a.querySelector('.pdf-fragment-annotation').getBoundingClientRect().width;a.querySelector('[data-pdf-action="zoom-in"]').click();await until(()=>a.querySelector('.pdf-fragment-annotation')?.getBoundingClientRect().width>width,'annotation follows zoom');
    check(a.querySelectorAll('.pdf-fragment-annotation').length===1,'one annotation focus marker');discard(a);
    window.debugStage='multiple items';const multi=await mount('page=2&selection=0,7,1,7');
    await until(()=>multi.querySelectorAll('.pdf-fragment-selection').length>=2,'multi-item text selection');check(multi.querySelector('.pdf-fragment-selection').textContent==='PDF page','first item offset is respected');discard(multi);
    window.debugStage='invalid';for(const fragment of ['page=2&selection=999,0,1000,3','page=2&selection=0,999,0,1000','page=2&selection=0,6,0,2','page=2&annotation=unknown','page=2&selection=0,0,0,NaN']){
     const bad=await mount(fragment);await until(()=>bad.querySelector('[data-page-number="2"] .textLayer'),'invalid fragment still renders page');await wait();check(!bad.querySelector('.pdf-fragment-selection,.pdf-fragment-annotation'),'invalid fragment creates no marker');check(!bad.textContent.includes('Could not display PDF'),'invalid fragment cannot break PDF');discard(bad);
    }
    window.debugStage='offset';const offset=await mount('page=2&offset=40,600,1');await until(()=>offset.dataset.scale==='1','offset zoom is applied');await until(()=>offset.querySelector('[data-page-number="2"] .textLayer'),'offset page renders');check(offset.querySelector('input').value==='2','offset page');const pageRect=offset.querySelector('[data-page-number=\"2\"]').getBoundingClientRect(),scrollRect=offset.querySelector('.pdf-reader-scroll').getBoundingClientRect();check(Math.abs(pageRect.top+pageRect.height/4-scrollRect.top)<5,'offset positions the requested PDF y coordinate');check(Math.abs(pageRect.left+pageRect.width*40/600-scrollRect.left)<5,'offset positions the requested PDF x coordinate');discard(offset);
    const fitted=await mount('page=2&zoom=200&offset=,600,');check(fitted.dataset.scale==='page-width','offset without explicit zoom fits page width like native Obsidian');discard(fitted);
    window.debugStage='isolation';const first=await mount('page=2&selection=0,0,0,6'),second=await mount('page=1&selection=0,0,0,5');
    await until(()=>first.querySelector('.pdf-fragment-selection')?.textContent==='Second'&&second.querySelector('.pdf-fragment-selection')?.textContent==='First','independent embedded viewers');discard(first);check(second.querySelector('.pdf-fragment-selection').textContent==='First','destroy preserves sibling viewer');discard(second);
    const late=createPdfViewer('/sample.pdf#page=2&annotation=8R','late.pdf');root.append(late);destroyPdfViewer(late);late.remove();await wait();check(!document.querySelector('.pdf-fragment-selection,.pdf-fragment-annotation'),'destroy cancels all pending markers');

    window.debugStage='app navigation';const rawPaths=[];api.rawUrl=path=>{rawPaths.push(path);return '/sample.pdf'};api.resolve=async()=>({path:'Folder/report#one.pdf'});api.tags=async()=>({tags:[]});api.propertyTypes=async()=>({types:{}});api.putUiState=async()=>({});
    const react=createRoot(root),Full=()=>{const path=useStore(s=>s.activePath),fragment=useStore(s=>s.tabs.find(t=>t.path===s.activePath)?.pdfFragment);return React.createElement(PdfFileView,{path,fragment})};
    useStore.setState({activePath:null,tabs:[],dirty:false});initUrlSync();await useStore.getState().openWikilink('report%23one.pdf#page=2&selection=0,0,0,6','markdown','Folder/Host.md');react.render(React.createElement(Full));
    await until(()=>root.querySelector('.pdf-fragment-selection')?.textContent==='Second','regular Markdown PDF link opens at selection');check(rawPaths.every(p=>p==='Folder/report#one.pdf'),'file URL uses canonical filename, never appended fragment');
    await useStore.getState().openWikilink('report%23one.pdf#page=2&annotation=8R','markdown','Folder/Host.md');await until(()=>root.querySelector('.pdf-fragment-annotation'),'same PDF link changes focus to annotation');check(location.hash==='#page=2&annotation=8R','PDF navigation updates browser URL');history.back();await until(()=>root.querySelector('.pdf-fragment-selection')?.textContent==='Second','browser Back restores selection in the same PDF');history.forward();await until(()=>root.querySelector('.pdf-fragment-annotation'),'browser Forward restores annotation');
    for(const mode of ['live','reading','preview']){
     window.debugStage='embed '+mode;react.render(React.createElement('div'));await wait();const content='# Embedded PDF\\n\\n![[sample.pdf#page=2&selection=0,0,0,6&height=340]]';useStore.setState({activePath:'Host.md',content,viewMode:mode==='preview'?'reading':mode,showInlineTitle:false,locked:false,dirty:false});react.render(React.createElement(mode==='preview'?Preview:Editor));
     await until(()=>root.querySelector('.pdf-fragment-selection')?.textContent==='Second',mode+' embedded PDF selection');check(useStore.getState().content===content,'highlight never edits the note');
    }
    react.unmount();if(window.capturePreview){const sample=await mount('page=2&selection=0,0,0,6');window.cleanup=()=>discard(sample)}return 'PDF_FRAGMENTS_BROWSER_PASS';
   };
  `},bundle:true,format:'iife',platform:'browser',tsconfigRaw:{compilerOptions:{useDefineForClassFields:false,jsx:'react-jsx'}},loader:{'.woff2':'file','.woff':'file','.ttf':'file','.svg':'file'},define:{'import.meta.env.DEV':'false'},outfile:join(dir,'fixture.js'),logLevel:'silent'});
  const assetDir=join(dir,pdfAssetBase.slice(1));await mkdir(assetDir,{recursive:true});
  const pkg=fileURLToPath(new URL('../../node_modules/pdfjs-dist/',import.meta.url));
  await cp(join(pkg,'build/pdf.worker.min.mjs'),join(assetDir,'pdf.worker.min.mjs'));
  await writeFile(join(assetDir,'pdf_viewer.css'),scopePdfStyles(await readFile(join(pkg,'web/pdf_viewer.css'),'utf8')));
  await cp(join(pkg,'web/images'),join(assetDir,'images'),{recursive:true});
  for(const name of ['cmaps','standard_fonts','wasm'])await cp(join(pkg,name),join(assetDir,name),{recursive:true});
  await writeFile(join(dir,'sample.pdf'),fragmentPdf());
  await writeFile(join(dir,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><body class="theme-dark"><div id="root" style="width:900px;height:1000px"></div><script src="fixture.js"></script>');

  const browserHelper=new URL('./helpers/headlessChrome.mjs',import.meta.url).href;
  await writeFile(join(dir,'runner.cjs'),`const http=require('node:http'),fs=require('node:fs'),path=require('node:path');(async()=>{
   const {launchChrome}=await import(${JSON.stringify(browserHelper)}),dir=${JSON.stringify(dir)},server=http.createServer((req,res)=>{const url=new URL(req.url,'http://fixture'),name=decodeURIComponent(url.pathname);const p=path.resolve(dir,'.'+(name==='/'?'/index.html':name==='/api/files/content'?'/sample.pdf':name));if(!p.startsWith(dir+path.sep)){res.writeHead(403).end();return}try{res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self'; media-src 'self' blob:; connect-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; object-src 'none'");res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.pdf':'application/pdf','.svg':'image/svg+xml','.wav':'audio/wav','.webm':'video/webm','.html':'text/html'})[path.extname(p)]||'application/octet-stream');res.end(fs.readFileSync(p))}catch{res.writeHead(404).end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
   let browser;try{
    browser=await launchChrome(path.join(dir,'profile'),'http://127.0.0.1:'+server.address().port,{timeoutMs:45000});
    for(let i=0;i<100&&!await browser.evaluate('typeof window.run==="function"');i++)await new Promise(r=>setTimeout(r,50));
    await browser.evaluate('window.capturePreview='+Boolean(process.env.WEBO_PDF_PREVIEW));
    try{console.log(await browser.evaluate('window.run()'))}catch(error){console.error(await browser.evaluate('JSON.stringify({stage:window.debugStage,text:document.querySelector("#root").textContent})'));throw error}
    if(process.env.WEBO_PDF_PREVIEW){const shot=await browser.call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(process.env.WEBO_PDF_PREVIEW,Buffer.from(shot.data,'base64'))}
   }finally{await browser?.close();server.close()}
  })().catch(e=>{console.error(e);process.exitCode=1});`);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const {stdout}=await promisify(execFile)(process.execPath,[join(dir,'runner.cjs')],{env,windowsHide:true,timeout:90000});
  assert.match(stdout,/PDF_FRAGMENTS_BROWSER_PASS/);
 }finally{assert.ok(dir.startsWith(join(tmpdir(),'webo-pdf-fragments-')));await rm(dir,{recursive:true,force:true})}
});
