import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {build} from 'esbuild';

test('browser: language file import, template, live labels and literal user titles', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'webo-language-'));
  try {
    const russianPack = await readFile(new URL('../../translations/ru.txt',import.meta.url),'utf8');
    await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx',contents:`
      import React from 'react';import {createRoot} from 'react-dom/client';
      import LanguageSettings from './src/components/LanguageSettings';
      import FolderView from './src/components/FolderView';
      import TemplatePicker from './src/components/TemplatePicker';
      import {useStore} from './src/lib/store';
      import {api} from './src/lib/api';
      import {defaultVaultPreferences} from './src/lib/vaultPreferences';
      import {registerTemplate,getCommand} from './src/lib/toolbar/registry';
      import {loadServerLanguage,saveServerLanguage,clearServerLanguage} from './src/lib/i18n/server';
      import {pdfLabel,bindPdfLabel} from './src/lib/i18n/pdfLabels';
      import {initializeLanguage,t,useLanguage,setLocalizedText} from './src/lib/i18n/runtime';
      import {exportLanguageTemplate} from './src/lib/i18n/pack';
      Object.defineProperty(navigator,'language',{configurable:true,value:'ru-RU'});
      initializeLanguage();localStorage.clear();
      let serverPack=null,failServer=false;
      api.getSettings=async()=>({ui:{languagePack:serverPack}});
      api.putSettings=async patch=>{if(failServer)throw Error('server unavailable');serverPack=patch.ui.languagePack;return {ui:{languagePack:serverPack}};};
      api.vaultPreferences=async()=>({values:defaultVaultPreferences,sources:{},warnings:[],vaultPath:'test'});
      useStore.setState({templatePicker:true,tree:{type:'folder',name:'Vault',path:'',children:[
        {type:'folder',name:'Notes',path:'Notes',children:[{type:'file',name:'Settings.md',path:'Notes/Settings.md',ext:'.md'}]},
        {type:'folder',name:'Templates',path:'Templates',children:[{type:'file',name:'Sample.md',path:'Templates/Sample.md',ext:'.md'}]}
      ]}});
      registerTemplate('custom-language-test','Settings','[',']');
      const wait=()=>new Promise(r=>setTimeout(r,80));
      function Fixture(){useLanguage();return <><LanguageSettings/><button id="folder">{t('plugins.file-explorer.action-new-folder')}</button><FolderView path="Notes"/><TemplatePicker/></>;}
      const root=document.createElement('div');document.body.append(root);createRoot(root).render(<Fixture/>);
      const widget=document.createElement('div');document.body.append(widget);setLocalizedText(widget,'webobsidian.missing-file',{name:'<b>note</b>'});
      const action=document.createElement('a');action.textContent='action';widget.append(action);
      const check=(value,message)=>{if(!value)throw Error(message)};
      window.run=async()=>{
        check(pdfLabel('Увеличить')==='Zoom in','fresh install uses English PDF labels in a Russian browser');
        await wait();check(exportLanguageTemplate().includes('[plugins.file-explorer.action-new-folder]'),'template contains compatible keys');
        const title=document.querySelector('[data-testid=template-title]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(title,'Settings');title.dispatchEvent(new Event('input',{bubbles:true}));await wait();
        let downloaded=false;HTMLAnchorElement.prototype.click=function(){downloaded=this.download==='webobsidian-language.txt'};
        [...document.querySelectorAll('button')].find(b=>b.textContent==='Download template').click();check(downloaded,'template download');
        const load=async(text)=>{const input=document.querySelector('input[type=file]');const data=new DataTransfer();data.items.add(new File([text],'custom.txt',{type:'text/plain'}));input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true}));await wait();};
        await load('[plugins.file-explorer.action-new-folder]\\ntranslation=Custom folder\\n[interface.settings]\\ntranslation=Translated settings\\n[webobsidian.missing-file]\\ntranslation=Missing {{name}}\\n[commands.zoom-in]\\ntranslation=Custom zoom');
        const pdfButton=document.createElement('button');
        bindPdfLabel(pdfButton,pdfLabel('Увеличить'),'title');
        check(pdfButton.title==='Custom zoom','PDF label uses active pack when created');
        check(document.querySelector('#folder').textContent==='Custom folder','react updates immediately');
        check(widget.firstChild.textContent==='Missing <b>note</b>'&&!widget.querySelector('b'),'existing DOM widget updates as text');
        check(widget.querySelector('a')===action,'language update preserves controls appended to translated text');
        check(document.querySelector('.folder-entry-name').textContent==='Settings','file names remain literal');
        check(title.value==='Settings','template title input remains literal');
        check(getCommand('custom-language-test').label==='Settings','custom command label remains literal');
        initializeLanguage();await wait();check(document.querySelector('#folder').textContent==='Custom folder','persisted on restart');
        localStorage.clear();initializeLanguage();await loadServerLanguage();await wait();
        check(document.querySelector('#folder').textContent==='Custom folder','another browser obtains language from server');
        serverPack=undefined;await loadServerLanguage();
        check(serverPack?.name==='custom.txt','existing browser language migrates to an unconfigured server');
        failServer=true;await load('[plugins.file-explorer.action-new-folder]\\ntranslation=Failed save');failServer=false;
        check(document.querySelector('#folder').textContent==='Custom folder','failed server save preserves active language');
        const put=api.putSettings;let release;
        const gate=new Promise(r=>{release=r});let first=true;
        api.putSettings=async patch=>{if(first){first=false;await gate;return put(patch);}throw Error('second save failed')};
        const a=saveServerLanguage('[plugins.file-explorer.action-new-folder]\\ntranslation=First saved','a.txt');
        const b=saveServerLanguage('[plugins.file-explorer.action-new-folder]\\ntranslation=Second failed','b.txt');
        release();await Promise.allSettled([a,b]);await wait();
        check(t('plugins.file-explorer.action-new-folder')==='First saved'&&serverPack.name==='a.txt','overlapping failure keeps last committed pack');
        api.putSettings=put;
        await Promise.all([saveServerLanguage('[plugins.file-explorer.action-new-folder]\\ntranslation=Before clear','a.txt'),clearServerLanguage()]);
        check(serverPack===null&&t('plugins.file-explorer.action-new-folder')==='New folder','save and clear are ordered');
        await load('[plugins.file-explorer.action-new-folder]\\ntranslation=Custom folder');
        await load('broken');check(document.querySelector('[role=alert]'),'invalid import reports error');check(document.querySelector('#folder').textContent==='Custom folder','invalid import preserves active pack');
        [...document.querySelectorAll('button')].find(b=>b.textContent==='Restore default language').click();await wait();
        check(document.querySelector('#folder').textContent==='New folder','reset restores English');
        check(!localStorage.getItem('webobsidian.language.v1'),'reset deletes saved pack');
        check(serverPack===null,'reset deletes server pack');
        check(pdfButton.title==='Zoom in','PDF reset restores English for widgets created under a pack');
        await load(${JSON.stringify(russianPack)});
        check(document.querySelector('#folder').textContent==='Новая папка','Russian is applied after explicitly importing a pack');
        check(pdfButton.title==='Увеличить масштаб','existing PDF widget follows the imported Russian pack');
        [...document.querySelectorAll('button')].find(b=>b.textContent===t('webobsidian.restore-default-language-a41d48')).click();await wait();
        check(pdfButton.title==='Zoom in'&&document.querySelector('#folder').textContent==='New folder','reset after Russian import restores English in a Russian browser');
        return 'LANGUAGE_PASS';
      };
    `},bundle:true,jsx:'automatic',format:'iife',platform:'browser',define:{'import.meta.env.DEV':'false'},outfile:join(dir,'fixture.js'),logLevel:'silent'});
    await writeFile(join(dir,'index.html'),'<body><script src="fixture.js"></script></body>');
    await writeFile(join(dir,'runner.cjs'),`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(dir,'profile'))});app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false}});w.webContents.on('console-message',(_e,_l,m)=>console.log('RENDER',m));await w.loadFile(${JSON.stringify(join(dir,'index.html'))});console.log(await w.webContents.executeJavaScript('window.run().catch(e => String(e.stack))'));w.destroy();app.quit()}).catch(e=>{console.error(e);app.exit(1)});`);
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    const {stdout}=await promisify(execFile)(createRequire(import.meta.url)('electron'),[...(process.platform==='linux'?['--ozone-platform=headless']:[]),join(dir,'runner.cjs')],{env,windowsHide:true,timeout:60000});
    assert.match(stdout,/LANGUAGE_PASS/);
  } finally {await rm(dir,{recursive:true,force:true});}
});
