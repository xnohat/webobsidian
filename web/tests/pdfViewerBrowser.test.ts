import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,mkdir,cp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {build} from 'esbuild';
import {pdfAssetBase} from '../src/lib/pdfAssets';
import {scopePdfStyles} from '../scripts/pdfStyles';

function samplePdf(){
 const stream=(text:string,y=700)=>{const data=`BT /F1 24 Tf 40 ${y} Td (${text}) Tj ET`;return `<< /Length ${data.length} >>\nstream\n${data}\nendstream`};
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>',stream('First PDF page'),
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 800 600] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',stream('Second PDF page',500),
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 let result='%PDF-1.4\n';const offsets=[0];objects.forEach((o,i)=>{offsets.push(result.length);result+=`${i+1} 0 obj\n${o}\nendobj\n`});
 const xref=result.length;result+=`xref\n0 8\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('');
 return result+`trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
}

test('PDF embeds have working page, zoom and thumbnail controls in live, reading and preview',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'webo-pdf-viewer-'));
 try{
  await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx',contents:`
   import React from 'react';import {createRoot} from 'react-dom/client';
   import Editor from './src/components/Editor';import Preview from './src/components/Preview';
   import Sidebar from './src/components/Sidebar';
   import {getActiveEditor} from './src/lib/activeEditor';
   import {useStore} from './src/lib/store';import {api} from './src/lib/api';import './src/styles/obsidian.css';
   api.tags=async()=>({tags:[]});api.propertyTypes=async()=>({types:{}});api.rawUrl=(_target,from)=>'/sample.pdf'+(from?'?from='+encodeURIComponent(from):'');
   const attachmentLookups=[];api.resolveAttachment=async(target,from)=>{attachmentLookups.push({target,from});return {path:(from==='Lab/Child.md'?'Lab/':'')+target.split('#')[0]}};api.resolve=async()=>({path:'Lab/Child.md'});api.read=async()=>({content:'![[sample.pdf#page=2&height=400]]',version:'fixture'});
   const root=createRoot(document.querySelector('#root'));const wait=()=>new Promise(r=>setTimeout(r,40));
   const check=(ok,msg)=>{if(!ok)throw Error(msg)};
   const until=async(fn,msg)=>{const end=Date.now()+15000;while(!fn()&&Date.now()<end)await wait();check(fn(),msg+': '+document.body.textContent)};
   window.run=async()=>{
    const audit=document.createElement('div');audit.style.cssText='position:fixed;left:-10000px;width:340px;visibility:hidden';
    audit.innerHTML='<div class="sidebar"><div class="nav-header"><span class="title">Title</span><button class="nav-action selected">Action</button></div></div><div class="workspace"><div class="tab-bar"><div class="tab selected"><span class="title">Tab</span></div></div><div class="format-toolbar"><button>Format</button></div></div><div class="page"><input value="test"></div>';
    document.body.append(audit);
    const properties=['position','display','width','min-width','max-width','padding','margin','border','border-radius','font-family','font-size','font-weight','line-height','color','background-color','box-shadow','overflow','transform','--sidebar-width','--right-width'];
    const auditSnapshot=()=>JSON.stringify([...audit.querySelectorAll('*')].map(el=>{const css=getComputedStyle(el);return properties.map(p=>css.getPropertyValue(p))}));
    const beforePdf=auditSnapshot();
    for(const mode of ['live','reading','preview']){
     useStore.setState({activePath:mode+'.md',content:'# PDF\\n\\n![[sample.pdf]]\\n\\nAfter PDF',viewMode:mode==='preview'?'reading':mode,showInlineTitle:false,locked:false,dirty:false,save:async()=>{}});
     root.render(mode==='preview'?<Preview/>:<Editor/>);await wait();await wait();
     await until(()=>document.querySelector('.pdf-toolbar'),'own PDF toolbar mounted');
     await until(()=>document.querySelector('.pdf-reader[data-ready="true"]'),'PDF document loaded');
     check(auditSnapshot()===beforePdf,'PDF loading leaves outside tabs, titles, sidebar, selected items, inputs and buttons unchanged');
     const reader=document.querySelector('.pdf-reader'),page=reader.querySelector('input[aria-label="Page number"]');
     check(reader.querySelector('.pdf-page-count').textContent.includes('2'),'page count');
     check(reader.querySelector('.pdf-thumbnails').hidden,'thumbnails initially closed');
     await until(()=>reader.querySelector('.textLayer')?.textContent.includes('First PDF page'),'selectable first-page text');
     const visiblePage=reader.querySelector('.pdfViewer .page');
     check(Math.abs(reader.getBoundingClientRect().height-visiblePage.getBoundingClientRect().height-reader.querySelector('.pdf-toolbar').getBoundingClientRect().height)<20,'embed height fits exactly one page plus toolbar');
     reader.querySelector('[data-pdf-action="sidebar-options"]').click();
     check([...document.querySelectorAll('.pdf-menu-panel button')].find(b=>b.dataset.label==='Outline').disabled,'PDF without outline disables outline command');
     document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
     const width=reader.querySelector('.pdfViewer .page').getBoundingClientRect().width;
     check(width>reader.getBoundingClientRect().width-60,'initially fit to width');
     reader.querySelector('[aria-label="Zoom in"]').click();await wait();await wait();
     check(reader.querySelector('.pdfViewer .page').getBoundingClientRect().width>width,'zoom in increases page width');
     check(Math.abs(reader.getBoundingClientRect().height-reader.querySelector('.pdfViewer .page').getBoundingClientRect().height-reader.querySelector('.pdf-toolbar').getBoundingClientRect().height)<20,'zoom updates height to one page');
     reader.querySelector('[aria-label="Zoom out"]').click();await wait();
     page.value='2';page.dispatchEvent(new Event('change',{bubbles:true}));
     await until(()=>reader.querySelector('.page[data-page-number="2"] .textLayer')?.textContent.includes('Second PDF page'),'page navigation renders page two');
     await until(()=>Math.abs(reader.getBoundingClientRect().height-reader.querySelector('.page[data-page-number="2"]').getBoundingClientRect().height-reader.querySelector('.pdf-toolbar').getBoundingClientRect().height)<20,'height updates for a page with different dimensions');
     reader.querySelector('[aria-label="Toggle sidebar"]').click();
     await until(()=>!reader.querySelector('.pdf-thumbnails').hidden&&reader.querySelectorAll('.pdf-thumbnails button').length===2,'thumbnail panel');
     reader.querySelector('.pdf-thumbnails button').click();await until(()=>page.value==='1','thumbnail navigation');
     reader.querySelector('[data-pdf-action="display-options"]').click();[...document.querySelectorAll('.pdf-menu-panel button')].find(b=>b.dataset.label==='Fit width').click();await wait();
     check(!reader.querySelector('iframe'),'native PDF UI replaced');
     if(mode==='live'){
       check(reader.querySelector('[aria-label="Edit block"]'),'PDF has edit-source button');
       useStore.setState({locked:true});await until(()=>!document.querySelector('[aria-label="Edit block"]'),'locked PDF hides edit-source button');
       useStore.setState({locked:false});await until(()=>!!document.querySelector('[aria-label="Edit block"]'),'unlock restores edit-source button');
       const edit=document.querySelector('[aria-label="Edit block"]');
       const before=useStore.getState().content;edit.click();
       await until(()=>document.querySelector('.cm-content')?.textContent.includes('![[sample.pdf]]'),'edit button reveals exact embed source');
       check(useStore.getState().content===before,'revealing source does not modify note');
       await until(()=>document.querySelector('.pdf-reader[data-ready="true"] .textLayer')?.textContent.includes('First PDF page'),'PDF remains rendered while its embed source is selected');
       check(document.querySelectorAll('.pdf-reader').length===1,'only one PDF viewer while editing source');
     }else check(!reader.querySelector('[aria-label="Edit block"]'),'readonly views do not offer edit-source control');
     root.render(<div/>);await wait();
    }
    for(const mode of ['live','reading','preview']){
     useStore.setState({activePath:mode+'.md',content:'# PDF\\n\\n![[sample.pdf#page=2&height=400]]',viewMode:mode==='preview'?'reading':mode,locked:false});
     root.render(mode==='preview'?<Preview/>:<Editor/>);await wait();await wait();
     await until(()=>document.querySelector('.pdf-reader[data-ready="true"]'),'fragment PDF loaded');
     await until(()=>document.querySelector('.pdf-reader [aria-label="Page number"]')?.value==='2',mode+': PDF opens requested page');
     const expectedHeight=mode==='live'?400:400+document.querySelector('.pdf-reader .pdf-toolbar').getBoundingClientRect().height;
     check(Math.abs(document.querySelector('.pdf-reader').getBoundingClientRect().height-expectedHeight)<2,mode+': native explicit PDF height respected');
     document.querySelector('.pdf-reader [aria-label="Zoom in"]').click();await wait();
     check(Math.abs(document.querySelector('.pdf-reader').getBoundingClientRect().height-expectedHeight)<2,mode+': explicit height survives zoom');
     root.render(<div/>);await wait();
    }
    for(const mode of ['live','reading','preview']){
     let opened;useStore.setState({activePath:'Host.md',content:'# Host\\n\\n![[Child]]',viewMode:mode==='preview'?'reading':mode,locked:false,openFile:async(path)=>{opened={path}}});
     root.render(mode==='preview'?<Preview/>:<Editor/>);await wait();await wait();
     await until(()=>document.querySelector('.pdf-reader[data-ready="true"]'),mode+': PDF inside embedded note has a viewer');
     await until(()=>document.querySelector('.pdf-reader [aria-label="Page number"]')?.value==='2',mode+': nested PDF keeps page option');
     document.querySelector('.pdf-reader [data-pdf-action="file-menu"]').click();await until(()=>document.querySelector('.pdf-menu-panel'),'nested PDF file menu');document.querySelector('.pdf-menu-panel button').click();await wait();
     check(opened?.path==='Lab/sample.pdf'&&attachmentLookups.at(-1)?.from==='Lab/Child.md',mode+': nested PDF opens relative to its own note');
     root.render(<div/>);await wait();
    }
    useStore.setState({activePath:'same-file.md',content:'# Same PDF\\n\\n![[sample.pdf#height=180]]\\n\\n![[sample.pdf#page=2&height=180]]\\n\\n![[sample.pdf#page=2&rect=100,150,400,350&height=180]]',viewMode:'live',locked:false});root.render(<Editor/>);await wait();await wait();
    await until(()=>document.querySelectorAll('.pdf-reader[data-ready="true"]').length===3,'three instances of the same PDF loaded');
    const sameFile=[...document.querySelectorAll('.pdf-reader')];
    for(const [index,reader] of sameFile.entries()){
     const expected=index===0?'1':'2';await until(()=>reader.querySelector('[aria-label="Page number"]').value===expected,'same file instance '+index+' keeps its own page');
     await until(()=>reader.querySelector('.page[data-page-number="'+expected+'"] .textLayer')?.textContent.includes(index===0?'First PDF page':'Second PDF page'),'same file instance '+index+' actually renders the requested page');
    }
    root.render(<div/>);await wait();
    useStore.setState({activePath:'adjacent.md',content:'# PDFs\\n\\n![[one.pdf]]![[two.pdf]]',viewMode:'live',locked:false});root.render(<Editor/>);
    await until(()=>document.querySelectorAll('.pdf-reader[data-ready="true"]').length===2,'adjacent PDF viewers loaded');
    document.querySelectorAll('[aria-label="Edit block"]')[1].click();await wait();
    let selected=getActiveEditor().state.selection.main;
    check(getActiveEditor().state.doc.sliceString(selected.from,selected.to)==='![[two.pdf]]','second PDF button selects second source, not adjacent first');
    await until(()=>document.querySelectorAll('.pdf-reader[data-ready="true"]').length===2,'adjacent previews remain visible');
    document.querySelectorAll('[aria-label="Edit block"]')[1].click();await wait();
    selected=getActiveEditor().state.selection.main;
    check(getActiveEditor().state.doc.sliceString(selected.from,selected.to)==='![[two.pdf]]','editing already-visible PDF source selects same source');
    document.querySelector('#root').style.width='100%';
    localStorage.removeItem('wo-sidebar-width');document.documentElement.style.setProperty('--sidebar-width','252px');
    useStore.setState({activePath:'sidebar.md',content:'# PDF\\n\\n![[sample.pdf]]',viewMode:'reading',tree:{name:'Vault',path:'',type:'folder',children:[]},leftPanel:'files'});
    const shell=(open=true)=><div className={'app right-closed'+(open?'':' left-closed')}><div className="ribbon"/>{open&&<Sidebar/>}<div className="workspace"><Editor/></div></div>;
    root.render(shell());await until(()=>document.querySelector('.app > .sidebar')&&document.querySelector('.app > .workspace .pdf-reader[data-ready="true"]'),'PDF with sidebar loaded');
    const assertLayout=width=>{
      const sidebar=document.querySelector('.app > .sidebar'),workspace=document.querySelector('.app > .workspace');
      check(getComputedStyle(sidebar).position==='relative','PDF styles must not reposition app sidebar');
      check(Math.abs(sidebar.getBoundingClientRect().width-width)<2,'sidebar width follows drag: '+JSON.stringify({actual:sidebar.getBoundingClientRect().width,expected:width,root:document.documentElement.style.getPropertyValue('--sidebar-width'),computed:getComputedStyle(sidebar).getPropertyValue('--sidebar-width'),saved:localStorage.getItem('wo-sidebar-width')}));
      check(Math.abs(workspace.getBoundingClientRect().left-sidebar.getBoundingClientRect().right)<2,'no gap between sidebar and workspace');
    };
    assertLayout(252);
    for(const width of [180,400,560,252]){
      const sidebar=document.querySelector('.app > .sidebar'),handle=sidebar.querySelector('.sidebar-resizer'),start=sidebar.getBoundingClientRect();
      handle.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:1,clientX:start.right}));
      window.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,clientX:start.right+width-start.width}));
      await wait();assertLayout(width);
      window.dispatchEvent(new PointerEvent('pointerup',{pointerId:1}));await wait();await wait();
      assertLayout(width);check(localStorage.getItem('wo-sidebar-width')===String(width),'resized width persisted');
    }
    root.render(shell(false));await wait();await wait();
    check(Math.abs(document.querySelector('.workspace').getBoundingClientRect().left-document.querySelector('.ribbon').getBoundingClientRect().right)<2,'closed sidebar leaves no gap');
    root.render(shell());await wait();await wait();assertLayout(252);
    check(auditSnapshot()===beforePdf,'PDF interactions and removal do not restyle the rest of the app');audit.remove();
    const originalRawUrl=api.rawUrl;api.rawUrl=()=>'/missing.pdf';
    for(const mode of ['live','reading','preview']){
     const missing='# Missing PDF\\n\\n![[Attachments/document.pdf#page=3&height=1000]]';
     useStore.setState({activePath:'missing-'+mode+'.md',content:missing,viewMode:mode==='preview'?'reading':mode,locked:false});root.render(mode==='preview'?<Preview/>:<Editor/>);await wait();await wait();
     await until(()=>!!document.querySelector('.pdf-reader[data-missing="true"]'),'HTTP 404 becomes compact missing-file state '+mode);
     const reader=document.querySelector('.pdf-reader');check(reader.getBoundingClientRect().height<80&&!reader.querySelector('.pdf-toolbar'),mode+': no empty PDF viewer or toolbar '+JSON.stringify({rect:reader.getBoundingClientRect().toJSON(),display:getComputedStyle(reader).display,font:getComputedStyle(reader).font,lineHeight:getComputedStyle(reader).lineHeight,viewport:{width:innerWidth,height:innerHeight},html:reader.outerHTML}));
     check(reader.textContent.includes('Attachments/document.pdf#page=3&height=1000'),mode+': missing label keeps original path and fragment');check(useStore.getState().content===missing,mode+': missing file rendering preserves source');
    }
    api.rawUrl=originalRawUrl;
    if(window.capturePreview){
      useStore.setState({activePath:'preview.md',content:'# PDF\\n\\n![[sample.pdf]]\\n\\nAfter PDF',viewMode:'reading'});root.render(<Editor/>);
      await until(()=>document.querySelector('.pdf-reader[data-ready="true"] .textLayer')?.textContent.includes('First PDF page'),'screenshot ready');
      window.cleanup=()=>root.unmount();
    }else root.unmount();return 'PDF_VIEWER_PASS';
   };
  `},bundle:true,format:'iife',platform:'browser',tsconfigRaw:{compilerOptions:{useDefineForClassFields:false,jsx:"react-jsx"}},loader:{'.woff2':'file','.woff':'file','.ttf':'file','.svg':'file'},define:{'import.meta.env.DEV':'false'},outfile:join(dir,'fixture.js'),logLevel:'silent'});
  const assetDir=join(dir,pdfAssetBase.slice(1));await mkdir(assetDir,{recursive:true});
  const pkg=fileURLToPath(new URL('../../node_modules/pdfjs-dist/',import.meta.url));
  await cp(join(pkg,'build/pdf.worker.min.mjs'),join(assetDir,'pdf.worker.min.mjs'));
  await writeFile(join(assetDir,'pdf_viewer.css'),scopePdfStyles(await readFile(join(pkg,'web/pdf_viewer.css'),'utf8')));
  await cp(join(pkg,'web/images'),join(assetDir,'images'),{recursive:true});
  for(const name of ['cmaps','standard_fonts','wasm'])await cp(join(pkg,name),join(assetDir,name),{recursive:true});
  await writeFile(join(dir,'sample.pdf'),samplePdf());
  await writeFile(join(dir,'index.html'),'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><body class="theme-dark"><div id="root" style="width:900px;height:1000px"></div><script src="fixture.js"></script>');
  await writeFile(join(dir,'runner.cjs'),`const {app,BrowserWindow}=require('electron'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');app.setPath('userData',${JSON.stringify(join(dir,'profile'))});app.whenReady().then(async()=>{
   const dir=${JSON.stringify(dir)},server=http.createServer((req,res)=>{const url=new URL(req.url,'http://fixture');if(url.pathname==='/api/files/content'&&url.searchParams.get('path')==='Attachments/document.pdf'){res.writeHead(404).end();return}const name=decodeURIComponent(req.url.split('?')[0]),p=path.resolve(dir,'.'+(name==='/'?'/index.html':name==='/api/files/content'?'/sample.pdf':name));if(!p.startsWith(dir+path.sep)){res.writeHead(403).end();return}try{res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self'; connect-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; object-src 'none'" );res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.pdf':'application/pdf','.html':'text/html'})[path.extname(p)]||'application/octet-stream');res.end(fs.readFileSync(p))}catch{res.writeHead(404).end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
   const w=new BrowserWindow({show:false,width:1100,height:1600,webPreferences:{backgroundThrottling:false}});w.webContents.on('console-message',(_e,l,m)=>{if(l>=2)console.error(m)});await w.loadURL('http://127.0.0.1:'+server.address().port);w.webContents.debugger.attach('1.3');await w.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:1100,height:1600,deviceScaleFactor:1,mobile:false});await w.webContents.executeJavaScript('window.capturePreview='+Boolean(process.env.WEBO_PDF_PREVIEW));console.log(await w.webContents.executeJavaScript('window.run()'));if(process.env.WEBO_PDF_PREVIEW){fs.writeFileSync(process.env.WEBO_PDF_PREVIEW,(await w.webContents.capturePage()).toPNG());await w.webContents.executeJavaScript('window.cleanup()')}w.destroy();server.close();app.quit()}).catch(e=>{console.error(e);app.exit(1)});`);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const {stdout}=await promisify(execFile)(createRequire(import.meta.url)('electron'),[...(process.platform==='linux'?['--ozone-platform=headless']:[]),join(dir,'runner.cjs')],{env,windowsHide:true,timeout:90000});
  assert.match(stdout,/PDF_VIEWER_PASS/);
 }finally{assert.ok(dir.startsWith(join(tmpdir(),'webo-pdf-viewer-')));await rm(dir,{recursive:true,force:true})}
});
