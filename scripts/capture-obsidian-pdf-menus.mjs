import {menuPdf} from '../tests/fixtures/embeds/pdf-menus.mjs';
// Optional native integration fixture. Never attaches to a user's Obsidian process.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'webo-pdf-menu-reference-'));
const profile=path.join(root,'profile'),vault=path.join(root,'vault');
const output=path.resolve('build/obsidian-pdf-menus');
await fs.mkdir(profile,{recursive:true});await fs.mkdir(path.join(vault,'.obsidian'),{recursive:true});await fs.mkdir(output,{recursive:true});
await fs.writeFile(path.join(vault,'.obsidian','app.json'),JSON.stringify({livePreview:true,readableLineLength:false}));
await fs.writeFile(path.join(vault,'.obsidian','appearance.json'),JSON.stringify({theme:'obsidian'}));
await fs.writeFile(path.join(profile,'obsidian.json'),JSON.stringify({vaults:{embedreference:{path:vault,open:true,ts:Date.now()}}}));
const asar=path.join(os.homedir(),'AppData/Roaming/obsidian/obsidian-1.14.5.asar');
await fs.copyFile(asar,path.join(profile,'obsidian-1.14.5.asar'));
const fixture=new Map([['sample.pdf',menuPdf()],['PDF.md','# PDF\n\n![[sample.pdf#height=400]]\n']]);
for(const [name,content]of fixture)await fs.writeFile(path.join(vault,name),content);
const before=new Map([...fixture].map(([name,content])=>[name,createHash('sha256').update(content).digest('hex')]));
const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
const child=spawn('C:/Program Files/Obsidian/Obsidian.exe',[`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1','--disable-background-timer-throttling'],{windowsHide:true,stdio:'ignore'});
let socket;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 let target;for(let i=0;i<100;i++){try{target=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.type==='page'&&t.url==='app://obsidian.md/index.html')}catch{}if(target)break;await sleep(200)}
 if(!target)throw Error('No isolated Obsidian renderer');
 socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true})});
 let seq=0;const pending=new Map();socket.addEventListener('message',e=>{const v=JSON.parse(e.data),p=pending.get(v.id);if(p){pending.delete(v.id);v.error?p.reject(v.error):p.resolve(v.result)}});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(pending.delete(id))reject(Error('Timeout '+method))},15000).unref()});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
 let info;for(let i=0;i<100;i++){info=await evaluate('typeof app!=="undefined"&&app.workspace?.layoutReady?({path:app.vault.adapter.getBasePath(),title:document.title}):null');if(info)break;await sleep(200)}
 if(path.resolve(info?.path??'')!==path.resolve(vault))throw Error('Wrong vault; refusing reference capture');

 await call('Emulation.setDeviceMetricsOverride',{width:1200,height:1000,deviceScaleFactor:1,mobile:false});
 await evaluate(`(async()=>{const leaf=app.workspace.getLeaf(false);await leaf.setViewState({type:'markdown',state:{file:'PDF.md',mode:'preview'}})})()`);
 await sleep(2200);
 const results=[];
 for(const label of ['Параметры боковой панели','Параметры отображения','Открыть']){
  await evaluate(`(()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));const root=app.workspace.activeLeaf.view.containerEl;const button=[...root.querySelectorAll('[aria-label]')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(label)});if(!button)throw Error('No native button');button.click()})()`);
  await sleep(200);
  const result=await evaluate(`(()=>({label:${JSON.stringify(label)},menus:[...document.querySelectorAll('.menu')].map(m=>({text:m.innerText,html:m.outerHTML,items:[...m.querySelectorAll('.menu-item')].map(e=>({text:e.innerText,cls:e.className,html:e.outerHTML}))}))}))()`);
  results.push(result);
  const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(path.join(output,'menu-'+results.length+'.png'),Buffer.from(shot.data,'base64'));
  console.log(label+' '+JSON.stringify(result.menus.map(m=>m.items.map(e=>({text:e.text,cls:e.cls})))));
 }

 const copyMenu=await evaluate(`(async()=>{const item=[...document.querySelectorAll('.menu-item')].find(e=>e.innerText==='Копировать путь');item?.dispatchEvent(new MouseEvent('mouseenter',{bubbles:true}));await new Promise(r=>setTimeout(r,300));return [...document.querySelectorAll('.menu')].map(e=>e.innerText)})()`);
 await fs.writeFile(path.join(output,'copy-menu.json'),JSON.stringify(copyMenu,null,2));
 await evaluate(`(()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));const b=[...app.workspace.activeLeaf.view.containerEl.querySelectorAll('[aria-label]')].find(e=>e.getAttribute('aria-label')==='Параметры отображения');b.click();[...document.querySelectorAll('.menu-item')].find(e=>e.innerText==='Адаптировать к теме').click()})()`);
 await sleep(200);
 const theme=await evaluate(`(()=>{const root=app.workspace.activeLeaf.view.containerEl;return [...root.querySelectorAll('*')].filter(e=>getComputedStyle(e).filter!=='none'||getComputedStyle(e).mixBlendMode!=='normal').map(e=>({cls:e.className,filter:getComputedStyle(e).filter,blend:getComputedStyle(e).mixBlendMode}))})()`);
 await fs.writeFile(path.join(output,'theme.json'),JSON.stringify(theme,null,2));console.log('COPY '+JSON.stringify(copyMenu)+' THEME '+JSON.stringify(theme));
 await fs.writeFile(path.join(output,'menus.json'),JSON.stringify(results,null,2));
 console.log('PDF_MENUS_REFERENCE_OK '+output);
}finally{socket?.close();child.kill()}
