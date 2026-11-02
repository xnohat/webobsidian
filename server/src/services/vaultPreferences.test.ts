import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
let root:string;
let follow=false;
beforeEach(async()=>{root=await fs.mkdtemp(path.join(os.tmpdir(),'vault-preferences-'));follow=false;vi.resetModules();vi.doMock('./settings.js',()=>({getSettings:async()=>({vault:{path:root,attachmentDir:'attachments',deleteMode:'trash',followObsidianDeletion:follow}})}));});
afterEach(async()=>{vi.doUnmock('./settings.js');await fs.rm(root,{recursive:true,force:true});});
async function app(value:unknown){await fs.mkdir(path.join(root,'.obsidian'),{recursive:true});await fs.writeFile(path.join(root,'.obsidian','app.json'),typeof value==='string'?value:JSON.stringify(value));}
it('hides unsupported files by default while respecting an explicit Obsidian preference',async()=>{
 const {getVaultPreferences}=await import('./vaultPreferences.js');
 expect((await getVaultPreferences()).values.showUnsupportedFiles).toBe(false);
 await app({});expect((await getVaultPreferences()).values.showUnsupportedFiles).toBe(false);
 await app({showUnsupportedFiles:true});const enabled=await getVaultPreferences();
 expect(enabled.values.showUnsupportedFiles).toBe(true);expect(enabled.sources.showUnsupportedFiles).toBe('obsidian');
 await app({showUnsupportedFiles:false});expect((await getVaultPreferences()).values.showUnsupportedFiles).toBe(false);
});
it('reads portable rules freshly without changing Obsidian or importing permanent deletion',async()=>{
 await app({alwaysUpdateLinks:true,readableLineLength:false,trashOption:'none',attachmentFolderPath:'./images',unknown:123});
 const {getVaultPreferences}=await import('./vaultPreferences.js');const first=await getVaultPreferences();
 expect(first.values).toMatchObject({alwaysUpdateLinks:true,readableLineLength:false,attachmentFolderPath:'./images',deleteMode:'trash'});
 expect(first.sources.deleteMode).toBe('webobsidian');expect(first.sources.alwaysUpdateLinks).toBe('obsidian');
 await app({alwaysUpdateLinks:false});expect((await getVaultPreferences()).values.alwaysUpdateLinks).toBe(false);
});
it('reports malformed and invalid config while using safe typed fallbacks',async()=>{
 const {getVaultPreferences}=await import('./vaultPreferences.js');await app('{broken');expect((await getVaultPreferences()).warnings.join(' ')).toMatch(/app.json/);
 await app({alwaysUpdateLinks:'yes',newLinkFormat:'invalid',userIgnoreFilters:['ok',3]});const r=await getVaultPreferences();
 expect(r.values.alwaysUpdateLinks).toBe(false);expect(r.sources.alwaysUpdateLinks).toBe('default');expect(r.values.userIgnoreFilters).toEqual([]);expect(r.warnings.length).toBeGreaterThan(0);
});
it('uses trash with a visible warning for unavailable system trash when explicitly following Obsidian',async()=>{
 follow=true;
 await app({trashOption:'system'});const r=await(await import('./vaultPreferences.js')).getVaultPreferences();
 expect(r.values.deleteMode).toBe('trash');expect(r.warnings.join(' ')).toMatch(/system.*trash/i);
});
it('shares the uploader missing-file and omitted-key attachment rules',async()=>{
 const {getVaultPreferences,getAttachmentFolderSetting}=await import('./vaultPreferences.js');
 expect((await getVaultPreferences()).values.attachmentFolderPath).toBe('./attachments');
 expect(await getAttachmentFolderSetting()).toBe('./attachments');
 await app({unrelated:'preserved'});
 const preferences=await getVaultPreferences();expect(preferences.values.attachmentFolderPath).toBe('/');expect(preferences.sources.attachmentFolderPath).toBe('default');
 expect(await getAttachmentFolderSetting()).toBe('/');
});
it('reports blocked uploads instead of claiming a fallback rule for malformed attachment configuration',async()=>{
 const {getVaultPreferences,getAttachmentFolderSetting}=await import('./vaultPreferences.js');
 for(const value of ['{broken',{attachmentFolderPath:17}]){
  await app(value);expect((await getVaultPreferences()).blocked?.attachmentUpload).toMatch(/app.json|attachmentFolderPath/);
  await expect(getAttachmentFolderSetting()).rejects.toThrow(/app.json|attachmentFolderPath/);
 }
});


it('imports fresh appearance font size without treating it as an app setting or changing files',async()=>{
 await app({baseFontSize:40});const file=path.join(root,'.obsidian','appearance.json');
 const {getVaultPreferences}=await import('./vaultPreferences.js');expect((await getVaultPreferences()).values).toHaveProperty('baseFontSize',16);
 await fs.writeFile(file,JSON.stringify({baseFontSize:19,accentColor:'unchanged'}));const before=await fs.readFile(file,'utf8');
 const r=await getVaultPreferences();expect(r.values).toHaveProperty('baseFontSize',19);expect(r.sources).toHaveProperty('baseFontSize','obsidian');expect(await fs.readFile(file,'utf8')).toBe(before);
 await fs.writeFile(file,JSON.stringify({baseFontSize:22}));expect((await getVaultPreferences()).values).toHaveProperty('baseFontSize',22);
 for(const value of [-1,10000,'19']){await fs.writeFile(file,JSON.stringify({baseFontSize:value}));const r=await getVaultPreferences();expect(r.values).toHaveProperty('baseFontSize',16);expect(r.warnings.join(' ')).toMatch(/baseFontSize/)}
 await fs.writeFile(file,'{invalid');const invalid=await getVaultPreferences();expect(invalid.warnings.join(' ')).toMatch(/appearance.json/);expect(invalid.blocked?.attachmentUpload).toBeUndefined();
});

it('refuses appearance configuration resolving outside the captured vault',async()=>{
 await app({});const original=fs.realpath.bind(fs),file=path.join(root,'.obsidian','appearance.json');
 const realpath=vi.spyOn(fs,'realpath').mockImplementation((async p=>String(p)===file?path.resolve(root,'..','outside-appearance.json'):original(p)) as typeof fs.realpath);
 try{
  const result=await(await import('./vaultPreferences.js')).getVaultPreferences();
  expect(result.values.baseFontSize).toBe(16);expect(result.warnings.join(' ')).toMatch(/appearance.json.*outside the vault/);
  expect(result.blocked?.attachmentUpload).toBeUndefined();
 }finally{realpath.mockRestore()}
});
