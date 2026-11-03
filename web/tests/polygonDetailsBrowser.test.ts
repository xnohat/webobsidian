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

test('polygon metadata, partial list indents, inline links, task glyphs and callout actions match native behavior',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'webo-polygon-details-'));
 try{
  await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx',contents:`
   import React from 'react';import {createRoot} from 'react-dom/client';import Editor from './src/components/Editor';
   import {useStore} from './src/lib/store';import {api} from './src/lib/api';import {getActiveEditor} from './src/lib/activeEditor';
   import {EditorView} from '@codemirror/view';import {defaultVaultPreferences} from './src/lib/vaultPreferences';import './src/styles/obsidian.css';
   api.tags=async()=>({tags:['test','extra']});api.propertyTypes=async()=>({types:{tags:'tags',aliases:'aliases',cssclasses:'multitext',created:'date',rating:'number'}});
   window.fetch=async()=>new Response(JSON.stringify({values:{...defaultVaultPreferences,baseFontSize:19},sources:{},warnings:[],vaultPath:'/fixture'}));
   const root=createRoot(document.querySelector('#root')),wait=()=>new Promise(r=>setTimeout(r,70)),issues=[];
   const trustedPress=(el,kind)=>new Promise(resolve=>{if(kind!=='hover')el.focus();const r=el.getBoundingClientRect();window.pendingInput={kind,x:r.x+r.width/2,y:r.y+r.height/2};window.finishInput=()=>{window.pendingInput=null;resolve()}});
   const hoverDetails=el=>JSON.stringify({rect:el.getBoundingClientRect().toJSON(),hover:el.matches(':hover'),viewport:{width:innerWidth,height:innerHeight}});const check=(ok,msg)=>{if(!ok)issues.push(msg)},until=async(fn,msg)=>{for(let i=0;i<70;i++){if(fn())return;await wait()}throw Error(msg+' '+JSON.stringify([...document.querySelectorAll('.cm-callout-first')].map(e=>e.outerHTML)))};
   let mount=0;const show=async(source,mode='live')=>{useStore.setState({activePath:'Polygon.md',content:source,viewMode:mode,dirty:false,locked:false,showInlineTitle:false,save:async()=>{}});root.render(<Editor key={++mount}/>);await wait();await wait();};
   const rect=(el,text)=>{const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode()){const at=n.textContent.indexOf(text);if(at>=0){const r=document.createRange();r.setStart(n,at);r.setEnd(n,at+text.length);return r.getBoundingClientRect()}}throw Error('No text '+text)};
   const metadata='---\\ntitle: Polygon\\ntags:\\n  - test\\n  - playground\\naliases:\\n  - Alternate\\ncreated: 2026-11-02\\nstatus: in-progress\\nrating: 5\\ncssclasses:\\n  - wide-page\\n  - custom-callouts\\n---\\n\\n# Body';
   window.run=async()=>{
    const markerSource='# Host\\n\\n### Foldable callouts\\n\\n> [!faq]- Closed (\`[-]\`)\\n> Body\\n\\n> [!example]+ Expanded (\`[+]\`)\\n> Body';
    for(const mode of ['live','reading']){
     await show(markerSource,mode);await until(()=>document.querySelectorAll('.cm-callout-first').length===2,'marker color fixture mounted');
     for(const theme of ['theme-dark','theme-light']){
      document.body.className=theme;const probe=document.createElement('span');probe.style.color='var(--text-normal)';document.body.append(probe);const normal=getComputedStyle(probe).color;probe.style.color='var(--text-faint)';const faint=getComputedStyle(probe).color;probe.remove();
      const codes=[...document.querySelectorAll('.cm-callout-first .cm-inline-code')];check(codes.length>=2,mode+': callout title code mounted');
      for(const code of codes)check(getComputedStyle(code).color===normal,mode+': '+theme+' inline code keeps normal color in colored callout title '+code.outerHTML+' '+getComputedStyle(code).color);
      if(mode==='live'){const v=getActiveEditor(),at=markerSource.indexOf('### ');v.dispatch({selection:{anchor:at+3}});await wait();const marker=v.dom.querySelector('.cm-formatting-header');check(!!marker,'active heading markers visible');for(const e of [marker,...marker.querySelectorAll('*')])check(getComputedStyle(e).color===faint,theme+': heading hashes keep native faint color '+e.outerHTML+' '+getComputedStyle(e).color);v.dispatch({selection:{anchor:0}});await wait();}
     }
     document.body.className='theme-dark';check(useStore.getState().content===markerSource,mode+': marker color display preserves source');
    }
    for(const mode of ['live','reading']){
     await show(metadata,mode);await until(()=>document.querySelectorAll('.prop-row').length===7,'metadata mounted');
     const rows=[...document.querySelectorAll('.prop-row')],row=key=>rows.find(r=>r.querySelector('.prop-key').textContent===key);
     check(rows.every(r=>!!r.querySelector('.prop-icon svg')),mode+': property type icons are strokes');
     check(row('tags').querySelector('.prop-icon svg')?.dataset.icon!==row('aliases').querySelector('.prop-icon svg')?.dataset.icon,mode+': tags and aliases have distinct icons');
     const field=row('title').querySelector('.prop-val-input');check(getComputedStyle(field).fontSize==='16.625px',mode+': metadata values follow native .875 text scale');
     const tag=row('tags').querySelector('.prop-pill'),alias=row('aliases').querySelector('.prop-pill'),cls=row('cssclasses').querySelector('.prop-pill');
     check(getComputedStyle(tag).backgroundColor!=='rgba(0, 0, 0, 0)'&&getComputedStyle(alias).backgroundColor==='rgba(0, 0, 0, 0)'&&getComputedStyle(cls).backgroundColor==='rgba(0, 0, 0, 0)',mode+': only tags use colored pills');
     if(mode==='live')check(getComputedStyle(tag.querySelector('.prop-pill-x')).opacity==='1',mode+': remove controls are visible');
     const number=row('rating').querySelector('input'),date=row('created').querySelector('input');
     check(getComputedStyle(number).backgroundColor==='rgba(0, 0, 0, 0)'&&getComputedStyle(number).borderTopWidth==='0px',mode+': idle number field is unboxed');
     check(date.value==='2026-11-02'&&!!row('created').querySelector('.prop-date-calendar svg'),mode+': date keeps canonical value with native calendar control');
     check(useStore.getState().content===metadata,mode+': displaying metadata preserves source');
     if(mode==='live'){number.value='7';number.dispatchEvent(new Event('change',{bubbles:true}));await wait();check(/rating: 7/.test(useStore.getState().content)&&/created: 2026-11-02/.test(useStore.getState().content),'number edit retains date');}
    }
    const lists='# Lists\\n\\n- Root\\n- Second\\n  - Child\\n    - Deep\\n- Back\\n\\n- Prefix: [[Target|Alias]] suffix\\n- Markdown: [Site](https://example.com) suffix\\n- [x] Done';
    for(const mode of ['live','reading']){
     await show(lists,mode);await until(()=>!!document.querySelector('.cm-wikilink'),'list widgets mounted');
     const lines=[...document.querySelectorAll('.cm-line')],line=word=>lines.find(e=>e.textContent.includes(word));
     const rootX=rect(line('Root'),'Root').x,childX=rect(line('Child'),'Child').x,deepX=rect(line('Deep'),'Deep').x;
     check(childX-rootX>7&&childX-rootX<15,mode+': two spaces remain a partial indent '+(childX-rootX));
     check(deepX-childX>25,mode+': four spaces create a deeper indent '+(deepX-childX));
     for(const [prefix,label] of [['Prefix:','Alias'],['Markdown:','Site']])check(rect(line(prefix),label).left>=rect(line(prefix),prefix).right+2,mode+': inline link does not overlap preceding text '+prefix);
     const box=document.querySelector('.cm-task-checkbox');
     for(const theme of ['theme-dark','theme-light']){document.body.className=theme;const probe=document.createElement('span');probe.style.color='var(--background-primary)';box.parentElement.append(probe);check(getComputedStyle(box,'::after').borderRightColor===getComputedStyle(probe).color,mode+': checkmark follows '+theme);probe.remove()}
     document.body.className='theme-dark';check(useStore.getState().content===lists,mode+': list display preserves source');
    }
    const calls='# Callouts\\n\\n> [!note] Note\\n> Body\\n\\n> [!faq]- Closed\\n> Hidden body\\n\\n> [!example]+ Open\\n> Visible body';
    for(const mode of ['live','reading']){
     await show(calls,mode);await until(()=>document.querySelectorAll('.cm-callout-first').length===3,'callouts mounted');await until(()=>document.querySelectorAll('.cm-callout-fold').length===2,'fold controls mounted');
     for(const first of [...document.querySelectorAll('.cm-callout-first')]){const fold=first.querySelector('.cm-callout-fold'),title=first.querySelector('.cm-callout-title');if(fold)check(fold.getBoundingClientRect().left>=title.getBoundingClientRect().right,mode+': fold arrow follows title');}
     const beforeFold=document.querySelector('.cm-content').textContent.includes('Hidden body');const folded=document.querySelectorAll('.cm-callout-fold')[0];folded.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));await wait();check(document.querySelector('.cm-content').textContent.includes('Hidden body')!==beforeFold,mode+': callout toggles body visibility');
     const source=document.querySelector('.cm-callout-edit');check(mode==='live'?!!source:!source,mode+': callout source action follows editability');
     if(mode==='live'&&source){const body=[...document.querySelectorAll('.cm-callout-line')].find(e=>e.textContent==='Body');await trustedPress(body,'hover');await wait();check(getComputedStyle(source.parentElement).opacity==='1','source action appears when hovering callout body '+hoverDetails(body));await trustedPress(document.querySelector('.cm-content .HyperMD-header-1'),'hover');await wait();check(getComputedStyle(source.parentElement).opacity==='0','source action hides after leaving callout');source.click();await wait();const v=getActiveEditor(),r=v.state.selection.main;check(v.state.doc.sliceString(r.from,r.to)==='> [!note] Note\\n> Body','source action selects entire original callout');check(v.contentDOM.textContent.includes('> Body'),'source action reveals quote markers');}
     check(useStore.getState().content===calls,mode+': callout actions preserve source');
    }
    const fence=String.fromCharCode(96).repeat(3),nl=String.fromCharCode(10),bs=String.fromCharCode(92),filler=('Filler paragraph to extend parsing beyond initial viewport.'+nl+nl).repeat(180);
    const code=[fence+'javascript','console.log(1);',fence].join(nl),math=['$$',bs+'begin{aligned}','a &= b '+bs+bs,'c &= d',bs+'end{aligned}','$$'].join(nl);
    const long=['# Long page',filler,code,math,[fence+'mermaid','graph TD','A[User] --> B[Browser]',fence].join(nl),'[^named]: Footnote'].join(nl+nl);
    for(const mode of ['live','reading']){
     await show(long,mode);let v=getActiveEditor();
     const scroll=async at=>{v.dispatch({selection:{anchor:Math.max(0,at-1)},effects:EditorView.scrollIntoView(at,{y:'start',yMargin:10})});for(let i=0;i<12;i++)await wait()};
     await scroll(long.indexOf(code));check(!!v.dom.querySelector('.HyperMD-codeblock-bg[data-lang]'),mode+': late code fence retains block styling and language flair');const codeLines=[...v.dom.querySelectorAll('.HyperMD-codeblock-bg')];check(codeLines.reduce((n,e)=>n+e.getBoundingClientRect().height,0)<80,mode+': hidden fences add no empty code rows');check(v.dom.querySelector('[data-lang]')?.dataset.lang==='JavaScript',mode+': native language label casing');
     await scroll(long.indexOf(math));check(!!v.dom.querySelector('.cm-math-rendered.math-block .katex'),mode+': multiline math renders beyond initial viewport');
     if(mode==='live'){
      const button=v.dom.querySelector('.math-block .cm-block-edit');check(!!button,mode+': display math has source action');
      if(button){await trustedPress(v.dom.querySelector('.math-block'),'hover');await wait();check(getComputedStyle(button.parentElement).opacity==='1','math source action appears on hover '+hoverDetails(v.dom.querySelector('.math-block')));await trustedPress(button,'keyboard');await wait();const r=v.state.selection.main;check(v.state.doc.sliceString(r.from,r.to)===math,'math Enter selects complete TeX source');await scroll(long.indexOf(math));}
     }
     await scroll(long.indexOf(fence+'mermaid'));check(!!v.dom.querySelector('.cm-mermaid svg'),mode+': Mermaid renders');
     if(mode==='live'){
      const button=v.dom.querySelector('.cm-mermaid .cm-block-edit');check(!!button,mode+': Mermaid has source action');
      if(button){await trustedPress(v.dom.querySelector('.cm-mermaid'),'hover');await wait();check(getComputedStyle(button.parentElement).opacity==='1','Mermaid source action appears on hover '+hoverDetails(v.dom.querySelector('.cm-mermaid')));await trustedPress(button,'pointer');await wait();const r=v.state.selection.main;check(v.state.doc.sliceString(r.from,r.to).startsWith(fence+'mermaid')&&v.state.doc.sliceString(r.from,r.to).endsWith(fence),'Mermaid pointer selects complete fenced source');await scroll(long.indexOf(fence+'mermaid'));}
     }
     const shape=v.dom.querySelector('.cm-mermaid .pele-node rect');check(!!shape&&getComputedStyle(shape).fill==='rgb(38, 38, 38)'&&getComputedStyle(v.dom.querySelector('.cm-mermaid svg.pele')).filter==='none',mode+': native Pele dark palette');
     if(mode==='live'){await scroll(long.indexOf('[^named]'));const ref=v.dom.querySelector('.cm-footref');check(ref&&getComputedStyle(ref).color==='rgb(179, 179, 179)','Live footnote markers use muted text');}
     check(useStore.getState().content===long,mode+': long-page rendering preserves source');
    }
    root.unmount();if(issues.length)throw Error(JSON.stringify(issues));return 'POLYGON_DETAILS_PASS';
   };
  `},bundle:true,format:'iife',platform:'browser',tsconfigRaw:{compilerOptions:{useDefineForClassFields:false,jsx:'react-jsx'}},loader:{'.woff2':'file','.woff':'file','.ttf':'file'},define:{'import.meta.env.DEV':'false'},outfile:join(dir,'fixture.js'),logLevel:'silent'});
  await writeFile(join(dir,'index.html'),'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><body class="theme-dark"><div id="root" style="width:800px;height:900px;display:flex;flex-direction:column"></div><script src="fixture.js"></script>');
  await writeFile(join(dir,'runner.cjs'),`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(dir,'profile'))});app.whenReady().then(async()=>{const win=new BrowserWindow({show:false,width:900,height:1100,webPreferences:{backgroundThrottling:false}});win.webContents.on('console-message',(_e,l,m)=>{if(l>=2)console.error(m)});await win.loadFile(${JSON.stringify(join(dir,'index.html'))});win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:900,height:1100,deviceScaleFactor:1,mobile:false});await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});let finished=false;const run=win.webContents.executeJavaScript('window.run()').then(v=>{finished=true;return v},e=>{finished=true;throw e});run.catch(()=>{});while(!finished){const input=await win.webContents.executeJavaScript('window.pendingInput??null');if(input){if(input.kind==='keyboard'){await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\\r',unmodifiedText:'\\r'});await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13})}else{await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:input.x,y:input.y});if(input.kind!=='hover'){await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',x:input.x,y:input.y,button:'left',clickCount:1});await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',x:input.x,y:input.y,button:'left',clickCount:1})}}await win.webContents.executeJavaScript('window.finishInput()')}await new Promise(r=>setTimeout(r,25))}console.log(await run);win.destroy();app.quit()}).catch(e=>{console.error(e);app.exit(1)});`);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const {stdout}=await promisify(execFile)(createRequire(import.meta.url)('electron'),[...(process.platform==='linux'?['--ozone-platform=headless']:[]),join(dir,'runner.cjs')],{env,windowsHide:true,timeout:60_000});assert.match(stdout,/POLYGON_DETAILS_PASS/);
 }finally{assert.ok(dir.startsWith(join(tmpdir(),'webo-polygon-details-')));await rm(dir,{recursive:true,force:true})}
});
