import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
// Optional local capture, never part of CI: requires the isolated profile from
// docs/rendering-compatibility.md. It never attaches to the user's main process.
const note = process.argv[2] ?? 'Structures.md';
if (!['Structures.md','Reference.md','Contract.md'].includes(note)) throw Error('Only synthetic reference notes may be captured');
const slug = note.replace('.md','').toLowerCase();
const root = path.join(os.tmpdir(), 'webobsidian-reference-20261029');
const profile = path.join(root, 'background-profile');
await fs.mkdir(profile, { recursive: true });
await fs.writeFile(path.join(profile, 'obsidian.json'), JSON.stringify({vaults:{backgroundfixture:{path:path.join(root,'vault'),open:true,ts:Date.now()}}}));
await fs.copyFile(path.join(root,'visible-profile','obsidian-1.14.5.asar'),path.join(profile,'obsidian-1.14.5.asar'));
const server = net.createServer();
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port;
await new Promise(r=>server.close(r));
const child=spawn('C:/Program Files/Obsidian/Obsidian.exe',[`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1','--disable-background-timer-throttling'],{windowsHide:true,stdio:'ignore'});
const sourcePath = path.join(root,'vault',note);
const before = createHash('sha256').update(await fs.readFile(sourcePath)).digest('hex');
let socket;
try {
  let target;
  for(let i=0;i<60;i++) {
    try { target=(await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.type==='page'&&t.url==='app://obsidian.md/index.html'); } catch {}
    if(target) break;
    await new Promise(r=>setTimeout(r,250));
  }
  if(!target) throw Error('No isolated Obsidian renderer');
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
  let seq=0;
  const pending=new Map();
  socket.addEventListener('message',e=>{const result=JSON.parse(e.data); const p=pending.get(result.id); if(p){pending.delete(result.id);result.error?p.reject(result.error):p.resolve(result.result);}});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(pending.delete(id))reject(Error(`timeout ${method}`));},15000).unref();});
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  let info;
  for(let i=0;i<60;i++){info=await evaluate('typeof app !== "undefined" && app.vault && app.workspace?.layoutReady ? ({path:app.vault.adapter.getBasePath(),requireType:typeof require}) : null');if(info)break;await new Promise(r=>setTimeout(r,250));}
  if(path.resolve(info?.path??'')!==path.resolve(root,'vault'))throw Error('Wrong vault; refusing inspection');
  console.log(JSON.stringify(info));
  console.log(JSON.stringify(await evaluate(`(async()=>{const leaf=app.workspace.getLeaf(false);await leaf.setViewState({type:"markdown",state:{file:${JSON.stringify(note)},mode:"preview"}});return {title:document.title,view:leaf.view.getViewType()};})()`)));
  await new Promise(r=>setTimeout(r,2000));
  const result=await evaluate('(()=>{const el=app.workspace.activeLeaf.view.containerEl;return {title:document.title,text:el.innerText,html:el.innerHTML,tables:[...el.querySelectorAll("table")].map(t=>t.innerText),width:window.innerWidth,height:window.innerHeight};})()');
  const {html, ...summary} = result;
  await fs.writeFile(`tests/fixtures/rendering/obsidian-${slug}.json`,JSON.stringify({...summary,sourceSha256:before},null,2));
  console.log(JSON.stringify({...result,html:undefined}));
  const styles = await evaluate('(()=>{const root=app.workspace.activeLeaf.view.containerEl;const out={};for(const selector of [".markdown-preview-view p",".markdown-preview-view h1",".markdown-preview-view h2",".markdown-preview-view th",".markdown-preview-view td",".markdown-preview-view blockquote"]){const el=root.querySelector(selector);if(!el)continue;const s=getComputedStyle(el);out[selector]=Object.fromEntries(["fontFamily","fontSize","fontWeight","lineHeight","color","backgroundColor","padding","margin","borderLeftWidth"].map(k=>[k,s[k]]));}return out;})()');
  await fs.writeFile(`tests/fixtures/rendering/obsidian-${slug}-styles.json`,JSON.stringify(styles,null,2));
  await evaluate(`app.workspace.activeLeaf.setViewState({type:"markdown",state:{file:${JSON.stringify(note)},mode:"source",source:false}})`);
  await new Promise(r=>setTimeout(r,500));
  const liveStyles=await evaluate('(()=>{const root=app.workspace.activeLeaf.view.containerEl;const result={state:app.workspace.activeLeaf.view.getState()};for(const selector of [".cm-content",".HyperMD-header-1",".HyperMD-header-2"]){const el=root.querySelector(selector);if(el){const s=getComputedStyle(el);result[selector]={fontSize:s.fontSize,lineHeight:s.lineHeight,fontWeight:s.fontWeight};}}return result;})()');
  liveStyles.code = await evaluate('(()=>{const root=app.workspace.activeLeaf.view.containerEl;return [...root.querySelectorAll(".cm-inline-code, code")].slice(0,15).map(el=>{const s=getComputedStyle(el);return {text:el.textContent,className:el.className,color:s.color,fontFamily:s.fontFamily,fontSize:s.fontSize,background:s.backgroundColor};});})()');
  liveStyles.text = await evaluate('app.workspace.activeLeaf.view.containerEl.innerText');
  if(note === 'Contract.md') liveStyles.contentHtml = await evaluate('app.workspace.activeLeaf.view.containerEl.querySelector(".cm-content")?.innerHTML');
  await fs.writeFile(`tests/fixtures/rendering/obsidian-${slug}-live-styles.json`,JSON.stringify(liveStyles,null,2));
  await evaluate(`app.workspace.activeLeaf.setViewState({type:"markdown",state:{file:${JSON.stringify(note)},mode:"preview"}})`);
  await new Promise(r=>setTimeout(r,500));
  try { const capture=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false}); await fs.writeFile(`tests/fixtures/rendering/obsidian-${slug}.png`,Buffer.from(capture.data,'base64'));console.log('Saved background screenshot'); }catch(error){console.log(`Screenshot unavailable: ${error.message}`);}
  const after = createHash('sha256').update(await fs.readFile(sourcePath)).digest('hex');
  if (before !== after) throw Error('Reference source changed during capture');
} finally { if(socket)socket.close(); child.kill(); }
