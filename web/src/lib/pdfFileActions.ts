import {t as uiText} from './i18n/runtime';
import {api} from './api';
import {useStore} from './store';
import {findNode} from './tree';
import {pathToUrl} from './urlsync';
import type {PdfMenuItem} from './pdfMenu';

function renamePdf(path:string):Promise<void>{
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.className='pdf-rename-dialog';dialog.setAttribute('aria-label',uiText("webobsidian.rename-pdf"));
  const form=document.createElement('form'),label=document.createElement('label'),input=document.createElement('input'),ok=document.createElement('button'),cancel=document.createElement('button'),error=document.createElement('div');
  label.textContent=uiText("webobsidian.new-name");input.value=path.split('/').pop()!.replace(/\.pdf$/i,'');input.required=true;label.append(input);
  ok.type='submit';ok.textContent=uiText("webobsidian.rename");cancel.type='button';cancel.textContent=uiText("dialogue.button-cancel");error.setAttribute('role','alert');form.append(label,error,ok,cancel);dialog.append(form);
  let pending=false;
  const done=()=>{dialog.remove();resolve()};cancel.onclick=()=>{if(!pending)done()};dialog.oncancel=e=>{e.preventDefault();if(!pending)done()};
  form.onsubmit=async e=>{
   e.preventDefault();if(pending)return;const value=input.value.trim();
   if(!value||/[\\/\u0000-\u001f]/.test(value)||value==='.'||value==='..'){error.textContent=uiText("webobsidian.file-name-without-path");return}
   const name=/\.pdf$/i.test(value)?value:value+'.pdf',dir=path.includes('/')?path.slice(0,path.lastIndexOf('/')+1):'';
   if(dir+name===path){done();return}
   pending=true;ok.disabled=true;cancel.disabled=true;
   try{await useStore.getState().renamePath(path,dir+name);done()}catch(reason){error.textContent=reason instanceof Error?reason.message:uiText("webobsidian.rename-file-failed");pending=false;ok.disabled=false;cancel.disabled=false}
  };
  (document.querySelector('.app')??document.body).append(dialog);dialog.showModal();input.focus();input.select();
 });
}

/** Only the authenticated app supplies vault actions; public readers import none. */
export function pdfFileActions(target:string,origin:string,options:{resolvedPath?:string;linkKind?:'wiki'|'markdown';fragment?:string}={}):()=>Promise<PdfMenuItem[]>{
 return async()=>{
  const path=options.resolvedPath??(options.linkKind==='markdown'?await api.resolve(target,origin,'markdown'):await api.resolveAttachment(target.split('#')[0],origin)).path;if(!path)throw Error(uiText("webobsidian.pdf-not-found"));
  const st=useStore.getState(),locked=!!findNode(st.tree,path)?.locked;
  const fragment=options.fragment??(options.resolvedPath?'':target.includes('#')?target.slice(target.indexOf('#')+1):'');
  const url=pathToUrl(path)+(fragment?'#'+fragment:'');
  return [
   {get label() {return uiText("webobsidian.pdf-71bf47a728");},icon:'tab',run:()=>useStore.getState().openFile(path,{preview:false,...(fragment?{pdfFragment:fragment}:{})})},
   {get label() {return uiText("interface.menu.open-to-the-right");},icon:'split',run:()=>useStore.getState().openToSide(path,'right',fragment?{pdfFragment:fragment}:undefined)},
   {get label() {return uiText("interface.menu.open-in-new-window");},icon:'window',run:()=>{window.open(url,'_blank','popup,noopener,noreferrer')}},
   {get label() {return uiText("webobsidian.rename");},icon:'rename',disabled:locked,run:()=>renamePdf(path)},
   {get label() {return uiText("webobsidian.move-file-to-ffc312");},icon:'folder',disabled:locked,run:()=>useStore.getState().setMovePath(path)},
   {label:st.bookmarks.includes(path)?uiText("webobsidian.remove-bookmark-7da720"):uiText("webobsidian.add-bookmark"),icon:'bookmark',run:()=>useStore.getState().toggleBookmark(path)},
   {get label() {return uiText("interface.menu.copy-path");},icon:'link',children:[
    {get label() {return uiText("webobsidian.vault-relative-path");},run:()=>navigator.clipboard.writeText(path)},
    {get label() {return uiText("webobsidian.browser-url");},run:()=>navigator.clipboard.writeText(new URL(url,location.origin).href)},
   ]},
   {get label() {return uiText("webobsidian.open-default-application");},icon:'window',disabled:true,get hint() {return uiText("webobsidian.os-command-unavailable");}},
   {get label() {return uiText("webobsidian.show-system-explorer");},icon:'folder',disabled:true,get hint() {return uiText("webobsidian.server-file-unavailable-in-explorer");}},
   {get label() {return uiText("webobsidian.reveal-file");},icon:'folder',run:()=>useStore.getState().revealInTree(path)},
  ];
 };
}
