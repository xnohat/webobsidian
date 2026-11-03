import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {useStore} from '../src/lib/store';

for(const saved of ['page=2&selection=0,0,0,6','page=1&annotation=8R','restored-root']){
 test('PDF startup keeps one history entry before navigation: saved '+saved,async()=>{
  const path='Folder/report#one.pdf',initial='page=2&selection=0,0,0,6',writes:string[]=[],disposers:(()=>void)[]=[];
  const fromRoot=saved==='restored-root';const location={pathname:fromRoot?'/':'/note/Folder/report%23one.pdf',search:'',hash:fromRoot?'':'#'+initial};
  const write=(kind:string,url:string)=>{writes.push(kind+':'+url);const parsed=new URL(url,'http://fixture');Object.assign(location,{pathname:parsed.pathname,search:parsed.search,hash:parsed.hash})};
  Object.defineProperty(globalThis,'window',{configurable:true,value:{location,history:{replaceState:(_a:unknown,_b:string,url:string)=>write('replace',url),pushState:(_a:unknown,_b:string,url:string)=>write('push',url)},addEventListener:()=>{},setTimeout,clearTimeout}});
  const subscribe=useStore.subscribe,patch=mock.method(useStore,'subscribe',((...args:any[])=>{const dispose=(subscribe as any)(...args);disposers.push(dispose);return dispose}) as typeof subscribe);
  const original=useStore.getState().openFile;
  useStore.setState({activePath:null,tabs:[],openFile:async(p,options)=>{useStore.setState({activePath:p,tabs:[{path:p,title:'PDF',pdfFragment:options?.pdfFragment}]})}});
  try{
   const {restoreWorkspaceFromUrl}=await import('../src/lib/urlsync.ts?startup='+encodeURIComponent(saved));
   await restoreWorkspaceFromUrl(async()=>{useStore.setState({activePath:path,tabs:[{path,title:'PDF',pdfFragment:fromRoot?'page=1':saved}]})});
   const expected=fromRoot?['replace:/note/Folder/report%23one.pdf#page=1']:[];assert.equal(location.hash,fromRoot?'#page=1':'#'+initial);assert.deepEqual(writes,expected,'restore must keep one correct initial URL');
   await useStore.getState().openFile(path,{pdfFragment:'page=2&annotation=8R'});
   assert.deepEqual(writes,[...expected,'push:/note/Folder/report%23one.pdf#page=2&annotation=8R'],'the first user navigation must preserve the initial URL for Back');
  }finally{disposers.forEach(dispose=>dispose());patch.mock.restore();useStore.setState({openFile:original})}
 });
}
