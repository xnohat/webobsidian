// Optional native integration fixture. Never attaches to a user's Obsidian process.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'webo-embed-reference-'));
const profile=path.join(root,'profile'),vault=path.join(root,'vault');
const output=path.resolve('build/obsidian-embed-reference');
await fs.mkdir(profile,{recursive:true});await fs.mkdir(path.join(vault,'.obsidian'),{recursive:true});await fs.mkdir(output,{recursive:true});
await fs.writeFile(path.join(vault,'.obsidian','app.json'),JSON.stringify({livePreview:true,readableLineLength:false}));
await fs.writeFile(path.join(vault,'.obsidian','appearance.json'),JSON.stringify({theme:'obsidian'}));
await fs.writeFile(path.join(profile,'obsidian.json'),JSON.stringify({vaults:{embedreference:{path:vault,open:true,ts:Date.now()}}}));
const asar=path.join(os.homedir(),'AppData/Roaming/obsidian/obsidian-1.14.5.asar');
await fs.copyFile(asar,path.join(profile,'obsidian-1.14.5.asar'));
const fixture=new Map([
 ['Target.md','# Target\n\nBody of the target note.\n\n## Section\n\nSelected section.\n'],
 ['Notes.md','# Notes\n\n![[Target]]\n\n![[Target.md#Section]]\n'],
 ['Board.canvas',JSON.stringify({nodes:[{id:'group',type:'group',x:-40,y:-40,width:730,height:340,label:'Group',color:'6'},{id:'a',type:'text',x:0,y:0,width:250,height:160,text:'First card',color:'1'},{id:'b',type:'text',x:400,y:100,width:250,height:160,text:'Second card',color:'4'}],edges:[{id:'edge',fromNode:'a',fromSide:'right',toNode:'b',toSide:'left',label:'Connection',color:'5'}]})],
 ['Canvas.md','# Canvas\n\n![[Board.canvas]]\n'],
 ['config.yaml','setting: true\n'],['table.csv','one,two\n1,2\n'],['archive.zip','synthetic attachment'],
 ['Files.md','# Files\n\n![[config.yaml]]\n\n![[table.csv]]\n\n![[archive.zip]]\n'],
 ['picture.svg','<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="#7856c7"/><circle cx="200" cy="200" r="130" fill="#ddd"/></svg>'],
 ['Images.md','# Images\n\n![[picture.svg|300x150]]\n'],
]);
const wav=Buffer.alloc(1644);wav.write('RIFF');wav.writeUInt32LE(1636,4);wav.write('WAVE',8);wav.write('fmt ',12);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(1600,40);
fixture.set('sound.wav',wav);fixture.set('Media.md','# Media\n\n![[sound.wav]]\n\n![[clip.webm|300x150]]\n');
const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Contents 4 0 R >>','<< /Length 0 >>\nstream\n\nendstream','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Contents 6 0 R >>','<< /Length 0 >>\nstream\n\nendstream'];
let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((o,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${o}\nendobj\n`});const xref=pdf.length;pdf+='xref\n0 7\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
fixture.set('sample.pdf',pdf);fixture.set('PDF.md','# PDF\n\n![[sample.pdf#page=2&height=400]]\n');
fixture.set('Web.md','# Web\n\n<iframe src="https://example.com" title="Reference website" width="600" height="300"></iframe>\n');
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
 const video=Buffer.from(await evaluate(`(async()=>{const canvas=document.createElement('canvas');canvas.width=300;canvas.height=150;const context=canvas.getContext('2d');context.fillStyle='#7856c7';context.fillRect(0,0,300,150);const stream=canvas.captureStream(5),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'});const done=new Promise(r=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=r});recorder.start();await new Promise(r=>setTimeout(r,400));recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());return Array.from(new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer()))})()`));
 fixture.set('clip.webm',video);before.set('clip.webm',createHash('sha256').update(video).digest('hex'));await fs.writeFile(path.join(vault,'clip.webm'),video);await sleep(300);
 await call('Emulation.setDeviceMetricsOverride',{width:1200,height:1000,deviceScaleFactor:1,mobile:false});
 const results=[];
 for(const note of ['Notes.md','Canvas.md','Files.md','Images.md','Media.md','PDF.md','Web.md'])for(const mode of ['preview','live']){
  await evaluate(`(async()=>{if(app.vault.adapter.getBasePath()!==${JSON.stringify(vault)})throw Error('Wrong vault');const leaf=app.workspace.getLeaf(false);await leaf.setViewState({type:'markdown',state:{file:${JSON.stringify(note)},mode:${JSON.stringify(mode==='live'?'source':'preview')},source:false}});})()`);
  await sleep(1800);
  const result=await evaluate(`(()=>{const root=app.workspace.activeLeaf.view.containerEl;return {note:${JSON.stringify(note)},mode:${JSON.stringify(mode)},title:document.title,text:root.innerText,html:root.innerHTML,controls:[...root.querySelectorAll('button,a,.clickable-icon,[aria-label],[title]')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height}).map(el=>({tag:el.tagName,cls:el.className,aria:el.getAttribute('aria-label'),title:el.getAttribute('title'),text:el.textContent?.slice(0,70)})),frames:[...root.querySelectorAll('iframe')].map(el=>({src:el.src,sandbox:el.getAttribute('sandbox'),width:el.width,height:el.height})),canvas:[...root.querySelectorAll('canvas,svg,.canvas-embed,.canvas-minimap')].map(el=>({tag:el.tagName,cls:typeof el.className==='string'?el.className:el.className.baseVal,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}))};})()`);
  const slug=note.replace('.md','').toLowerCase()+'-'+mode;
  await fs.writeFile(path.join(output,slug+'.json'),JSON.stringify(result,null,2));
  const capture=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(path.join(output,slug+'.png'),Buffer.from(capture.data,'base64'));
  let action;
  if(note==='Canvas.md'){
   action=await evaluate(`(async()=>{const root=app.workspace.activeLeaf.view.containerEl;const svg=[...root.querySelectorAll('svg.canvas-minimap')].find(el=>el.getBoundingClientRect().width>0);svg.dispatchEvent(new MouseEvent('click',{bubbles:true}));await new Promise(r=>setTimeout(r,150));return {type:app.workspace.activeLeaf.view.getViewType(),file:app.workspace.activeLeaf.view.file?.path};})()`);
   if(action.type!=='canvas'||action.file!=='Board.canvas')throw Error('Native Canvas click did not open the canvas');
  }
  if((note==='Images.md'||note==='PDF.md')&&mode==='live'){
   action=await evaluate(`(async()=>{const root=app.workspace.activeLeaf.view.containerEl;const button=root.querySelector('.markdown-source-view .embed-action.edit-block-button');button.click();await new Promise(r=>setTimeout(r,100));return {selection:app.workspace.activeLeaf.view.editor.getSelection(),sourceVisible:root.querySelector('.cm-content').textContent.includes('![[')};})()`);
  }
  results.push({note,mode,action,controls:result.controls.filter(c=>/embed|canvas|file|pdf/i.test(c.cls??'')),frames:result.frames,canvas:result.canvas});
  console.log('CAPTURED '+slug);
 }
 const sourceChanges=[];
 for(const [name,sha]of before){
  const bytes=await fs.readFile(path.join(vault,name)),after=createHash('sha256').update(bytes).digest('hex');
  if(after!==sha){
   if(name!=='Board.canvas')throw Error('Fixture changed: '+name);
   sourceChanges.push({file:name,before:sha,after,original:JSON.parse(fixture.get(name)),updated:JSON.parse(bytes.toString('utf8'))});
  }
 }
 await fs.writeFile(path.join(output,'summary.json'),JSON.stringify({root,vault,profile,original:info,results,sourceChanges,personalVaultAccessed:false},null,2));
 console.log('REFERENCE_OK '+output);
}finally{socket?.close();child.kill()}
