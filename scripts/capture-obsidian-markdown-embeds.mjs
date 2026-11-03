import {menuPdf} from '../tests/fixtures/embeds/pdf-menus.mjs';
// Optional native integration fixture. Never attaches to a user's Obsidian process.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'webo-md-embed-reference-'));
const profile=path.join(root,'profile'),vault=path.join(root,'vault');
const output=path.resolve('build/obsidian-markdown-embeds');
await fs.mkdir(profile,{recursive:true});await fs.mkdir(path.join(vault,'.obsidian'),{recursive:true});await fs.mkdir(output,{recursive:true});
await fs.writeFile(path.join(vault,'.obsidian','app.json'),JSON.stringify({livePreview:true,readableLineLength:false}));
await fs.writeFile(path.join(vault,'.obsidian','appearance.json'),JSON.stringify({theme:'obsidian'}));
await fs.writeFile(path.join(profile,'obsidian.json'),JSON.stringify({vaults:{embedreference:{path:vault,open:true,ts:Date.now()}}}));
const asar=path.join(os.homedir(),'AppData/Roaming/obsidian/obsidian-1.14.5.asar');
await fs.copyFile(asar,path.join(profile,'obsidian-1.14.5.asar'));

const wav=Buffer.alloc(1644);wav.write('RIFF');wav.writeUInt32LE(1636,4);wav.write('WAVE',8);wav.write('fmt ',12);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(1600,40);
const fixture=new Map([
 ['Target.md','# TARGET_BODY_UNIQUE'],['Target one.md','# Space\n\n## Part\nPART_BODY_UNIQUE'],['Target%20one.md','# PERCENT_BODY_UNIQUE'],
 ['sample.pdf',menuPdf()],['sound.wav',wav],['image (1).svg','<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50" fill="red"/></svg>'],
 ['Board.canvas','{"nodes":[{"id":"a","type":"text","x":0,"y":0,"width":200,"height":100,"text":"Canvas card"}],"edges":[]}'],['config.yaml','safe: true'],
 ['Standard.md','# Standard\n\n![note](Target.md)\n\n![part](Target%20one.md#Part)\n\n![literal](Target%2520one.md)\n\n![](sample.pdf#height=240&page=2)\n\n![](sound.wav)\n\n![](Board.canvas)\n\n![](config.yaml)\n\n![image|100](<image (1).svg>)\n\n![reference][target]\n\n[target]: Target.md\n'],
]);
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
 for(const mode of ['preview','source']){
  await evaluate(`app.workspace.getLeaf(false).setViewState({type:'markdown',state:{file:'Standard.md',mode:${JSON.stringify(mode)},source:false}})`);
  await sleep(1500);
  const result=await evaluate(`(()=>{const root=app.workspace.activeLeaf.view.containerEl;return {mode:${JSON.stringify(mode)},text:root.innerText,html:root.innerHTML,notes:root.querySelectorAll('.markdown-embed').length,pdfs:root.querySelectorAll('.pdf-embed').length,audio:root.querySelectorAll('audio').length,canvases:root.querySelectorAll('.canvas-embed').length,files:root.querySelectorAll('.file-embed').length}})()`);
  results.push(result);await fs.writeFile(path.join(output,mode+'.json'),JSON.stringify(result,null,2));
  const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(path.join(output,mode+'.png'),Buffer.from(shot.data,'base64'));
  console.log(JSON.stringify({...result,html:undefined}));
 }
 console.log('MARKDOWN_NATIVE_REFERENCE_OK '+output);
}finally{socket?.close();child.kill()}
