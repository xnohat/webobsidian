import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { build } from 'esbuild';

test('explorer uses natural numeric sorting and preserves filename spelling', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'webo-explorer-sort-'));
  try {
    await build({stdin: {resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'tsx', contents: `
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import FileTree from './src/components/FileTree'; import {useStore} from './src/lib/store';
      import './src/styles/obsidian.css';
      import {defaultVaultPreferences} from './src/lib/vaultPreferences';
      // This fixture explicitly shows unsupported files to exercise BASE badges.
      window.fetch=async()=>Response.json({values:{...defaultVaultPreferences,showUnsupportedFiles:true},sources:{},warnings:[],vaultPath:'/fixture'});
      const file=(name,path=name)=>({name,path,type:'file',mtime:1,ext:'.'+name.split('.').pop()});
      const folder=(name,children=[])=>({name,path:name,type:'folder',children});
      const tree=folder('vault',[file('2026-05-04.md'),file('3proxy.md'),file('note_with-hyphen.md'),
        file('Без названия.base'),file('Pasted image.png'),folder('Папка10'),folder('Папка2'),folder('Работа',[
          file('HR-1037 удержание.md','Работа/HR-1037 удержание.md'),
          file('HR-908 Адаптация.md','Работа/HR-908 Адаптация.md'),
          file('HR-685 Начисление.md','Работа/HR-685 Начисление.md')])]);
      tree.path='';
      useStore.setState({tree,treeSort:'name-asc',expanded:['Работа'],autoReveal:false});
      createRoot(document.querySelector('#root')).render(<FileTree/>);
      const wait=()=>new Promise(r=>setTimeout(r,50));
      const check=(ok,msg)=>{if(!ok)throw Error(msg)};
      const rows=()=>[...document.querySelectorAll('.tree-row[data-path]')];
      const paths=()=>rows().map(el=>el.dataset.path);
      window.run=async()=>{
        await wait(); await wait();
        check(paths().slice(0,6).join('|')==='Папка2|Папка10|Работа|Работа/HR-685 Начисление.md|Работа/HR-908 Адаптация.md|Работа/HR-1037 удержание.md', 'natural folder and HR order: '+paths());
        check(paths().indexOf('3proxy.md')<paths().indexOf('2026-05-04.md'),'numeric filename order');
        check(rows().find(el=>el.dataset.path==='2026-05-04.md').querySelector('.name').textContent==='2026-05-04','date keeps hyphens');
        check(rows().find(el=>el.dataset.path==='note_with-hyphen.md').querySelector('.name').textContent==='note_with-hyphen','filename keeps spelling');
        for(const [path,label,tag] of [['Без названия.base','Без названия','base'],['Pasted image.png','Pasted image','png']]){
          const row=rows().find(el=>el.dataset.path===path);
          check(row?.querySelector('.name').textContent===label,'basename displayed for '+path);
          check(row?.querySelector('.nav-file-tag')?.textContent===tag,'extension badge for '+path);
          check(!row?.querySelector('.twisty:not(.leaf)'),'no leading attachment icon for '+path);
          const badge=row.querySelector('.nav-file-tag'),del=row.querySelector('.tree-del');
          check(getComputedStyle(badge).textTransform==='uppercase','uppercase extension badge');
          check(del.getBoundingClientRect().left-badge.getBoundingClientRect().right<10,'extension badge stays beside right row controls');
        }
        useStore.setState({treeSort:'name-desc'}); await wait();
        check(paths().filter(p=>p.startsWith('Работа/')).join('|')==='Работа/HR-1037 удержание.md|Работа/HR-908 Адаптация.md|Работа/HR-685 Начисление.md','reverse natural order');
        check(paths().slice(0,3).join('|')==='Папка2|Папка10|Работа','folders remain naturally ascending');
        useStore.setState({treeSort:'manual',manualOrder:{'':['2026-05-04.md','3proxy.md']}}); await wait();
        check(paths().slice(0,2).join('|')==='2026-05-04.md|3proxy.md','manual order remains authoritative');
        return 'EXPLORER_SORT_PASS';
      };
    `},bundle:true,format:'iife',platform:'browser',loader:{'.woff2':'file','.woff':'file','.ttf':'file'},define:{'import.meta.env.DEV':'false'},outfile:join(dir,'fixture.js'),logLevel:'silent'});
    await writeFile(join(dir,'index.html'),'<link rel="stylesheet" href="fixture.css"><body class="theme-dark"><div id="root" style="width:300px"></div><script src="fixture.js"></script>');
    await writeFile(join(dir,'runner.cjs'),`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(dir,'profile'))});app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false}});await w.loadFile(${JSON.stringify(join(dir,'index.html'))});console.log(await w.webContents.executeJavaScript('window.run()'));w.destroy();app.quit()}).catch(e=>{console.error(e);app.exit(1)});`);
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    const {stdout}=await promisify(execFile)(createRequire(import.meta.url)('electron'),[...(process.platform==='linux'?['--ozone-platform=headless']:[]),join(dir,'runner.cjs')],{env,windowsHide:true,timeout:30000});
    assert.match(stdout,/EXPLORER_SORT_PASS/);
  } finally {
    assert.ok(dir.startsWith(join(tmpdir(),'webo-explorer-sort-')));
    await rm(dir,{recursive:true,force:true});
  }
});
