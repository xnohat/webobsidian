import {t as uiText} from "../i18n/runtime";
import {getDefaultToolbarConfig,parseToolbarConfig,record,toolbarSurfaces,toolbarColor,safeToolbarIcon,knownToolbarCommandIds,type ToolbarConfigV1,type ToolbarNode} from './config';
export interface ImportReport { config:ToolbarConfigV1; unknownCommands:string[]; warnings:string[]; importedItems:number }
/** Supports native exports and pinned upstream data.json's *Commands/SubmenuCommands format. */
export function importEditingToolbar(input:unknown):ImportReport {
  const source=record(typeof input==='string'?JSON.parse(input):input),warnings:string[]=[],unknown=new Set<string>();
  let importedItems=0;
  if(source.version===1) {
    const config=parseToolbarConfig(source);
    const visit=(nodes:ToolbarNode[])=>nodes.forEach(n=>{importedItems++;if(n.type==='group')visit(n.children);else if(n.type==='command'&&n.disabled)unknown.add(n.commandId);});
    Object.values(config.layouts).forEach(l=>visit(l.items));
    for(const id of unknown)warnings.push(`Unavailable command retained disabled: ${id}`);
    return {config,unknownCommands:[...unknown],warnings,importedItems};
  }
  const config=getDefaultToolbarConfig();
  if(!Array.isArray(source.menuCommands)&&!toolbarSurfaces.some(s=>Array.isArray(source[`${s}Commands`]))) throw Error('No toolbar layouts found in this JSON file');
  const customs=Array.isArray(source.customCommands)?source.customCommands.slice(0,100):[];
  const idMap=new Map<string,string>();
  config.customCommands=customs.flatMap((v,i)=>{
    const c=record(v);
    if(c.useRegex||c.useCondition||c.script||c.code){warnings.push(`Custom command ${String(c.name||c.id||i)} uses scripts, regex or conditions and was skipped.`);return [];}
    const oldId=typeof c.id==='string'?c.id:String(i), id=oldId.startsWith('custom:')?oldId:`custom:${oldId.replace(/[^\w:-]/g,'-')}`;
    idMap.set(oldId,id);idMap.set(`editing-toolbar:${oldId}`,id);
    return [{id,label:typeof c.name==='string'?c.name:typeof c.label==='string'?c.label:'Custom command',prefix:typeof c.prefix==='string'?c.prefix:'',suffix:typeof c.suffix==='string'?c.suffix:'',icon:safeToolbarIcon(c.icon)}];
  });
  const customIds=new Set(config.customCommands.map(c=>c.id));
  for(const surface of toolbarSurfaces) {
    let serial=0;
    const convert=(values:unknown[],depth:number):ToolbarNode[]=>{
      if(depth>3) throw Error('Toolbar groups exceed maximum depth of 3');
      return values.map(v=>{
        if(++serial>200) throw Error('Toolbar layout exceeds maximum of 200 items'); importedItems++;
        const c=record(v),id=typeof c.id==='string'?c.id:'unknown',instanceId=`${surface}-import-${serial}`;
        if(id==='editingToolbar-Divider-Line'||c.type==='separator')return {type:'separator',instanceId};
        if(Array.isArray(c.SubmenuCommands)){
          if(depth>=3)throw Error('Toolbar groups exceed maximum depth of 3');
          return {type:'group',instanceId,label:typeof c.name==='string'?c.name:uiText("plugins.bases.label-group"),icon:safeToolbarIcon(c.icon),style:c.menuType==='dropdown'?'menu':'compact',children:convert(c.SubmenuCommands,depth+1)};
        }
        const commandId=idMap.get(id)||id;
        if(!knownToolbarCommandIds.has(commandId)&&!customIds.has(commandId))unknown.add(commandId);
        if(typeof c.icon==='string'&&safeToolbarIcon(c.icon)==='command'&&c.icon!=='command')warnings.push(`Icon for ${String(c.name||id)} was replaced with a safe icon.`);
        return {type:'command',instanceId,commandId,...(typeof c.name==='string'?{label:c.name}:{}),icon:safeToolbarIcon(c.icon)};
      });
    };
    const own=source[`${surface}Commands`],values=source.enableMultipleConfig===true&&Array.isArray(own)?own:Array.isArray(source.menuCommands)?source.menuCommands:own;
    if(Array.isArray(values))config.layouts[surface].items=convert(values,0);
    const enabled=source[`enable${surface[0].toUpperCase()+surface.slice(1)}Toolbar`];
    if(typeof enabled==='boolean'&&source.enableMultipleConfig===true)config.layouts[surface].enabled=enabled;
    if(surface==='mobile'&&typeof source.isLoadOnMobile==='boolean')config.layouts.mobile.enabled=source.isLoadOnMobile;
    if(source.enableMultipleConfig!==true&&typeof source.positionStyle==='string'&&surface!=='mobile')config.layouts[surface].enabled=surface===source.positionStyle;
  }
  const appearance=record(record(source.appearanceByStyle).top);
  config.appearance.iconColor=toolbarColor(appearance.toolbarIconColor??source.toolbarIconColor);
  config.appearance.backgroundColor=toolbarColor(appearance.toolbarBackgroundColor??source.toolbarBackgroundColor);
  const size=appearance.toolbarIconSize??source.toolbarIconSize;if(typeof size==='number')config.appearance.iconSize=size;
  if((appearance.aestheticStyle??source.aestheticStyle)==='tiny')config.appearance.style='compact';
  config.customColors=Object.entries(source).filter(([k])=>/^custom_(?:fc|bg)\d+$/.test(k)).map(([,v])=>toolbarColor(v)).filter((v):v is string=>!!v);
  if(source.css||source.customCSS||source.script||source.code)warnings.push('Executable code and arbitrary CSS were ignored.');
  const parsed=parseToolbarConfig(config);
  for(const id of unknown)warnings.push(`Unavailable command retained disabled: ${id}`);
  return {config:parsed,unknownCommands:[...unknown],warnings:[...new Set(warnings)],importedItems};
}
