import {t as uiText, useLanguage} from "../lib/i18n/runtime";
import {useEffect,useRef,useState} from 'react';
import {EditorState,Compartment} from '@codemirror/state';
import {EditorView,lineNumbers,drawSelection,keymap} from '@codemirror/view';
import {search,searchKeymap} from '@codemirror/search';
import {syntaxHighlighting,LanguageDescription} from '@codemirror/language';
import {languages} from '@codemirror/language-data';
import {getActiveEditor,setActiveEditor} from '../lib/activeEditor';
import {obsidianHighlightStyle} from '../lib/highlight';
import {api} from '../lib/api';
import {useStore} from '../lib/store';
import type {CodeFileReadResult} from '../lib/codeFiles';

export default function CodeFileView({path,result,language,lineNumbers:showLines,pane='main'}:{path:string;result:CodeFileReadResult|null;language:string;lineNumbers:boolean;pane?:'main'|'split'}){
  const languageRevision = useLanguage().revision;

 const host=useRef<HTMLDivElement>(null);const [note,setNote]=useState('');const [copyStatus,setCopyStatus]=useState('');
 useEffect(()=>{
  setNote('');setCopyStatus('');if(!host.current||result?.kind!=='text')return;
  let live=true;const compartment=new Compartment();
  const view=new EditorView({parent:host.current,state:EditorState.create({doc:result.content,extensions:[EditorState.readOnly.of(true),EditorView.editable.of(false),EditorView.contentAttributes.of({tabindex:'0',"aria-label":uiText("webobsidian.code-file-contents-53d5b3")}),drawSelection(),...(showLines?[lineNumbers()]:[]),search({top:true}),keymap.of(searchKeymap),syntaxHighlighting(obsidianHighlightStyle),compartment.of([]),EditorView.domEventHandlers({focus:()=>{setActiveEditor(view);}})]})});
  if(!getActiveEditor())setActiveEditor(view);
  if(!result.highlightAllowed)setNote(uiText("webobsidian.highlighting-off-large-file-05e959"));
  else if(language!=='plain'){
   const desc=LanguageDescription.matchLanguageName(languages,language,true);
   if(!desc)setNote(uiText("webobsidian.no-grammar-available-plain-text-4557ad"));
   else void desc.load().then(s=>{if(live)view.dispatch({effects:compartment.reconfigure(s)});}).catch(()=>{if(live)setNote(uiText("webobsidian.highlighting-unavailable-plain-text-a284fe"));});
  }
  return()=>{live=false;if(getActiveEditor()===view)setActiveEditor(null);view.destroy();};
 },[path,result,language,showLines]);
 useEffect(()=>{let pending=false;const refresh=(event:Event)=>{const d=(event as CustomEvent).detail;if(d?.path!==path||pending)return;pending=true;const s=useStore.getState();const read=s.refreshCodeFile(path,pane);void read.catch(()=>s.notify(uiText("webobsidian.file-changed-or-is-no-longer-available-reopen-it-e55828"))).finally(()=>{pending=false;});};window.addEventListener('wo-fs',refresh);return()=>window.removeEventListener('wo-fs',refresh);},[path,pane]);
 const copy=async()=>{try{if(result?.kind==='text'){await navigator.clipboard.writeText(result.content);setCopyStatus(uiText("webobsidian.copied-8e3df4"));}}catch{setCopyStatus(uiText("webobsidian.copy-unavailable-select-the-text-and-copy-it-60dfd9"));}};
 return <div className="code-file-view">
  <div className="code-file-toolbar"><span>{language} {uiText("webobsidian.-read-only-f17d4c")}</span><span className="grow"/><span role="status">{copyStatus||note}</span>{result?.kind==='text'&&<button title={uiText("webobsidian.copy-entire-file-contents-to-the-clipboard-9ee8bb")} onClick={()=>void copy()}>{uiText("interface.menu.copy")}</button>}</div>
  {result?.kind==='unavailable'?<div className="attachment-card"><p>{result.reason==="too-large"?uiText("webobsidian.file-exceeds-the-10-mib-preview-limit-9ab369"):result.reason==="binary"?uiText("webobsidian.this-file-contains-binary-data-23c5d8"):uiText("webobsidian.this-file-is-not-valid-utf-8-text-fbd6c9")}</p><a href={api.downloadUrl(path)}>{uiText("dialogue.button-download")}</a></div>:<div className="code-file-editor" ref={host}/>}
 </div>;
}
