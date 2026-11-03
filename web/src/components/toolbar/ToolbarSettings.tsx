import {translateLabel as uiLabel} from "../../lib/i18n/runtime";
import {t as uiText, useLanguage} from "../../lib/i18n/runtime";
import {useState, type Dispatch, type SetStateAction} from 'react';
import {api} from '../../lib/api';
import {getDefaultToolbarConfig,parseToolbarConfig,toolbarSurfaces,toolbarCommandOptions,toolbarIcons,moveToolbarItem,type ToolbarConfigV1,type ToolbarNode,type ToolbarSurface} from '../../lib/toolbar/config';
import {importEditingToolbar,type ImportReport} from '../../lib/toolbar/importConfig';

const newId=()=>`item-${crypto.randomUUID()}`;
function updateNode(nodes:ToolbarNode[],id:string,update:(n:ToolbarNode)=>ToolbarNode|null):ToolbarNode[] {
  return nodes.flatMap(n=>n.instanceId===id?update(n)??[]:n.type==='group'?{...n,children:updateNode(n.children,id,update)}:n);
}
function appendGroup(nodes:ToolbarNode[],id:string,node:ToolbarNode):ToolbarNode[] {
  return nodes.map(n=>n.type==='group'?{...n,children:n.instanceId===id?[...n.children,node]:appendGroup(n.children,id,node)}:n);
}
function countNodes(nodes:ToolbarNode[]):number {return nodes.reduce((sum,n)=>sum+1+(n.type==='group'?countNodes(n.children):0),0);}

