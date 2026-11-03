import {listShares,type ShareRecord} from './shares.js';
import {indexedFilePaths} from './fileindex.js';
import {resolveReference} from './fileReferences.js';
import * as vault from './vault.js';
import {renderNoteHtml,decorateNoteHtml} from './renderhtml.js';
import {renderNoteEmbed,type RenderOpts} from './markdownTransclusion.js';

/** A parent publication never grants access to another note or its attachments. */
export async function createPublicNoteRenderer(content:string,root:ShareRecord,unlocked:(share:ShareRecord)=>Promise<boolean>,assetUrl?:(share:ShareRecord,target:string,source:string)=>string){
 const shares=(await listShares()).filter(share=>share.enabled),paths=indexedFilePaths();
 const contexts=new Map<string,ShareRecord>([[root.path,root]]),bodies=new Map<string,string>([[root.path,content]]);
 const permissions=new Map<string,boolean>();
 let remaining=64,bytes=0;
 const resolveEmbed=async(target:string,from=root.path,kind:'wiki'|'markdown'='wiki')=>{
  if(remaining--<=0||bytes>=2*1024*1024)return null;
  const path=resolveReference(target,from,paths,kind);
  if(!path||!/\.(md|markdown)$/i.test(path))return null;
  let child:ShareRecord|undefined=contexts.get(path);
  if(!child)for(const candidate of shares){
   if(candidate.path!==path)continue;
   if(!permissions.has(candidate.id))permissions.set(candidate.id,await unlocked(candidate));
   if(permissions.get(candidate.id)){child=candidate;break}
  }
  if(!child)return null;
  let body=bodies.get(path);
  if(body===undefined){body=await vault.readFileTextBounded(path,2*1024*1024-bytes).catch(()=>null)??undefined;if(body===undefined)return null}
  const size=Buffer.byteLength(body,'utf8');if(size>2*1024*1024-bytes)return null;
  bytes+=size;bodies.set(path,body);
  contexts.set(path,child);return {path,content:body};
 };
 const rawUrl:RenderOpts['rawUrl']=(target,source)=>{
  const share=contexts.get(source??root.path)??root;
  return assetUrl?.(share,target,source??root.path)??`/public/shares/${encodeURIComponent(share.id)}/file?path=${encodeURIComponent(target)}`;
 };
 const options:RenderOpts={rawUrl,sourcePath:root.path,resolveEmbed,noteEmbedLink:(path,fragment)=>{
  const share=contexts.get(path);return share?{shareId:share.id,href:`/share/${encodeURIComponent(share.id)}`+(fragment?'#'+encodeURIComponent(fragment):'')}:undefined;
 }};
 return {
  render:(text:string,source=root.path)=>renderNoteHtml(text,rawUrl,{...options,sourcePath:source}),
  embed:async(path:string,fragment='')=>{
   const target='/'+path.split('/').map(encodeURIComponent).join('/')+(fragment?'#'+encodeURIComponent(fragment.replace(/^#/,'')):'');
   const rendered=await renderNoteEmbed(target,options,0,'markdown'),share=contexts.get(path);
   return rendered&&share?{html:decorateNoteHtml(rendered.html),shareId:share.id,href:options.noteEmbedLink!(path,fragment.replace(/^#/,''))!.href}:null;
  },
 };
}

export async function renderPublicNoteHtml(content:string,root:ShareRecord,unlocked:(share:ShareRecord)=>Promise<boolean>):Promise<string>{
 return (await createPublicNoteRenderer(content,root,unlocked)).render(content);
}
