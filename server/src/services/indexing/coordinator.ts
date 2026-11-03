import path from 'node:path';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import type { IndexStatus, InventoryRecord, VaultIdentity, FileStamp } from './types.js';
import type { IndexProjection } from './projection.js';
import { scanInventory, readStableNote, sameStamp, isMarkdown, isVisiblePath, readFileStamp } from './inventory.js';
import { indexingConfig } from './config.js';
import { watchVault } from './watcher.js';
import { needsMaintenance } from './maintenance.js';
import { config } from '../../config.js';
import { broadcast } from '../realtime.js';
import { clearStatCache, invalidateStat } from '../vault.js';

type Options={watch?:boolean;snapshotPath?:string;allowedRoots?:string[];reconcileMs?:number;auditMs?:number};
export class IndexCoordinator {
  private started=false; private switching=false; private transitionGuards=0;
  private switchChain=Promise.resolve(); private switchCount=0;
  get isStarted(){return this.started||this.switching||this.transitionGuards>0;}
  private root=''; private epoch=0; private projection?:IndexProjection;
  private records=new Map<string,InventoryRecord>(); private pending=new Set<string>();
  private missing=new Map<string,number>(); private retryCounts=new Map<string,number>();
  private timers=new Set<ReturnType<typeof setTimeout>>();
  private watcher?:ReturnType<typeof watchVault>; private chain=Promise.resolve();
  private jobs=new Map<string,{id:string;promise:Promise<void>}>(); private finished=new Map<string,Promise<void>>();
  private debounce?:ReturnType<typeof setTimeout>; private firstPending=0;
  private saveTimer?:ReturnType<typeof setTimeout>; private dirtySince=0;
  private changes=0; private builtAt=Date.now(); private maintenanceRetryAt=0;
  private state:IndexStatus={phase:'starting',available:false,initialScanComplete:false,generation:'',revision:0,watcherMode:'native',indexedNotes:0,pendingPaths:0,errorCount:0,lastReconcileAt:null,lastHashAuditAt:null,persistenceError:false};
  private explicitRoots:boolean;
  constructor(private options:Options={}) {this.explicitRoots=options.allowedRoots!==undefined;}
  beginTransition():()=>void {this.transitionGuards++;let released=false;return ()=>{if(!released){released=true;this.transitionGuards--;}};}
  status():IndexStatus{return {...this.state,pendingPaths:this.pending.size};}
  assertReady(preliminary=false):void {
    if(!this.isStarted)return;
    if(this.switching||this.transitionGuards>0)throw Object.assign(new Error('INDEX_NOT_READY'),{status:503});
    if(!this.state.available||(!preliminary&&!this.state.initialScanComplete))throw Object.assign(new Error('INDEX_NOT_READY'),{status:503});
  }
  private later(fn:()=>void,ms:number){const t=setTimeout(()=>{this.timers.delete(t);fn();},ms);t.unref();this.timers.add(t);return t;}
  private lastEmit=0; private emitTimer?:ReturnType<typeof setTimeout>;
  private emit(){
    this.state.indexedNotes=this.projection?.noteCount??0;
    if(!this.isStarted)return;
    if(this.emitTimer)return;
    const send=()=>{this.emitTimer=undefined;this.lastEmit=Date.now();broadcast({type:'index',status:this.status()});};
    if(Date.now()-this.lastEmit>=250)send();else this.emitTimer=this.later(send,250-(Date.now()-this.lastEmit));
  }
  private error(){this.state.errorCount++;this.state.phase='degraded';this.emit();}
  private enqueue(action:()=>Promise<void>):Promise<void>{const work=this.chain.then(action);this.chain=work.catch(()=>{this.error();});return work;}
  async start(root:string):Promise<void>{
    if(this.isStarted)await this.close();
    const settings=indexingConfig();
    if(!this.explicitRoots){const {getSettings}=await import('../settings.js');this.options.allowedRoots=[...(await getSettings()).vault.allowedRoots];}
    this.root=path.resolve(root);this.started=true;const epoch=++this.epoch;
    clearStatCache();
    this.projection=undefined;this.records.clear();this.pending.clear();this.missing.clear();this.retryCounts.clear();this.changes=0;
    this.state={phase:'starting',available:false,initialScanComplete:false,generation:randomUUID(),revision:0,watcherMode:settings.polling?'polling':'native',indexedNotes:0,pendingPaths:0,errorCount:0,lastReconcileAt:null,lastHashAuditAt:null,persistenceError:false};
    const rootNow=this.root;
    if(this.options.watch!==false)this.watcher=watchVault(rootNow,settings.polling,(rel,event)=>{
      this.notify({root:rootNow,paths:[rel],source:'watcher'});broadcast({type:'fs',event,path:rel});
    },polling=>{if(epoch!==this.epoch)return;this.state.watcherMode=polling?'polling':'native';if(this.state.initialScanComplete)this.requestJob('reconcile');},()=>this.error());
    // Defer boot work so the caller can start listening before restore/scan.
    void this.enqueue(async()=>{
      await yieldTurn();if(epoch!==this.epoch)return;
      const [{IndexProjection},{loadSnapshot}]=await Promise.all([import('./projection.js'),import('./snapshot.js')]);
      const snapshot=await loadSnapshot(await this.identity(),this.options.snapshotPath);
      if(epoch!==this.epoch)return;
      let restored=false;
      if(snapshot){
        try{
          this.projection=IndexProjection.fromState(snapshot.projection);
          this.records=new Map(snapshot.records);this.changes=snapshot.changesSinceBuild;
          this.state.lastHashAuditAt=snapshot.lastHashAuditAt;
          const builtAt=Date.parse(snapshot.lastBuildAt??snapshot.savedAt);
          this.builtAt=Number.isFinite(builtAt)?builtAt:Date.now();
          this.state.revision=snapshot.revision;this.state.available=true;this.projection.publish();restored=true;
        }catch{/* Invalid or incompatible derived cache is rebuilt from Markdown. */}
      }
      if(!restored){this.projection=new IndexProjection();this.records.clear();this.changes=0;this.state.available=false;this.state.lastHashAuditAt=null;}
      await this.watcher?.ready;if(epoch!==this.epoch)return;
      await this.reconcile(false,false,epoch);
      do{await this.flush(epoch);}while(this.pending.size&&epoch===this.epoch);
      if(this.state.phase!=='degraded'&&!this.pending.size){this.state.initialScanComplete=true;this.state.phase='ready';}
      this.emit();await this.save(epoch);
      this.periodic('reconcile',this.options.reconcileMs??settings.reconcileMs,epoch);
      const auditMs=this.options.auditMs??settings.auditMs;
      const elapsed=this.state.lastHashAuditAt ? Date.now()-Date.parse(this.state.lastHashAuditAt) : auditMs;
      this.later(()=>{if(epoch!==this.epoch)return;void this.auditHashes().catch(()=>{});this.periodic('audit',auditMs,epoch);},Math.max(1000,auditMs-elapsed));
    }).catch(()=>{});
  }
  async switchVault(root:string){
    this.switchCount++;this.switching=true;this.state.initialScanComplete=false;this.state.available=false;
    const work=this.switchChain.then(async()=>{await this.close();await this.start(root);});
    this.switchChain=work.catch(()=>{});
    try{await work;}finally{this.switchCount--;this.switching=this.switchCount>0;}
  }
  private async identity():Promise<VaultIdentity>{return {root:await fs.realpath(this.root).catch(()=>this.root),policy:JSON.stringify({v:1,allowedRoots:this.options.allowedRoots??[]})};}
  notify(event:{root:string;paths:string[];source:'watcher'|'web'|'agent'}){
    if(!this.started||this.switching||this.transitionGuards>0||path.resolve(event.root)!==this.root)return;
    for(const rel of event.paths)if(isVisiblePath(rel)){invalidateStat(rel);if(this.pending.size>=10000){this.requestJob('reconcile');break;}this.pending.add(rel);}
    if(!this.firstPending)this.firstPending=Date.now();
    if(this.debounce){clearTimeout(this.debounce);this.timers.delete(this.debounce);}
    const epoch=this.epoch;
    this.debounce=this.later(()=>{this.debounce=undefined;this.firstPending=0;void this.enqueue(()=>this.flush(epoch)).catch(()=>{});},Math.min(250,Math.max(0,2000-(Date.now()-this.firstPending))));
  }
  private auditFlight?:Promise<void>;
  auditHashes():Promise<void>{
    if(this.auditFlight)return this.auditFlight;
    const epoch=this.epoch;
    const work=this.enqueue(()=>this.reconcile(false,true,epoch));
    this.auditFlight=work;
    void work.finally(()=>{if(this.auditFlight===work)this.auditFlight=undefined;}).catch(()=>{});
    return work;
  }
  private periodic(mode:'reconcile'|'audit',ms:number,epoch:number){this.later(()=>{if(epoch!==this.epoch)return;if(mode==='reconcile')this.requestJob('reconcile');else void this.auditHashes().catch(()=>{});this.periodic(mode,ms,epoch);},ms);}
  requestJob(mode:'reconcile'|'rebuild'):{jobId:string}{
    const active=this.jobs.get('rebuild')??this.jobs.get(mode);if(active)return {jobId:active.id};
    const id=randomUUID(),epoch=this.epoch;
    const promise=this.enqueue(async()=>{if(epoch!==this.epoch||!this.isStarted)throw Object.assign(new Error('INDEX_JOB_CANCELLED'),{status:503});await this.reconcile(mode==='rebuild',false,epoch);do{await this.flush(epoch);}while(this.pending.size&&epoch===this.epoch);if(this.state.phase==='degraded')throw Object.assign(new Error('INDEX_UPDATE_FAILED'),{status:503});if(this.state.phase==='ready'&&!this.pending.size){this.state.initialScanComplete=true;this.emit();}});
    this.jobs.set(mode,{id,promise});this.finished.set(id,promise);
    void promise.finally(()=>{if(this.jobs.get(mode)?.id===id)this.jobs.delete(mode);if(this.finished.size>100)this.finished.delete(this.finished.keys().next().value!);}).catch(()=>{});
    return {jobId:id};
  }
  async waitForJob(id:string){const p=this.finished.get(id);if(!p)throw Object.assign(new Error('Unknown indexing job'),{status:404});await p;}
  async settled(){if(this.debounce){clearTimeout(this.debounce);this.timers.delete(this.debounce);this.debounce=undefined;await this.enqueue(()=>this.flush(this.epoch));}await this.chain;}
  private async update(rel:string,stamp:FileStamp,force:boolean,epoch:number,target=this.projection!,records=this.records):Promise<boolean>{
    const previous=records.get(rel);
    if(!force&&previous&&sameStamp(previous.stamp,stamp))return true;
    invalidateStat(rel);
    if(!isMarkdown(rel)){target.applyFile(rel);records.set(rel,{stamp});return true;}
    const result=await readStableNote(this.root,rel,previous?.sha256,this.options.allowedRoots);
    if(epoch!==this.epoch)return false;
    if(result.kind!=='ok'){this.error();this.retry(rel,epoch);return false;}
    if(result.parsed){target.applyNote(rel,result.parsed);if(previous)this.changes++;}
    const now=new Date().toISOString();records.set(rel,{stamp:result.stamp,sha256:result.sha256,lastReadAt:now,lastHashVerifiedAt:now});this.retryCounts.delete(rel);return true;
  }
  private retry(rel:string,epoch:number){const n=this.retryCounts.get(rel)??0;if(n>=3)return;this.retryCounts.set(rel,n+1);this.later(()=>{if(epoch===this.epoch)this.notify({root:this.root,paths:[rel],source:'watcher'});},[1000,5000,30000][n]);}
  private async reconcile(rebuild:boolean,audit:boolean,epoch:number){
    if(epoch!==this.epoch||!this.projection)return;
    this.state.phase=rebuild?'rebuilding':'reconciling';this.emit();
    const scan=await scanInventory(this.root,this.options.allowedRoots);if(epoch!==this.epoch)return;
    if(!scan.complete){this.error();return;}
    const now=Date.now();
    const absent=[...this.records.keys()].filter(p=>!scan.files.has(p));
    const mass=absent.length>0&&absent.length>=this.records.size*.5;
    let blocked=false;
    for(const rel of absent){const first=this.missing.get(rel);if(first===undefined){this.missing.set(rel,now);blocked=true;}else if(now-first<(mass?30000:5000))blocked=true;}
    if(mass&&blocked){this.error();this.later(()=>{if(epoch===this.epoch)this.requestJob('reconcile');},30000);return;}
    const {IndexProjection}=await import('./projection.js');
    const target=rebuild?new IndexProjection():this.projection;
    const records=rebuild?new Map<string,InventoryRecord>():this.records;
    let ok=true;
    for(const [rel,stamp] of scan.files){this.missing.delete(rel);if(!(await this.update(rel,stamp,rebuild||audit,epoch,target,records)))ok=false;await yieldTurn();if(epoch!==this.epoch)return;}
    if(rebuild&&!ok){this.error();return;}
    if(rebuild&&blocked){this.error();this.later(()=>{if(epoch===this.epoch)this.requestJob('rebuild');},5000);return;}
    for(const rel of absent){const first=this.missing.get(rel)!;if(now-first>=(mass?30000:5000)){target.remove(rel);records.delete(rel);this.missing.delete(rel);this.changes++;}}
    if(blocked)this.later(()=>{if(epoch===this.epoch)this.requestJob('reconcile');},5000);
    this.projection=target;this.records=records;target.publish();this.state.available=true;this.state.revision++;
    if(rebuild){this.changes=0;this.builtAt=now;}
    if(ok&&!blocked){this.state.lastReconcileAt=new Date().toISOString();this.state.phase='ready';if(audit)this.state.lastHashAuditAt=new Date().toISOString();}
    else this.state.phase='degraded';
    this.emit();this.scheduleSave(epoch);this.maintain(epoch);
  }
  private async flush(epoch:number){
    if(epoch!==this.epoch||!this.projection)return;
    const paths=[...this.pending];this.pending.clear();if(!paths.length){if(this.state.phase==='ready')this.state.initialScanComplete=true;return;}
    let needsReconcile=false;
    for(const rel of paths){
      const result=await readFileStamp(this.root,rel,this.options.allowedRoots);
      if(epoch!==this.epoch)return;
      if(result.kind==='ok')await this.update(rel,result.stamp,true,epoch);
      else if(result.kind==='retry'){if(result.code!=='OUTSIDE_ROOTS'&&result.code!=='INVALID_PATH'){this.error();this.retry(rel,epoch);}}
      else needsReconcile=true;
      if(epoch!==this.epoch)return;
    }
    if(needsReconcile)await this.reconcile(false,false,epoch);
    if(epoch!==this.epoch)return;
    this.projection.publish();this.state.revision++;if(this.state.phase==='ready'&&!this.pending.size)this.state.initialScanComplete=true;this.emit();this.scheduleSave(epoch);this.maintain(epoch);
  }
  private maintain(epoch:number){if(!this.isStarted||epoch!==this.epoch)return;if(Date.now()<this.maintenanceRetryAt)return;if(needsMaintenance(this.changes,this.projection?.noteCount??0,this.builtAt,Date.now())){this.maintenanceRetryAt=Date.now()+1800000;this.requestJob('rebuild');}}
  private scheduleSave(epoch:number){
    if(!this.dirtySince)this.dirtySince=Date.now();
    if(this.saveTimer){clearTimeout(this.saveTimer);this.timers.delete(this.saveTimer);}
    this.saveTimer=this.later(()=>{this.saveTimer=undefined;this.dirtySince=0;void this.enqueue(()=>this.save(epoch)).catch(()=>{});},Math.min(2000,Math.max(0,30000-(Date.now()-this.dirtySince))));
  }
  private async save(epoch:number){
    if(epoch!==this.epoch||!this.state.available||!this.projection)return;
    const {saveSnapshot}=await import('./snapshot.js');
    try{await saveSnapshot({schemaVersion:1,parserVersion:1,identity:await this.identity(),generation:this.state.generation,revision:this.state.revision,savedAt:new Date().toISOString(),records:[...this.records],projection:this.projection.exportState(),lastHashAuditAt:this.state.lastHashAuditAt,changesSinceBuild:this.changes,lastBuildAt:new Date(this.builtAt).toISOString()},this.options.snapshotPath??path.join(config.dataDir,'vault-index-v1.json'));this.state.persistenceError=false;}
    catch{this.state.persistenceError=true;this.emit();}
  }
  async close(){
    if(!this.started)return;
    this.started=false;await this.watcher?.close();this.watcher=undefined;
    for(const timer of this.timers)clearTimeout(timer);this.timers.clear();this.debounce=undefined;this.saveTimer=undefined;
    await this.chain;await this.save(this.epoch);for(const timer of this.timers)clearTimeout(timer);this.timers.clear();this.firstPending=0;this.dirtySince=0;this.emitTimer=undefined;this.epoch++;this.pending.clear();this.jobs.clear();this.finished.clear();
  }
}
export const indexing=new IndexCoordinator();
