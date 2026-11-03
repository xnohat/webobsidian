import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultToolbarConfig, parseToolbarConfig, moveToolbarItem, type ToolbarNode } from '../src/lib/toolbar/config';
import { importEditingToolbar } from '../src/lib/toolbar/importConfig';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Icon from '../src/components/Icon';

function commands(nodes: ToolbarNode[]): string[] {
  return nodes.flatMap(n => n.type === 'command' ? [n.commandId] : n.type === 'group' ? commands(n.children) : []);
}
test('all toolbar registry icon names render a safe nonempty glyph',()=>{
  for(const name of ['paintbrush','eraser','type','strikethrough','highlighter','maximize','table','copy','scissors','clipboard','arrow-up','arrow-down','list-ordered','message-square','superscript','subscript','align-justify']){
    const html=renderToStaticMarkup(createElement(Icon,{name}));assert.match(html,/<(?:path|line|rect|circle|polyline|polygon)\b/,name);
  }
});
test('defaults expose all 64 commands, independent layouts and safe initial visibility', () => {
  const c = getDefaultToolbarConfig();
  assert.equal(new Set(commands(c.layouts.top.items)).size, 64);
  assert.deepEqual(Object.values(c.layouts).map(x => x.enabled), [true, true, false, true]);
  assert.equal(c.layouts.following.items.length,7);
  assert.equal(c.layouts.following.items[4].type,'group');
  c.layouts.top.items.length = 0;
  assert.ok(c.layouts.mobile.items.length);
  assert.ok(getDefaultToolbarConfig().layouts.top.items.length);
});
test('valid config round trips; malformed sections recover without resetting good layouts', () => {
  const c = getDefaultToolbarConfig(); c.layouts.mobile.enabled = false;
  assert.deepEqual(parseToolbarConfig(JSON.parse(JSON.stringify(c))), c);
  const p = parseToolbarConfig({ ...c, layouts: { ...c.layouts, top: { items: 'broken' } } });
  assert.deepEqual(p.layouts.top, getDefaultToolbarConfig().layouts.top);
  assert.equal(p.layouts.mobile.enabled, false);
  assert.deepEqual(parseToolbarConfig({version: 88}), getDefaultToolbarConfig());
});
test('unknown IDs are retained disabled; duplicate instance IDs are repaired', () => {
  const c = getDefaultToolbarConfig();
  c.layouts.top.items = [0, 1].map(() => ({type:'command', instanceId:'duplicate', commandId:'other:unknown'}));
  const p = parseToolbarConfig(c); const [a,b] = p.layouts.top.items;
  assert.notEqual(a.instanceId, b.instanceId);
  assert.ok(a.type === 'command' && a.disabled && a.disabledReason);
});
test('layout bounds cap items and group depth without losing other settings', () => {
  const c = getDefaultToolbarConfig();
  c.layouts.top.items = Array.from({length:201}, (_,i) => ({type:'separator',instanceId:String(i)}));
  assert.equal(parseToolbarConfig(c).layouts.top.items.length, getDefaultToolbarConfig().layouts.top.items.length);
  let node: ToolbarNode = {type:'separator',instanceId:'end'};
  for(let i=0;i<4;i++) node={type:'group',instanceId:String(i),label:'Group',children:[node]};
  c.layouts.top.items=[node];
  assert.deepEqual(parseToolbarConfig(c).layouts.top, getDefaultToolbarConfig().layouts.top);
});
test('templates remain literal, bounded and unique; unsafe appearance and icons never survive', () => {
  const c = getDefaultToolbarConfig();
  const p = parseToolbarConfig({...c, css:'body{}', appearance:{...c.appearance,backgroundColor:'url(javascript:bad)',iconColor:'#ff000080'},
    customCommands:[{id:'custom:literal',label:'Literal',icon:'<svg onload=evil>',prefix:'${x} **',suffix:'**'},
      {id:'custom:literal',label:'Duplicate',prefix:'x',suffix:'y'}]});
  assert.equal(p.customCommands.length,1); assert.equal(p.customCommands[0].prefix,'${x} **');
  assert.equal(p.customCommands[0].icon,'command'); assert.equal(p.appearance.backgroundColor,undefined);
  assert.equal(p.appearance.iconColor,'#ff000080'); assert.equal('css' in p,false);
  assert.equal(parseToolbarConfig({...c,customCommands:Array.from({length:101},(_,i)=>({id:`custom:${i}`,label:'x',prefix:'',suffix:''}))}).customCommands.length,100);
});
test('accessible move operations reorder siblings and leave input immutable', () => {
  const c = getDefaultToolbarConfig();const original=c.layouts.top.items.map(n=>n.instanceId);
  const moved=moveToolbarItem(c.layouts.top.items, original[1], -1);
  assert.equal(moved[0].instanceId, original[1]); assert.deepEqual(c.layouts.top.items.map(n=>n.instanceId),original);
});
test('upstream importer keeps groups, duplicate buttons, colors and reports unsupported commands', () => {
  const r=importEditingToolbar({enableMultipleConfig:true,enableTopToolbar:true,topCommands:[
    {id:'SubmenuCommands-test',name:'Editing',icon:'edit',SubmenuCommands:[{id:'editing-toolbar:editor-copy',name:'Copy'},{id:'another:plugin',name:'Unavailable'}]},
    {id:'editing-toolbar:toggle-bold'},{id:'editing-toolbar:toggle-bold'},
    {id:'editingToolbar-Divider-Line'}],toolbarIconColor:'#ABCDEF',custom_fc1:'#123456',custom_bg1:'#12345680'});
  assert.equal(r.config.layouts.top.items[0].type,'group');
  assert.equal(r.config.appearance.iconColor,'#abcdef'); assert.deepEqual(r.config.customColors,['#123456','#12345680']);
  assert.deepEqual(r.unknownCommands,['another:plugin']);
  assert.equal(new Set(r.config.layouts.top.items.map(n=>n.instanceId)).size,4);
});
test('native import round trips; regex/script customs rejected with an explicit report', () => {
  const c=getDefaultToolbarConfig(); assert.deepEqual(importEditingToolbar(c).config,c);
  const r=importEditingToolbar({menuCommands:[{id:'evil'}],customCommands:[{id:'custom:x',name:'Bad',useRegex:true,prefix:'x',suffix:'y'}],css:'unsafe'});
  assert.equal(r.config.customCommands.length,0); assert.ok(r.warnings.length);
});

