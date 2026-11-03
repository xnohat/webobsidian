import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn,execFile} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {promisify} from 'node:util';
import net from 'node:net';
import {hashPassword} from '../../server/src/services/auth';
import {fragmentPdf} from '../../tests/fixtures/embeds/pdf-fragments.mjs';

function samplePdf(){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 800 600] >>'];
 let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((o,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${o}\nendobj\n`});const start=pdf.length;
 return pdf+'xref\n0 5\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
}

test('public SSR hydrates PDF and Canvas using only scoped share access, including password unlock',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'webo-public-embeds-'));let server:ReturnType<typeof spawn>|undefined,logs='';
 try{
  const vault=join(dir,'vault'),data=join(dir,'data');await mkdir(join(vault,'Folder'),{recursive:true});await mkdir(data);
  const note='![[sample.pdf#page=2&height=400]]\n\n![[Board.canvas]]\n\nAfter embeds\n\n<a class="pdf-embed" data-href="Private.md" href="/api/files/content?path=Private.md">Untrusted PDF lookalike</a>\n\n<a class="canvas-embed" data-href="Other.canvas" href="/public/shares/another/file?path=Other.canvas">Another share lookalike</a>';
  await writeFile(join(vault,'Folder','Host.md'),note+'\n\n%%\n\n[hidden]: Private.svg\n\n%%\n\n![secret][hidden]');await writeFile(join(vault,'Folder','sample.pdf'),samplePdf());
  await writeFile(join(vault,'Folder','Private.svg'),'<svg xmlns="http://www.w3.org/2000/svg"/>');
  await writeFile(join(vault,'Private.md'),'PRIVATE_NOTE_CANARY');
  await writeFile(join(vault,'Folder','Board.canvas'),JSON.stringify({nodes:[{id:'a',type:'text',x:0,y:0,width:200,height:100,text:'Public canvas card'},{id:'b',type:'file',x:300,y:0,width:200,height:100,file:'Private.md'}],edges:[{id:'e',fromNode:'a',toNode:'b'}]}));
  await writeFile(join(vault,'Other.canvas'),'{}');
  await writeFile(join(vault,'Folder','md #one.pdf'),fragmentPdf());
  await writeFile(join(vault,'Folder','Board#one.canvas'),JSON.stringify({nodes:[],edges:[]}));
  await writeFile(join(vault,'Folder','Markdown.md'),'![](md%20%23one.pdf#page=2&selection=0,0,0,6&height=400)\n\n![](Board%23one.canvas)\n\nAfter embeds');
  await mkdir(join(vault,'Child'));
  await writeFile(join(vault,'Folder','Parent.md'),'# Parent\n\n![[../Child/Published#Section]]\n\n![](../Child/Space%2520%23one.md#Section)\n\n![[../Child/Protected]]\n\n![[../Child/Unshared]]\n\n![[../Child/Disabled]]\n\n![[Private]]');
  await writeFile(join(vault,'Child','Published.md'),'# Published\n\n'+('Before section paragraph\n\n'.repeat(30))+'## Section\n\nNESTED_PUBLIC_BODY\n\n![](inside.pdf#page=2&height=160)\n\n![[Board.canvas]]\n\n![](picture.svg)\n\n![[Grand]]\n\n<div data-public-share="another"><a class="pdf-embed" data-href="Private.md" href="/public/shares/another/file?path=Private.md">Scope spoof</a></div>\n\n## Other\n\nOMITTED_CHILD_SECTION');
  await writeFile(join(vault,'Child','Space%20#one.md'),'# Literal\n\n## Section\n\nENCODED_PUBLIC_BODY');
  await writeFile(join(vault,'Child','Grand.md'),'GRAND_PUBLIC_BODY');
  for(const name of ['Protected','Unshared','Disabled'])await writeFile(join(vault,'Child',name+'.md'),name.toUpperCase()+'_CHILD_CANARY');
  await writeFile(join(vault,'Child','inside.pdf'),fragmentPdf());await writeFile(join(vault,'Child','Board.canvas'),JSON.stringify({nodes:[{id:'child',type:'text',x:0,y:0,width:150,height:80,text:'Child canvas'}],edges:[]}));
  await writeFile(join(vault,'Child','picture.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="red"/></svg>');
  await mkdir(join(vault,'Boards'));await mkdir(join(vault,'Media'));
  const cards=JSON.stringify({nodes:[{id:'note',type:'file',file:'Child/Published.md',subpath:'#Section',x:0,y:0,width:360,height:280},{id:'pdf',type:'file',file:'Media/report #one.pdf',subpath:'#page=2&selection=0,0,0,6',x:400,y:0,width:360,height:360},{id:'image',type:'file',file:'Media/photo%20#one.svg',x:800,y:0,width:240,height:120},{id:'audio',type:'file',file:'Media/sound.wav',x:0,y:420,width:360,height:100},{id:'generic',type:'file',file:'Media/config.yaml',x:400,y:420,width:300,height:160},{id:'private',type:'file',file:'Private.md',x:800,y:420,width:240,height:160}],edges:[]});
  await writeFile(join(vault,'Boards','Files.canvas'),cards);await writeFile(join(vault,'Boards','Restricted.canvas'),cards);
  await writeFile(join(vault,'Folder','CanvasHost.md'),'![[../Boards/Files.canvas]]\n\n![[../Boards/Restricted.canvas]]');
  await writeFile(join(vault,'Media','report #one.pdf'),fragmentPdf());await writeFile(join(vault,'Media','photo%20#one.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="240" height="120" fill="red"/></svg>');await writeFile(join(vault,'Media','config.yaml'),'setting: true');
  const wav=Buffer.alloc(1644);wav.write('RIFF');wav.writeUInt32LE(1636,4);wav.write('WAVE',8);wav.write('fmt ',12);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(1600,40);await writeFile(join(vault,'Media','sound.wav'),wav);
  const blockFiller=Array.from({length:35},(_,i)=>'Block navigation filler '+i).join('\n\n');
  await writeFile(join(vault,'Folder','BlockChild.md'),'Nested duplicate ^paragraph');
  await writeFile(join(vault,'Folder','BlockSource.md'),'# Blocks\n\n![[BlockChild]]\n\n'+blockFiller+'\n\nBLOCK_NAV_PARAGRAPH **bold** ^paragraph\n\n'+blockFiller+'\n\n- BLOCK_NAV_LIST_ONE\n- BLOCK_NAV_LIST_TWO\n\n^list\n\n'+blockFiller+'\n\n| A | B |\n| - | - |\n| BLOCK_NAV_TABLE | Cell |\n\n^table\n\n'+blockFiller+'\n\n```text\nBLOCK_NAV_CODE\n```\n\n^code\n\n'+blockFiller+'\n\n- [x] BLOCK_NAV_TASK ^task\n\n'+blockFiller+'\n\n> [!note] Title\n> BLOCK_NAV_CALLOUT ^callout\n\n'+blockFiller+'\n\n> BLOCK_NAV_QUOTE ^quote\n\n'+blockFiller);
  await writeFile(join(vault,'Folder','BlockHost.md'),'![[BlockSource#^paragraph]]');
  const pw=await hashPassword('share-password');
  const childPassword=await hashPassword('child-password');
  const boardPassword=await hashPassword('board-password');
  await writeFile(join(data,'shares.json'),JSON.stringify([{id:'open',path:'Folder/Host.md',enabled:true},{id:'block-source',path:'Folder/BlockSource.md',enabled:true},{id:'block-host',path:'Folder/BlockHost.md',enabled:true},{id:'block-child',path:'Folder/BlockChild.md',enabled:true},{id:'markdown',path:'Folder/Markdown.md',enabled:true},{id:'protected',path:'Folder/Host.md',enabled:true,passwordHash:pw},{id:'disabled',path:'Folder/Host.md',enabled:false},
   {id:'nested',path:'Folder/Parent.md',enabled:true,passwordHash:pw},{id:'child',path:'Child/Published.md',enabled:true},{id:'encoded-child',path:'Child/Space%20#one.md',enabled:true},{id:'grand',path:'Child/Grand.md',enabled:true},{id:'protected-child',path:'Child/Protected.md',enabled:true,passwordHash:childPassword},{id:'disabled-child',path:'Child/Disabled.md',enabled:false},{id:'canvas-parent',path:'Folder/CanvasHost.md',enabled:true},{id:'files-board',path:'Boards/Files.canvas',enabled:true,passwordHash:boardPassword}]));
  const socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=(socket.address() as net.AddressInfo).port;await new Promise<void>(r=>socket.close(()=>r()));
  const repo=fileURLToPath(new URL('../../',import.meta.url)),base='http://127.0.0.1:'+port;
  server=spawn(process.execPath,['--import','tsx','server/src/index.ts'],{cwd:repo,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_ENV:'production',HOST:'127.0.0.1',PORT:String(port),DATA_DIR:data,VAULT_PATH:vault,ALLOWED_ROOTS:vault,WEBOBSIDIAN_PASSWORD:'fixture-admin',TRUST_PROXY:'false'}});
  server.stdout!.on('data',d=>{logs+=d});server.stderr!.on('data',d=>{logs+=d});
  let started=false;for(let i=0;i<120;i++){if(server.exitCode!==null)throw Error(logs);try{started=(await fetch(base+'/healthz')).ok}catch{}if(started)break;await delay(100)}assert.ok(started,logs);
  for(const id of ['open','protected','disabled']){
   const expected=id==='open'?200:id==='protected'?401:404;
   assert.equal((await fetch(base+'/public/shares/'+id+'/file?path=sample.pdf')).status,expected);
   assert.equal((await fetch(base+'/share/'+id+'/canvas?path=Board.canvas')).status,expected);
  }
  assert.equal((await fetch(base+'/public/shares/open/file?path=Private.md')).status,404);
  assert.equal((await fetch(base+'/public/shares/open/file?path=Private.svg')).status,404);
  assert.equal((await fetch(base+'/share/open/canvas?path=Other.canvas')).status,404);
  assert.equal((await fetch(base+'/api/files/content?path=Private.md')).status,401);
  await writeFile(join(dir,'runner.cjs'),`
   const {app,BrowserWindow}=require('electron'),fs=require('node:fs');app.setPath('userData',${JSON.stringify(join(dir,'profile'))});
   app.whenReady().then(async()=>{
    const base=${JSON.stringify(base)},win=new BrowserWindow({show:false,width:1100,height:1200,webPreferences:{backgroundThrottling:false}}),requests=[],opened=[];
    win.webContents.setWindowOpenHandler(({url})=>{opened.push(url);return {action:'deny'}});
    win.webContents.session.webRequest.onBeforeRequest((details,done)=>{requests.push(details.url);done({})});
    win.webContents.on('console-message',(_event,level,message)=>{if(level>=2)console.error(message)});
    const evaluate=async code=>{try{return await win.webContents.executeJavaScript(code,true)}catch(error){throw Error(code+': '+error.message)}},check=(ok,msg)=>{if(!ok)throw Error(msg)};
    const until=async(code,msg)=>{for(let i=0;i<200;i++){if(await evaluate(code))return;await new Promise(r=>setTimeout(r,50))}throw Error(msg+': '+await evaluate('JSON.stringify({hash:location.hash,scrollY,innerHeight,wheel:window.canvasWheel,noteScroll:(()=>{const e=document.querySelector(\"[data-canvas-node=note] .canvas-file-body\");return e?{top:e.scrollTop,height:e.clientHeight,scroll:e.scrollHeight,overflow:getComputedStyle(e).overflowY,parentHeight:e.parentElement.clientHeight,canvasTransform:document.querySelector(\"#cv-world\").style.transform}:null})(),height:document.documentElement.scrollHeight,headings:[...document.querySelectorAll(\"h2\")].map(h=>({text:h.textContent,top:h.getBoundingClientRect().top}))})')+': '+await evaluate('document.body.innerText'))};
    const reader=async()=>{
     await until('!!document.querySelector(".pdf-reader[data-ready=true]")','public PDF loaded');
     await until('!!document.querySelector(".canvas-embed[data-ready=true] .canvas-minimap")','public Canvas minimap loaded');
     await evaluate(\`(()=>{const root=document.querySelector('.pdf-reader'),page=root.querySelector('[aria-label="Page number"]');if(page.value!=='2'||!root.querySelector('.pdf-page-count').textContent.includes('2'))throw Error('PDF fragment and count');if(Math.abs(root.getBoundingClientRect().height-438)>2)throw Error('PDF fixed Reading height');if(root.querySelector('[aria-label="Edit block"]'))throw Error('Public reader has edit control');page.value='1';page.dispatchEvent(new Event('change'));if(!document.body.innerText.includes('After embeds'))throw Error('Following note content missing')})()\`);
     await until('document.querySelector(".pdf-reader .pdf-toolbar input").value==="1"','public PDF page control');
     await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
     await evaluate("document.querySelector('.pdf-toolbar [data-pdf-action=zoom-in]').click()");
     await evaluate("document.querySelector('.pdf-toolbar [data-pdf-action=sidebar-toggle]').click()");
     check(await evaluate('!document.querySelector(".pdf-thumbnails").hidden'),'public PDF thumbnails');
     await until('document.querySelectorAll(".pdf-thumbnails canvas").length===2','public PDF thumbnails render');
     await evaluate('document.querySelector(".pdf-thumbnails button:last-child").click()');
     await until('document.querySelector(".pdf-reader .pdf-toolbar input").value==="2"','public PDF thumbnail navigation');
     const dimensions=await evaluate('({width:document.querySelector(".pdf-reader").getBoundingClientRect().width,height:document.querySelector(".pdf-reader").getBoundingClientRect().height})');check(dimensions.width>400&&dimensions.height>400,'public PDF layout '+JSON.stringify(dimensions));
    };
    await win.loadURL(base+'/share/open');win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:1100,height:1200,deviceScaleFactor:1,mobile:false});await until('innerWidth===1100&&innerHeight===1200','explicit public viewport');await reader();
    await evaluate('window.dispatchEvent(new PageTransitionEvent("pagehide",{persisted:true}));window.dispatchEvent(new PageTransitionEvent("pageshow",{persisted:true}))');
    check(await evaluate('!!document.querySelector(".pdfViewer .page")'),'BFCache transition preserves PDF pages and workers');
    await evaluate('document.querySelector(".pdf-file-menu").click()');await until('!!document.querySelector(".pdf-menu-panel")','public file menu');check(await evaluate('!document.querySelector(".pdf-menu-panel [data-label=Rename]")'),'public menu excludes vault mutations');await evaluate('document.querySelector(".pdf-menu-panel button").click()');check(opened.some(url=>url.startsWith(base+'/public/shares/open/file?')&&url.includes('#page=2')),'PDF opens using public file URL');
    if(process.env.WEBO_PUBLIC_CAPTURE)fs.writeFileSync(process.env.WEBO_PUBLIC_CAPTURE,(await win.webContents.capturePage()).toPNG());
    await evaluate('document.querySelector(".canvas-embed .embed-title").click()');
    await until('!!document.querySelector("#cv-world")','Canvas title opens full scoped board');
    check(win.webContents.getURL().includes('/share/open/canvas?path=Board.canvas'),'Canvas opens scoped viewer');
    check(await evaluate('document.body.innerText.includes("Public canvas card")&&!document.body.innerText.includes("PRIVATE_NOTE_CANARY")'),'Canvas shows its own text without private note transclusion');
    await evaluate(\`(()=>{const world=document.querySelector('#cv-world'),before=world.style.transform;document.querySelector('#cv-zin').click();if(world.style.transform===before)throw Error('Canvas zoom');document.querySelector('#cv-fit').click()})()\`);
    win.webContents.navigationHistory.goBack();await until('!!document.querySelector(".pdf-reader[data-ready=true] .pdfViewer .page")','Back from Canvas restores a working PDF reader');
    await win.loadURL(base+'/share/markdown');await reader();await until('document.querySelector(".pdf-fragment-selection")?.textContent==="Second"','public PDF fragment selection is highlighted');check(await evaluate('document.querySelector(".canvas-embed .embed-title").textContent==="Board#one"'),'public Markdown Canvas preserves literal hash filename');
    await win.loadURL(base+'/share/protected');check(!await evaluate('!!document.querySelector(".pdf-reader,.canvas-minimap")'),'locked page has no readers');
    check(!await evaluate('document.body.innerText.includes("Board.canvas")'),'locked page leaks no embed names');
    await evaluate(\`fetch('/public/shares/protected/unlock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'share-password'})}).then(r=>{if(!r.ok)throw Error('Unlock failed')})\`);
    await win.loadURL(base+'/share/protected');await reader();
    await evaluate('document.querySelector(".canvas-minimap").focus()');
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});win.webContents.sendInputEvent({type:'char',keyCode:String.fromCharCode(13)});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});
    await until('!!document.querySelector("#cv-world")','unlocked Canvas opens with Enter');
    await win.loadURL(base+'/share/nested');check(!await evaluate('document.body.innerText.includes("NESTED_PUBLIC_BODY")'),'locked parent hides transcluded bodies');
    await evaluate(\`fetch('/public/shares/nested/unlock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'share-password'})}).then(r=>{if(!r.ok)throw Error('Parent unlock failed')})\`);
    await win.loadURL(base+'/share/nested');
    check(await evaluate('document.body.innerText.includes("NESTED_PUBLIC_BODY")&&document.body.innerText.includes("ENCODED_PUBLIC_BODY")&&document.body.innerText.includes("GRAND_PUBLIC_BODY")'),'published note transclusions, Markdown encoding and recursion');
    check(!await evaluate('/PROTECTED_CHILD_CANARY|UNSHARED_CHILD_CANARY|DISABLED_CHILD_CANARY|PRIVATE_NOTE_CANARY|OMITTED_CHILD_SECTION/.test(document.body.innerText)'),'parent publication and password cannot grant child access');
    check(await evaluate("fetch('/public/shares/nested/file?path=../Child/inside.pdf').then(r=>r.status)")===404,'parent endpoint cannot serve child attachments');
    check(await evaluate("fetch('/public/shares/nested/file?path=../Child/Published.md').then(r=>r.status)")===404,'parent endpoint cannot expose child Markdown bytes');
    check(await evaluate("fetch('/public/shares/protected-child').then(r=>r.status)")===401,'parent unlock cannot read protected child directly');
    await until('!!document.querySelector(".embed-note[data-public-share=child] .pdf-reader[data-ready=true]")','PDF inside public child is hydrated');
    await until('!!document.querySelector(".embed-note[data-public-share=child] .canvas-minimap")','Canvas inside public child is hydrated');
    await until('[...document.querySelectorAll(".embed-note[data-public-share=child] img")].some(i=>i.naturalWidth>0)','image inside public child loads');
    check(requests.some(url=>new URL(url).pathname==='/public/shares/child/file'&&new URL(url).searchParams.get('path')==='inside.pdf'),'child PDF uses its own publication endpoint');
    await evaluate('document.querySelector(".embed-note[data-public-share=child] .canvas-embed .embed-title").click()');await until('!!document.querySelector("#cv-world")','nested Canvas opens');check(win.webContents.getURL().includes('/share/child/canvas?path=Board.canvas'),'nested Canvas opens in child scope');
    await win.loadURL(base+'/share/nested');await evaluate('document.querySelector(".embed-note[data-public-share=child] > .markdown-embed-link").click()');await until('document.querySelector(".inline-title")?.textContent==="Published"','public note open button opens child source');check(win.webContents.getURL().endsWith('/share/child#Section'),'note button preserves heading fragment');
    await until('[...document.querySelectorAll("h2")].some(h=>h.textContent==="Section"&&h.getBoundingClientRect().top>=-2&&h.getBoundingClientRect().bottom<innerHeight-10&&document.querySelector(\".public-page > .markdown-preview\").scrollTop>100)','opening source scrolls to its section');
    await win.loadURL(base+'/share/nested');await evaluate(\`fetch('/public/shares/protected-child/unlock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'child-password'})}).then(r=>{if(!r.ok)throw Error('Child unlock failed')})\`);await win.loadURL(base+'/share/nested');check(await evaluate('document.body.innerText.includes("PROTECTED_CHILD_CANARY")'),'child unlock authorizes transclusion only for that visitor');
    await evaluate('document.querySelector(".embed-note[data-public-share=encoded-child] > .markdown-embed-link").focus()');win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});win.webContents.sendInputEvent({type:'char',keyCode:String.fromCharCode(13)});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});await until('document.querySelector(".inline-title")?.textContent==="Space%20#one"','note source button opens encoded filename by keyboard');

    await win.loadURL(base+'/share/canvas-parent/canvas?path=../Boards/Restricted.canvas');check(await evaluate('document.body.innerText.includes("NESTED_PUBLIC_BODY")&&!document.body.innerText.includes("PRIVATE_NOTE_CANARY")'),'unpublished board only expands independently published note cards');check(!await evaluate('!!document.querySelector("[data-canvas-node=pdf] .pdf-embed,[data-canvas-node=pdf] .pdf-reader,[data-canvas-node=image] img")'),'parent does not grant board file descendants');
    await win.loadURL(base+'/share/canvas-parent/canvas?path=../Boards/Files.canvas');check(!await evaluate('!!document.querySelector("[data-canvas-node=pdf] .pdf-reader,[data-canvas-node=image] img")'),'board password still applies through parent');
    await evaluate(\`fetch('/public/shares/files-board/unlock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'board-password'})}).then(r=>{if(!r.ok)throw Error('Board unlock failed')})\`);await win.loadURL(base+'/share/canvas-parent/canvas?path=../Boards/Files.canvas');
    await until('!!document.querySelector("[data-canvas-node=pdf] .pdf-reader[data-ready=true]")','direct PDF card hydrates');
    await until('document.querySelector("[data-canvas-node=image] img")?.naturalWidth===240','image card loads');await until('document.querySelector("[data-canvas-node=audio] audio")?.readyState>=1','audio card metadata loads');
    check(await evaluate('new URL(document.querySelector("[data-canvas-node=image] img").src).searchParams.get("path")==="/Media/photo%20#one.svg"'),'literal percent/hash Canvas path preserved');
    check(await evaluate('document.querySelector("[data-canvas-node=pdf] input").value==="2"'),'Canvas PDF subpath selected');
    check(await evaluate('(()=>{const node=document.querySelector("[data-canvas-node=pdf]"),r=node.querySelector(".pdf-reader");return r.getBoundingClientRect().height<=node.getBoundingClientRect().height+2})()'),'PDF stays within card height');
    check(await evaluate('(()=>{const node=document.querySelector("[data-canvas-node=note]"),label=node.querySelector(".canvas-file-head");return label.getBoundingClientRect().bottom<=node.getBoundingClientRect().top+2})()'),'native file label is above card');check(await evaluate('(()=>{const a=document.querySelector(\"[data-canvas-node=note] .canvas-file-source\"),r=a.getBoundingClientRect();return a.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})()'),'file source label is visible and hit-testable');
    check(!await evaluate('document.body.innerText.includes("PRIVATE_NOTE_CANARY")'),'published board never expands unpublished note');
    check(await evaluate('!!document.querySelector("[data-canvas-node=note] .canvas-file-open[aria-label]")'),'native note card open button is present');
    await until('!!document.querySelector("[data-canvas-node=pdf] .pdfViewer .page[data-loaded=true] canvas")','Canvas PDF page is painted');await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    if(process.env.WEBO_CANVAS_CAPTURE)fs.writeFileSync(process.env.WEBO_CANVAS_CAPTURE,(await win.webContents.capturePage()).toPNG());
    const mouse=async(type,p,extra={})=>win.webContents.sendInputEvent({type,x:Math.round(p.x),y:Math.round(p.y),...extra});
    const point=async selector=>evaluate('(()=>{const r=document.querySelector('+JSON.stringify(selector)+').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
    const transform=await evaluate('document.querySelector("#cv-world").style.transform'),pdfPoint=await point('[data-canvas-node=pdf] [data-pdf-action=zoom-in]');
    mouse('mouseDown',pdfPoint,{button:'left',clickCount:1});mouse('mouseUp',pdfPoint,{button:'left',clickCount:1});await until('document.querySelector("[data-canvas-node=pdf] .pdf-reader").dataset.scale!=="page-width"','real PDF zoom click works inside Canvas');check(await evaluate('document.querySelector("#cv-world").style.transform')===transform,'PDF click never pans board');
    await evaluate('document.addEventListener(\"wheel\",e=>{window.canvasWheel={delta:e.deltaY,tag:e.target.tagName,pdf:!!e.target.closest(\".pdf-reader\")}}, {capture:true,passive:true})');const notePoint=await point('[data-canvas-node=note] .canvas-file-body > p'),beforeScroll=await evaluate('document.querySelector("[data-canvas-node=note] .canvas-file-body").scrollTop');mouse('mouseMove',notePoint);mouse('mouseWheel',notePoint,{deltaY:-180,canScroll:true});await until('document.querySelector("[data-canvas-node=note] .canvas-file-body").scrollTop>'+beforeScroll,'wheel scrolls note card');check(await evaluate('document.querySelector("#cv-world").style.transform')===transform,'card scrolling never zooms board');
    const panPoint=await evaluate('(()=>{const r=document.querySelector("#cv-viewport").getBoundingClientRect();return {x:r.x+20,y:r.y+20}})()');mouse('mouseDown',panPoint,{button:'left',clickCount:1});mouse('mouseMove',{x:panPoint.x+60,y:panPoint.y+30},{button:'left'});mouse('mouseUp',{x:panPoint.x+60,y:panPoint.y+30},{button:'left',clickCount:1});await until('document.querySelector("#cv-world").style.transform!=='+JSON.stringify(transform),'background drag still pans board');
    await evaluate('document.querySelector("[data-canvas-node=note] .canvas-file-source").focus()');win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});win.webContents.sendInputEvent({type:'char',keyCode:String.fromCharCode(13)});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});await until('document.querySelector(".inline-title")?.textContent==="Published"','Canvas card source opens by keyboard');check(win.webContents.getURL().endsWith('/share/child#Section'),'Canvas source retains section');
    await win.loadURL(base+'/share/files-board');await until('!!document.querySelector("[data-canvas-node=pdf] .pdf-reader[data-ready=true]")','standalone public Canvas hydrates same file cards');check(await evaluate('document.querySelector("[data-canvas-node=generic]").textContent.includes("config.yaml")'),'unsupported file card remains a file card');
    const openPoint=await point('[data-canvas-node=note] .canvas-file-open');mouse('mouseMove',openPoint);mouse('mouseDown',openPoint,{button:'left',clickCount:1});mouse('mouseUp',openPoint,{button:'left',clickCount:1});await until('document.querySelector(".inline-title")?.textContent==="Published"','native Canvas note open button opens source');check(win.webContents.getURL().endsWith('/share/child#Section'),'Canvas open button retains section');
    await win.loadURL(base+'/share/block-host');check(await evaluate('document.body.innerText.includes("BLOCK_NAV_PARAGRAPH")&&!document.body.innerText.includes("BLOCK_NAV_LIST_ONE")'),'block transclusion selects only its body');await evaluate('document.querySelector(".embed-note > .markdown-embed-link").click()');await until('location.pathname==="/share/block-source"','block source opens own publication');
    for(const id of ['paragraph','list','table','code','task','callout','quote']){
     await evaluate('location.hash='+JSON.stringify('^'+id));
     await until('(()=>{const e=[...document.querySelectorAll("[data-block-id]")].find(e=>e.dataset.blockId==='+JSON.stringify(id)+'&&!e.closest(".embed-note"));if(!e)return false;const r=e.getBoundingClientRect();return r.top>=-2&&r.top<100&&r.bottom<innerHeight&&document.querySelector(".public-page > .markdown-preview").scrollTop>100})()','public block navigation '+id);
    }
    await win.loadURL(base+'/share/block-source#%5Eparagraph');await until('(()=>{const e=[...document.querySelectorAll("[data-block-id=paragraph]")].find(e=>!e.closest(".embed-note"));return !!e&&e.getBoundingClientRect().top>=-2&&e.getBoundingClientRect().bottom<innerHeight&&document.querySelector(".public-page > .markdown-preview").scrollTop>100})()','initial encoded block fragment scrolls root block');
    await evaluate('location.hash=""');await until('document.querySelector(".public-page > .markdown-preview").scrollTop===0','clearing public fragment returns to top');
    await evaluate('document.querySelector(".public-page > .markdown-preview").scrollTop=0;location.hash="^missing"');await evaluate('new Promise(r=>setTimeout(r,100))');check(await evaluate('document.querySelector(".public-page > .markdown-preview").scrollTop')===0,'missing block leaves viewport unchanged');
    check(!requests.some(url=>new URL(url).pathname.startsWith('/api/')),'public reader must never request authenticated APIs');
    check(!requests.some(url=>new URL(url).pathname==='/ws'),'public reader must not boot SPA websocket');
    check(!requests.some(url=>new URL(url).pathname.startsWith('/public/shares/another/')),'raw HTML cannot hydrate another share');
    console.log('PUBLIC_EMBEDS_PASS');win.destroy();app.quit();
   }).catch(e=>{console.error(e);app.exit(1)});
  `);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const {stdout}=await promisify(execFile)(createRequire(import.meta.url)('electron'),[...(process.platform==='linux'?['--ozone-platform=headless']:[]),join(dir,'runner.cjs')],{env,windowsHide:true,timeout:90000});assert.match(stdout,/PUBLIC_EMBEDS_PASS/);
 }finally{
  if(server&&server.exitCode===null){const closed=once(server,'exit');server.kill();await Promise.race([closed,delay(5000)])}
  assert.ok(dir.startsWith(join(tmpdir(),'webo-public-embeds-')));await rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});
 }
});
