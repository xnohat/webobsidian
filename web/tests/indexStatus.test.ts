import {test} from 'node:test';
import assert from 'node:assert/strict';
import {api} from '../src/lib/api';
import {applyIndexStatus, getIndexState, refreshIndexStatus, resetIndexStatus, indexStatusMessage} from '../src/lib/indexStatus';

const ready = {phase:'ready' as const,available:true,initialScanComplete:true,generation:'one',revision:3,watcherMode:'polling',indexedNotes:5,pendingPaths:0,errorCount:0,lastReconcileAt:null,lastHashAuditAt:null,persistenceError:false};
test('index state rejects older revision and reconnect invalidates results even without a revision change',async()=>{
 resetIndexStatus();applyIndexStatus(ready);applyIndexStatus({...ready,revision:2});
 assert.equal(getIndexState().status?.revision,3);
 const serial=getIndexState().refresh;
 api.indexStatus=async()=>ready;await refreshIndexStatus();
 assert.equal(getIndexState().refresh,serial+1);
 assert.equal(indexStatusMessage({...ready,phase:'degraded'}),'Index updates are delayed. Results may be outdated.');
 assert.match(indexStatusMessage({...ready,phase:'reconciling',initialScanComplete:false}),/Checking changes/);
});
test('a status request started before a vault reset cannot restore old vault status',async()=>{
 resetIndexStatus();let release!:(v:typeof ready)=>void;
 api.indexStatus=()=>new Promise(r=>{release=r});
 const pending=refreshIndexStatus();resetIndexStatus();release(ready);await pending;
 assert.equal(getIndexState().status,null);
});
test('an in-flight status fetch cannot undo a newer websocket generation',async()=>{
 resetIndexStatus();applyIndexStatus(ready);
 let release!:(v:typeof ready)=>void;api.indexStatus=()=>new Promise(r=>{release=r});
 const pending=refreshIndexStatus();applyIndexStatus({...ready,generation:'new-vault'});release(ready);await pending;
 assert.equal(getIndexState().status?.generation,'new-vault');
});
