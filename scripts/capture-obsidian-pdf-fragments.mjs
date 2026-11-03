import {fragmentPdf} from '../tests/fixtures/embeds/pdf-fragments.mjs';
// Optional native integration fixture. Never attaches to a user's Obsidian process.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'webo-pdf-fragment-reference-'));
const profile=path.join(root,'profile'),vault=path.join(root,'vault');
const output=path.resolve('build/obsidian-pdf-fragments');
await fs.mkdir(profile,{recursive:true});await fs.mkdir(path.join(vault,'.obsidian'),{recursive:true});await fs.mkdir(output,{recursive:true});
await fs.writeFile(path.join(vault,'.obsidian','app.json'),JSON.stringify({livePreview:true,readableLineLength:false}));
await fs.writeFile(path.join(vault,'.obsidian','appearance.json'),JSON.stringify({theme:'obsidian'}));
await fs.writeFile(path.join(profile,'obsidian.json'),JSON.stringify({vaults:{embedreference:{path:vault,open:true,ts:Date.now()}}}));
const asar=path.join(os.homedir(),'AppData/Roaming/obsidian/obsidian-1.14.5.asar');
await fs.copyFile(asar,path.join(profile,'obsidian-1.14.5.asar'));
const cases=[['multi','#page=2&selection=0,7,1,7'],['selection','#page=2&selection=0,0,0,6'],['annotation','#page=2&annotation=8R'],['both','#page=2&annotation=8R&selection=0,0,0,6'],['invalid','#page=2&selection=999,0,1000,3'],['offset','#page=2&offset=40,600,1']];
const fixture=new Map([['sample.pdf',fragmentPdf()],...cases.map(([name,fragment])=>[name+'.md','# '+name+'\n\n![[sample.pdf'+fragment+'&height=400]]\n'])]);
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
 const results=[];
 for(const [name,fragment] of cases){
  await evaluate(`(async()=>{const leaf=app.workspace.getLeaf(false);await leaf.setViewState({type:'markdown',state:{file:${JSON.stringify(name+'.md')},mode:'preview'}})})()`);
  await sleep(1800);
  const result=await evaluate(`(()=>{const root=app.workspace.activeLeaf.view.containerEl,rect=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {x:r.x,y:r.y,width:r.width,height:r.height,background:s.backgroundColor,outline:s.outline,border:s.border}};return {name:${JSON.stringify(name)},fragment:${JSON.stringify(fragment)},focused:[...root.querySelectorAll('.mod-focused')].map(e=>({text:e.textContent,cls:e.className,rect:rect(e)})),text:[...root.querySelectorAll('.textLayer > span')].map((e,i)=>({i,text:e.textContent})),annotations:[...root.querySelectorAll('[data-annotation-id]')].map(e=>({id:e.dataset.annotationId,rect:rect(e)})),page:root.querySelector('.pdf-toolbar input')?.value,selectedText:getSelection()?.toString()}})()`);
  results.push(result);console.log(JSON.stringify(result));
  const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(path.join(output,name+'.png'),Buffer.from(shot.data,'base64'));
 }
 await fs.writeFile(path.join(output,'fragments.json'),JSON.stringify(results,null,2));
 for(const [name,hash]of before)if(createHash('sha256').update(await fs.readFile(path.join(vault,name))).digest('hex')!==hash)throw Error('Reference fixture changed');
 console.log('PDF_FRAGMENTS_REFERENCE_OK '+output);
}finally{socket?.close();child.kill()}
