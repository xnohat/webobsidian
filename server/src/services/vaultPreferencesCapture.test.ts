import {it,expect,vi} from 'vitest';import {promises as fs} from 'node:fs';import path from 'node:path';import os from 'node:os';
const {current}=vi.hoisted(()=>({current:{vault:{path:'',allowedRoots:[] as string[],trash:'.trash',attachmentDir:'old',deleteMode:'trash',followObsidianDeletion:false}}}));
vi.mock('./settings.js',()=>({getSettings:async()=>current}));
import * as vault from './vault.js';import {getVaultPreferences} from './vaultPreferences.js';
it('a queued operation retains old vault attachment and deletion policies after a switch',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'vault-policy-capture-'));const other=path.join(root,'other');await fs.mkdir(other);current.vault.path=root;
 let unlock!:()=>void,started!:()=>void;const start=new Promise<void>(r=>{started=r});const gate=new Promise<void>(r=>{unlock=r});
 try{const busy=vault.withVaultMutation(async()=>{started();await gate;});await start;
 const queued=vault.withVaultMutation(async()=>({folder:await vault.resolveAttachmentDir('docs/n.md'),mode:(await getVaultPreferences()).values.deleteMode}));
 await new Promise<void>(r=>setImmediate(r));current.vault={...current.vault,path:other,attachmentDir:'new',deleteMode:'permanent'};unlock();await busy;
 expect(await queued).toEqual({folder:'docs/old',mode:'trash'});
 }finally{unlock();await fs.rm(root,{recursive:true,force:true});}
});
