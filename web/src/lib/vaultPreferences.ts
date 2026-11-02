import {useSyncExternalStore} from 'react';
import {parseToolbarConfig,type ToolbarConfigV1,type ToolbarNode} from './toolbar/config';

export interface VaultPreferences {
 attachmentFolderPath:string;alwaysUpdateLinks:boolean;newFileLocation:'root'|'current'|'folder';newFileFolderPath:string;
 useMarkdownLinks:boolean;newLinkFormat:'shortest'|'relative'|'absolute';userIgnoreFilters:string[];trashOption:'local'|'system'|'none';promptDelete:boolean;
 deleteUnlinkedAttachments:'ask'|'always'|'never';showUnsupportedFiles:boolean;readableLineLength:boolean;baseFontSize:number;mobileToolbarCommands:string[];deleteMode:'trash'|'permanent';
}
export type PreferenceSource='obsidian'|'webobsidian'|'default';
export interface VaultPreferencesResult {values:VaultPreferences;sources:Record<keyof VaultPreferences,PreferenceSource>;warnings:string[];vaultPath:string;blocked?:{attachmentUpload?:string}}
export const defaultVaultPreferences:VaultPreferences={attachmentFolderPath:'./attachments',alwaysUpdateLinks:false,newFileLocation:'root',newFileFolderPath:'',useMarkdownLinks:false,newLinkFormat:'shortest',userIgnoreFilters:[],trashOption:'local',promptDelete:true,deleteUnlinkedAttachments:'ask',showUnsupportedFiles:false,readableLineLength:true,baseFontSize:16,mobileToolbarCommands:[],deleteMode:'trash'};
function empty(vaultPath=''):VaultPreferencesResult{return {values:structuredClone(defaultVaultPreferences),sources:Object.fromEntries(Object.keys(defaultVaultPreferences).map(k=>[k,'default'])) as VaultPreferencesResult['sources'],warnings:[],vaultPath};}
let state:VaultPreferencesResult&{loading:boolean;error?:string}={...empty(),loading:true};
let epoch=0,request=0;
const listeners=new Set<()=>void>();let timer:ReturnType<typeof setInterval>|undefined;
function publish(next:typeof state){if(JSON.stringify(state)===JSON.stringify(next))return;state=next;for(const listener of listeners)listener();}
export function resetVaultPreferences(vaultPath=''){epoch++;publish({...empty(vaultPath),loading:true});}
export function getCachedVaultPreferences(){return state;}
export async function getVaultPreferences():Promise<VaultPreferencesResult>{
 const at=epoch,id=++request;
 try{
  const response=await fetch('/api/settings/vault-preferences',{credentials:'include',cache:'no-store'});
  if(!response.ok)throw Error(`Could not load vault preferences (${response.status}).`);
  const result=await response.json() as VaultPreferencesResult;
  if(!result.values||!result.sources||!Array.isArray(result.warnings)||typeof result.vaultPath!=='string')throw Error('Invalid vault preferences response.');
  if(at!==epoch)throw Error('The active vault changed while loading preferences. Repeat the action.');
  if(at===epoch&&id===request)publish({...result,loading:false});
  return result;
 }catch(error){if(at===epoch&&id===request)publish({...state,loading:false,error:error instanceof Error?error.message:String(error)});throw error;}
}
function subscribe(listener:()=>void){
  listeners.add(listener);
  if(listeners.size===1){void getVaultPreferences().catch(()=>{});timer=setInterval(()=>{void getVaultPreferences().catch(()=>{});},3000);}
  return ()=>{listeners.delete(listener);if(!listeners.size&&timer){clearInterval(timer);timer=undefined;}};
}
export function useVaultPreferences(){
 return useSyncExternalStore(subscribe,getCachedVaultPreferences,getCachedVaultPreferences);
}

/** Only known native Obsidian commands are mapped; unknown plugin commands remain visible in the report. */
export const mobileToolbarCommandMappings:Record<string,string>={
 'editor:undo':'editor-undo','editor:redo':'editor-redo','editor:toggle-bold':'toggle-bold','editor:toggle-italics':'toggle-italics',
 'editor:toggle-strikethrough':'toggle-strikethrough','editor:toggle-highlight':'toggle-highlight','editor:toggle-code':'editor:toggle-code',
 'editor:insert-link':'insert-link','editor:insert-wikilink':'editor:insert-wikilink','editor:insert-embed':'editor:insert-embed',
 'editor:attach-file':'editor:attach-file','editor:toggle-bullet-list':'toggle-bullet-list','editor:toggle-numbered-list':'toggle-numbered-list',
 'editor:toggle-checklist-status':'editor:toggle-checklist-status','editor:toggle-blockquote':'editor:toggle-blockquote',
 'editor:indent-list':'indent-list','editor:unindent-list':'undent-list','editor:insert-table':'editor:insert-table',
};
export function importMobileToolbarCommands(current:unknown,commands:string[]):{config:ToolbarConfigV1;unsupported:string[]}{
 const config=parseToolbarConfig(current);const unsupported:string[]=[];
 const nodes:ToolbarNode[]=[];const existing=new Set(config.layouts.mobile.items.map(n=>n.instanceId));
 const commandIds=new Set<string>();
 const collect=(items:ToolbarNode[])=>{for(const item of items){if(item.type==='command')commandIds.add(item.commandId);else if(item.type==='group')collect(item.children);}};
 collect(config.layouts.mobile.items);
 const count=(items:ToolbarNode[]):number=>items.reduce((n,item)=>n+1+(item.type==='group'?count(item.children):0),0);
 const existingCount=count(config.layouts.mobile.items);
 for(const [index,id] of commands.entries()){
  const mapped=mobileToolbarCommandMappings[id];
  if(!mapped){unsupported.push(id);continue;}
  const commandId=`editing-toolbar:${mapped}`;
  if(commandIds.has(commandId))continue;
  if(existingCount+nodes.length>=200){unsupported.push(id);continue;}
  let instanceId=`obsidian-import-${index}`;while(existing.has(instanceId))instanceId+='-copy';existing.add(instanceId);
  nodes.push({type:'command',instanceId,commandId});commandIds.add(commandId);
 }
 config.layouts.mobile.items.push(...nodes);
 return {config,unsupported};
}
