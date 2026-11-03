import {isDeepStrictEqual} from 'node:util';
import {fragmentPdf} from '../tests/fixtures/embeds/pdf-fragments.mjs';
// Optional native integration fixture. Never attaches to a user's Obsidian process.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'webo-canvas-file-reference-'));
const profile=path.join(root,'profile'),vault=path.join(root,'vault');
const output=path.resolve('build/obsidian-canvas-files');
await fs.mkdir(profile,{recursive:true});await fs.mkdir(path.join(vault,'.obsidian'),{recursive:true});await fs.mkdir(output,{recursive:true});
await fs.writeFile(path.join(vault,'.obsidian','app.json'),JSON.stringify({livePreview:true,readableLineLength:false}));
await fs.writeFile(path.join(vault,'.obsidian','appearance.json'),JSON.stringify({theme:'obsidian'}));
await fs.writeFile(path.join(profile,'obsidian.json'),JSON.stringify({vaults:{embedreference:{path:vault,open:true,ts:Date.now()}}}));
const asar=path.join(os.homedir(),'AppData/Roaming/obsidian/obsidian-1.14.5.asar');
await fs.copyFile(asar,path.join(profile,'obsidian-1.14.5.asar'));
const fixture=new Map([['sample.pdf',fragmentPdf()],['Note.md','# Note\n\nNOTE_CARD_BODY\n\n## Section\n\nSELECTED_CARD_BODY'],['image.svg','<svg xmlns="http://www.w3.org/2000/svg" width="300" height="160"><rect width="300" height="160" fill="#7856c7"/></svg>'],['config.yaml','setting: true'],['Board.canvas',JSON.stringify({nodes:[{id:'note',type:'file',file:'Note.md',x:0,y:0,width:300,height:250},{id:'image',type:'file',file:'image.svg',x:340,y:0,width:300,height:160},{id:'pdf',type:'file',file:'sample.pdf',x:680,y:0,width:300,height:400},{id:'generic',type:'file',file:'config.yaml',x:0,y:300,width:300,height:150},{id:'part',type:'file',file:'Note.md',subpath:'#Section',x:340,y:300,width:300,height:220}],edges:[]})]]);
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
 await evaluate(`(async()=>{const leaf=app.workspace.getLeaf(false);await leaf.setViewState({type:'canvas',state:{file:'Board.canvas'}})})()`);
 await sleep(2400);
 const commands=await evaluate(`app.commands.listCommands().filter(c=>c.id.includes('canvas')&&/fit/i.test(c.id))`);console.log('COMMANDS '+JSON.stringify(commands));
 if(commands[0])await evaluate(`app.commands.executeCommandById(${JSON.stringify(commands[0].id)})`);
 await sleep(400);
 const result=await evaluate(`(()=>({nodes:[...app.workspace.activeLeaf.view.containerEl.querySelectorAll('.canvas-node')].map(e=>({text:e.innerText,cls:e.className,html:e.outerHTML,controls:[...e.querySelectorAll('[aria-label]')].map(b=>({tag:b.tagName,label:b.getAttribute('aria-label')}))}))}))()`);
 await fs.writeFile(path.join(output,'cards.json'),JSON.stringify(result,null,2));
 const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(path.join(output,'cards.png'),Buffer.from(shot.data,'base64'));
 for(const [name,hash]of before){const data=await fs.readFile(path.join(vault,name));if(name==='Board.canvas'){const expected=JSON.parse(fixture.get(name)),actual=JSON.parse(data);if(!isDeepStrictEqual(actual.nodes,expected.nodes)||!isDeepStrictEqual(actual.edges,expected.edges))throw Error('Canvas nodes changed')}else if(createHash('sha256').update(data).digest('hex')!==hash)throw Error('Reference fixture changed')}
 console.log('CANVAS_FILES_REFERENCE_OK '+output);
}finally{socket?.close();child.kill()}
