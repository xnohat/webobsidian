import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getDefaultToolbarConfig} from '../src/lib/toolbar/config.ts';
import {importMobileToolbarCommands,defaultVaultPreferences,getVaultPreferences,getCachedVaultPreferences,resetVaultPreferences} from '../src/lib/vaultPreferences.ts';
test('explicit mobile command import keeps every existing layout and reports unsupported commands',()=>{
 const before=getDefaultToolbarConfig();before.layouts.mobile.items=[{type:'group',instanceId:'existing-group',label:'Existing',children:[{type:'command',instanceId:'existing-bold',commandId:'editing-toolbar:toggle-bold'}]}];const snapshot=JSON.stringify(before);
 const nativeCommands=['editor:toggle-bold','plugin:unknown','editor:undo','editor:undo'];
 const result=importMobileToolbarCommands(before,nativeCommands);
 assert.equal(JSON.stringify(before),snapshot);assert.deepEqual(result.config.layouts.top,before.layouts.top);
 assert.equal(result.config.layouts.mobile.items.length,before.layouts.mobile.items.length+1);
 assert.deepEqual(result.unsupported,['plugin:unknown']);
 assert.equal(result.config.layouts.mobile.items.at(-1)?.type,'command');
 assert.deepEqual(importMobileToolbarCommands(result.config,nativeCommands).config,result.config);
});
test('a reply from the previous vault cannot be returned to an awaiting mutation',async()=>{
 const original=globalThis.fetch;let release!:(response:Response)=>void;
 globalThis.fetch=async()=>new Promise<Response>(r=>{release=r;});
 try{
  resetVaultPreferences('/old');const pending=getVaultPreferences();resetVaultPreferences('/new');
  release(new Response(JSON.stringify({values:defaultVaultPreferences,sources:{},warnings:[],vaultPath:'/old'})));
  await assert.rejects(pending,/vault changed/i);assert.equal(getCachedVaultPreferences().vaultPath,'/new');assert.equal(getCachedVaultPreferences().loading,true);
 }finally{globalThis.fetch=original;resetVaultPreferences();}
});
