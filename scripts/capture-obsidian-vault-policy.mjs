// Optional native contract capture. Uses a fresh synthetic vault and profile only.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn} from 'node:child_process';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'webobsidian-policy-'));
const profile=path.join(root,'profile'),vault=path.join(root,'vault');
await fs.mkdir(profile,{recursive:true});await fs.mkdir(path.join(vault,'.obsidian'),{recursive:true});
await fs.writeFile(path.join(vault,'.obsidian','app.json'),JSON.stringify({promptDelete:false,trashOption:'local'}));
await fs.writeFile(path.join(profile,'obsidian.json'),JSON.stringify({vaults:{syntheticpolicy:{path:vault,open:true,ts:Date.now()}}}));
await fs.copyFile(path.join(os.homedir(),'AppData/Roaming/obsidian/obsidian-1.14.5.asar'),path.join(profile,'obsidian-1.14.5.asar'));
const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
const child=spawn('C:/Program Files/Obsidian/Obsidian.exe',[`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1','--disable-background-timer-throttling'],{windowsHide:true,stdio:'ignore'});
let socket;
try {
 let target;for(let i=0;i<80;i++){try{target=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.type==='page'&&t.url==='app://obsidian.md/index.html');}catch{}if(target)break;await new Promise(r=>setTimeout(r,250));}
 if(!target)throw Error('No isolated renderer');socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
 let seq=0;const pending=new Map();socket.addEventListener('message',e=>{const value=JSON.parse(e.data),p=pending.get(value.id);if(p){pending.delete(value.id);value.error?p.reject(value.error):p.resolve(value.result);}});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(pending.delete(id))reject(Error(`timeout ${method}`));},20000).unref();});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 let info;for(let i=0;i<80;i++){info=await evaluate('typeof app!=="undefined"&&app.workspace?.layoutReady?({path:app.vault.adapter.getBasePath()}):null');if(info)break;await new Promise(r=>setTimeout(r,250));}
 if(path.resolve(info?.path??'')!==path.resolve(vault))throw Error('Wrong vault; refusing mutation');
 const result=await evaluate(`(async()=>{
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const waitCache=async()=>{await sleep(200);await new Promise(r=>app.metadataCache.onCleanCache(r));};
 const cases=[];
 for(const policy of ['never','always','ask']){
  app.vault.setConfig('deleteUnlinkedAttachments',policy);app.vault.setConfig('promptDelete',false);app.vault.setConfig('trashOption','local');
  const image=await app.vault.createBinary(policy+'-embed.png',new Uint8Array([1,2,3]).buffer);
  const note=await app.vault.create(policy+'-embed.md','![[ '+image.path+' ]]'.replace(/\\[\\[ /,'[[').replace(/ \\]\\]/,']]'));
  await app.workspace.getLeaf(false).openFile(note);await waitCache();
  const view=app.workspace.activeLeaf.view;view.editor.setValue('# Embed removed');await view.save();await waitCache();
  cases.push({action:'remove-embed',policy,attachmentExists:!!app.vault.getFileByPath(image.path)});
  const attachment=await app.vault.createBinary(policy+'-delete.png',new Uint8Array([1,2,3]).buffer);
  const target=await app.vault.create(policy+'-delete.md','![[ '+attachment.path+' ]]'.replace(/\\[\\[ /,'[[').replace(/ \\]\\]/,']]'));
  await waitCache();let done=false;
  const task=app.fileManager.promptForDeletion(target).then(v=>{done=true;return v;});
  let dialog=null;
  for(let i=0;i<50&&!done;i++){await sleep(100);const modal=document.querySelector('.modal-container');if(modal){dialog=modal.innerText;const button=modal.querySelector('button.mod-cta');if(button)button.click();}}
  if(!done)throw Error('Deletion prompt did not complete: '+dialog);
  await task;await waitCache();
  cases.push({action:'delete-note',policy,noteExists:!!app.vault.getFileByPath(target.path),attachmentExists:!!app.vault.getFileByPath(attachment.path),promptShown:dialog!==null});
 }
 const exclusions=[];
 for(const [filter,target] of [[' archive ','Archives.md'],['Archive','Other/Archive.md'],['/draft\\\\.md$/','Notes/Draft.md'],['*.md','Notes/a.md']]){app.vault.setConfig('userIgnoreFilters',[filter]);app.metadataCache.updateUserIgnoreFilters();exclusions.push({filter,target,ignored:app.metadataCache.isUserIgnored(target)});}
 return {version:app.appVersion??'1.14.5',cases,exclusions};
})()`);
 await fs.mkdir('tests/fixtures/settings',{recursive:true});await fs.writeFile('tests/fixtures/settings/obsidian-vault-policy.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({root,...result}));
} finally {socket?.close();child.kill();}
