import { afterEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { IndexCoordinator } from './coordinator.js';
import {qmd} from '../search.js';
import * as inventory from './inventory.js';

const cleaners: (() => Promise<unknown>)[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const clean of cleaners.splice(0).reverse()) await clean(); });
async function fixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'index-coordinator-'));
  cleaners.push(() => fs.rm(dir, {recursive:true,force:true}));
  const root = path.join(dir,'vault'); await fs.mkdir(root);
  const index = new IndexCoordinator({watch:false,snapshotPath:path.join(dir,'cache.json')});
  cleaners.push(() => index.close());
  return {root,index};
}
describe('index coordinator', () => {
  it('serves readiness errors until initial reconciliation, then indexes external changes', async () => {
    const {root,index} = await fixture();
    await fs.writeFile(path.join(root,'ЕЦП.md'),'# ЕЦП\nquartzunique');
    await index.start(root);
    expect(() => index.assertReady()).toThrow('INDEX_NOT_READY');
    await index.settled();
    expect(index.status().initialScanComplete).toBe(true);
    expect((await qmd.search('quartzunique')).length).toBe(1);
    await fs.writeFile(path.join(root,'ЕЦП.md'),'# ЕЦП\nmercuryunique');
    index.notify({root,paths:['ЕЦП.md'],source:'watcher'});
    await index.settled();
    expect((await qmd.search('mercuryunique')).length).toBe(1);
    expect((await qmd.search('quartzunique')).length).toBe(0);
  });
  it('restores an empty valid cache and reconciles files added offline', async () => {
    const {root,index} = await fixture();
    await index.start(root); await index.settled(); await index.close();
    await fs.writeFile(path.join(root,'Offline.md'),'offlineuniqueterm');
    await index.start(root); await index.settled();
    expect((await qmd.search('offlineuniqueterm')).length).toBe(1);
  });
  it('rejects foreign vault notifications and closes timers across switches', async () => {
    const {root,index} = await fixture();
    await fs.writeFile(path.join(root,'Same.md'),'quartzmarker');
    await index.start(root); await index.settled();
    const next = root+'-next'; await fs.mkdir(next);
    await fs.writeFile(path.join(next,'Same.md'),'jupiterword');
    await index.switchVault(next); await index.settled();
    index.notify({root,paths:['Same.md'],source:'agent'}); await index.settled();
    expect((await qmd.search('quartzmarker')).length).toBe(0);
    expect((await qmd.search('jupiterword')).length).toBe(1);
    await index.close(); expect(index.isStarted).toBe(false);
  });
  it('retains last successful data on unavailable storage and deduplicates jobs', async () => {
    const {root,index} = await fixture();
    await fs.writeFile(path.join(root,'Note.md'),'retainedunique');
    await index.start(root); await index.settled();
    await fs.rename(root,root+'-offline');
    const a=index.requestJob('reconcile'), b=index.requestJob('reconcile');
    expect(a.jobId).toBe(b.jobId);
    await expect(index.waitForJob(a.jobId)).rejects.toThrow('INDEX_UPDATE_FAILED');
    expect(index.status().phase).toBe('degraded');
    expect((await qmd.search('retainedunique')).length).toBe(1);
  });
  it('removes absent notes only after a second successful inventory', async () => {
    const {root,index}=await fixture();await fs.writeFile(path.join(root,'A.md'),'disappearword');
    await index.start(root);await index.settled();await fs.unlink(path.join(root,'A.md'));
    await expect(index.waitForJob(index.requestJob('reconcile').jobId)).rejects.toThrow('INDEX_UPDATE_FAILED');
    expect((await qmd.search('disappearword')).length).toBe(1);
    const future=Date.now()+31000;vi.spyOn(Date,'now').mockReturnValue(future);
    await index.waitForJob(index.requestJob('reconcile').jobId);
    expect((await qmd.search('disappearword')).length).toBe(0);
  });
  it('audits content even when its recorded metadata matches', async () => {
    const {root,index}=await fixture();const file=path.join(root,'A.md');
    await fs.writeFile(file,'quartzword');await index.start(root);await index.settled();
    await fs.writeFile(file,'jupiterword');
    // Simulate metadata-preserving external writer by recording current stamps
    // without consuming its content, as can happen with a stale stat cache.
    const {readFileStamp}=await import('./inventory.js');const stamp=await readFileStamp(root,'A.md');
    const records=(index as unknown as {records:Map<string,{stamp:unknown}>}).records;
    if(stamp.kind==='ok')records.get('A.md')!.stamp=stamp.stamp;
    await index.waitForJob(index.requestJob('reconcile').jobId);
    expect((await qmd.search('quartzword')).length).toBe(1);
    await index.auditHashes();
    expect((await qmd.search('quartzword')).length).toBe(0);
    expect((await qmd.search('jupiterword')).length).toBe(1);
  });
  it('warm startup reads no unchanged Markdown bodies and gates settings transitions',async()=>{
    const {root,index}=await fixture();await fs.writeFile(path.join(root,'Warm.md'),'warmcacheword');
    await index.start(root);await index.settled();await index.close();
    const reader=vi.spyOn(inventory,'readStableNote');
    await index.start(root);await index.settled();
    expect(reader).not.toHaveBeenCalled();expect((await qmd.search('warmcacheword')).length).toBe(1);
    const release=index.beginTransition();expect(index.isStarted).toBe(true);
    expect(()=>index.assertReady(true)).toThrow('INDEX_NOT_READY');
    release();expect(()=>index.assertReady()).not.toThrow();
  });
  it('deduplicates queued and running hash audits on slow storage',async()=>{
    const {root,index}=await fixture();await fs.writeFile(path.join(root,'A.md'),'auditsingleflight');
    await index.start(root);await index.settled();
    const reader=vi.spyOn(inventory,'readStableNote');
    await Promise.all([index.auditHashes(),index.auditHashes(),index.auditHashes()]);
    expect(reader).toHaveBeenCalledTimes(1);
  });
  it('rebuilds when a structurally valid cache cannot be deserialized',async()=>{
    const {root,index}=await fixture();await fs.writeFile(path.join(root,'A.md'),'recovercachedword');
    await index.start(root);await index.settled();await index.close();
    const {IndexProjection}=await import('./projection.js');
    vi.spyOn(IndexProjection,'fromState').mockImplementationOnce(()=>{throw new Error('Incompatible index');});
    await index.start(root);await index.settled();
    expect(index.status().initialScanComplete).toBe(true);
    expect((await qmd.search('recovercachedword')).length).toBe(1);
  });
});

