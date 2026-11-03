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


test('PDF menus match native sidebar, spread, theme and file commands with keyboard and cleanup',{skip:chromePath?false:'Set CHROME_BIN to test PDF menus'},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'webo-pdf-menus-'));
 try{
  await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx',contents:`
   import React from 'react';import {createRoot} from 'react-dom/client';import PdfFileView from './src/components/PdfFileView';import {pdfFileActions} from './src/lib/pdfFileActions';import {api} from './src/lib/api';import {useStore} from './src/lib/store';import {createPdfViewer,destroyPdfViewer} from './src/lib/pdfViewer';import './src/styles/obsidian.css';
   const root=document.querySelector('#root'),wait=()=>new Promise(r=>setTimeout(r,40));
   const check=(ok,msg)=>{if(!ok)throw Error(msg)};
   const until=async(fn,msg)=>{for(let i=0;i<300&&!fn();i++)await wait();check(fn(),msg+': '+document.body.textContent)};
   const actions=[];const reader=createPdfViewer('/sample.pdf#height=400','sample.pdf',()=>actions.push('open'),undefined,{fixedHeightIncludesToolbar:false,fileActions:async()=>[{label:'Open in new tab',run:()=>actions.push('tab')},{label:'Rename',run:()=>actions.push('rename')}]});root.append(reader);
   const menu=async action=>{reader.querySelector('[data-pdf-action="'+action+'"]').click();await until(()=>document.querySelector('.pdf-menu-panel'),'menu opens');return [...document.querySelectorAll('.pdf-menu-panel button')].map(b=>b.textContent.trim())};
   const choose=label=>{const item=[...document.querySelectorAll('.pdf-menu-panel button')].find(b=>b.dataset.label===label);check(item,'menu item '+label);check(!item.disabled,'enabled '+label);item.click()};

   let pointerBox,pointerReader;
   window.pointerSetup=async()=>{pointerBox=document.createElement('div');pointerBox.style.cssText='position:fixed;left:20px;top:20px;width:700px;z-index:10';document.body.append(pointerBox);pointerReader=createPdfViewer('/sample.pdf#height=400','pointer.pdf');pointerBox.append(pointerReader);await until(()=>pointerReader.dataset.ready==='true','pointer PDF loaded');const rect=pointerReader.querySelector('[data-pdf-action="display-options"] svg').getBoundingClientRect();return {x:Math.round(rect.left+rect.width/2),y:Math.round(rect.top+rect.height/2)}};
   window.pointerCheck=opened=>{check(!!document.querySelector('.pdf-menu-panel')===opened,'real repeated SVG pointer click toggles menu');if(!opened){destroyPdfViewer(pointerReader);pointerBox.remove()}};
   window.run=async()=>{const reviewFailures=[];const verifyReview=(ok,msg)=>{if(!ok)reviewFailures.push(msg)};
    await until(()=>reader.dataset.ready==='true'&&reader.querySelector('.textLayer')?.textContent.includes('First PDF page'),'PDF loaded');
    check(reader.querySelector('[aria-label="Sidebar options"]'),'native sidebar options button');
    check(JSON.stringify(await menu('sidebar-options'))===JSON.stringify(['Thumbnails','Outline','Reveal page in outline']),'native sidebar menu items');
    choose('Outline');await until(()=>reader.querySelector('.pdf-outline button'),'outline loaded');
    reader.querySelector('.pdf-outline button').click();await until(()=>reader.querySelector('input').value==='A-2','outline navigates to labelled page');
    await menu('sidebar-options');choose('Reveal page in outline');check(document.activeElement.closest('.pdf-outline'),'reveal current outline entry');
    await menu('sidebar-options');choose('Thumbnails');check(!reader.querySelector('.pdf-thumbnails').hidden,'thumbnail mode restored');
    const labels=await menu('display-options');check(JSON.stringify(labels)===JSON.stringify(['Fit width','Fit height','Single page','Two pages (odd)','Two pages (even)','Adapt to theme']),'native display items');
    choose('Two pages (odd)');await until(()=>reader.querySelector('.spread')?.querySelectorAll('.page').length===2,'odd spread contains two pages');
    await menu('display-options');check(document.querySelector('[data-label="Two pages (odd)"]').getAttribute('aria-checked')==='true','spread checkmark');choose('Two pages (even)');await until(()=>reader.querySelector('.spread')?.querySelectorAll('.page').length===1,'even spread starts with a single page');
    await menu('display-options');choose('Single page');check(!reader.querySelector('.spread'),'single page removes spreads');
    await menu('display-options');choose('Fit height');await until(()=>reader.dataset.scale==='page-height','fit height command');
    await menu('display-options');choose('Fit width');await until(()=>reader.dataset.scale==='page-width','fit width command');
    await menu('display-options');choose('Adapt to theme');check(reader.classList.contains('pdf-adapt-theme'),'theme command enabled');
    await menu('display-options');check(document.querySelector('[data-label="Adapt to theme"]').getAttribute('aria-checked')==='true','theme checkmark');choose('Adapt to theme');check(!reader.classList.contains('pdf-adapt-theme'),'theme command toggles');
    await menu('file-menu');choose('Rename');check(actions.join()==='rename','file command runs exactly once');
    await menu('display-options');document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));check(!document.querySelector('.pdf-menu-panel'),'Escape closes');check(document.activeElement===reader.querySelector('[data-pdf-action="display-options"]'),'focus restored');
    await menu('display-options');const active=document.activeElement;document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));check(document.activeElement!==active,'keyboard moves through menu');
    document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));check(!document.querySelector('.pdf-menu-panel'),'outside pointer closes');
    await menu('display-options');const rect=document.querySelector('.pdf-menu-panel').getBoundingClientRect();check(rect.left>=0&&rect.right<=innerWidth&&rect.top>=0&&rect.bottom<=innerHeight,'menu remains in viewport');
    destroyPdfViewer(reader);reader.remove();check(!document.querySelector('.pdf-menu-panel'),'destroy closes popup');

    const lookups=[],opened=[],splits=[],renamed=[],revealed=[],copied=[],windows=[];
    api.putUiState=async()=>({});api.rawUrl=()=>'/sample.pdf';api.resolveAttachment=async(target,from)=>{lookups.push({target,from});return {path:'Lab/sample.pdf'}};
    const tree={name:'Vault',path:'',type:'folder',children:[{name:'Lab',path:'Lab',type:'folder',children:[{name:'sample.pdf',path:'Lab/sample.pdf',type:'file'}]}]};
    useStore.setState({tree,bookmarks:[],openFile:async(path,options)=>{opened.push({path,options})},openToSide:async(path,side,options)=>{splits.push({path,side,options})},renamePath:async(from,to)=>{renamed.push({from,to})},revealInTree:path=>revealed.push(path)});
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>copied.push(text)}});window.open=(...args)=>{windows.push(args);return null};
    const provider=pdfFileActions('sample.pdf#page=2','Notes/Parent.md'),fileItems=await provider();
    const run=async label=>{const action=fileItems.find(i=>i.label===label);check(action&&!action.disabled,'available file command '+label);await action.run?.()};
    await run('Open in new tab');check(opened[0].path==='Lab/sample.pdf'&&opened[0].options.preview===false,'file opens persistent app tab');
    await run('Open to the right');check(splits[0].path==='Lab/sample.pdf'&&splits[0].side==='right','file opens right pane');
    check(opened[0].options.pdfFragment==='page=2'&&splits[0].options.pdfFragment==='page=2','file-menu tab and split preserve fragment');
    await run('Open in new window');check(windows[0][0]==='/note/Lab/sample.pdf#page=2','window uses app route');
    await run('Add bookmark…');check(useStore.getState().bookmarks.includes('Lab/sample.pdf'),'bookmark command');
    await run('Move file to…');check(useStore.getState().movePath==='Lab/sample.pdf','move opens app folder picker');
    await run('Reveal in file explorer');check(revealed[0]==='Lab/sample.pdf','reveal exact resolved file');
    await fileItems.find(i=>i.label==='Copy path').children[0].run();check(copied[0]==='Lab/sample.pdf','copy vault path');await fileItems.find(i=>i.label==='Copy path').children[1].run();check(copied[1].endsWith('/note/Lab/sample.pdf#page=2'),'copy browser URL preserves PDF fragment');
    check(fileItems.find(i=>i.label==='Show in system file explorer').disabled&&fileItems.find(i=>i.label==='Open in default application').disabled,'OS-only commands explicitly unavailable in browser');
    const pendingRename=run('Rename');await until(()=>document.querySelector('.pdf-rename-dialog'),'rename dialog');
    document.querySelector('.pdf-rename-dialog input').value='renamed';document.querySelector('.pdf-rename-dialog form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await pendingRename;
    check(renamed[0].from==='Lab/sample.pdf'&&renamed[0].to==='Lab/renamed.pdf','rename retains folder and PDF extension');
    check(lookups[0].target==='sample.pdf'&&lookups[0].from==='Notes/Parent.md','file actions use embedding note origin');
    tree.children[0].children[0].locked=true;useStore.setState({tree});const locked=await provider();check(locked.find(i=>i.label==='Rename').disabled&&locked.find(i=>i.label==='Move file to…').disabled,'locked PDF has no mutation commands');
    api.resolveAttachment=async(target,from)=>({path:from==='Lab/sample.pdf'?'Lab/Lab/sample.pdf':target});
    root.style.height='600px';const reactRoot=createRoot(root);reactRoot.render(React.createElement(PdfFileView,{path:'Lab/sample.pdf'}));
    await until(()=>document.querySelector('.pdf-fill-container[data-ready="true"]'),'full PDF pane loaded');
    check(Math.abs(document.querySelector('.pdf-fill-container').getBoundingClientRect().height-600)<3,'file viewer fills pane without growing to page height');

    const full=document.querySelector('.pdf-fill-container');full.querySelector('[data-pdf-action="display-options"]').click();choose('Fit height');await wait();await wait();const pageHeight=full.querySelector('.page').getBoundingClientRect().height;root.style.height='450px';await wait();await wait();verifyReview(full.querySelector('.page').getBoundingClientRect().height<pageHeight-100,'height-only resize must refit PDF '+JSON.stringify({before:pageHeight,after:full.querySelector(".page").getBoundingClientRect().height,mode:full.dataset.scale,root:full.getBoundingClientRect().height,scroll:full.querySelector(".pdf-reader-scroll").clientHeight,parent:root.clientHeight}));
    full.querySelector('[data-pdf-action="file-menu"]').click();await until(()=>document.querySelector('.pdf-menu-panel'),'full file view has native menu');choose('Copy path');choose('Vault-relative path');await wait();verifyReview(copied.at(-1)==='Lab/sample.pdf','canonical file actions must not resolve Lab/Lab/sample.pdf');
    full.querySelector('[data-pdf-action="file-menu"]').click();await until(()=>document.querySelector('.pdf-menu-panel'),'full view menu before unmount');
    reactRoot.unmount();check(!document.querySelector('.pdf-menu-panel'),'unmounting full PDF closes menu');

    const pendingCancel=run('Rename');await until(()=>document.querySelector('.pdf-rename-dialog'),'cancel rename dialog');document.querySelector('.pdf-rename-dialog button[type="button"]').click();await pendingCancel;check(renamed.length===1,'cancelled rename does not mutate file');
    useStore.setState({renamePath:async()=>{throw Error('Version conflict')}});const failed=run('Rename');await until(()=>document.querySelector('.pdf-rename-dialog'),'failed rename dialog');document.querySelector('.pdf-rename-dialog input').value='retry';document.querySelector('.pdf-rename-dialog form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await until(()=>document.querySelector('.pdf-rename-dialog [role="alert"]').textContent.includes('Version conflict'),'failed rename stays visible');document.querySelector('.pdf-rename-dialog button[type="button"]').click();await failed;
    let resolveMenu;const late=createPdfViewer('/sample.pdf','late.pdf',undefined,undefined,{fileActions:()=>new Promise(r=>{resolveMenu=r})});root.append(late);late.querySelector('[data-pdf-action="file-menu"]').click();destroyPdfViewer(late);late.remove();resolveMenu([{label:'Late command'}]);await wait();check(!document.querySelector('.pdf-menu-panel'),'cancelled file menu cannot appear after destroy');

    let escapeResolve;const escapeReader=createPdfViewer('/sample.pdf','escape.pdf',undefined,undefined,{fileActions:()=>new Promise(r=>{escapeResolve=r})});root.append(escapeReader);escapeReader.querySelector('[data-pdf-action="file-menu"]').click();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));escapeResolve([{label:'Must remain closed'}]);await wait();verifyReview(!document.querySelector('.pdf-menu-panel'),'Escape must cancel pending file menu');destroyPdfViewer(escapeReader);escapeReader.remove();
    check(!reviewFailures.length,reviewFailures.join('; '));
    if(window.capturePreview){const capture=createPdfViewer('/sample.pdf#height=400','sample.pdf');root.append(capture);await until(()=>capture.dataset.ready==='true','capture PDF');capture.querySelector('[data-pdf-action="display-options"]').click();await wait();await wait();window.cleanup=()=>{destroyPdfViewer(capture);capture.remove()}};
    return 'PDF_MENUS_PASS';
   };
  `},bundle:true,format:'iife',platform:'browser',loader:{'.woff2':'file','.woff':'file','.ttf':'file','.svg':'file'},outfile:join(dir,'fixture.js'),logLevel:'silent'});
  const assetDir=join(dir,pdfAssetBase.slice(1));await mkdir(assetDir,{recursive:true});
  const pkg=fileURLToPath(new URL('../../node_modules/pdfjs-dist/',import.meta.url));
  await cp(join(pkg,'build/pdf.worker.min.mjs'),join(assetDir,'pdf.worker.min.mjs'));
  await writeFile(join(assetDir,'pdf_viewer.css'),scopePdfStyles(await readFile(join(pkg,'web/pdf_viewer.css'),'utf8')));
  await cp(join(pkg,'web/images'),join(assetDir,'images'),{recursive:true});
  for(const name of ['cmaps','standard_fonts','wasm'])await cp(join(pkg,name),join(assetDir,name),{recursive:true});
  await writeFile(join(dir,'sample.pdf'),menuPdf());
  await writeFile(join(dir,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><body class="theme-dark"><div id="root" style="width:900px;height:1000px"></div><script src="fixture.js"></script>');

  const browserHelper=new URL('./helpers/headlessChrome.mjs',import.meta.url).href;
  await writeFile(join(dir,'runner.cjs'),`const http=require('node:http'),fs=require('node:fs'),path=require('node:path');(async()=>{
   const {launchChrome}=await import(${JSON.stringify(browserHelper)}),dir=${JSON.stringify(dir)},server=http.createServer((req,res)=>{const name=decodeURIComponent(req.url.split('?')[0]),p=path.resolve(dir,'.'+(name==='/'?'/index.html':name));if(!p.startsWith(dir+path.sep)){res.writeHead(403).end();return}try{res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self'; connect-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; object-src 'none'");res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.pdf':'application/pdf','.html':'text/html'})[path.extname(p)]||'application/octet-stream');res.end(fs.readFileSync(p))}catch{res.writeHead(404).end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
   let browser;try{
    browser=await launchChrome(path.join(dir,'profile'),'http://127.0.0.1:'+server.address().port);
    for(let i=0;i<100&&!await browser.evaluate('typeof window.run==="function"');i++)await new Promise(r=>setTimeout(r,50));
    await browser.evaluate('window.capturePreview='+Boolean(process.env.WEBO_PDF_PREVIEW));
    const pointer=await browser.evaluate('window.pointerSetup()');
    for(const opened of [true,false]){await browser.call('Input.dispatchMouseEvent',{type:'mouseMoved',...pointer});await browser.call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...pointer});await browser.call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...pointer});await new Promise(r=>setTimeout(r,80));await browser.evaluate('window.pointerCheck('+opened+')')}
    console.log(await browser.evaluate('window.run()'));
    if(process.env.WEBO_PDF_PREVIEW){const shot=await browser.call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(process.env.WEBO_PDF_PREVIEW,Buffer.from(shot.data,'base64'));await browser.evaluate('window.cleanup()')}
   }finally{await browser?.close();server.close()}
  })().catch(e=>{console.error(e);process.exitCode=1});`);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const {stdout}=await promisify(execFile)(process.execPath,[join(dir,'runner.cjs')],{env,windowsHide:true,timeout:90000});
  assert.match(stdout,/PDF_MENUS_PASS/);
 }finally{assert.ok(dir.startsWith(join(tmpdir(),'webo-pdf-menus-')));await rm(dir,{recursive:true,force:true})}
});
