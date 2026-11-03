import {promises as fs} from 'node:fs';
import path from 'node:path';
import {z} from 'zod';
import {getVaultSettings} from './vault.js';

const preferenceSchemas = {
 attachmentFolderPath:z.string(),alwaysUpdateLinks:z.boolean(),newFileLocation:z.enum(['root','current','folder']),newFileFolderPath:z.string(),
 useMarkdownLinks:z.boolean(),newLinkFormat:z.enum(['shortest','relative','absolute']),userIgnoreFilters:z.array(z.string()),
 trashOption:z.enum(['local','system','none']),promptDelete:z.boolean(),deleteUnlinkedAttachments:z.enum(['ask','always','never']),
 showUnsupportedFiles:z.boolean(),readableLineLength:z.boolean(),baseFontSize:z.number().finite().min(6).max(100),mobileToolbarCommands:z.array(z.string()),deleteMode:z.enum(['trash','permanent']),
};
export type VaultPreferences = {[K in keyof typeof preferenceSchemas]:z.infer<(typeof preferenceSchemas)[K]>};
export type PreferenceSource = 'obsidian'|'webobsidian'|'default';
export interface VaultPreferencesResult {values:VaultPreferences;sources:Record<keyof VaultPreferences,PreferenceSource>;warnings:string[];vaultPath:string;blocked?:{attachmentUpload?:string}}
export const defaultVaultPreferences:VaultPreferences = {
 attachmentFolderPath:'./attachments',alwaysUpdateLinks:false,newFileLocation:'root',newFileFolderPath:'',useMarkdownLinks:false,newLinkFormat:'shortest',
 userIgnoreFilters:[],trashOption:'local',promptDelete:true,deleteUnlinkedAttachments:'ask',showUnsupportedFiles:false,readableLineLength:true,baseFontSize:16,mobileToolbarCommands:[],deleteMode:'trash',
};

async function readAppSettings(vaultPath:string,name:'app.json'|'appearance.json'='app.json'):Promise<{raw:Record<string,unknown>;exists:boolean}>{
 try{
  const file=path.join(vaultPath,'.obsidian',name);
  const real=await fs.realpath(file);const root=await fs.realpath(vaultPath);const relative=path.relative(root,real);
  if(relative.startsWith('..'+path.sep)||relative==='..'||path.isAbsolute(relative))throw Error('configuration resolves outside the vault');
  const parsed:unknown=JSON.parse(await fs.readFile(real,'utf8'));
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('expected an object');
  return {raw:parsed as Record<string,unknown>,exists:true};
 }catch(error){
  if((error as NodeJS.ErrnoException).code==='ENOENT')return {raw:{},exists:false};
  throw Object.assign(Error(`Could not read .obsidian/${name}: ${error instanceof Error?error.message:String(error)}`),{status:400});
 }
}
function attachmentRule(app:{raw:Record<string,unknown>;exists:boolean},attachmentDir:string):string{
 if(!app.exists)return `./${attachmentDir}`;
 const value=app.raw.attachmentFolderPath;
 if(value!==undefined&&typeof value!=='string')throw Object.assign(Error('Invalid Obsidian attachmentFolderPath in .obsidian/app.json'),{status:400});
 return value as string|undefined??'/';
}
/** Strict uploader policy. Unlike presentation fallbacks, malformed app.json blocks uploads. */
export async function getAttachmentFolderSetting(capturedVaultPath?:string):Promise<string>{
 const settings={vault:await getVaultSettings()};const root=path.resolve(capturedVaultPath??settings.vault.path);
 return attachmentRule(await readAppSettings(root),settings.vault.attachmentDir);
}

/** Read freshly on every operation: dotfiles are not covered by the ordinary vault watcher.
 * Capture the root once, so switching vaults cannot combine two vaults' configuration. */
export async function getVaultPreferences(capturedVaultPath?:string):Promise<VaultPreferencesResult> {
 const settings={vault:await getVaultSettings()};const vaultPath=path.resolve(capturedVaultPath??settings.vault.path);
 const values:VaultPreferences=structuredClone(defaultVaultPreferences);
 const sources=Object.fromEntries(Object.keys(values).map(k=>[k,'default'])) as VaultPreferencesResult['sources'];
 const warnings:string[]=[];
 const blocked:NonNullable<VaultPreferencesResult['blocked']>={};
 values.attachmentFolderPath=`./${settings.vault.attachmentDir}`;sources.attachmentFolderPath='webobsidian';
 values.deleteMode=settings.vault.deleteMode;sources.deleteMode='webobsidian';
 let raw:Record<string,unknown>={};
 try {
   const app=await readAppSettings(vaultPath);raw=app.raw;
   values.attachmentFolderPath=attachmentRule(app,settings.vault.attachmentDir);
   sources.attachmentFolderPath=raw.attachmentFolderPath!==undefined?'obsidian':app.exists?'default':'webobsidian';
 }catch(error){
   blocked.attachmentUpload=`${error instanceof Error?error.message:String(error)}. Attachment uploads are blocked until this is repaired; no fallback attachment location is active.`;
   warnings.push(blocked.attachmentUpload);
 }
 for(const key of Object.keys(preferenceSchemas) as (keyof VaultPreferences)[]){
   if(key==='deleteMode'||key==='attachmentFolderPath'||key==='baseFontSize'||!(key in raw))continue;
   const parsed=preferenceSchemas[key].safeParse(raw[key]);
   if(parsed.success){Object.assign(values,{[key]:parsed.data});sources[key]='obsidian';}
   else warnings.push(`Invalid .obsidian/app.json value for ${key}; ${sources[key]} fallback is active.`);
 }
 try{
   const appearance=await readAppSettings(vaultPath,'appearance.json');
   if('baseFontSize' in appearance.raw){
     const parsed=preferenceSchemas.baseFontSize.safeParse(appearance.raw.baseFontSize);
     if(parsed.success){values.baseFontSize=parsed.data;sources.baseFontSize='obsidian'}
     else warnings.push('Invalid .obsidian/appearance.json value for baseFontSize; default fallback is active.');
   }
 }catch(error){warnings.push(error instanceof Error?error.message:String(error))}
 if(settings.vault.followObsidianDeletion){
   // A malformed/missing deletion rule always uses recoverable trash.
   values.deleteMode=values.trashOption==='none'&&sources.trashOption==='obsidian'?'permanent':'trash';
   sources.deleteMode=sources.trashOption;
   if(values.trashOption==='system')warnings.push('Client system trash is unavailable on the server; recoverable .trash is active.');
 }else if(sources.trashOption==='obsidian'&&(values.trashOption==='none'?'permanent':'trash')!==values.deleteMode){
   warnings.push('Obsidian deletion differs from the saved WebObsidian choice. WebObsidian deletion remains active until following Obsidian is explicitly enabled.');
 }
 return {values,sources,warnings,vaultPath,blocked};
}
