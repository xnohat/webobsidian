import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { coordinator } = vi.hoisted(() => ({coordinator:{
  isStarted:true, status:vi.fn(()=>({phase:'ready',available:true,initialScanComplete:true,revision:3})),
  requestJob:vi.fn(()=>({jobId:'one'})), waitForJob:vi.fn(async()=>{}),
  notify:vi.fn(),
  beginTransition:vi.fn(()=>vi.fn()), switchVault:vi.fn(async()=>{}),
  assertReady:vi.fn((preliminary=false)=>{if(!preliminary)throw Object.assign(new Error('INDEX_NOT_READY'),{status:503});}),
}}));
vi.mock('../services/indexing/coordinator.js',()=>({indexing:coordinator}));
const {settings}=vi.hoisted(()=>({settings:{vault:{path:'',allowedRoots:[] as string[],trash:'.trash'}}}));
const {updateSettingsMock}=vi.hoisted(()=>({updateSettingsMock:vi.fn()}));
vi.mock('../services/settings.js',()=>({getSettings:async()=>settings,updateSettings:updateSettingsMock,redactSettings:(s:unknown)=>s,ensureVaultBrowsable:()=>{}}));
vi.mock('../services/git.js',()=>({scheduleAutoCommitOnSave:()=>{}}));
vi.mock('../middleware/auth.js',()=>({requireAuth:(req:any,res:any,next:()=>void)=>req.headers.authorization==='test'?next():res.status(401).json({error:'Unauthorized'})}));
const {searchVaultMock}=vi.hoisted(()=>({searchVaultMock:vi.fn(async()=>[])}));
vi.mock('../services/search.js',()=>({searchVault:searchVaultMock,qmd:{search:async()=>[],allTags:()=>[],allProperties:()=>[],queryTerms:()=>[],allTasks:async()=>[]}}));
vi.mock('../services/links.js',()=>({backlinksFor:()=>[],graphData:()=>({nodes:[],edges:[]}),resolveLink:()=>undefined,buildLinkGraph:async()=>{}}));
let server:Server; let base:string; let testRoot:string;
beforeAll(async()=>{
  testRoot=await fs.mkdtemp(path.join(os.tmpdir(),'wo-index-routes-'));settings.vault.path=testRoot;
  const {indexingRouter}=await import('./indexing.js');
  const {searchRouter}=await import('./search.js');
  const {filesRouter}=await import('./files.js');
  const {tasksRouter}=await import('./tasks.js');
  const {settingsRouter}=await import('./settings.js');
  const {errorHandler}=await import('../middleware/error.js');
  const app=express();app.use(express.json());app.use('/api/index',indexingRouter);app.use('/api/settings',settingsRouter);app.use('/api/files',filesRouter);app.use('/api/tasks',tasksRouter);app.use('/api',searchRouter);app.use(errorHandler);
  server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
});
afterAll(async()=>{if(server)await new Promise<void>(r=>server.close(()=>r()));if(testRoot)await fs.rm(testRoot,{recursive:true,force:true});});
beforeEach(()=>vi.clearAllMocks());
const get=(path:string,auth=true)=>fetch(base+path,{headers:auth?{authorization:'test'}:{}});
it('protects status and jobs with session authentication',async()=>{
  expect((await get('/api/index/status',false)).status).toBe(401);
  expect(await (await get('/api/index/status')).json()).toMatchObject({revision:3});
  expect((await fetch(base+'/api/index/jobs',{method:'POST',headers:{'content-type':'application/json'},body:'{"mode":"rebuild"}'})).status).toBe(401);
});
it('validates jobs and responds without waiting for completion',async()=>{
  const submit=(mode:string)=>fetch(base+'/api/index/jobs',{method:'POST',headers:{authorization:'test','content-type':'application/json'},body:JSON.stringify({mode})});
  expect((await submit('bad')).status).toBe(400);expect(coordinator.requestJob).not.toHaveBeenCalled();
  const response=await submit('rebuild');expect(response.status).toBe(202);expect(await response.json()).toEqual({jobId:'one'});
  expect(coordinator.waitForJob).not.toHaveBeenCalled();
});
it('does not turn unready derived indexes into authoritative empty results',async()=>{
  for(const route of ['/api/tags','/api/properties','/api/backlinks?path=a.md','/api/graph','/api/resolve?target=a','/api/tasks'])expect((await get(route)).status).toBe(503);
  const search=await get('/api/search?q=ЕЦП');expect(search.status).toBe(200);expect(await search.json()).toMatchObject({hits:[],index:{revision:3}});
  expect(searchVaultMock).toHaveBeenCalledWith('ЕЦП',0);
});
it('preserves the captured vault through a write and its completion notification',async()=>{
  const vault=await import('../services/vault.js');
  const original=vault.mutateFileText;
  const nextRoot=path.join(testRoot,'next');await fs.mkdir(nextRoot,{recursive:true});
  vi.spyOn(vault,'mutateFileText').mockImplementationOnce(async(...args)=>{
    const result=await original(...args);
    settings.vault={...settings.vault,path:nextRoot};
    return result;
  });
  try {
    const response=await fetch(base+'/api/files/content',{method:'PUT',headers:{authorization:'test','content-type':'application/json'},body:JSON.stringify({path:'same.md',content:'captured'})});
    expect(response.status).toBe(200);
    expect(coordinator.notify).toHaveBeenCalledWith({root:path.resolve(testRoot),paths:['same.md'],source:'web'});
    expect(await fs.readFile(path.join(testRoot,'same.md'),'utf8')).toBe('captured');
    await expect(fs.stat(path.join(nextRoot,'same.md'))).rejects.toMatchObject({code:'ENOENT'});
  }finally{settings.vault={...settings.vault,path:testRoot};vi.restoreAllMocks();}
});
it('preserves readiness errors through the MCP scope wrapper',async()=>{
  const {createScopedAgentApi}=await import('../services/mcpAgentApi.js');
  const api=createScopedAgentApi(['read','search']);
  for(const op of [()=>api.search('ЕЦП'),()=>api.tags(),()=>api.backlinks('a.md')])await expect(op()).rejects.toMatchObject({status:503,message:'INDEX_NOT_READY'});
});
it('holds the readiness gate before publishing vault settings until persistence and switching finish',async()=>{
  let releasePersist!:()=>void;let published!:()=>void;
  const persisted=new Promise<void>(r=>{releasePersist=r;});
  const publication=new Promise<void>(r=>{published=r;});
  const releaseGate=vi.fn();coordinator.beginTransition.mockReturnValueOnce(releaseGate);
  updateSettingsMock.mockImplementationOnce(async(mutator:(draft:any)=>void)=>{
    // The real updateSettings publishes its cache before awaiting disk persistence.
    const draft={vault:{...settings.vault,allowedRoots:[]},ui:{},git:{},api:{}};mutator(draft);
    published();await persisted;return draft;
  });
  const response=fetch(base+'/api/settings',{method:'PUT',headers:{authorization:'test','content-type':'application/json'},body:JSON.stringify({vault:{allowedRoots:[testRoot]}})});
  try {
    await publication;
    expect(coordinator.beginTransition).toHaveBeenCalledOnce();
    expect(releaseGate).not.toHaveBeenCalled();expect(coordinator.switchVault).not.toHaveBeenCalled();
  }finally{releasePersist();}
  expect((await response).status).toBe(200);
  expect(coordinator.switchVault).toHaveBeenCalledWith(testRoot);expect(releaseGate).toHaveBeenCalledOnce();
});
it('synchronizes the active vault before releasing the gate when settings persistence fails after publication',async()=>{
  const original=settings.vault;
  const nextRoot=path.join(testRoot,'published-after-error');
  const releaseGate=vi.fn();coordinator.beginTransition.mockReturnValueOnce(releaseGate);
  updateSettingsMock.mockImplementationOnce(async()=>{
    settings.vault={...original,allowedRoots:[nextRoot]};
    throw new Error('persistence failed');
  });
  try {
    const response=await fetch(base+'/api/settings',{method:'PUT',headers:{authorization:'test','content-type':'application/json'},body:JSON.stringify({vault:{allowedRoots:[nextRoot]}})});
    expect(response.status).toBe(500);
    expect(coordinator.switchVault).toHaveBeenCalledWith(original.path);
    expect(releaseGate).toHaveBeenCalledOnce();
  } finally {settings.vault=original;}
});
it('preserves legacy reindex response only after the job completes',async()=>{
  const response=await fetch(base+'/api/reindex',{method:'POST',headers:{authorization:'test'}});
  expect(await response.json()).toEqual({ok:true});expect(coordinator.requestJob).toHaveBeenCalledWith('rebuild');expect(coordinator.waitForJob).toHaveBeenCalledWith('one');
});
