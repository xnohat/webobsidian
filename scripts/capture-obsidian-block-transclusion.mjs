// Optional native integration fixture. Never attaches to a user's Obsidian process.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'webo-block-transclusion-'));
const profile=path.join(root,'profile'),vault=path.join(root,'vault');
const output=path.resolve('build/obsidian-block-transclusion');
await fs.mkdir(profile,{recursive:true});await fs.mkdir(path.join(vault,'.obsidian'),{recursive:true});await fs.mkdir(output,{recursive:true});
await fs.writeFile(path.join(vault,'.obsidian','app.json'),JSON.stringify({livePreview:true,readableLineLength:false}));
await fs.writeFile(path.join(vault,'.obsidian','appearance.json'),JSON.stringify({theme:'obsidian'}));
await fs.writeFile(path.join(profile,'obsidian.json'),JSON.stringify({vaults:{embedreference:{path:vault,open:true,ts:Date.now()}}}));
const asar=path.join(os.homedir(),'AppData/Roaming/obsidian/obsidian-1.14.5.asar');
await fs.copyFile(asar,path.join(profile,'obsidian-1.14.5.asar'));

const filler=Array.from({length:40},(_,i)=>`Paragraph ${i+1}`).join('\n\n');
const fixture=new Map([['Host.md',['paragraph','list','table','code','item','callout','inlinecallout','quote'].map(id=>'![[Target#^'+id+']]').join('\n\n')],['Target.md','# Target\n\n'+filler+'\n\nBLOCK_PARAGRAPH **bold** ^paragraph\n\n- List one\n- List two\n\n^list\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n^table\n\n```text\nCODE_BLOCK\n```\n\n^code\n\n- [x] INLINE_ITEM ^item\n\n> [!note] Title\n> Callout body\n\n^callout\n\n> [!note] Inline\n> Body ^inlinecallout\n\n> Quote body ^quote\n\nAfter']]);
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
 await evaluate(`app.workspace.getLeaf(false).setViewState({type:'markdown',state:{file:'Host.md',mode:'preview'}})`);await sleep(1500);
 const result=await evaluate(`(()=>({embeds:[...app.workspace.activeLeaf.view.containerEl.querySelectorAll('.internal-embed.markdown-embed')].filter(e=>e.offsetParent!==null).map(e=>({src:e.getAttribute('src'),text:e.innerText,html:e.innerHTML,lists:e.querySelectorAll('ul,ol').length,tasks:e.querySelectorAll('input[type=checkbox]').length,callouts:e.querySelectorAll('.callout').length,quotes:e.querySelectorAll('blockquote').length}))}))()`);
 await fs.writeFile(path.join(output,'transclusions.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({embeds:result.embeds.map(e=>({...e,html:undefined}))}));
 const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(path.join(output,'transclusions.png'),Buffer.from(shot.data,'base64'));
 for(const [name,hash]of before)if(createHash('sha256').update(await fs.readFile(path.join(vault,name))).digest('hex')!==hash)throw Error('Fixture changed');
 console.log('BLOCK_TRANSCLUSION_NATIVE_OK '+output);
}finally{socket?.close();child.kill()}
