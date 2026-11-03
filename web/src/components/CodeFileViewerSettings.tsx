import {t as uiText, useLanguage} from "../lib/i18n/runtime";
import {useState} from 'react';
import {defaultCodeFileViewer,parseCodeMappings,type CodeFileViewerSettings as Settings} from '../lib/codeFiles';
export default function CodeFileViewerSettings({value,onSave}:{value:Settings;onSave:(next:Settings)=>Promise<void>}){
  const languageRevision = useLanguage().revision;

 const [enabled,setEnabled]=useState(value.enabled);const [numbers,setNumbers]=useState(value.lineNumbers);const [text,setText]=useState(format(value.extensionMap));const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 const save=async()=>{const r=parseCodeMappings(text);if(r.errors.length){setMessage(r.errors.join('\n'));return;}setBusy(true);try{await onSave({enabled,lineNumbers:numbers,extensionMap:r.map});setMessage('Saved');}catch(e){setMessage(e instanceof Error?e.message:uiText("webobsidian.could-not-save-settings-7768c8"));}finally{setBusy(false);}};
 return <div><h2>{uiText("webobsidian.code-files-4b0d81")}</h2><p>{uiText("webobsidian.open-mapped-file-types-in-a-read-only-code-viewe-51d598")}</p>
 <p><label><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> {uiText("webobsidian.enable-code-viewer-c9b8ae")}</label></p>
 <p><label><input type="checkbox" checked={numbers} onChange={e=>setNumbers(e.target.checked)}/> {uiText("webobsidian.show-line-numbers-89aac6")}</label></p>
 <label>{uiText("webobsidian.extension-language-mappings-47bae0")}<textarea aria-label={uiText("webobsidian.extension-to-language-mappings-7b47fd")} rows={16} value={text} onChange={e=>setText(e.target.value)} style={{width:'100%'}}/></label>
 <p>{uiText("webobsidian.one-mapping-per-line-e-g-py-python-use-plain-for-286cba")}</p>
 <button disabled={busy} onClick={()=>{setText(format(defaultCodeFileViewer.extensionMap));setEnabled(true);setNumbers(true);}}>{uiText("webobsidian.restore-defaults-894a58")}</button> <button disabled={busy} onClick={()=>void save()}>{uiText("dialogue.button-save")}</button><p role="status" style={{whiteSpace:'pre-line'}}>{message}</p></div>;
}
function format(map:Record<string,string>){return Object.keys(map).sort().map(ext=>`${ext}: ${map[ext]}`).join('\n');}