export default function ToolbarSettings({value,onSaved}:{value?:unknown;onSaved?:(config:ToolbarConfigV1)=>void}) {
  const languageRevision = useLanguage().revision;

  const [config,setConfig]=useState(()=>parseToolbarConfig(value));
  const [surface,setSurface]=useState<ToolbarSurface>('top');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [report,setReport]=useState<ImportReport|null>(null);
  const layout=config.layouts[surface];
  const setItems=(items:ToolbarNode[])=>setConfig(c=>({...c,layouts:{...c.layouts,[surface]:{...c.layouts[surface],items}}}));
  const save=async()=>{
    setBusy(true);setMessage('');
    try {
      const parsed=parseToolbarConfig(config);await api.putSettings({ui:{editingToolbar:parsed}});
      setConfig(parsed);window.dispatchEvent(new CustomEvent('editing-toolbar-config',{detail:parsed}));onSaved?.(parsed);setMessage(uiText("webobsidian.editing-toolbar-saved-921b88"));
    }catch(error){setMessage(error instanceof Error?error.message:uiText("webobsidian.unable-to-save-toolbar-settings-7a1226"));}
    finally{setBusy(false);}
  };
  const importFile=async(file:File|undefined)=>{
    if(!file)return;
    try{if(file.size>1024*1024)throw Error(uiText("webobsidian.toolbar-configuration-must-be-smaller-than-1-mb-521071"));const next=importEditingToolbar(JSON.parse(await file.text()));setConfig(next.config);setReport(next);setMessage(uiText("webobsidian.imported-for-review-save-to-apply-78f898"));}
    catch(error){setMessage(error instanceof Error?error.message:uiText("webobsidian.invalid-toolbar-json-0f3a06"));}
  };
  const exportFile=()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(parseToolbarConfig(config),null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='webobsidian-editing-toolbar.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  return <div className="toolbar-settings">
    <h2>{uiText("webobsidian.editing-toolbar-98490d")}</h2>
    <p>{uiText("webobsidian.each-toolbar-has-its-own-commands-and-groups-cha-3f3fc5")}</p>
    <fieldset><legend>{uiText("webobsidian.visible-toolbars-965908")}</legend>{toolbarSurfaces.map(key=><label key={key} style={{display:'inline-flex',gap:5,marginRight:14}}><input type="checkbox" checked={config.layouts[key].enabled} onChange={e=>setConfig(c=>({...c,layouts:{...c.layouts,[key]:{...c.layouts[key],enabled:e.target.checked}}}))}/>{key}</label>)}</fieldset>
    <label style={{display:'block',margin:'12px 0'}}>{uiText("webobsidian.edit-layout-b46931")} <select className="text-input" aria-label={uiText("webobsidian.edit-toolbar-layout-5584b0")} value={surface} onChange={e=>setSurface(e.target.value as ToolbarSurface)}>{toolbarSurfaces.map(key=><option key={key}>{key}</option>)}</select></label>
    <NodeEditor items={layout.items} allItems={layout.items} setItems={setItems} commandOptions={[...toolbarCommandOptions,...config.customCommands]} depth={0}/>
    <button className="btn secondary" onClick={()=>setConfig(c=>({...c,layouts:{...c.layouts,[surface]:getDefaultToolbarConfig().layouts[surface]}}))}>{uiText("webobsidian.reset-44c57a")} {surface} {uiText("webobsidian.layout-207b87")}</button>
    <fieldset style={{marginTop:16}}><legend>{uiText("setting.appearance.name")}</legend>
      <label>{uiText("webobsidian.icon-size-7a6728")} <input type="number" min={12} max={32} value={config.appearance.iconSize} onChange={e=>setConfig(c=>({...c,appearance:{...c.appearance,iconSize:Number(e.target.value)}}))}/></label>{' '}
      <label>{uiText("webobsidian.density-f9160c")} <select value={config.appearance.density} onChange={e=>setConfig(c=>({...c,appearance:{...c.appearance,density:e.target.value as 'comfortable'|'compact'}}))}><option value="comfortable">{uiText("webobsidian.comfortable-231370")}</option><option value="compact">{uiText("webobsidian.compact-1df39a")}</option></select></label>{' '}
      <label>{uiText("plugins.canvas.label-style")} <select value={config.appearance.style} onChange={e=>setConfig(c=>({...c,appearance:{...c.appearance,style:e.target.value as 'standard'|'compact'}}))}><option value="standard">{uiText("webobsidian.standard-2dfa66")}</option><option value="compact">{uiText("webobsidian.compact-1df39a")}</option></select></label>{' '}
      <label>{uiText("webobsidian.overflow-4da7bc")} <select value={config.appearance.overflow} onChange={e=>setConfig(c=>({...c,appearance:{...c.appearance,overflow:e.target.value as 'menu'|'scroll'|'wrap'}}))}><option value="menu">{uiText("webobsidian.one-row-more-8d7a27")}</option><option value="scroll">{uiText("webobsidian.scroll-090a3c")}</option><option value="wrap">{uiText("webobsidian.wrap-c3447e")}</option></select></label>
      {(['showLabels','tooltips'] as const).map(key=><label key={key} style={{display:'block'}}><input type="checkbox" checked={config.appearance[key]} onChange={e=>setConfig(c=>({...c,appearance:{...c.appearance,[key]:e.target.checked}}))}/>{key==="showLabels"?uiText("webobsidian.show-labels-b0a687"):uiText("webobsidian.show-tooltips-bd57ff")}</label>)}
      {(['backgroundColor','iconColor'] as const).map(key=><label key={key} style={{display:'block'}}>{key==="backgroundColor"?uiText("webobsidian.panel-background-f05bb4"):uiText("webobsidian.icon-color-dd2228")} <input className="text-input" aria-label={key==="backgroundColor"?uiText("webobsidian.panel-background-f05bb4"):uiText("webobsidian.icon-color-dd2228")} placeholder={uiText("webobsidian.theme-default-or-rrggbbaa-c23648")} pattern="#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?" value={config.appearance[key]??''} onChange={e=>setConfig(c=>({...c,appearance:{...c.appearance,[key]:e.target.value||undefined}}))}/></label>)}
      <label style={{display:'block'}}>{uiText("webobsidian.custom-palette-colors-0d4cda")} <input className="text-input" placeholder={uiText("webobsidian.-ff0000-00ff0080-feaf63")} value={config.customColors.join(', ')} onChange={e=>setConfig(c=>({...c,customColors:e.target.value.split(',').map(v=>v.trim())}))}/></label>
    </fieldset>
    <CustomCommands config={config} setConfig={setConfig}/>
    <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:16}}>
      <button className="btn" onClick={save} disabled={busy}>{busy?uiText("webobsidian.saving-56a228"):uiText("webobsidian.save-toolbar-settings-725244")}</button>
      <button className="btn secondary" onClick={exportFile}>{uiText("webobsidian.export-json-bc3990")}</button>
      <label className="btn secondary">{uiText("webobsidian.import-json-1a5894")}<input aria-label={uiText("webobsidian.import-toolbar-json-336d29")} type="file" accept="application/json,.json" style={{display:'block',maxWidth:230}} onChange={e=>{void importFile(e.target.files?.[0]);e.target.value='';}}/></label>
    </div>
    {message&&<p role="status">{message}</p>}
    {report&&<details open><summary>{uiText("webobsidian.import-report-debcdc")} {report.importedItems} {uiText("webobsidian.items-a01256")} {report.unknownCommands.length} {uiText("webobsidian.unavailable-commands-3d529b")}</summary>{report.warnings.length?<ul>{report.warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul>:<p>{uiText("webobsidian.imported-successfully-285766")}</p>}</details>}
  </div>;
}
function NodeEditor({items,allItems,setItems,commandOptions,depth}:{items:ToolbarNode[];allItems:ToolbarNode[];setItems:(nodes:ToolbarNode[])=>void;commandOptions:{id:string;label:string}[];depth:number}) {
  const languageRevision = useLanguage().revision;

  const change=(id:string,update:(n:ToolbarNode)=>ToolbarNode|null)=>setItems(updateNode(allItems,id,update));
  const add=(type:'command'|'group'|'separator',parent?:string)=>{
    if(countNodes(allItems)>=200)return;
    const node:ToolbarNode=type==='command'?{type,instanceId:newId(),commandId:commandOptions[0].id}:type==='group'?{type,instanceId:newId(),label: "New group",children:[]}:{type,instanceId:newId()};
    setItems(parent?appendGroup(allItems,parent,node):[...allItems,node]);
  };
  return <div>{items.map((node,index)=><div key={node.instanceId} style={{border:'1px solid var(--bg-modifier-border)',borderRadius:4,padding:6,marginBottom:6}} onKeyDown={e=>{if(e.altKey&&(e.key==='ArrowUp'||e.key==='ArrowDown')){e.preventDefault();e.stopPropagation();setItems(moveToolbarItem(allItems,node.instanceId,e.key==='ArrowUp'?-1:1));}}}>
    <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
      <span>{node.type==='separator'?uiText("webobsidian.separator-b4b289"):node.type==='group'?uiText("plugins.bases.label-group"):uiText("webobsidian.command-890189")}</span>
      {node.type==='command'&&<select aria-label={uiText("webobsidian.command-value0-8ac4d9", {value0: index+1})} className="text-input" value={node.commandId} style={{maxWidth:210}} onChange={e=>change(node.instanceId,n=>n.type==='command'?{type:'command',instanceId:n.instanceId,commandId:e.target.value,label:commandOptions.find(c=>c.id===e.target.value)?.label,icon:n.icon}:n)}>{!commandOptions.some(c=>c.id===node.commandId)&&<option value={node.commandId}>{node.commandId} {uiText("webobsidian.-unavailable-b2cac2")}</option>}{commandOptions.map(c=><option key={c.id} value={c.id}>{uiLabel(c.label)}</option>)}</select>}
      {node.type!=='separator'&&<><input aria-label={uiText("webobsidian.-value0-label-value1-3f0a5d", {value0: node.type, value1: index+1})} className="text-input" placeholder={uiText("webobsidian.label-74341e")} maxLength={120} style={{maxWidth:150}} value={node.label??''} onChange={e=>change(node.instanceId,n=>n.type!=='separator'?{...n,label:e.target.value}:n)}/><select aria-label={uiText("webobsidian.icon-value0-af2e3e", {value0: index+1})} value={node.icon??'command'} onChange={e=>change(node.instanceId,n=>n.type!=='separator'?{...n,icon:e.target.value}:n)}>{toolbarIcons.map(icon=><option key={icon}>{icon}</option>)}</select></>}
      <button type="button" className="btn secondary" aria-label={uiText("webobsidian.move-item-value0-up-e8f797", {value0: index+1})} disabled={index===0} onClick={()=>setItems(moveToolbarItem(allItems,node.instanceId,-1))}>↑</button>
      <button type="button" className="btn secondary" aria-label={uiText("webobsidian.move-item-value0-down-019695", {value0: index+1})} disabled={index===items.length-1} onClick={()=>setItems(moveToolbarItem(allItems,node.instanceId,1))}>↓</button>
      <button type="button" className="btn secondary" aria-label={uiText("webobsidian.remove-item-value0-3199b4", {value0: index+1})} onClick={()=>change(node.instanceId,()=>null)}>{uiText("webobsidian.remove-e96390")}</button>
    </div>
    {node.type==='command'&&node.disabled&&<p>{node.disabledReason}</p>}
    {node.type==='group'&&<div style={{marginLeft:14,marginTop:6}}>
      <label>{uiText("webobsidian.group-presentation-178524")} <select value={node.style??'menu'} onChange={e=>change(node.instanceId,n=>n.type==='group'?{...n,style:e.target.value as 'menu'|'compact'}:n)}><option value="menu">{uiText("webobsidian.menu-57f5f5")}</option><option value="compact">{uiText("webobsidian.compact-panel-32c2e8")}</option></select></label>
      <NodeEditor items={node.children} allItems={allItems} setItems={setItems} commandOptions={commandOptions} depth={depth+1}/>
      <button className="btn secondary" onClick={()=>add('command',node.instanceId)}>{uiText("webobsidian.add-command-to-4226a6")} {node.label}</button>{' '}
      <button className="btn secondary" onClick={()=>add('separator',node.instanceId)}>{uiText("webobsidian.add-separator-to-90793c")} {node.label}</button>{' '}
      {depth<2&&<button className="btn secondary" onClick={()=>add('group',node.instanceId)}>{uiText("webobsidian.add-subgroup-6fd13d")}</button>}
    </div>}
  </div>)}{depth===0&&<div style={{display:'flex',gap:6,margin:'8px 0'}}><button className="btn secondary" onClick={()=>add('command')}>{uiText("webobsidian.add-command-079e41")}</button><button className="btn secondary" onClick={()=>add('group')}>{uiText("plugins.bases.action-add-group")}</button><button className="btn secondary" onClick={()=>add('separator')}>{uiText("webobsidian.add-separator-230f65")}</button></div>}</div>;
}
function CustomCommands({config,setConfig}:{config:ToolbarConfigV1;setConfig:Dispatch<SetStateAction<ToolbarConfigV1>>}) {
  const languageRevision = useLanguage().revision;

  const update=(index:number,key:'label'|'prefix'|'suffix'|'icon',value:string)=>setConfig(c=>({...c,customCommands:c.customCommands.map((item,i)=>i===index?{...item,[key]:value}:item)}));
  return <fieldset style={{marginTop:16}}><legend>{uiText("webobsidian.literal-text-templates-c8cb07")}</legend><p>{uiText("webobsidian.prefix-and-suffix-are-inserted-as-written-around-4ed1c4")}</p>
    {config.customCommands.map((command,index)=><div key={command.id} style={{marginBottom:12}}><code>{command.id}</code>{' '}<button className="btn secondary" onClick={()=>setConfig(c=>({...c,customCommands:c.customCommands.filter((_,i)=>i!==index)}))}>{uiText("webobsidian.remove-template-12605e")}</button>
      <label style={{display:'block'}}>{uiText("webobsidian.label-74341e")} <input className="text-input" maxLength={120} value={command.label} onChange={e=>update(index,'label',e.target.value)}/></label>
      <label style={{display:'block'}}>{uiText("webobsidian.icon-716f63")} <select value={command.icon} onChange={e=>update(index,'icon',e.target.value)}>{toolbarIcons.map(icon=><option key={icon}>{icon}</option>)}</select></label>
      <label style={{display:'block'}}>{uiText("webobsidian.prefix-90eceb")} <textarea className="text-input" maxLength={4096} value={command.prefix} onChange={e=>update(index,'prefix',e.target.value)}/></label>
      <label style={{display:'block'}}>{uiText("webobsidian.suffix-885db9")} <textarea className="text-input" maxLength={4096} value={command.suffix} onChange={e=>update(index,'suffix',e.target.value)}/></label>
    </div>)}<button className="btn secondary" disabled={config.customCommands.length>=100} onClick={()=>setConfig(c=>({...c,customCommands:[...c.customCommands,{id:`custom:${crypto.randomUUID()}`,label: "New template",icon:'command',prefix:'',suffix:''}]}))}>{uiText("webobsidian.add-template-b612a2")}</button>
  </fieldset>;
}
