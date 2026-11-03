import {listShares,type ShareRecord} from './shares.js';
import * as vault from './vault.js';
import {renderCanvasHtml} from './rendercanvas.js';
import {escapeHtml} from './renderhtml.js';
import {createPublicNoteRenderer} from './publicNoteRendering.js';
import {resolveCanvasFile,resolvePublicAttachment,localEmbedTargets} from './publicAttachments.js';

const md=/\.(md|markdown)$/i,image=/\.(png|jpe?g|gif|svg|webp|bmp|ico|avif)$/i;
const audio=/\.(mp3|wav|m4a|3gp|flac|ogg|oga|opus)$/i,video=/\.(mp4|webm|ogv|mov|mkv)$/i;
const encodePath=(path:string)=>path.split('/').map(encodeURIComponent).join('/');

export async function renderPublicCanvasHtml(raw:string,boardPath:string,parent:ShareRecord,unlocked:(share:ShareRecord)=>Promise<boolean>,attachments:(share:ShareRecord,source:string)=>Promise<Set<string>>):Promise<string>{
 let scope=parent;
 if(parent.path!==boardPath)for(const share of await listShares()){
  if(share.enabled&&share.path===boardPath&&await unlocked(share)){scope=share;break}
 }
 const source=scope.path===boardPath?raw:await vault.readFileText(scope.path);
 const allowed=await attachments(scope,source);
 const url=(file:string)=>`/public/shares/${encodeURIComponent(scope.id)}/file?path=${encodeURIComponent('/'+file)}`;
 const textUrls=new Map<string,string>();
 const notes=await createPublicNoteRenderer(source,scope,unlocked,(share,target,from)=>{
  if(from!==boardPath)return `/public/shares/${encodeURIComponent(share.id)}/file?path=${encodeURIComponent(target)}`;
  // Text-card embeds are relative to the board, not the parent note that embeds it.
  // Resolution is performed below before text rendering so this remains synchronous.
  return textUrls.get(target)??`/public/shares/${encodeURIComponent(scope.id)}/file?path=${encodeURIComponent(target)}`;
 });
 const header=(label:string,href?:string)=>`<div class="canvas-file-head">${href?`<a class="canvas-file-source" href="${escapeHtml(href)}" aria-label="Open ${escapeHtml(label)}">${escapeHtml(label)}</a>`:`<span class="title">${escapeHtml(label)}</span>`}</div>`;
 let files=64;
 return renderCanvasHtml(raw,url,{expandFiles:false,shareId:scope.id,
  renderText:async(text)=>{
   for(const target of localEmbedTargets(text)){const file=await resolvePublicAttachment(target,boardPath);if(file)textUrls.set(target,url(file))}
   return notes.render(text,boardPath);
  },
  renderFile:async(file,subpath)=>{
   if(files--<=0)return null;
   const path=await resolveCanvasFile(file);if(!path)return null;
   const fragment=subpath.startsWith('#')?subpath:'';
   const name=(path.split('/').pop()??path).replace(md,''),label=name+(fragment?' › '+fragment.slice(1).split('#').join(' › '):'');
   if(md.test(path)){
    const note=await notes.embed(path,fragment);if(!note)return null;
    const title=fragment?'':`<div class="inline-title">${escapeHtml(name)}</div>`;
    const open=`<a class="canvas-file-open markdown-embed-link" href="${escapeHtml(note.href)}" title="Open embedded note" aria-label="Open embedded note"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6m0-6-7 7M9 21H3v-6m0 6 7-7"/></svg></a>`;
    return {shareId:note.shareId,html:`<div class="canvas-file-note">${header(label,note.href)}${open}<div class="canvas-file-body markdown-preview">${title}${note.html}</div></div>`};
   }
   if(!allowed.has(path))return null;
   const href=url(path)+fragment,head=header(label,href);let body:string;
   if(image.test(path))body=`<div class="canvas-file-img"><img src="${escapeHtml(href)}" alt="${escapeHtml(name)}" draggable="false" /></div>`;
   else if(/\.pdf$/i.test(path))body=`<div class="canvas-file-body"><a class="pdf-embed" data-link-kind="markdown" data-href="${escapeHtml('/'+encodePath(path))}" href="${escapeHtml(href)}">${escapeHtml(name)}</a></div>`;
   else if(audio.test(path)||video.test(path)){
    const tag=video.test(path)?'video':'audio';body=`<div class="canvas-file-body canvas-file-media"><${tag} src="${escapeHtml(href)}" controls${tag==='audio'?' controlslist="nodownload"':''} preload="metadata"></${tag}></div>`;
   }else body=`<div class="canvas-file-body canvas-file-generic"><a class="file-embed mod-generic" href="${escapeHtml(href)}">${escapeHtml(path.split('/').pop()??path)}</a></div>`;
   return {shareId:scope.id,pdf:/\.pdf$/i.test(path),html:`<div class="canvas-file-note">${head}${body}</div>`};
  },
 });
}
