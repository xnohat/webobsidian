import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {promises as fs} from 'node:fs';import path from 'node:path';import os from 'node:os';
const {settings}=vi.hoisted(()=>({settings:{vault:{path:'',allowedRoots:[] as string[],trash:'.trash',deleteMode:'trash',attachmentDir:'attachments'}}}));
vi.mock('./settings.js',()=>({getSettings:async()=>settings}));
vi.mock('./vaultPreferences.js',()=>({getVaultPreferences:async()=>({values:{deleteMode:settings.vault.deleteMode}})}));
import {deleteUnreferencedAttachment} from './attachmentDeletion.js';import {contentVersion} from './noteversion.js';
let root:string;beforeEach(async()=>{root=await fs.mkdtemp(path.join(os.tmpdir(),'webo-delete-'));settings.vault.path=root;settings.vault.deleteMode='trash';await fs.writeFile(path.join(root,'image #1.png'),'image');await fs.writeFile(path.join(root,'source.md'),'removed');});afterEach(async()=>{await fs.rm(root,{recursive:true,force:true});});
const request=()=>({sourcePath:'source.md',targetPath:'image #1.png',sourceVersion:contentVersion('removed')});
describe('attachment deletion',()=>{
 it('trashes only after source version is saved',async()=>{expect((await deleteUnreferencedAttachment(request())).outcome).toBe('trashed');expect(await fs.readFile(path.join(root,'.trash/image #1.png'),'utf8')).toBe('image');});
 it('keeps a file used by an encoded markdown link',async()=>{await fs.writeFile(path.join(root,'other.md'),'![](image%20%231.png)');expect((await deleteUnreferencedAttachment(request())).outcome).toBe('kept');expect(await fs.readFile(path.join(root,'image #1.png'),'utf8')).toBe('image');});
 it('keeps canvas references',async()=>{await fs.writeFile(path.join(root,'other.canvas'),JSON.stringify({nodes:[{file:'image #1.png'}]}));expect((await deleteUnreferencedAttachment(request())).outcome).toBe('kept');});
 it('rejects stale source without deleting file',async()=>{await expect(deleteUnreferencedAttachment({...request(),sourceVersion:'stale'})).rejects.toMatchObject({status:409});expect(await fs.readFile(path.join(root,'image #1.png'),'utf8')).toBe('image');});
 it('caps confirmed trash when deletion policy changes to permanent',async()=>{
  settings.vault.deleteMode='permanent';
  expect((await deleteUnreferencedAttachment({...request(),confirmedMode:'trash'})).outcome).toBe('trashed');
  expect(await fs.readFile(path.join(root,'.trash','image #1.png'),'utf8')).toBe('image');
 });
 it('uses permanent deletion only when both current policy and confirmed action are permanent',async()=>{
  settings.vault.deleteMode='permanent';
  expect((await deleteUnreferencedAttachment({...request(),confirmedMode:'permanent'})).outcome).toBe('deleted');
  await expect(fs.stat(path.join(root,'image #1.png'))).rejects.toMatchObject({code:'ENOENT'});
  await expect(fs.stat(path.join(root,'.trash','image #1.png'))).rejects.toMatchObject({code:'ENOENT'});
 });
 it('keeps an attachment used by a visible local HTML image',async()=>{
  await fs.writeFile(path.join(root,'other.md'),'<img src="image%20%231.png">');
  expect((await deleteUnreferencedAttachment(request())).outcome).toBe('kept');
  expect(await fs.readFile(path.join(root,'image #1.png'),'utf8')).toBe('image');
 });
 it('keeps a literal-percent filename used by a wikilink without double decoding',async()=>{
  const targetPath='literal%23.png';await fs.writeFile(path.join(root,targetPath),'literal percent image');
  await fs.writeFile(path.join(root,'other.md'),'![[literal%23.png]]');
  expect((await deleteUnreferencedAttachment({...request(),targetPath})).outcome).toBe('kept');
  expect(await fs.readFile(path.join(root,targetPath),'utf8')).toBe('literal percent image');
 });
});
