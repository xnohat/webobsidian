import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {useStore} from '../src/lib/store';

for(const saved of ['^task','Parent#Section%20','restored-root','literal-block-url','literal-heading-url']){
 test('Note startup keeps one history entry before navigation: saved '+saved,async()=>{
  const path='Folder/Target#one.md',initial=saved==='literal-block-url'?'^task':saved==='literal-heading-url'?'Parent#Section%20':'%5Etask',writes:string[]=[],disposers:(()=>void)[]=[];
  const listeners:Record<string,()=>void>={};let opens=0;
  const fromRoot=saved==='restored-root';const location={pathname:fromRoot?'/':'/note/Folder/Target%23one.md',search:'',hash:fromRoot?'':'#'+initial};
  const write=(kind:string,url:string)=>{writes.push(kind+':'+url);const parsed=new URL(url,'http://fixture');Object.assign(location,{pathname:parsed.pathname,search:parsed.search,hash:parsed.hash})};
  Object.defineProperty(globalThis,'window',{configurable:true,value:{location,history:{replaceState:(_a:unknown,_b:string,url:string)=>write('replace',url),pushState:(_a:unknown,_b:string,url:string)=>write('push',url)},addEventListener:(type:string,fn:()=>void)=>{listeners[type]=fn},setTimeout,clearTimeout}});
  const subscribe=useStore.subscribe,patch=mock.method(useStore,'subscribe',((...args:any[])=>{const dispose=(subscribe as any)(...args);disposers.push(dispose);return dispose}) as typeof subscribe);
  const original=useStore.getState().openFile;
  useStore.setState({activePath:null,tabs:[],openFile:async(p,options)=>{opens++;useStore.setState({activePath:p,tabs:[{path:p,title:'Note'}],noteNavigation:options?.noteFragment!==undefined?{path:p,fragment:options.noteFragment,request:Date.now()}:null})}});
  try{
   const {restoreWorkspaceFromUrl}=await import('../src/lib/urlsync.ts?note-startup='+encodeURIComponent(saved));
   await restoreWorkspaceFromUrl(async()=>{useStore.setState({activePath:path,tabs:[{path,title:'Note'}],noteNavigation:{path,fragment:fromRoot?'^old':saved,request:1}})});
   const expected=fromRoot?['replace:/note/Folder/Target%23one.md#%5Eold']:[];assert.equal(location.hash,fromRoot?'#%5Eold':'#'+initial);assert.deepEqual(writes,expected,'restore must keep one correct initial URL');
   await useStore.getState().openFile(path,{noteFragment:'Parent#Section%20'});
   assert.deepEqual(writes,[...expected,'push:/note/Folder/Target%23one.md#Parent%23Section%2520'],'the first user navigation must preserve the initial URL for Back');
   const before=opens;location.hash='#%5Etask';listeners.popstate();listeners.hashchange();await new Promise(r=>setTimeout(r,0));assert.equal(useStore.getState().noteNavigation?.fragment,'^task');assert.equal(opens,before+1,'Back/hashchange navigates once');
   location.hash='#%E0%A4%A';listeners.hashchange();await new Promise(r=>setTimeout(r,0));assert.equal(useStore.getState().noteNavigation?.fragment,'%E0%A4%A','malformed encoding remains inert');
  }finally{disposers.forEach(dispose=>dispose());patch.mock.restore();useStore.setState({openFile:original})}
 });
}
