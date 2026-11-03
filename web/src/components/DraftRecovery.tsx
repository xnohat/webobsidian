import {t as uiText, useLanguage} from "../lib/i18n/runtime";
import {confirmDialog} from '../lib/confirm';
import {useEffect,useRef,useState} from 'react';
import {useVisualViewport} from '../lib/useVisualViewport';
import {useStore,documentSessions,loadDraftScope,resetDraftScope,draftScopeEpoch,isDraftScopeCurrent,assertDraftScope} from '../lib/store';
import {listDrafts,deleteDraftIfRevision} from '../lib/drafts/storage';
import {removeSavedDrafts} from '../lib/drafts/cleanup';
import {loadConflict,type ConflictSession} from '../lib/conflicts';
import type {DraftRecord} from '../lib/drafts/types';
import ConflictResolver from './ConflictResolver';
function exportText(path:string,content:string){const url=URL.createObjectURL(new Blob([content],{type:'text/plain;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=path.split('/').pop()||'draft.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export default function DraftRecovery(){
  const languageRevision = useLanguage().revision;

 const viewport=useVisualViewport();const path=useStore(s=>s.activePath),authed=useStore(s=>s.authed),dirty=useStore(s=>s.dirty);
 const [records,setRecords]=useState<DraftRecord[]>([]),[expanded,setExpanded]=useState(false),[error,setError]=useState(''),[conflict,setConflict]=useState<ConflictSession|null>(null),[,tick]=useState(0);
 const mounted=useRef(false),request=useRef(0);
 const cleanupRunning=useRef(false),lastCleanup=useRef(0),reviewing=useRef<DraftRecord|null>(null);
 const conflictRef=useRef(conflict);conflictRef.current=conflict;
 const refresh=async(forceCleanup=false,paths?:ReadonlySet<string>)=>{const epoch=draftScopeEpoch(),id=++request.current;try{
  const scope=await loadDraftScope();const rows=await listDrafts(scope);
  if(!mounted.current||id!==request.current||!isDraftScopeCurrent(scope,epoch))return;
  setRecords(rows);setError('');
  if(cleanupRunning.current||!forceCleanup&&Date.now()-lastCleanup.current<30000)return;
  cleanupRunning.current=true;if(!paths)lastCleanup.current=Date.now();
  try {
   await removeSavedDrafts(paths?rows.filter(record=>paths.has(record.path)):rows,record=>{
    if(!mounted.current||!isDraftScopeCurrent(scope,epoch))return false;
    if(reviewing.current?.path===record.path||conflictRef.current?.source.path===record.path)return false;
    const live=documentSessions.get(record.path);
    return !live||live.key.writerId!==record.writerId||live.state==='saved';
   });
  }finally{cleanupRunning.current=false;}
  const remaining=await listDrafts(scope);
  if(mounted.current&&id===request.current&&isDraftScopeCurrent(scope,epoch))setRecords(remaining);
 }catch(e){if(mounted.current&&epoch===draftScopeEpoch()&&id===request.current)setError(uiText("webobsidian.local-drafts-unavailable-f45964")+String(e));}};
 useEffect(()=>{
  mounted.current=true;if(!authed){resetDraftScope();return()=>{mounted.current=false;};}
  let recheckTimer:ReturnType<typeof setTimeout>|undefined;
  const pendingPaths=new Set<string>();let fullRecheck=false;
  const recheck=(path?:string)=>{
   if(path)pendingPaths.add(path);else fullRecheck=true;
   clearTimeout(recheckTimer);recheckTimer=setTimeout(()=>{
    const paths=fullRecheck?undefined:new Set(pendingPaths);pendingPaths.clear();fullRecheck=false;void refresh(true,paths);
   },200);
  };
  const filesystem=(event:Event)=>recheck((event as CustomEvent<{path?:string}>).detail?.path);
  const focused=()=>recheck();
  const savedVersions=new Map([...documentSessions].map(([path,s])=>[path,s.state==='saved'?s.key.writerId+':'+s.baseVersion:null]));
  const invalidated=()=>{request.current++;lastCleanup.current=0;conflictRef.current=null;reviewing.current=null;setRecords([]);setConflict(null);setExpanded(false);setError('');void refresh();};
  const handler=()=>{tick(v=>v+1);for(const [path,s] of documentSessions){
   const version=s.state==='saved'?s.key.writerId+':'+s.baseVersion:null;if(version!==null&&savedVersions.get(path)!==version)recheck(path);savedVersions.set(path,version);
  }};
  const changed=()=>void refresh();
  const before=(e:BeforeUnloadEvent)=>{if(useStore.getState().dirty){e.preventDefault();e.returnValue='';}};
  const background=()=>{for(const s of documentSessions.values())if(s.state!=='saved')void s.flush().catch(()=>{});};
  window.addEventListener('draft-scope-change',invalidated);window.addEventListener('draft-status',handler);window.addEventListener('local-drafts-changed',changed);
  window.addEventListener('wo-fs',filesystem);window.addEventListener('focus',focused);
  window.addEventListener('beforeunload',before);document.addEventListener('visibilitychange',background);const timer=setInterval(changed,3000);void refresh();
  return()=>{mounted.current=false;request.current++;clearInterval(timer);clearTimeout(recheckTimer);window.removeEventListener('wo-fs',filesystem);window.removeEventListener('focus',focused);window.removeEventListener('draft-scope-change',invalidated);window.removeEventListener('draft-status',handler);window.removeEventListener('local-drafts-changed',changed);window.removeEventListener('beforeunload',before);document.removeEventListener('visibilitychange',background);};
 },[authed]);
 const session=path?documentSessions.get(path):undefined;
 const compare=async(record:DraftRecord)=>{const epoch=draftScopeEpoch();reviewing.current=record;try{const result=await loadConflict(record);if(mounted.current&&isDraftScopeCurrent(record.scopeId,epoch)){conflictRef.current=result;setConflict(result);}}catch(e){if(mounted.current&&epoch===draftScopeEpoch())setError(String(e));}finally{if(reviewing.current===record)reviewing.current=null;}};
 const discard=async(record:DraftRecord)=>{const epoch=draftScopeEpoch();try{
  if(!await confirmDialog(uiText("webobsidian.remove-this-browser-copy-e1e0eb"),{get confirmLabel(){return uiText("webobsidian.remove-copy-4f1f63");},danger:true,get detail(){return uiText("webobsidian.this-does-not-delete-or-change-the-file-in-your-be4caa");}}))return;
  assertDraftScope(record.scopeId,epoch);
  const removed=await deleteDraftIfRevision(record,record.revision);await refresh();
  if(!removed&&isDraftScopeCurrent(record.scopeId,epoch))setError(uiText("webobsidian.this-copy-changed-while-you-were-reviewing-it-re-33e030"));
 }catch(e){if(epoch===draftScopeEpoch())setError(String(e));}};
 if(!authed)return null;
 // A live editor's ordinary autosave is already represented by its save status.
 // Only detached copies and failed/conflicting saves need a recovery action.
 const recoverable=records.filter(record=>{
  const live=documentSessions.get(record.path);
  return !live||live.key.writerId!==record.writerId||['conflict','error','saved'].includes(live.state);
 });
 if(!session&&!dirty&&!error&&!recoverable.length&&!expanded)return null;
 return <><div className="draft-status" style={{bottom:viewport.bottom+(viewport.width<=700?60:24),right:viewport.right+12,maxWidth:Math.max(0,viewport.width-24),maxHeight:Math.max(36,viewport.height-80)}}>
 <span role="status">{session?.localError?uiText("webobsidian.browser-backup-failed-5b3f25"):session?({get modified(){return uiText("webobsidian.saving-changes-804053");},get saving(){return uiText("webobsidian.saving-to-vault-993b6e");},get local(){return uiText("webobsidian.backed-up-in-this-browser-saving-to-vault-7c35b6");},get saved(){return uiText("webobsidian.saved-to-vault-f158e0");},get conflict(){return uiText("webobsidian.changes-need-review-94185f");},get error(){return uiText("webobsidian.not-saved-to-vault-b031e1");}}[session.state]):dirty?uiText("webobsidian.saving-changes-804053"):error?uiText("webobsidian.recovery-copies-unavailable-33a975"):''}</span>
 {session?.localError&&<button onClick={()=>exportText(session.key.path,session.content)}>{uiText("webobsidian.export-unsaved-text-42fe26")}</button>}
 {session?.state==='conflict'&&<button onClick={()=>void compare(session.record())}>{uiText("webobsidian.resolve-conflict-8b7233")}</button>}
 {(recoverable.length>0||expanded)&&<button aria-expanded={expanded} aria-controls="unsaved-text-recovery" onClick={()=>{setExpanded(!expanded);void refresh();}}>{uiText("webobsidian.recover-unsaved-text-b2918d")}{recoverable.length})</button>}
 {error&&!expanded&&<span role="alert">{error}</span>}
 {expanded&&<section id="unsaved-text-recovery" style={{maxHeight:Math.max(40,viewport.height-160),maxWidth:Math.max(0,viewport.width-24)}} className="draft-list" aria-label={uiText("webobsidian.unsaved-text-recovery-222d50")}>
  <header><h2>{uiText("webobsidian.unsaved-text-recovery-222d50")}</h2><button onClick={()=>setExpanded(false)}>{uiText("interface.menu.close")}</button></header>
  <p>{uiText("webobsidian.these-browser-copies-may-contain-text-that-was-n-1fa7df")}</p>
  <p className="draft-list-help">{uiText("webobsidian.review-a-copy-to-recover-text-you-need-or-remove-d3d3d5")}</p>
  {error&&<p role="alert">{error}</p>}
  {!recoverable.length&&<p role="status">{uiText("webobsidian.no-text-needs-recovery-your-current-edits-are-sa-5718bc")}</p>}
  {recoverable.map(r=><article className="draft-recovery-item" key={[r.scopeId,r.path,r.writerId].join(':')}>
   <strong>{r.path}</strong><small>{uiText("webobsidian.browser-copy-976be5")} {new Date(r.updatedAt).toLocaleString()}</small>
   <p>{r.state==='conflict'?uiText("webobsidian.this-copy-could-not-be-saved-because-the-file-ch-f260e3"):r.state==='recovery'?uiText("webobsidian.you-left-a-recovery-in-progress-review-it-to-con-6bc1d3"):uiText("webobsidian.this-copy-was-kept-for-recovery-review-it-before-88ae08")}</p>
   <div className="draft-recovery-actions"><button className="btn" onClick={()=>void compare(r)}>{uiText("webobsidian.review-text-9fa54a")}</button><button className="btn secondary" onClick={()=>exportText(r.path,r.content)}>{uiText("webobsidian.download-copy-f779a1")}</button><button className="btn secondary" onClick={()=>void discard(r)}>{uiText("webobsidian.remove-browser-copy-2fa645")}</button></div>
  </article>)}
 </section>}</div>
 {conflict&&<ConflictResolver session={conflict} onClose={()=>{conflictRef.current=null;setConflict(null);void refresh(true);}}/>}</>;
}
