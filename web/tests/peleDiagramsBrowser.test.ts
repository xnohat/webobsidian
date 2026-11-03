import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {build} from 'esbuild';

test('Pele diagrams share native themes, responsive layout, source controls and safe links across rendering surfaces',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'webo-pele-diagrams-'));
 try{
  await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx',contents:`
   import React from 'react';import {createRoot} from 'react-dom/client';import Editor from './src/components/Editor';import Preview from './src/components/Preview';
   import {useStore} from './src/lib/store';import {api} from './src/lib/api';import {getActiveEditor} from './src/lib/activeEditor';import './src/styles/obsidian.css';
   api.tags=async()=>({tags:[]});api.propertyTypes=async()=>({types:{}});
   const root=createRoot(document.querySelector('#root')),host=document.querySelector('#root'),wait=()=>new Promise(r=>setTimeout(r,60));
   const check=(ok,msg)=>{if(!ok)throw Error(msg)},until=async(fn,msg)=>{for(let i=0;i<100;i++){if(fn())return;await wait()}throw Error(msg+' '+document.body.innerText.slice(-500))};
   let mounts=0,current='',nested='',opened=[],external=[];window.open=(...args)=>{external.push(args);return null};
   const observed=new Map(),NativeObserver=window.ResizeObserver;
   window.ResizeObserver=class extends NativeObserver{observe(el,options){if(el.classList.contains('diagram-content')){if(!observed.has(this))observed.set(this,new Set());observed.get(this).add(el)}return super.observe(el,options)}unobserve(el){observed.get(this)?.delete(el);return super.unobserve(el)}disconnect(){observed.delete(this);return super.disconnect()}};
   useStore.setState({openWikilink:async(...args)=>{opened.push(args)}});
   api.resolve=async()=>({path:'Nested.md'});api.read=async()=>({content:nested});
   const fence=String.fromCharCode(96).repeat(3),nl=String.fromCharCode(10),md=code=>fence+'mermaid'+nl+code+nl+fence;
   const flow='flowchart LR'+nl+' A[User] --> B(Web interface)'+nl+' B --> C{Parser}'+nl+' C --> D[(Vault)]';
   const show=async(code,mode='live')=>{const previous=document.querySelector('svg.pele');host.style.width='760px';nested=md(code);current='# Host'+nl+nl+(mode==='nested'?'![[Nested]]':nested);useStore.setState({activePath:'Host.md',content:current,viewMode:mode==='preview'?'reading':mode==='nested'?'live':mode,dirty:false,locked:false,showInlineTitle:false,save:async()=>{}});root.render(mode==='preview'?<Preview key={++mounts}/>:<Editor key={++mounts}/>);await until(()=>{const svg=document.querySelector('svg.pele');return svg&&svg!==previous},mode+': Pele SVG renders');await document.fonts.ready;await wait()};
   const color=(value,prop='color')=>{const e=document.createElement('span');e.style[prop]=value;document.body.append(e);const c=getComputedStyle(e)[prop];e.remove();return c};
   const input=(el,kind)=>new Promise(resolve=>{el.scrollIntoView({block:'center'});if(kind==='key')el.focus();const r=el.getBoundingClientRect();window.pendingInput={kind,x:r.x+r.width/2,y:r.y+r.height/2};window.finishInput=()=>{window.pendingInput=null;resolve()}});
   window.run=async()=>{
    for(const mode of ['live','reading','preview','nested']){
     await show(flow,mode);const diagram=document.querySelector('.mermaid'),svg=diagram.querySelector('svg.pele');
     check(svg.querySelectorAll('.pele-node').length===4,mode+': all flowchart nodes render');
     for(const theme of ['theme-dark','theme-light']){
      document.body.className=theme;await wait();const shape=diagram.querySelector('.pele-node rect'),label=diagram.querySelector('.pele-node .pele-label'),edge=diagram.querySelector('.pele-edge');
      check(getComputedStyle(shape).fill===color('var(--background-secondary)'),mode+'/'+theme+': native node surface');
      check(getComputedStyle(shape).stroke===color('var(--background-modifier-border-hover)'),mode+'/'+theme+': native node border');
      check(getComputedStyle(label).fill===color('var(--text-normal)'),mode+'/'+theme+': native label color');
      check(getComputedStyle(edge).stroke===color('var(--text-normal)'),mode+'/'+theme+': native edge color');
      check(getComputedStyle(svg).filter==='none',mode+'/'+theme+': no legacy color inversion');
     }
     document.body.style.setProperty('--mermaid-surface','#345678');check(getComputedStyle(diagram.querySelector('.pele-node rect')).fill==='rgb(52, 86, 120)',mode+': theme diagram overrides inherit into the renderer');document.body.style.removeProperty('--mermaid-surface');
     document.body.className='theme-dark';host.style.width='330px';await wait();await wait();
     const r=diagram.getBoundingClientRect(),s=diagram.querySelector('svg.pele').getBoundingClientRect();check(s.width<=r.width+1&&document.documentElement.scrollWidth<=innerWidth,mode+': narrow diagram does not expand workspace');
     host.style.width='760px';await until(()=>diagram.querySelector('svg.pele').getBoundingClientRect().width>s.width,mode+': diagram follows widening '+JSON.stringify({narrow:s.toJSON(),wide:diagram.querySelector('svg.pele').getBoundingClientRect().toJSON(),host:host.getBoundingClientRect().toJSON(),diagram:diagram.getBoundingClientRect().toJSON()}));
     const action=diagram.querySelector('.cm-block-edit');check(!!action===(mode==='live'),mode+': editable-only source action');
     if(action){await input(diagram,'hover');await wait();check(getComputedStyle(action.parentElement).opacity==='1','source action visible on hover');await input(action,'click');await wait();const v=getActiveEditor(),range=v.state.selection.main;check(v.state.doc.sliceString(range.from,range.to)===md(flow),'source action selects complete unchanged fence')}
     check(useStore.getState().content===current,mode+': rendering and resizing preserve source');
    }
    await show('sequenceDiagram'+nl+' actor User'+nl+' participant Server'+nl+' User->>Server: Open note'+nl+' Server-->>User: Content','reading');check(document.querySelector('svg.pele-sequence'),'sequence diagram renders');
    await show('pie'+nl+' "First" : 2'+nl+' "Second" : 3','preview');check(document.querySelector('svg.pele-pie'),'pie chart renders');
    await show('flowchart LR'+nl+' A[Other note]:::internal-link --> B[External]'+nl+' click B "https://example.org"','live');
    const internal=document.querySelector('.mermaid a.internal-link'),externalLink=document.querySelector('.mermaid a[href^="https:"]');check(internal&&externalLink,'internal and external links render');
    await input(internal,'click');check(opened.at(-1)?.[0]==='Other note'&&opened.at(-1)?.[2]==='Host.md','internal links navigate relative to source');
    await input(externalLink,'click');check(external.at(-1)?.[0]==='https://example.org/'&&external.at(-1)?.[2]?.includes('noopener'),'external link opens safely');
    await show('flowchart LR'+nl+' A[Other note]:::internal-link','preview');useStore.setState({activePath:'Another/Copy.md'});await wait();await wait();await input(document.querySelector('.mermaid a.internal-link'),'click');check(opened.at(-1)?.[2]==='Another/Copy.md','identical diagram in another note uses current origin');
    root.render(<Preview source={current} sourcePath="Folder/Displayed.md"/>);await until(()=>document.querySelector('.mermaid a.internal-link'),'explicit source preview link renders');await input(document.querySelector('.mermaid a.internal-link'),'click');check(opened.at(-1)?.[2]==='Folder/Displayed.md','split and Canvas file previews use displayed note origin');
    await show('flowchart LR'+nl+' A["$$'+String.fromCharCode(92)+'frac{a}{b}$$"] --> B[End]','preview');check(document.querySelector('.pele-math math mfrac'),'formula labels are typeset');
    await show('flowchart LR'+nl+' A[Safe] --> B[End]'+nl+' click A "javascript:window.pwned=1"'+nl+' click B call danger()','reading');check(!document.querySelector('.mermaid a')&&!window.pwned,'unsafe links and JavaScript callbacks stay inert');
    const links='flowchart LR'+nl+' A[Other note]:::internal-link';nested=md(links);
    current='# Host'+nl+nl+'![[Nested]]';useStore.setState({content:current,viewMode:'reading'});root.render(<Preview key={++mounts}/>);await until(()=>document.querySelector('.embed-note .mermaid a.internal-link'),'nested preview link renders');await input(document.querySelector('.embed-note .mermaid a.internal-link'),'click');check(opened.at(-1)?.[2]==='Nested.md','embedded diagram link uses embedded note origin');
    current='# Multiple'+nl+nl+md(flow)+nl+nl+md(flow);useStore.setState({content:current});root.render(<Preview key={++mounts}/>);await until(()=>document.querySelectorAll('.mermaid svg.pele').length===2,'multiple diagrams render');const ids=[...document.querySelectorAll('.mermaid [id]')].map(e=>e.id);check(new Set(ids).size===ids.length,'SVG identifiers are unique across diagrams');
    current='# Bad'+nl+nl+md('flowchart LR'+nl+' A[broken');useStore.setState({content:current});root.render(<Preview key={++mounts}/>);await until(()=>document.querySelector('.mermaid .pele-error'),'malformed diagram displays an error');check(!document.querySelector('.mermaid script'),'error stays text');
    await show('sequenceDiagram'+nl+' participant A as A_Very_Long_Participant_Name'+nl+' participant B as Another_Very_Long_Participant_Name'+nl+' A->>B: Message','live');host.style.width='260px';await until(()=>document.querySelector('.mermaid [aria-label="Zoom in"]'),'scaled diagram has zoom controls');const zoom=document.querySelector('.mermaid [aria-label="Zoom in"]'),zoomSvg=document.querySelector('.mermaid svg.pele'),fitBox=zoomSvg.getAttribute('viewBox');await input(zoom,'click');await wait();check(zoomSvg.getAttribute('viewBox')!==fitBox,'zoom button enlarges the diagram');await input(zoomSvg,'key');await wait();check(zoomSvg.getAttribute('viewBox')===fitBox,'keyboard zero resets diagram zoom');check(useStore.getState().content===current,'zoom does not edit note');
    host.className='canvas-view';await show('sequenceDiagram'+nl+Array.from({length:7},(_,i)=>' participant P'+i+' as LongParticipant'+i).join(nl)+nl+' P0->>P6: Message','preview');host.style.width='260px';await wait();await wait();await wait();check(!document.querySelector('.mermaid [aria-label="Zoom in"]'),'Canvas keeps its own zoom without competing diagram controls');host.className='';
    root.render(<div/>);await wait();check(!document.querySelector('.mermaid'),'unmount removes diagrams and controls');check([...observed.values()].every(targets=>targets.size===0),'unmount disconnects diagram resize observers');window.ResizeObserver=NativeObserver;
    root.unmount();return 'PELE_DIAGRAMS_PASS';
   };
  `},bundle:true,format:'iife',platform:'browser',tsconfigRaw:{compilerOptions:{useDefineForClassFields:false,jsx:'react-jsx'}},loader:{'.woff2':'file','.woff':'file','.ttf':'file'},define:{'import.meta.env.DEV':'false'},outfile:join(dir,'fixture.js'),logLevel:'silent'});
  await writeFile(join(dir,'index.html'),'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><body class="theme-dark"><div id="root" style="width:760px;height:1100px;display:flex;flex-direction:column"></div><script src="fixture.js"></script>');
  await writeFile(join(dir,'runner.cjs'),`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(dir,'profile'))});app.whenReady().then(async()=>{const win=new BrowserWindow({show:false,width:1000,height:1300,webPreferences:{backgroundThrottling:false}});await win.loadFile(${JSON.stringify(join(dir,'index.html'))});win.webContents.debugger.attach('1.3');const call=(method,params)=>win.webContents.debugger.sendCommand(method,params);await call('Emulation.setDeviceMetricsOverride',{width:1000,height:1300,deviceScaleFactor:1,mobile:false});await call('Emulation.setFocusEmulationEnabled',{enabled:true});let finished=false;const run=win.webContents.executeJavaScript('window.run()').finally(()=>{finished=true});run.catch(()=>{});while(!finished){const input=await win.webContents.executeJavaScript('window.pendingInput??null');if(input){if(input.kind==='key'){await call('Input.dispatchKeyEvent',{type:'keyDown',key:'0',code:'Digit0',windowsVirtualKeyCode:48,text:'0'});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'0',code:'Digit0',windowsVirtualKeyCode:48})}else{await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:input.x,y:input.y});if(input.kind!=='hover'){await call('Input.dispatchMouseEvent',{type:'mousePressed',x:input.x,y:input.y,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:input.x,y:input.y,button:'left',clickCount:1})}}await win.webContents.executeJavaScript('window.finishInput()')}await new Promise(r=>setTimeout(r,20))}console.log(await run);win.destroy();app.quit()}).catch(e=>{console.error(e);app.exit(1)});`);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const {stdout}=await promisify(execFile)(createRequire(import.meta.url)('electron'),[...(process.platform==='linux'?['--ozone-platform=headless']:[]),join(dir,'runner.cjs')],{env,windowsHide:true,timeout:90_000});assert.match(stdout,/PELE_DIAGRAMS_PASS/);
 }finally{assert.ok(dir.startsWith(join(tmpdir(),'webo-pele-diagrams-')));await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
});
