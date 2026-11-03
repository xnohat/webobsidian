import {promises as fs} from 'node:fs';
import {resolveInVault} from './vault.js';
export const MAX_CODE_FILE_BYTES=10*1024*1024;
export type CodeFileReadResult={kind:'text';path:string;content:string;highlightAllowed:boolean}|{kind:'unavailable';path:string;reason:'too-large'|'binary'|'encoding'};
export async function readCodeFile(rel:string):Promise<CodeFileReadResult>{
 const handle=await fs.open(await resolveInVault(rel),'r').catch(error=>{if(error.code==='ENOENT')error.status=404;throw error;});
 try{
  if(!(await handle.stat()).isFile())throw Object.assign(new Error('Not a file'),{status:400});
  const buffer=Buffer.alloc(MAX_CODE_FILE_BYTES+1);let count=0;
  while(count<buffer.length){const r=await handle.read(buffer,count,buffer.length-count,null);if(!r.bytesRead)break;count+=r.bytesRead;}
  const unavailable=(reason:'too-large'|'binary'|'encoding'):CodeFileReadResult=>({kind:'unavailable',path:rel,reason});
  if(count>MAX_CODE_FILE_BYTES)return unavailable('too-large');const bytes=buffer.subarray(0,count);
  if(bytes.includes(0))return unavailable('binary');
  try{const content=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);return {kind:'text',path:rel,content,highlightAllowed:content.length<=1_000_000};}catch{return unavailable('encoding');}
 }finally{await handle.close();}
}
