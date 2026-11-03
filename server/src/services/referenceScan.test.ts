import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const {settings}=vi.hoisted(()=>({settings:{vault:{path:'',allowedRoots:[] as string[],trash:'.trash'}}}));
vi.mock('./settings.js',()=>({getSettings:async()=>settings}));
import {findFileReferences,referenceSnapshot} from './referenceScan.js';
import * as vault from './vault.js';
let root:string;
beforeEach(async()=>{root=await fs.mkdtemp(path.join(os.tmpdir(),'webo-reference-scan-'));settings.vault.path=root;await fs.writeFile(path.join(root,'photo.png'),'image');});
afterEach(async()=>{vi.restoreAllMocks();await fs.rm(root,{recursive:true,force:true});});
describe('complete reference safety inventory',()=>{
 it('includes hidden and excluded notes while excluding trash and app metadata',async()=>{
  await fs.mkdir(path.join(root,'.hidden'));await fs.writeFile(path.join(root,'.hidden','note.md'),'![[photo.png]]');
  await fs.mkdir(path.join(root,'Archive'));await fs.writeFile(path.join(root,'Archive','note.md'),'![[photo.png]]');
  for(const dir of ['.trash','.obsidian','.webobsidian-rename']){await fs.mkdir(path.join(root,dir));await fs.writeFile(path.join(root,dir,'note.md'),'![[photo.png]]');}
  expect((await findFileReferences('photo.png')).sort()).toEqual(['.hidden/note.md','Archive/note.md']);
 });
 it('rejects incomplete scans instead of losing unreadable references',async()=>{
  await fs.writeFile(path.join(root,'.hidden.md'),'![[photo.png]]');
  vi.spyOn(vault,'readFileText').mockRejectedValue(Error('unreadable fixture'));
  await expect(referenceSnapshot()).rejects.toThrow('unreadable fixture');
 });
 it('rejects cyclic symlinks as an incomplete inventory',async()=>{
  await fs.symlink(root,path.join(root,'loop'),process.platform==='win32'?'junction':'dir');
  await expect(referenceSnapshot()).rejects.toThrow(/cyclic/i);
  await fs.unlink(path.join(root,'loop'));
 });
});
