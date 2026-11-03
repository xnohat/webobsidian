import * as vault from './vault.js';
import {contentVersion} from './noteversion.js';
import {findFileReferences} from './referenceScan.js';
import {getVaultPreferences} from './vaultPreferences.js';
export interface AttachmentDeleteInput {sourcePath:string;targetPath:string;sourceVersion:string;confirmedMode?:'trash'|'permanent';mayWrite?:(p:string)=>Promise<boolean>}
export async function deleteUnreferencedAttachment(input:AttachmentDeleteInput):Promise<{outcome:'kept'|'trashed'|'deleted';path:string}>{
 return vault.withVaultMutation(async()=>{
  const {sourcePath,targetPath,sourceVersion}=input;
  if(!sourcePath||!targetPath||!sourceVersion||sourcePath===targetPath||/\.(md|markdown|canvas)$/i.test(targetPath))throw Object.assign(Error('Invalid attachment deletion request'),{status:400});
  await vault.resolveInVault(sourcePath);await vault.resolveInVault(targetPath);
  if(input.mayWrite&&(!(await input.mayWrite(sourcePath))||!(await input.mayWrite(targetPath))))throw Object.assign(Error('Read-only path'),{status:423});
  if(contentVersion(await vault.readFileText(sourcePath))!==sourceVersion)throw Object.assign(Error('Source changed; attachment kept'),{status:409});
  const {values}=await getVaultPreferences(await vault.getVaultRoot());
  if((await findFileReferences(targetPath)).length)return {outcome:'kept',path:targetPath};
  if(contentVersion(await vault.readFileText(sourcePath))!==sourceVersion)throw Object.assign(Error('Source changed; attachment kept'),{status:409});
  if(values.deleteMode==='permanent'&&input.confirmedMode==='permanent'){await vault.remove(targetPath);return {outcome:'deleted',path:targetPath};}
  await vault.trash(targetPath);return {outcome:'trashed',path:targetPath};
 });
}
