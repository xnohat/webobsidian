import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
import {execFile,spawn} from 'node:child_process';
import {once} from 'node:events';
import net from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {promisify} from 'node:util';
import {build} from 'esbuild';

// Cross-process iframe hit-testing needs a real headless browser; hidden Electron
// windows do not reliably paint or route pointer input to their child surfaces.
const chrome=[process.env.CHROME_BIN,'C:/Program Files/Google/Chrome/Application/chrome.exe',
 '/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser',
 '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p=>p&&existsSync(p));
test('authored web frames load and interact under the real server CSP while isolating the parent',{skip:chrome?false:'Set CHROME_BIN to run the cross-origin iframe pointer test'},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'webo-web-frames-')),vault=join(dir,'vault');let apiProcess:ReturnType<typeof spawn>|undefined,logs='';
 try{
  await mkdir(vault);await writeFile(join(vault,'Canary.md'),'PRIVATE_FIXTURE_CANARY');
  const socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=(socket.address() as net.AddressInfo).port;await new Promise<void>(r=>socket.close(()=>r()));
  const repo=fileURLToPath(new URL('../../',import.meta.url));
  apiProcess=spawn(process.execPath,['--import','tsx','server/src/index.ts'],{cwd:repo,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_ENV:'production',HOST:'127.0.0.1',PORT:String(port),DATA_DIR:join(dir,'data'),VAULT_PATH:vault,ALLOWED_ROOTS:vault,WEBOBSIDIAN_PASSWORD:'iframe-fixture-password',TRUST_PROXY:'false'}});
  apiProcess.stdout!.on('data',d=>{logs+=d});apiProcess.stderr!.on('data',d=>{logs+=d});
  let csp='';for(let i=0;i<120;i++){
   if(apiProcess.exitCode!==null)throw Error('Fixture server exited: '+logs);
   try{const r=await fetch('http://127.0.0.1:'+port+'/healthz');if(r.ok){csp=r.headers.get('content-security-policy')??'';break}}catch{}
   await delay(100);
  }
  assert.ok(csp,'real server started and returned CSP: '+logs);
  assert.match(csp,/script-src 'self' 'nonce-/);assert.doesNotMatch(csp,/script-src[^;]*'unsafe-/);
  assert.match(csp,/frame-ancestors 'self'/);assert.match(csp,/object-src 'none'/);
  await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx',contents:`
   import React from 'react';import {createRoot} from 'react-dom/client';
   import Editor from './src/components/Editor';import Preview from './src/components/Preview';
   import {useStore} from './src/lib/store';import {api} from './src/lib/api';import './src/styles/obsidian.css';
   api.tags=async()=>({tags:[]});api.propertyTypes=async()=>({types:{}});api.resolve=async()=>({path:'Lab/FrameNote.md'});
   let markup='',token='',ready=null,clicked=null;api.read=async()=>({content:markup,version:'fixture'});
   const root=createRoot(document.querySelector('#root')),wait=()=>new Promise(r=>setTimeout(r,40));
   const check=(ok,msg)=>{if(!ok)throw Error(msg)};
   const until=async(fn,msg)=>{for(let i=0;i<150&&!fn();i++)await wait();check(fn(),msg+': '+document.querySelector('#root')?.textContent)};
   window.addEventListener('message',event=>{
    const frame=document.querySelector('iframe.web-embed');
    if(!frame||event.source!==frame.contentWindow||event.data?.token!==token)return;
    if(event.data.kind==='ready')ready={...event.data,origin:event.origin};
    if(event.data.kind==='clicked')clicked=event.data;
   });
   localStorage.setItem('parent-canary','PRIVATE_PARENT_STORAGE');document.body.dataset.canary='unchanged';
   window.prepare=async mode=>{
    root.render(<div/>);await wait();token=mode;ready=null;clicked=null;
    const url=window.frameBase+(mode.includes('preview')?'/redirect':'/frame')+'?token='+token;
    markup='<div><p>Editable surrounding HTML</p><iframe src="'+url+'" width="600" height="300" title="Reference website" sandbox="allow-same-origin allow-top-navigation allow-popups" onload="window.parentCompromised=true" srcdoc="bad" allow="camera *; microphone *"></iframe></div>';
    const nested=mode.startsWith('nested-'),viewMode=mode.replace('nested-','');
    const source='# Host\\n\\n'+(nested?'![[FrameNote]]':markup);
    useStore.setState({activePath:'Host.md',content:source,viewMode:viewMode==='preview'?'reading':viewMode,showInlineTitle:false,locked:false,dirty:false,save:async()=>{}});
    root.render(viewMode==='preview'?<Preview/>:<Editor/>);
    await until(()=>document.querySelector('iframe.web-embed'),mode+': iframe rendered');
    await until(()=>ready,mode+': external iframe loaded under production CSP');
    // The child posts ready while parsing. Wait for the embedding frame to
    // commit its compositor hit-test region before sending physical input.
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const frame=document.querySelector('iframe.web-embed');
    check(frame.width==='600'&&frame.height==='300'&&frame.title==='Reference website',mode+': dimensions and title preserved');
    check(ready.parentBlocked&&ready.storageBlocked&&ready.cookieBlocked&&ready.origin==='null',mode+': iframe cannot access parent DOM, storage or cookies');
    check(!frame.hasAttribute('srcdoc')&&!frame.hasAttribute('onload')&&!frame.hasAttribute('allow'),mode+': untrusted frame attributes excluded');
    check(!frame.sandbox.contains('allow-same-origin')&&!frame.sandbox.contains('allow-top-navigation')&&!frame.sandbox.contains('allow-popups'),mode+': frame privileges bounded');
    check(!window.parentCompromised&&document.body.dataset.canary==='unchanged',mode+': parent untouched');
    check(useStore.getState().content===source,mode+': rendering preserves note');
    const rect=frame.getBoundingClientRect(),point={x:Math.round(rect.left+50),y:Math.round(rect.top+40)};window.frameDiagnostics=()=>({mode,point,ready,clicked,viewport:{width:innerWidth,height:innerHeight},rect:frame.getBoundingClientRect().toJSON(),atPoint:document.elementFromPoint(point.x,point.y)?.outerHTML.slice(0,600)});return point;
   };
   window.verifyClick=async()=>{await until(()=>clicked,'iframe button receives real pointer input');check(clicked.topBlocked,'iframe cannot navigate top after user activation');check(document.body.dataset.canary==='unchanged','parent stays unchanged after iframe interaction')};
   window.surroundingPoint=()=>{const rect=document.querySelector('.cm-html-block p').getBoundingClientRect();return {x:Math.round(rect.left+40),y:Math.round(rect.top+rect.height/2)}};
   window.verifySurrounding=async()=>{await until(()=>!document.querySelector('iframe.web-embed'),'ordinary HTML around iframe still opens source on click');check(useStore.getState().content==='# Host\\n\\n'+markup,'opening surrounding HTML preserves source')};
   window.finish=async()=>{
    root.render(<div/>);await wait();useStore.setState({content:'# Host\\n\\n'+markup,viewMode:'source'});root.render(<Editor/>);await wait();await wait();
    check(!document.querySelector('iframe'),'Source mode shows literal markup');check(useStore.getState().content.includes('<iframe'),'Source mode preserves markup');root.unmount();
   };
  `},bundle:true,format:'iife',platform:'browser',tsconfigRaw:{compilerOptions:{useDefineForClassFields:false,jsx:'react-jsx'}},loader:{'.woff2':'file','.woff':'file','.ttf':'file'},define:{'import.meta.env.DEV':'false'},outfile:join(dir,'fixture.js'),logLevel:'silent'});
  const probe=`<!doctype html><meta charset="utf-8"><button id="press" style="position:absolute;left:20px;top:20px;width:160px;height:40px">Frame action</button><script>
   const token=new URL(location.href).searchParams.get('token');let parentBlocked=false,storageBlocked=false,cookieBlocked=false;
   try{parent.document.body.dataset.canary='compromised'}catch{parentBlocked=true}
   try{localStorage.setItem('iframe-storage','value')}catch{storageBlocked=true}
   try{document.cookie='iframe-cookie=value'}catch{cookieBlocked=true}
   parent.postMessage({kind:'ready',token,parentBlocked,storageBlocked,cookieBlocked},'*');
   document.getElementById('press').onclick=()=>{let topBlocked=false;try{top.location.href='/escaped'}catch{topBlocked=true}parent.postMessage({kind:'clicked',token,topBlocked},'*')};
  </script>`;
  await writeFile(join(dir,'frame.html'),probe);
  await writeFile(join(dir,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><body class="theme-dark"><div id="root" style="width:780px;height:1000px"></div><script src="fixture.js"></script>');
  await writeFile(join(dir,'runner.cjs'),`
   const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
   (async()=>{
    const dir=${JSON.stringify(dir)},policy=${JSON.stringify(csp)};let parentBase='',escapes=0;
    const frameServer=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/redirect'){res.writeHead(302,{Location:parentBase+'/frame'+url.search}).end();return}res.setHeader('Content-Type','text/html');res.end(fs.readFileSync(path.join(dir,'frame.html')))});
    await new Promise(r=>frameServer.listen(0,'127.0.0.1',r));const frameBase='http://127.0.0.1:'+frameServer.address().port;
    const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/frame'){res.setHeader('Content-Type','text/html');res.end(fs.readFileSync(path.join(dir,'frame.html')));return}if(url.pathname==='/escaped')escapes++;
     const file=path.resolve(dir,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(dir+path.sep)){res.writeHead(403).end();return}
     try{res.setHeader('Content-Security-Policy',policy);res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file))}catch{res.writeHead(404).end()}
    });await new Promise(r=>server.listen(0,'127.0.0.1',r));parentBase='http://127.0.0.1:'+server.address().port;
    const profile=path.join(dir,'chrome-profile'),browser=spawn(${JSON.stringify(chrome)},['--headless=new','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','--window-size=1200,1100','about:blank'],{windowsHide:true,stdio:'ignore'});
    let socket;
    try{
     let port;for(let i=0;i<100;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\\n')[0]}catch{}if(port)break;await new Promise(r=>setTimeout(r,100))}if(!port)throw Error('Headless Chrome did not start');
     const target=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(t=>t.type==='page');
     socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true})});
     let seq=0;const pending=new Map();socket.addEventListener('message',e=>{const v=JSON.parse(e.data),p=pending.get(v.id);if(p){pending.delete(v.id);v.error?p.reject(Error(JSON.stringify(v.error))):p.resolve(v.result)}});
     const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(pending.delete(id))reject(Error('Timeout '+method))},15000).unref()});
     const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
     await call('Emulation.setDeviceMetricsOverride',{width:1200,height:1100,deviceScaleFactor:1,mobile:false});
     await call('Page.navigate',{url:parentBase});
     for(let i=0;i<100&&!await evaluate('typeof window.prepare==="function"');i++)await new Promise(r=>setTimeout(r,50));
     if(!await evaluate('innerWidth===1200&&innerHeight===1100'))throw Error('Explicit frame viewport was not applied');
     await evaluate('window.frameBase='+JSON.stringify(frameBase));
     const click=async point=>{await call('Input.dispatchMouseEvent',{type:'mouseMoved',...point});await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point})};
     for(const mode of ['live','reading','preview','nested-live','nested-reading','nested-preview']){
      const point=await evaluate('window.prepare('+JSON.stringify(mode)+')');
      await click(point);
      if(process.env.WEBO_FRAME_CAPTURE){const shot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(process.env.WEBO_FRAME_CAPTURE,Buffer.from(shot.data,'base64'))}
      try{await evaluate('window.verifyClick()')}catch(error){console.error('FRAME_INPUT_CONTEXT '+JSON.stringify(await evaluate('window.frameDiagnostics()')));console.error('FRAME_HIT_TEST '+JSON.stringify(await call('DOM.getNodeForLocation',{...point,includeUserAgentShadowDOM:true})));console.error('FRAME_TREE '+JSON.stringify(await call('Page.getFrameTree')));throw error}if(await evaluate('location.href')!==parentBase+'/')throw Error('Iframe navigated parent');
      if(mode==='live'){await click(await evaluate('window.surroundingPoint()'));await evaluate('window.verifySurrounding()')}
     }
     if(escapes)throw Error('Unexpected top navigation');await evaluate('window.finish()');console.log('WEB_FRAMES_PASS');
     await call('Browser.close').catch(()=>{});
    }finally{socket?.close();browser.kill();server.close();frameServer.close()}
   })().catch(e=>{console.error(e);process.exitCode=1});
  `);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const {stdout}=await promisify(execFile)(process.execPath,[join(dir,'runner.cjs')],{env,windowsHide:true,timeout:90000});assert.match(stdout,/WEB_FRAMES_PASS/);
 }finally{
  if(apiProcess&&apiProcess.exitCode===null){const exited=once(apiProcess,'exit');apiProcess.kill();await Promise.race([exited,delay(5000)]);}
  assert.ok(dir.startsWith(join(tmpdir(),'webo-web-frames-')));await rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});
 }
});
