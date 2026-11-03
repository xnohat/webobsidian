import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {Server} from 'node:http';
let root:string,base:string,token:string,server:Server;
let activeTransitions=0;
const switchVault=vi.fn(async()=>{});
beforeEach(async()=>{
 root=await fs.mkdtemp(path.join(os.tmpdir(),'preferences-http-'));vi.resetModules();activeTransitions=0;switchVault.mockClear();
 await fs.mkdir(path.join(root,'vault'));await fs.mkdir(path.join(root,'other'));
 vi.doMock('../config.js',()=>({config:{dataDir:path.join(root,'data'),defaultVaultPath:path.join(root,'vault'),allowedRoots:[root]},SETTINGS_FILE:path.join(root,'data','settings.json')}));
 vi.doMock('./indexing/coordinator.js',()=>({indexing:{isStarted:true,beginTransition:()=>{activeTransitions++;return()=>{activeTransitions--;};},switchVault}}));
 vi.doMock('./trashretention.js',()=>({purgeExpiredTrash:async()=>0}));
 const {getSettings}=await import('./settings.js');token=jwt.sign({sub:'owner'},(await getSettings()).auth.jwtSecret,{algorithm:'HS256'});
 const {settingsRouter}=await import('../routes/settings.js');const app=express();app.use(express.json());app.use('/api/settings',settingsRouter);app.use((err:Error&{status?:number},_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(err.status??500).json({error:err.message}));
 server=await new Promise<Server>(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});
 const address=server.address();if(!address||typeof address==='string')throw Error('missing address');base=`http://127.0.0.1:${address.port}/api/settings`;
});
afterEach(async()=>{await new Promise<void>(resolve=>server?.close(()=>resolve()));vi.restoreAllMocks();vi.doUnmock('../config.js');vi.doUnmock('./indexing/coordinator.js');vi.doUnmock('./trashretention.js');await fs.rm(root,{recursive:true,force:true});});
function put(body:unknown){return fetch(base,{method:'PUT',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body)});}
it('authenticates preferences and rejects blank paths without changing settings or index',async()=>{
 expect((await fetch(base+'/vault-preferences')).status).toBe(401);
 const {getSettings}=await import('./settings.js');const before=structuredClone(await getSettings());
 for(const value of ['', '  ',null])expect((await put({vault:{path:value}})).status).toBe(400);
 expect(await getSettings()).toEqual(before);expect(switchVault).not.toHaveBeenCalled();expect(activeTransitions).toBe(0);
 const response=await fetch(base+'/vault-preferences',{headers:{authorization:`Bearer ${token}`}});expect(response.status).toBe(200);expect(await response.json()).toMatchObject({values:{deleteMode:'trash'},sources:{deleteMode:'webobsidian'},vaultPath:before.vault.path});
});
it('holds the index barrier during persistence failure and leaves the original vault/cache/disk active',async()=>{
 const {getSettings}=await import('./settings.js');const before=structuredClone(await getSettings());
 vi.spyOn(fs,'rename').mockImplementationOnce(async()=>{expect(activeTransitions).toBe(1);expect((await getSettings()).vault.path).toBe(before.vault.path);throw Error('fixture rename failure');});
 expect((await put({vault:{path:path.join(root,'other')}})).status).toBe(500);
 expect(await getSettings()).toEqual(before);expect(JSON.parse(await fs.readFile(path.join(root,'data','settings.json'),'utf8'))).toEqual(before);
 expect(switchVault).not.toHaveBeenCalled();expect(activeTransitions).toBe(0);
});
