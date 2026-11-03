/** Native, data-only Editing Toolbar configuration. No imported field is executable. */
export type ToolbarSurface = 'top' | 'following' | 'fixed' | 'mobile';
export const toolbarSurfaces: ToolbarSurface[] = ['top', 'following', 'fixed', 'mobile'];
export type ToolbarNode =
  | { type: 'command'; instanceId: string; commandId: string; label?: string; icon?: string; disabled?: boolean; disabledReason?: string }
  | { type: 'group'; instanceId: string; label: string; icon?: string; style?: 'menu' | 'compact'; children: ToolbarNode[] }
  | { type: 'separator'; instanceId: string };
export interface ToolbarLayout { enabled: boolean; items: ToolbarNode[]; position?: { x: number; y: number } }
export interface CustomToolbarCommand { id: string; label: string; icon: string; prefix: string; suffix: string }
export interface ToolbarAppearance {
  iconSize: number; density: 'comfortable' | 'compact'; showLabels: boolean; tooltips: boolean;
  overflow: 'menu' | 'scroll' | 'wrap'; style: 'standard' | 'compact'; backgroundColor?: string; iconColor?: string;
}
export interface ToolbarConfigV1 {
  version: 1; layouts: Record<ToolbarSurface, ToolbarLayout>; appearance: ToolbarAppearance;
  customCommands: CustomToolbarCommand[]; customColors: string[];
}
export const toolbarIcons = ['command','undo','redo','bold','italic','heading','palette','code','link','list','quote','paperclip','check-square','brackets','pencil','menu','more-horizontal','align-left','align-center','align-right','indent-increase','indent-decrease','hash','minus','columns','rows','crosshair','file-text','settings','paintbrush','eraser','type','strikethrough','underline','highlighter','maximize','table','copy','scissors','clipboard','arrow-up','arrow-down','list-ordered','message-square','superscript','subscript','align-justify'] as const;
const icons = new Set<string>(toolbarIcons);
export function safeToolbarIcon(value: unknown): string { return typeof value === 'string' && icons.has(value) ? value : 'command'; }
export function toolbarColor(value: unknown): string | undefined {
  return typeof value === 'string' && /^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(value) ? value.toLowerCase() : undefined;
}
const STANDARD = [
  ['editor-undo','Undo'],['editor-redo','Redo'],['toggle-format-brush','Format brush'],['format-eraser','Clear formatting'],
  ['header2-text','Heading 2'],['header3-text','Heading 3'],['header1-text','Heading 1'],['header4-text','Heading 4'],['header5-text','Heading 5'],['header6-text','Heading 6'],
  ['toggle-bold','Bold'],['toggle-italics','Italic'],['toggle-strikethrough','Strikethrough'],['underline','Underline'],['toggle-highlight','Highlight'],
  ['get-plain-text','Get plain text'],['smart-symbols','Full / half width'],['insert-blank-lines','Insert blank lines'],['remove-blank-lines','Remove blank lines'],
  ['split-lines','Split lines'],['merge-lines','Merge lines'],['dedupe-lines','Dedupe lines'],['add-wrap','Add prefix / suffix'],['number-lines','Number lines'],
  ['remove-whitespace-trim','Trim line ends'],['remove-whitespace-compress','Shrink extra spaces'],['remove-whitespace-all','Remove all whitespace'],['list-to-table','List to table'],['table-to-list','Table to list'],['extract-between','Extract between strings'],
  ['editor-cut','Cut'],['editor-copy','Copy'],['editor-paste','Paste'],['editor:swap-line-down','Move line down'],['editor:swap-line-up','Move line up'],
  ['editor:attach-file','Attach file'],['editor:insert-table','Insert table'],['editor:cycle-list-checklist','Cycle list / checklist'],
  ['editor:toggle-blockquote','Blockquote'],['insert-callout','Callout'],['superscript','Superscript'],['subscript','Subscript'],['editor:toggle-code','Inline code'],['codeblock','Code block'],['editor:insert-wikilink','Wikilink'],['editor:insert-embed','Embed'],['insert-link','Link'],['hrline','Divider'],['toggle-inline-math','Inline math'],['editor:insert-mathblock','Math block'],
  ['editor:toggle-checklist-status','Checklist'],['renumber-ordered-list','Renumber list'],['toggle-numbered-list','Ordered list'],['toggle-bullet-list','Bullet list'],['undent-list','Unindent'],['indent-list','Indent'],
  ['justify','Justify'],['left','Align left'],['center','Align center'],['right','Align right'],['change-font-color','Text color'],['change-background-color','Highlight color'],['fullscreen-focus','Editor focus'],['workplace-fullscreen-focus','Workspace fullscreen'],
] as const;
export const toolbarCommandOptions = STANDARD.map(([id,label]) => ({id:`editing-toolbar:${id}`,label}));
const extraIds = ['header0-text','editor:insert-tag','editor:toggle-comments','show-toolbar','hide-toolbar','toggle-toolbar','toggle-top','toggle-following','toggle-fixed'];
export const knownToolbarCommandIds = new Set([...toolbarCommandOptions.map(c=>c.id),...extraIds.map(id=>`editing-toolbar:${id}`)]);
const iconFor = (id: string) => id.includes('header') ? 'heading' : id.includes('undo') ? 'undo' : id.includes('redo') ? 'redo' : id.includes('bold') ? 'bold' : id.includes('italic') ? 'italic' : id.includes('color') ? 'palette' : id.includes('list') ? 'list' : id.includes('code') ? 'code' : id.includes('link') ? 'link' : 'command';
export function getDefaultToolbarConfig(): ToolbarConfigV1 {
  const makeItems = (surface: string): ToolbarNode[] => {
    const command = (i:number): ToolbarNode => {
      const option=toolbarCommandOptions[i],icon=iconFor(option.id);
      return {type:'command',instanceId:`${surface}-command-${i}`,commandId:option.id,label:option.label,...(icon!=='command'?{icon}:{})};
    };
    const group = (label:string,indices:number[],icon:string,style:'menu'|'compact'='menu'): ToolbarNode => ({type:'group',instanceId:`${surface}-group-${indices[0]}`,label,icon,style,children:indices.map(command)});
    const range=(a:number,b:number)=>Array.from({length:b-a+1},(_,i)=>a+i);
    return [...range(0,5).map(command),group('Headings',range(6,9),'heading'),...range(10,14).map(command),
      group('Text tools',range(15,29),'file-text'),group('Editing',[31,30,32,33,34],'pencil','compact'),
      ...range(35,37).map(command),group('Quotes',range(38,39),'quote'),group('Markdown',range(40,49),'code'),
      group('Lists',range(50,55),'list'),group('Alignment',range(56,59),'align-left'),...range(60,63).map(command)];
  };
  const followingItems=makeItems('following');
  const compactFollowing:ToolbarNode[]=['toggle-bold','toggle-italics','insert-link','editor:toggle-code'].map((id,i)=>({type:'command',instanceId:`following-direct-${i}`,commandId:`editing-toolbar:${id}`,icon:iconFor(id)}));
  compactFollowing.push({type:'group',instanceId:'following-more',label:'More',icon:'more-horizontal',style:'menu',children:followingItems});
  compactFollowing.push(...['change-font-color','change-background-color'].map((id,i):ToolbarNode=>({type:'command',instanceId:`following-color-${i}`,commandId:`editing-toolbar:${id}`,label:i===0?'Text color':'Highlight color',icon:'palette'})));
  return {version:1,layouts:{top:{enabled:true,items:makeItems('top')},following:{enabled:true,items:compactFollowing},fixed:{enabled:false,items:makeItems('fixed'),position:{x:0.5,y:0.85}},mobile:{enabled:true,items:makeItems('mobile')}},
    appearance:{iconSize:18,density:'comfortable',showLabels:false,tooltips:true,overflow:'menu',style:'standard'},customCommands:[],customColors:[]};
}
export function record(value: unknown): Record<string,unknown> { return value && typeof value==='object' && !Array.isArray(value) ? value as Record<string,unknown> : {}; }
function text(value:unknown,max:number): string | undefined { return typeof value==='string' && value.length<=max ? value : undefined; }
/** Invalid layout sections recover independently, preserving unrelated application settings. */
export function parseToolbarConfig(input: unknown): ToolbarConfigV1 {
  const out=getDefaultToolbarConfig(), raw=record(input);
  if(raw.version !== 1) return out;
  const customIds=new Set<string>();
  if(Array.isArray(raw.customCommands)) for(const value of raw.customCommands.slice(0,100)) {
    const c=record(value),id=text(c.id,120),label=text(c.label,120),prefix=text(c.prefix,4096),suffix=text(c.suffix,4096);
    if(!id || !/^custom:[\w:-]+$/.test(id) || customIds.has(id) || !label || prefix===undefined || suffix===undefined || c.useRegex || c.script || c.code) continue;
    customIds.add(id); out.customCommands.push({id,label,prefix,suffix,icon:safeToolbarIcon(c.icon)});
  }
  for(const surface of toolbarSurfaces) {
    const layout=record(record(raw.layouts)[surface]); if(!Array.isArray(layout.items)) continue;
    let count=0; const instances=new Set<string>();
    const nodes=(values:unknown[],depth:number):ToolbarNode[]=>values.map((value):ToolbarNode=>{
      if(++count>200) throw Error('Too many toolbar items');
      const n=record(value); let instanceId=text(n.instanceId,160)||`${surface}-item-${count}`;
      if(instances.has(instanceId)) instanceId=`${surface}-item-${count}`;
      while(instances.has(instanceId)) instanceId+='-copy'; instances.add(instanceId);
      if(n.type==='separator') return {type:'separator',instanceId};
      if(n.type==='group') {
        if(depth>=3 || !Array.isArray(n.children)) throw Error('Invalid group nesting');
        return {type:'group',instanceId,label:text(n.label,120)||'Group',icon:safeToolbarIcon(n.icon),style:n.style==='compact'?'compact':'menu',children:nodes(n.children,depth+1)};
      }
      if(n.type!=='command' || !text(n.commandId,240)) throw Error('Invalid command');
      const commandId=n.commandId as string, unknown=!knownToolbarCommandIds.has(commandId)&&!customIds.has(commandId);
      return {type:'command',instanceId,commandId,...(text(n.label,120)!==undefined?{label:n.label as string}:{}),...(n.icon!==undefined?{icon:safeToolbarIcon(n.icon)}:{}),
        ...(unknown?{disabled:true,disabledReason:'Command is unavailable in WebObsidian'}:n.disabled===true?{disabled:true,disabledReason:text(n.disabledReason,240)||'Disabled in toolbar settings'}:{})};
    });
    try {
      const items=nodes(layout.items,0);
      out.layouts[surface]={enabled:typeof layout.enabled==='boolean'?layout.enabled:out.layouts[surface].enabled,items};
      const p=record(layout.position);
      if(typeof p.x==='number'&&Number.isFinite(p.x)&&typeof p.y==='number'&&Number.isFinite(p.y)) out.layouts[surface].position={x:Math.max(0,Math.min(1,p.x)),y:Math.max(0,Math.min(1,p.y))};
    } catch { /* Restore only this layout. */ }
  }
  const a=record(raw.appearance);
  if(typeof a.iconSize==='number'&&Number.isFinite(a.iconSize)) out.appearance.iconSize=Math.max(12,Math.min(32,Math.round(a.iconSize)));
  if(a.density==='compact') out.appearance.density='compact';
  if(a.style==='compact') out.appearance.style='compact';
  if(a.overflow==='wrap'||a.overflow==='scroll'||a.overflow==='menu') out.appearance.overflow=a.overflow;
  if(typeof a.showLabels==='boolean') out.appearance.showLabels=a.showLabels;
  if(typeof a.tooltips==='boolean') out.appearance.tooltips=a.tooltips;
  for(const key of ['backgroundColor','iconColor'] as const) { const color=toolbarColor(a[key]); if(color) out.appearance[key]=color; }
  if(Array.isArray(raw.customColors)) out.customColors=[...new Set(raw.customColors.slice(0,100).map(toolbarColor).filter((c):c is string=>!!c))];
  return out;
}
/** Used by both mouse controls and keyboard shortcuts; works within nested sibling lists. */
export function moveToolbarItem(items:ToolbarNode[],instanceId:string,direction:-1|1):ToolbarNode[] {
  const index=items.findIndex(n=>n.instanceId===instanceId);
  if(index>=0) { const next=[...items],target=index+direction; if(target>=0&&target<next.length) [next[index],next[target]]=[next[target],next[index]]; return next; }
  return items.map(n=>n.type==='group'?{...n,children:moveToolbarItem(n.children,instanceId,direction)}:n);
}
