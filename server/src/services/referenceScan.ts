import * as vault from './vault.js';
import {promises as fs} from 'node:fs';
import {parseFileReferences,resolveReference} from './fileReferences.js';
export async function referenceSnapshot():Promise<{paths:string[];documents:Map<string,string>}>{
 const paths:string[]=[];
 const root=await vault.getVaultRoot(),trash=vault.toRel(root,await vault.getTrashRoot());
 const walk=async(directory:string,ancestors:Set<string>):Promise<void>=>{
  const abs=await vault.resolveInVault(directory),real=await fs.realpath(abs);
  if(ancestors.has(real))throw Error(`Cyclic directory prevents a complete reference scan: ${directory}`);
  const visited=new Set(ancestors).add(real);
  for(const entry of (await fs.readdir(abs,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
   const relative=directory?`${directory}/${entry.name}`:entry.name;
   // Hide presentation dotfiles in the explorer, never in safety checks. Only
   // application/git metadata and deleted files are outside the live inventory.
   if(entry.name.toLowerCase()==='.git'||relative==='.obsidian'||relative==='.webobsidian-rename'||relative===trash)continue;
   const target=await vault.resolveInVault(relative),stat=await fs.stat(target);
   if(stat.isDirectory())await walk(relative,visited);
   else if(stat.isFile())paths.push(relative);
   else throw Error(`Unsupported entry prevents a complete reference scan: ${relative}`);
  }
 };
 await walk('',new Set());
 const documents=new Map<string,string>();
 for(const p of paths)if(/\.(md|markdown|canvas)$/i.test(p))documents.set(p,await vault.readFileText(p));
 return {paths,documents};
}
export function referencedPaths(content:string,source:string,paths:string[]):string[]{
 const canvas=/\.canvas$/i.test(source);const refs=parseFileReferences(content,canvas).map(r=>canvas&&paths.includes(r.target)?r.target:resolveReference(r.target,source,paths,r.kind)).filter((v):v is string=>!!v);
 if(canvas){const parsed=JSON.parse(content);for(const node of parsed.nodes??[])if(typeof node.text==='string')refs.push(...referencedPaths(node.text,source.replace(/\.canvas$/i,'.md'),paths));}
 return refs;
}
export async function findFileReferences(target:string,exclude=''):Promise<string[]>{
 return (await fileReferenceReport(target,exclude)).references;
}
export async function fileReferenceReport(target:string,exclude='',sourceContent?:string):Promise<{references:string[];sourceReferences:number}>{
 const {paths,documents}=await referenceSnapshot();const refs:string[]=[];
 for(const [p,c] of documents)if(p!==exclude&&referencedPaths(c,p,paths).includes(target))refs.push(p);
 return {references:refs,sourceReferences:sourceContent===undefined?0:referencedPaths(sourceContent,exclude,paths).filter(p=>p===target).length};
}
