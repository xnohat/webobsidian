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

test('attachment embeds preserve dimensions, native media controls and readonly image behavior',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'webo-attachment-embeds-'));
 try{
  await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx',contents:`
   import React from 'react';import {createRoot} from 'react-dom/client';
   import Editor from './src/components/Editor';import Preview from './src/components/Preview';
   import {useStore} from './src/lib/store';import {api} from './src/lib/api';
   import {getActiveEditor} from './src/lib/activeEditor';import './src/styles/obsidian.css';
   api.tags=async()=>({tags:[]});api.propertyTypes=async()=>({types:{}});
   api.resolve=async()=>({path:'Lab/CardNote.md'});api.read=async()=>({content:'# Nested\\n\\n![[my.yaml]]\\n\\n![[photo.png|100]]',version:'fixture'});
   const root=createRoot(document.querySelector('#root')),wait=()=>new Promise(r=>setTimeout(r,50));
   const check=(ok,message)=>{if(!ok)throw Error(message)};
   const until=async(fn,message)=>{for(let i=0;i<60&&!fn();i++)await wait();check(fn(),message+': '+document.querySelector('#root')?.textContent+' images='+JSON.stringify([...document.querySelectorAll('img')].map(img=>({src:img.src,width:img.width,height:img.height,loaded:img.complete}))))};
   const mount=async(mode,source,locked=false)=>{
    root.render(<div/>);await wait();
    useStore.setState({activePath:'Host.md',content:source,viewMode:mode==='preview'?'reading':mode,showInlineTitle:false,locked,dirty:false,save:async()=>{}});
    root.render(mode==='preview'?<Preview/>:<Editor/>);await wait();await wait();
   };
   window.run=async()=>{
    const failures=[];
    for(const part of ['readonly','images','media'])try{
     if(part==='readonly'){
      const source='# Host\\n\\n![[photo.png|120]]';await mount('live',source);
      await until(()=>document.querySelector('.cm-image-resize'),'editable image resize handles');
      const handle=document.querySelector('.cm-image-resize-right');
      handle.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,clientX:120}));
      useStore.setState({locked:true});await wait();await wait();
      window.dispatchEvent(new MouseEvent('mousemove',{clientX:180}));window.dispatchEvent(new MouseEvent('mouseup'));
      check(useStore.getState().content===source,'locking during drag does not change image source');
      check(!document.querySelector('.cm-image-resize,.cm-image-delete'),'locked images expose no mutation controls');
      await mount('reading',source);check(!document.querySelector('.cm-image-resize,.cm-image-delete'),'reading images expose no mutation controls');
     }
     if(part==='images')for(const mode of ['live','reading','preview']){
      const source='# Host\\n\\n![[photo.avif|120x75]]\\n\\n![[photo.png#outline|100]]\\n\\n![[photo.png|800x400]]\\n\\n![[photo.png]]';await mount(mode,source);
      await until(()=>document.querySelectorAll('.cm-embed-image,img[data-embed]').length===4,mode+': AVIF and image fragment render as images');
      const images=[...document.querySelectorAll('.cm-embed-image,img[data-embed]')];
      await until(()=>images.every(img=>img.complete&&img.naturalWidth>0),mode+': images loaded');
      check(images[0].width===120&&images[0].height===75,mode+': image dimensions preserved');
      check(images[1].width===100,mode+': width-only image keeps requested width');
      check(images[2].getBoundingClientRect().width===800&&images[2].getBoundingClientRect().height===400,mode+': explicit large image dimensions do not distort');
      check(images[3].getBoundingClientRect().width<=600,mode+': unsized image stays within the note column');
      check(new URL(images[1].src).searchParams.get('path')==='photo.png',mode+': fragments are not part of vault filenames');
      check(useStore.getState().content===source,mode+': image rendering preserves source');
      images[1].click();await until(()=>document.querySelector('.image-lightbox'),'image opens zoom viewer');
      const zoomed=document.querySelector('.image-lightbox-img'),before=zoomed.style.transform;
      document.querySelector('.image-lightbox').dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:-100,clientX:100,clientY:100}));
      check(zoomed.style.transform!==before,'image wheel zoom works');document.querySelector('.image-lightbox-close').click();
      check(!document.querySelector('.image-lightbox'),'image viewer closes');
      check(document.querySelector('.cm-image-wrap [aria-label="Zoom image"],.image-embed-wrap [aria-label="Zoom image"]'),mode+': image has native zoom action');
      if(mode==='live'){
       const edit=document.querySelector('.cm-image-wrap [aria-label="Edit embed"]');check(edit,'image has edit-source action');edit.click();await wait();
       const view=getActiveEditor(),selection=view.state.selection.main;
       check(view.state.doc.sliceString(selection.from,selection.to)==='photo.avif','image source action selects filename like native Obsidian');
       check(document.querySelectorAll('.cm-embed-image').length===4,'editing image source keeps rendered images');
       check(useStore.getState().content===source,'image source action preserves document');
      }else check(!document.querySelector('.cm-image-wrap [aria-label="Edit embed"],.image-embed-wrap [aria-label="Edit embed"]'),mode+': readonly images have no source-edit action');
     }
     if(part==='images')for(const mode of ['live','reading']){
      const source='# Host\\n\\n![[photo.png|120x75]]\\n![[photo.png|100x90]]\\n\\n![[photo.png|100x80]]';await mount(mode,source);
      await until(()=>document.querySelectorAll('.cm-embed-image').length===3,mode+': image rows mounted');const imgs=[...document.querySelectorAll('.cm-embed-image')];await until(()=>imgs.every(e=>e.complete),mode+': image rows loaded');
      const a=imgs[0].getBoundingClientRect(),b=imgs[1].getBoundingClientRect(),c=imgs[2].getBoundingClientRect();
      check(Math.abs(b.top-a.bottom)<1,mode+': adjacent image rows have no extra gap: '+(b.top-a.bottom));
      check(c.top-b.bottom>=15,mode+': authored blank line between images remains visible');check(useStore.getState().content===source,mode+': image spacing preserves source');
     }
     if(part==='images'){
      const markdown='# Host\\n\\n![Picture|100](photo.png)';await mount('live',markdown);
      await until(()=>document.querySelector('.cm-image-wrap [aria-label="Edit embed"]'),'Markdown image source action');
      document.querySelector('.cm-image-wrap [aria-label="Edit embed"]').click();await wait();
      let view=getActiveEditor(),selection=view.state.selection.main;
      check(view.state.doc.sliceString(selection.from,selection.to)==='photo.png','Markdown source action selects destination');
      check(document.querySelector('.cm-embed-image')&&useStore.getState().content===markdown,'Markdown image stays rendered without changing source');
      const adjacent='# Host\\n\\n![[photo.png|100]]![[photo.png|200]]';await mount('live',adjacent);
      await until(()=>document.querySelectorAll('.cm-image-wrap').length===2,'adjacent images loaded');
      document.querySelectorAll('.cm-image-wrap [aria-label="Edit embed"]')[1].click();await wait();
      const handle=document.querySelectorAll('.cm-image-resize-right')[1];handle.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,clientX:200}));
      window.dispatchEvent(new MouseEvent('mousemove',{clientX:260}));window.dispatchEvent(new MouseEvent('mouseup'));await wait();
      check(useStore.getState().content===adjacent.replace('photo.png|200','photo.png|260'),'resizing source-visible second image preserves adjacent first source');
     }
     if(part==='media')for(const mode of ['live','reading','preview']){
      const source='# Host\\n\\n![[sound.wav]]\\n\\n![[clip.webm|180x90]]\\n\\n![[clip.webm|800x400]]';await mount(mode,source);
      await until(()=>document.querySelector('audio')&&document.querySelector('video'),mode+': audio and video players mounted');
      const audioEl=document.querySelector('audio'),video=document.querySelector('video');
      check(audioEl.controls&&video.controls,mode+': native media controls enabled');
      check(audioEl.getBoundingClientRect().height===42,mode+': native audio height');
      check(Math.abs(audioEl.getBoundingClientRect().width-audioEl.parentElement.getBoundingClientRect().width)<1,mode+': audio fills the note column');
      check(audioEl.getAttribute('controlslist')==='nodownload',mode+': audio controls match the native download-button setting');
      check(video.width===180&&video.height===90,mode+': video dimensions preserved');
      const wideVideo=document.querySelectorAll('video')[1];
      check(wideVideo.getBoundingClientRect().width===800&&wideVideo.getBoundingClientRect().height===400,mode+': explicit large video dimensions do not distort');
      await until(()=>audioEl.readyState>=1,mode+': playable audio metadata loaded');
      await audioEl.play();audioEl.pause();check(audioEl.paused,mode+': native play and pause work');
      check(useStore.getState().content===source,mode+': player interactions preserve source');
      check(!document.querySelector('.cm-media-wrap [aria-label="Edit embed"]'),mode+': native audio/video have player controls without a source-edit action');
     }
    }catch(error){failures.push(part+': '+error.message)}
    let opened=[],lastFrom;const cardSource='# Host\\n\\n![[my.yaml]]';
    for(const mode of ['live','reading','preview'])try{
     await mount(mode,cardSource);useStore.setState({openWikilink:async target=>{opened.push(target)}});await wait();
     const card=document.querySelector('.file-embed.mod-generic');check(card&&card.tabIndex===0&&card.getAttribute('href'),mode+': file card is keyboard accessible');
     opened=[];card.click();await wait();check(opened.join()==='my.yaml',mode+': file card click opens once');
    }catch(error){failures.push('file cards: '+error.message)}
    const nestedSource='# Host\\n\\n![[CardNote]]';
    for(const mode of ['live','reading','preview'])try{
     await mount(mode,nestedSource);useStore.setState({openWikilink:async(target,_kind,from)=>{opened.push(target);lastFrom=from}});await until(()=>document.querySelector('.file-embed.mod-generic'),'nested card loaded');
     opened=[];document.querySelector('.file-embed.mod-generic').click();await wait();
     check(opened.join()==='my.yaml',mode+': nested card click opens once');
     check(lastFrom==='Lab/CardNote.md',mode+': nested card keeps its own note context');
     const image=document.querySelector('.markdown-embed-content img,.embed-note img');image.click();await until(()=>document.querySelector('.image-lightbox'),'nested image opens viewer');document.querySelector('.image-lightbox-close').click();
    }catch(error){failures.push('nested file cards: '+error.message)}
    window.prepareKeyboard=async nested=>{await mount('live',nested?nestedSource:cardSource);useStore.setState({openWikilink:async target=>{opened.push(target)}});await until(()=>document.querySelector('.file-embed.mod-generic'),'keyboard card loaded');opened=[];document.querySelector('.file-embed.mod-generic').focus()};
    window.verifyKeyboard=nested=>{check(opened.join()==='my.yaml','Enter opens focused file card once');check(useStore.getState().content===(nested?nestedSource:cardSource),'file card preserves source')};
    window.cleanup=()=>root.unmount();
    window.verifyMobile=async()=>{
     document.querySelector('#root').className='app mobile';
     await mount('preview','# Host\\n\\n![[photo.png|800x400]]');
     await until(()=>document.querySelector('img[data-embed]')?.complete,'mobile image loaded');
     const rect=document.querySelector('img[data-embed]').getBoundingClientRect();
     check(rect.width===800&&rect.height===400,'mobile explicit image dimensions do not distort');
    };
    if(failures.length){root.unmount();throw Error(failures.join('; '))}return 'ATTACHMENT_EMBEDS_PASS';
   };
  `},bundle:true,format:'iife',platform:'browser',tsconfigRaw:{compilerOptions:{useDefineForClassFields:false,jsx:'react-jsx'}},loader:{'.woff2':'file','.woff':'file','.ttf':'file'},define:{'import.meta.env.DEV':'false'},outfile:join(dir,'fixture.js'),logLevel:'silent'});
  await writeFile(join(dir,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><body class="theme-dark"><div id="root" style="width:600px;height:1000px"></div><script src="fixture.js"></script>');
  await writeFile(join(dir,'runner.cjs'),`
   const {app,BrowserWindow}=require('electron'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');app.setPath('userData',${JSON.stringify(join(dir,'profile'))});
   app.whenReady().then(async()=>{
    const wave=Buffer.alloc(1644);wave.write('RIFF');wave.writeUInt32LE(1636,4);wave.write('WAVE',8);wave.write('fmt ',12);wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);wave.writeUInt16LE(1,22);wave.writeUInt32LE(8000,24);wave.writeUInt32LE(16000,28);wave.writeUInt16LE(2,32);wave.writeUInt16LE(16,34);wave.write('data',36);wave.writeUInt32LE(1600,40);
    const png=fs.readFileSync(${JSON.stringify(fileURLToPath(new URL('../../tests/fixtures/rendering/obsidian-reference.png',import.meta.url)))});
    const dir=${JSON.stringify(dir)},server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');
     if(url.pathname==='/api/files/content'){const image=url.searchParams.get('path')?.includes('photo');res.setHeader('Content-Type',image?'image/png':'audio/wav');res.end(image?png:wave);return}
     const file=path.resolve(dir,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(dir+path.sep)){res.writeHead(403).end();return}
     try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file))}catch{res.writeHead(404).end()}
    });await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const win=new BrowserWindow({show:false,width:800,height:1200,webPreferences:{backgroundThrottling:false}});
    await win.loadURL('http://127.0.0.1:'+server.address().port);win.webContents.focus();await win.webContents.executeJavaScript('window.run()',true);
    for(const nested of [false,true]){await win.webContents.executeJavaScript('window.prepareKeyboard('+nested+')');
     win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});win.webContents.sendInputEvent({type:'char',keyCode:String.fromCharCode(13)});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});
     await win.webContents.executeJavaScript('new Promise(r=>setTimeout(r,100)).then(()=>window.verifyKeyboard('+nested+'))');
    }win.setSize(390,1200);await win.webContents.executeJavaScript('window.verifyMobile()');await win.webContents.executeJavaScript('window.cleanup()');console.log('ATTACHMENT_EMBEDS_PASS');
    win.destroy();server.close();app.quit();
   }).catch(e=>{console.error(e);app.exit(1)});
  `);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const {stdout}=await promisify(execFile)(createRequire(import.meta.url)('electron'),[...(process.platform==='linux'?['--ozone-platform=headless']:[]),join(dir,'runner.cjs')],{env,windowsHide:true,timeout:60_000});assert.match(stdout,/ATTACHMENT_EMBEDS_PASS/);
 }finally{assert.ok(dir.startsWith(join(tmpdir(),'webo-attachment-embeds-')));await rm(dir,{recursive:true,force:true})}
});
