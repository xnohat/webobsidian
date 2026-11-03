import chokidar from 'chokidar';
import path from 'node:path';
import { isVisiblePath } from './inventory.js';

/** Owns the active handle even after native → polling replacement. */
export function watchVault(root:string, polling:boolean, changed:(rel:string,event:string)=>void, recovered:(polling:boolean)=>void, failed:()=>void) {
  let current:chokidar.FSWatcher | undefined;
  let closed=false;
  let fallingBack=false;
  let resolveReady!:()=>void;
  const ready=new Promise<void>(r=>{resolveReady=r;});
  function start(usePolling:boolean) {
    if(closed)return;
    current=chokidar.watch(root,{ignored:p=>{const rel=path.relative(root,p).split(path.sep).join('/');return !!rel&&!isVisiblePath(rel);},ignoreInitial:true,persistent:true,usePolling,interval:1000,binaryInterval:3000,awaitWriteFinish:{stabilityThreshold:300,pollInterval:100}});
    current.on('ready',()=>{resolveReady();recovered(usePolling);});
    current.on('all',(event,p)=>{const rel=path.relative(root,p).split(path.sep).join('/');if(isVisiblePath(rel))changed(rel,event);});
    current.on('error',error=>{
      failed(); resolveReady();
      const code=(error as NodeJS.ErrnoException).code;
      if(!usePolling&&!fallingBack&&(code==='ENOSPC'||code==='EMFILE')) {
        fallingBack=true;
        const old=current; void old?.close().then(()=>start(true)).catch(()=>{failed();});
      }
    });
  }
  start(polling);
  return {ready,async close(){closed=true;resolveReady();await current?.close();}};
}
