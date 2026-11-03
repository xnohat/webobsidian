import path from 'node:path';
import * as vault from './vault.js';
import {indexedFilePaths,resolveFile} from './fileindex.js';
import {markdownImages,markdownEmbedTarget,protectMarkdown,stripObsidianComments} from './markdownContext.js';

export function localEmbedTargets(source:string):string[]{
 const protectedSource=protectMarkdown(stripObsidianComments(source)),targets=new Set<string>();
 const images=markdownImages(protectedSource.text);
 for(const match of protectedSource.text.matchAll(/!\[\[([^\]]+?)\]\]/g)){
  if(images.some(image=>match.index!>=image.from&&match.index!<image.to))continue;
  const target=protectedSource.restore(match[1]).split('|')[0].split('#')[0].trim();if(target)targets.add(target);
 }
 for(const image of images){const target=markdownEmbedTarget(protectedSource.restore(image.url));if(!target.external&&target.path)targets.add(target.path)}
 return [...targets];
}

export function canvasAttachmentReferences(raw:string):{target:string;rooted:boolean}[]{
 let nodes:unknown;try{nodes=JSON.parse(raw)?.nodes}catch{return []}
 if(!Array.isArray(nodes))return [];
 const refs:{target:string;rooted:boolean}[]=[];
 for(const node of nodes){
  if(!node||typeof node!=='object')continue;
  if(node.type==='file'&&typeof node.file==='string'&&!/\.(md|markdown)$/i.test(node.file))refs.push({target:node.file,rooted:true});
  if(node.type==='text'&&typeof node.text==='string')refs.push(...localEmbedTargets(node.text).map(target=>({target,rooted:false})));
 }
 return refs;
}

/** Canvas JSON file fields are literal vault-root paths, including % and #. */
export async function resolveCanvasFile(target:string):Promise<string|null>{
 const rel=path.posix.normalize(target.replace(/^\/+/,''));
 if(!rel||rel==='.'||rel==='..'||rel.startsWith('../')||rel.includes('\0'))return null;
 if(await vault.exists(rel).catch(()=>false))return rel;
 return indexedFilePaths().find(p=>p.toLowerCase()===rel.toLowerCase())??null;
}

export async function resolvePublicAttachment(target:string,source:string):Promise<string|null>{
 if(target.startsWith('/'))return resolveCanvasFile(target);
 const candidate=path.posix.normalize(path.posix.join(path.posix.dirname(source),target));
 if(candidate&&!candidate.startsWith('..')&&!path.posix.isAbsolute(candidate)&&await vault.exists(candidate).catch(()=>false))return candidate;
 if(await vault.exists(target).catch(()=>false))return target;
 return resolveFile(target)??null;
}