test('browser: settings reorder/reset/save/import/export and color palettes support alpha, saved colors and coordinated dismissal',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'webobsidian-toolbar-settings-'));
  try{
    await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx',contents:`
      import React from 'react';import {createRoot} from 'react-dom/client';
      import ToolbarSettings from './src/components/toolbar/ToolbarSettings';
      import ColorControls from './src/components/ColorControls';
      import {getDefaultToolbarConfig} from './src/lib/toolbar/config';
      import {EditorState} from '@codemirror/state';import {EditorView} from '@codemirror/view';
      import {setActiveEditor} from './src/lib/activeEditor';
      import './src/styles/obsidian.css';
      const wait=()=>new Promise(r=>setTimeout(r,60));
      window.runFixture=async()=>{
        const results=[];const check=(ok,message)=>{if(!ok)throw Error(message);results.push(message);};
        const config=getDefaultToolbarConfig();config.layouts.top.items=config.layouts.top.items.slice(0,2);config.layouts.mobile.enabled=false;
        const requests=[];window.fetch=async(url,opts)=>{requests.push(JSON.parse(opts.body));return new Response('{}',{status:200,headers:{'content-type':'application/json'}});};
        document.body.innerHTML='<div class="theme-ctp-mocha"><div id="settings"></div><div id="colors"></div><div id="editor"></div></div>';
        const settings=createRoot(document.querySelector('#settings'));settings.render(<ToolbarSettings value={config}/>);await wait();
        const button=text=>[...document.querySelectorAll('#settings button')].find(b=>b.textContent===text);
        document.querySelector('[aria-label="Move item 2 up"]').click();await wait();
        check(document.querySelector('[aria-label="Command 1"]').value==='editing-toolbar:editor-redo','mouse reorder changes command order');
        document.querySelector('[aria-label="Command 1"]').dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'ArrowDown',altKey:true}));await wait();
        check(document.querySelector('[aria-label="Command 1"]').value==='editing-toolbar:editor-undo','keyboard reorder changes command order');
        button('Reset top layout').click();await wait();button('Save toolbar settings').click();await wait();
        check(requests.length===1&&Object.keys(requests[0]).join(',')==='ui','save sends only ui settings patch');
        check(requests[0].ui.editingToolbar.layouts.top.items.length>2&&!requests[0].ui.editingToolbar.layouts.mobile.enabled,'reset affects only selected layout');
        let exported;URL.createObjectURL=blob=>{exported=blob;return 'blob:test';};HTMLAnchorElement.prototype.click=function(){};
        button('Export JSON').click();await wait();check(JSON.parse(await exported.text()).version===1,'export produces versioned native JSON');
        const imported=getDefaultToolbarConfig();imported.layouts.top.enabled=false;
        const file=document.querySelector('[aria-label="Import toolbar JSON"]');Object.defineProperty(file,'files',{configurable:true,value:[new File([JSON.stringify(imported)],'toolbar.json',{type:'application/json'})]});
        file.dispatchEvent(new Event('change',{bubbles:true}));await wait();button('Save toolbar settings').click();await wait();
        check(requests.at(-1).ui.editingToolbar.layouts.top.enabled===false,'native JSON import can be reviewed and saved');settings.unmount();
        const editor=new EditorView({parent:document.querySelector('#editor'),state:EditorState.create({doc:'hello',selection:{anchor:0,head:5}})});setActiveEditor(editor);
        const colors=createRoot(document.querySelector('#colors'));colors.render(<ColorControls view={editor} customColors={['#12345680']}/>);await wait();
        const click=async(selector)=>{const el=document.querySelector(selector);if(!el)throw Error('Missing '+selector);el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true}));el.click();await wait();};
        await click('[aria-label="Text color"]');check(!!document.querySelector('[aria-label="Saved color #12345680"]'),'configured custom colors appear in palette');
        await click('[aria-label="Saved color #12345680"]');check(editor.state.doc.toString().includes('color:#12345680'),'alpha custom color applies');
        await click('[aria-label="Text color"]');check(!!document.querySelector('[aria-label="Recent color #12345680"]'),'applied color appears in recent colors');
        check(!!document.querySelector('[aria-label="Custom color HEX"]'),'palette offers explicit HEX alpha input');
        window.dispatchEvent(new Event('toolbar-close-colors'));await wait();check(!document.querySelector('.color-palette'),'opening another overlay dismisses palette');
        await click('[aria-label="Apply last text color"]');check(editor.state.doc.toString().includes('color:#12345680'),'split main action applies last color');
        await click('[aria-label="Highlight color"]');window.dispatchEvent(new Event('toolbar-close-colors'));await wait();
        colors.render(<ColorControls view={editor} properties={['color']}/>);await wait();
        check(!!document.querySelector('[aria-label="Text color"]')&&!document.querySelector('[aria-label="Highlight color"]'),'color controls can follow individual configured nodes');
        colors.unmount();setActiveEditor(null);editor.destroy();return results;
      };
    `},bundle:true,format:'iife',platform:'browser',loader:{'.woff2':'file','.woff':'file','.ttf':'file'},define:{'import.meta.env.DEV':'false'},outfile:join(dir,'fixture.js'),logLevel:'silent'});
    await writeFile(join(dir,'index.html'),'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><script src="fixture.js"></script>');
    await writeFile(join(dir,'runner.cjs'),`
      const {app,BrowserWindow}=require('electron');app.whenReady().then(async()=>{
        const win=new BrowserWindow({show:false,width:1200,height:900,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
        await win.loadFile(${JSON.stringify(join(dir,'index.html'))});const result=await win.webContents.executeJavaScript('window.runFixture()');
        console.log('SETTINGS_RESULTS:'+JSON.stringify(result));win.destroy();app.quit();
      }).catch(e=>{console.error(e);app.exit(1)});
    `);
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    const {stdout}=await promisify(execFile)(createRequire(import.meta.url)('electron'),[...(process.platform==='linux'?['--ozone-platform=headless']:[]),join(dir,'runner.cjs')],{env,timeout:60_000,windowsHide:true,maxBuffer:1024*1024});
    const line=stdout.split(/\r?\n/).find(s=>s.startsWith('SETTINGS_RESULTS:'));assert.ok(line,stdout);
    assert.equal(JSON.parse(line.slice('SETTINGS_RESULTS:'.length)).length,13);
  }finally{assert.ok(dir.startsWith(join(tmpdir(),'webobsidian-toolbar-settings-')));await rm(dir,{recursive:true,force:true});}
});
