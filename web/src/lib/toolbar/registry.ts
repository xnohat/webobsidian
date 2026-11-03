import {translateLabel} from '../i18n/runtime';
import {t as uiText} from "../i18n/runtime";
import {transformInlineSelection,stripInline,wrapInline,selectionStyleSamples,type InlineAttribute} from './formatCleanup';
import {EditorSelection, type Text} from '@codemirror/state';
import type {EditorView} from '@codemirror/view';
import {undo,redo,indentMore,indentLess,moveLineUp,moveLineDown,isolateHistory} from '@codemirror/commands';
import {toggleInline,toggleChecklist} from '../editorCommands';
import {applyColor} from '../colorFormatting';
import {transformText} from './commands/textTools';
import {useStore} from '../store';
import {treeFilePaths} from '../tree';
import {getCachedVaultPreferences} from '../vaultPreferences';
import {formatInternalLink,resolveNewNoteDirectory} from '../vaultLinks';

export interface ToolbarContext {view:EditorView;documentId:string;doc:Text;selection:EditorSelection;generation?:number}
export type CommandResult={status:'applied'|'cancelled'|'unavailable';reason?:string};
export interface ToolbarCommand {id:string;label:string;icon:string;writesDocument:boolean;selectionPolicy:'inline'|'lines'|'single'|'explicit';getState:(ctx:ToolbarContext)=>{enabled:boolean;active:boolean|'mixed';reason?:string};run:(ctx:ToolbarContext)=>Promise<CommandResult>}
export type DialogField={key:string;label:string;value:string};
export interface ToolbarServices {prompt:(title:string,fields:DialogField[],preview?:(params:Record<string,string>)=>string,ctx?:ToolbarContext)=>Promise<Record<string,string>|null>;attach:(ctx:ToolbarContext)=>Promise<string|null>;notify:(message:string)=>void}
let services:ToolbarServices={prompt:async()=>null,attach:async()=>null,notify:()=>{}};
export function setToolbarServices(next:Partial<ToolbarServices>){services={...services,...next};}
const ids=new WeakMap<EditorView,string>();let nextId=0;
const generations=new WeakMap<EditorView,number>();
export function invalidateContext(view:EditorView){generations.set(view,(generations.get(view)??0)+1);}
export function captureContext(view:EditorView,documentId?:string):ToolbarContext {if(!ids.has(view))ids.set(view,documentId??String(++nextId));return {view,documentId:ids.get(view)!,doc:view.state.doc,selection:view.state.selection,generation:generations.get(view)??0};}
export function isContextCurrent(c:ToolbarContext){return (c.generation??0)===(generations.get(c.view)??0)&&c.view.state.doc===c.doc&&ids.get(c.view)===c.documentId;}
const ok:CommandResult={status:'applied'};
const full=(id:string)=>id.startsWith('editing-toolbar:')||id.startsWith('custom:')?id:'editing-toolbar:'+id;
export const commands:ToolbarCommand[]=[];
export function getCommand(id:string){return commands.find(x=>x.id===full(id));}
export async function executeCommand(id:string,ctx:ToolbarContext):Promise<CommandResult>{
 if(!isContextCurrent(ctx))return {status:'cancelled',get reason() {return uiText("webobsidian.the-document-changed-repeat-the-action-c47f48");}};
 const cmd=getCommand(id);if(!cmd)return {status:'unavailable',get reason() {return uiText("webobsidian.command-is-unavailable-cb5bb9");}};
 const state=cmd.getState(ctx);if(!state.enabled)return {status:'unavailable',reason:state.reason};
 try{return await cmd.run(ctx);}catch(error){const reason=error instanceof Error?error.message:String(error);services.notify(reason);return {status:'unavailable',reason};}
}
function add(id:string,label:string,icon:string,run:(c:ToolbarContext)=>void|CommandResult|Promise<void|CommandResult>,writesDocument=true,selectionPolicy:ToolbarCommand['selectionPolicy']='inline',localize=true){
 const marks:Record<string,string>={'toggle-bold':'**','toggle-italics':'*','toggle-strikethrough':'~~','toggle-highlight':'==','editor:toggle-code':'`'};
 commands.push({id:full(id),get label(){return localize?translateLabel(label):label;},icon,writesDocument,selectionPolicy,getState(c){
 const protectedBlock=['left','center','right','justify'].includes(id)&&c.selection.ranges.some(r=>{const skip=protectedLines(c.doc);for(let n=c.doc.lineAt(r.from).number;n<=c.doc.lineAt(r.to).number;n++)if(skip.has(n))return true;return false;});
 const enabled=!protectedBlock&&(!writesDocument||!c.view.state.readOnly)&&(selectionPolicy!=='single'||c.selection.ranges.length===1)&&(selectionPolicy!=='explicit'||!c.selection.main.empty);
 const mark=marks[id];const vals=c.selection.ranges.map(r=>mark?(c.doc.sliceString(r.from,r.to).startsWith(mark)&&c.doc.sliceString(r.from,r.to).endsWith(mark))||(c.doc.sliceString(Math.max(0,r.from-mark.length),r.from)===mark&&c.doc.sliceString(r.to,r.to+mark.length)===mark):false);
 return {enabled,active:vals.every(Boolean)?true:vals.some(Boolean)?'mixed':false,reason:enabled?undefined:c.view.state.readOnly?uiText("webobsidian.read-only-note-b27581"):selectionPolicy==="single"?uiText("webobsidian.use-one-selection-d6bdca"):uiText("webobsidian.select-text-first-88ab4c")};
 },async run(c){if(!isContextCurrent(c)||writesDocument&&c.view.state.readOnly)return {status:'cancelled'};const result=await run(c);return result??ok;}});
}
export function replaceSelection(c:ToolbarContext,text:string){if(!isContextCurrent(c)||c.view.state.readOnly)return;const {from,to}=c.selection.main;c.view.dispatch({changes:{from,to,insert:text},selection:EditorSelection.range(from,from+text.length),annotations:isolateHistory.of('full'),userEvent:'input.toolbar'});c.view.focus();}
function insert(c:ToolbarContext,text:string){replaceSelection(c,text);}
function html(c:ToolbarContext,tag:string){
 const key:InlineAttribute=tag==='u'?'underline':tag==='sup'?'sup':'sub';
 const samples=selectionStyleSamples(c.view.state);const remove=samples.length>0&&samples.every(sample=>sample[key]===true);
 const fields=new Set<InlineAttribute>([key]);if(key==='sup')fields.add('sub');if(key==='sub')fields.add('sup');
 transformInlineSelection(c.view,nodes=>{const clean=stripInline(nodes,fields);return remove?clean:wrapInline(clean,{[key]:true});});
}
function protectedLines(doc:Text){const result=new Set<number>();let fence='',front=false;for(let n=1;n<=doc.lines;n++){const t=doc.line(n).text;if(n===1&&t==='---')front=true;else if(front&&/^(---|\.\.\.)\s*$/.test(t)){result.add(n);front=false;continue;}if(front){result.add(n);continue;}const f=t.match(/^\s{0,3}(`{3,}|~{3,})/);if(f){result.add(n);if(!fence)fence=f[1];else if(f[1][0]===fence[0]&&f[1].length>=fence.length)fence='';continue;}if(fence)result.add(n);}return result;}
function lines(c:ToolbarContext,fn:(text:string,index:number)=>string){const selected=new Set<number>(),skip=protectedLines(c.doc);for(const r of c.selection.ranges){const last=c.doc.lineAt(r.to).number-(r.to>r.from&&c.doc.lineAt(r.to).from===r.to?1:0);for(let n=c.doc.lineAt(r.from).number;n<=last;n++)if(!skip.has(n))selected.add(n);}let index=0;const changes=[...selected].sort((a,b)=>a-b).map(n=>{const l=c.doc.line(n);const output=fn(l.text,index++);let a=0,b=0;while(a<l.text.length&&a<output.length&&l.text[a]===output[a])a++;while(b<l.text.length-a&&b<output.length-a&&l.text[l.text.length-1-b]===output[output.length-1-b])b++;return {from:l.from+a,to:l.to-b,insert:output.slice(a,output.length-b)};});if(changes.length)c.view.dispatch({changes,annotations:isolateHistory.of('full'),userEvent:'input.toolbar'});c.view.focus();}
const stripList=(s:string)=>s.replace(/^(\s*)(?:[-+*]|\d+[.)])\s+(?:\[[^\]]\]\s+)?/,'$1');
const inline:[string,string,string,string][]=[['toggle-bold','Bold','bold','**'],['toggle-italics','Italic','italic','*'],['toggle-strikethrough','Strikethrough','strikethrough','~~'],['toggle-highlight','Highlight','highlighter','=='],['editor:toggle-code','Inline code','code','`'],['toggle-inline-math','Inline math','code','$'],['editor:toggle-comments','Comment','message-square','%%']];
for(const [id,label,icon,mark] of inline)add(id,label,icon,c=>{toggleInline(c.view,mark);});
for(const [id,tag,label] of [['underline','u','Underline'],['superscript','sup','Superscript'],['subscript','sub','Subscript']])add(id,label,'type',c=>html(c,tag));
for(let level=0;level<=6;level++)add('header'+level+'-text',level?'Heading '+level:'Normal paragraph','heading',c=>lines(c,s=>s.replace(/^(\s*)(?:#{1,6}\s+)?/,'$1'+(level?'#'.repeat(level)+' ':''))),true,'lines');
add('editor-undo','Undo','undo',c=>{undo(c.view);});
add('editor-redo','Redo','redo',c=>{redo(c.view);});
add('indent-list','Indent','indent-increase',c=>{indentMore(c.view);},true,'lines');
add('undent-list','Outdent','indent-decrease',c=>{indentLess(c.view);},true,'lines');
add('toggle-numbered-list','Ordered list','list-ordered',c=>lines(c,(s,i)=>stripList(s).replace(/^(\s*)/,'$1'+(i+1)+'. ')),true,'lines');
add('toggle-bullet-list','Bullet list','list',c=>lines(c,s=>/^\s*[-+*]\s+(?!\[)/.test(s)?stripList(s):stripList(s).replace(/^(\s*)/,'$1- ')),true,'lines');
add('renumber-ordered-list','Renumber list','list-ordered',c=>{let n=0;lines(c,s=>s.replace(/^(\s*)\d+([.)])\s+/,(all,space,sep)=>space+(++n)+sep+' '));},true,'lines');
add('editor:toggle-checklist-status','Toggle checklist','check-square',c=>{toggleChecklist(c.view);},true,'lines');
add('editor:cycle-list-checklist','Cycle list / task','check-square',c=>lines(c,s=>/^\s*[-+*] \[.\] /.test(s)?stripList(s):/^\s*[-+*] /.test(s)?s.replace(/^([ \t]*[-+*] )/,'$1[ ] '):stripList(s).replace(/^(\s*)/,'$1- ')),true,'lines');
add('editor:toggle-blockquote','Blockquote','quote',c=>lines(c,s=>/^\s*> ?/.test(s)?s.replace(/^(\s*)> ?/,'$1'):s.replace(/^(\s*)/,'$1> ')),true,'lines');
for(const dir of ['up','down'])add('editor:swap-line-'+dir,'Move line '+dir,dir==='up'?'arrow-up':'arrow-down',c=>{(dir==='up'?moveLineUp:moveLineDown)(c.view);},true,'lines');
for(const [id,label] of [['editor-copy','Copy'],['editor-cut','Cut'],['editor-paste','Paste']])add(id,label,id==='editor-copy'?'copy':id==='editor-cut'?'scissors':'clipboard',async c=>{
 const text=c.doc.sliceString(c.selection.main.from,c.selection.main.to);
 if(id==='editor-paste'){let value:string;try{value=await navigator.clipboard.readText();}catch{const r=await services.prompt(uiText("webobsidian.paste-or-use-ctrl-cmd-v-0b49f5"),[{key:'text',get label() {return uiText("properties.types.option-text");},value:''}]);if(!r)return {status:'cancelled'};value=r.text;}if(isContextCurrent(c))replaceSelection(c,value);}
 else {try{await navigator.clipboard.writeText(text);}catch{services.notify(uiText("webobsidian.clipboard-unavailable-use-ctrl-cmd-4b581b")+(id==="editor-cut"?'X':'C'));return {status:'unavailable'};}if(id==='editor-cut'&&isContextCurrent(c))replaceSelection(c,'');}
},id!=='editor-copy','single');
async function form(c:ToolbarContext,title:string,fields:DialogField[],build:(p:Record<string,string>,selected:string)=>string){const p=await services.prompt(title,fields,undefined,c);if(!p||!isContextCurrent(c))return {status:'cancelled'} as CommandResult;insert(c,build(p,c.doc.sliceString(c.selection.main.from,c.selection.main.to)));return ok;}
add('insert-link','Link','link',c=>form(c,'Insert link',[{key:'url',get label() {return uiText("webobsidian.url-0e2d9b");},value:'https://'},{key:'label',get label() {return uiText("properties.types.option-text");},value:c.doc.sliceString(c.selection.main.from,c.selection.main.to)}],p=>'['+p.label.replace(/\]/g,'\\]')+']('+p.url.replace(/[\s()]/g,s=>encodeURIComponent(s))+')'),true,'single');
for(const embed of [false,true])add(embed?'editor:insert-embed':'editor:insert-wikilink',embed?'Embed note':'Internal link','brackets',async c=>{
 const sourcePath=useStore.getState().activePath,knownPaths=treeFilePaths(useStore.getState().tree),preferences=getCachedVaultPreferences().values;
 const p=await services.prompt(embed?"Embed note":uiText("webobsidian.internal-link-e3976f"),[{key:'target',get label() {return uiText("webobsidian.note-file-42102d");},value:c.doc.sliceString(c.selection.main.from,c.selection.main.to)}],undefined,c);
 if(!p||!isContextCurrent(c)||c.view.state.readOnly||useStore.getState().activePath!==sourcePath)return {status:'cancelled'};
 const [rawTarget,label]=p.target.trim().split('|',2);if(!rawTarget)return {status:'cancelled'};
 const literal=knownPaths.find(path=>path.toLowerCase()===rawTarget.toLowerCase());
 const hash=literal?-1:rawTarget.indexOf('#'),target=hash<0?rawTarget:rawTarget.slice(0,hash),fragment=hash<0?'':rawTarget.slice(hash+1);
 const normalize=(value:string)=>{const parts:string[]=[];for(const segment of value.split('/')){if(segment==='..'){if(!parts.length)throw Error(uiText("webobsidian.path-must-stay-inside-the-vault-b1b4e8"));parts.pop();}else if(segment&&segment!=='.')parts.push(segment);}return parts.join('/');};
 const sourceDir=sourcePath?.includes('/')?sourcePath.slice(0,sourcePath.lastIndexOf('/')):'';
 const candidates:string[]=[];
 for(const value of [...(target.startsWith('/')?[]:[(sourceDir?sourceDir+'/':'')+target]),target.replace(/^\//,'')]){try{candidates.push(normalize(value));}catch{/* a source-relative path may be valid only against its source */}}
 const key=(value:string)=>value.toLowerCase().replace(/\.(md|markdown)$/i,'');
 let targetPath=literal??candidates.map(candidate=>knownPaths.find(path=>key(path)===key(candidate))).find(Boolean);
 if(!targetPath&&!target.includes('/'))targetPath=[...knownPaths].sort((a,b)=>a.split('/').length-b.split('/').length||a.localeCompare(b)).find(path=>key(path.split('/').pop()!)===key(target));
 if(!targetPath){const directory=target.startsWith('.')?sourceDir:target.includes('/')?'':resolveNewNoteDirectory({sourcePath,preferences});const file=/\.[^./]+$/.test(target)?target:target+'.md';targetPath=normalize((directory?directory+'/':'')+file);}
 let text=formatInternalLink({sourcePath,targetPath,label,embed,preferences,knownPaths});
 if(fragment){if(text.includes(']('))text=text.slice(0,-1)+'#'+fragment.split('#').map(encodeURIComponent).join('#')+')';else text=text.replace(/(?=\||\]\])/,'#'+fragment);}
 insert(c,text);return ok;
},true,'single');
add('insert-callout','Callout','message-square',c=>form(c,'Insert callout',[{key:'type',get label() {return uiText("webobsidian.type-3deb74");},value:'note'},{key:'title',get label() {return uiText("plugins.bookmarks.option-title");},value:''}],(p,s)=>'> [!'+p.type.replace(/[^a-z-]/gi,'')+']'+(p.title?' '+p.title:'')+'\n'+s.split('\n').map(x=>'> '+x).join('\n')),true,'single');
add('codeblock','Code block','code',c=>form(c,'Code block',[{key:'language',get label() {return uiText("setting.about.option-language");},value:''}],(p,s)=>{const fence='`'.repeat(Math.max(3,...[...s.matchAll(/`+/g)].map(m=>m[0].length+1)));return fence+p.language.replace(/[\r\n`]/g,'')+'\n'+s+'\n'+fence;}),true,'single');
add('editor:insert-mathblock','Math block','code',c=>insert(c,'$$\n'+c.doc.sliceString(c.selection.main.from,c.selection.main.to)+'\n$$'),true,'single');
add('hrline','Horizontal divider','minus',c=>insert(c,'\n\n---\n\n'),true,'single');
add('editor:insert-tag','Tag','hash',c=>insert(c,'#'),true,'single');
add('editor:insert-table','Insert table','table',c=>form(c,'Insert table',[{key:'rows',get label() {return uiText("webobsidian.rows-1-100-6fb533");},value:'3'},{key:'columns',get label() {return uiText("webobsidian.columns-1-20-5e6693");},value:'3'}],p=>{const rows=Math.min(100,Math.max(1,Number(p.rows)||3)),cols=Math.min(20,Math.max(1,Number(p.columns)||3));return '\n'+Array.from({length:rows+1},(_,i)=>'| '+Array.from({length:cols},(_,j)=>i===0?'Column '+(j+1):i===1?'---':' ').join(' | ')+' |').join('\n')+'\n';}),true,'single');
add('editor:attach-file','Attach file','paperclip',async c=>{const md=await services.attach(c);if(md&&isContextCurrent(c))insert(c,md);else return {status:'cancelled'};},true,'single');
for(const align of ['left','center','right','justify'])add(align,'Align '+align,'align-'+(align==='justify'?'left':align),c=>{const r=c.selection.main;const a=c.doc.lineAt(r.from).from,b=c.doc.lineAt(r.to).to;const t=c.doc.sliceString(a,b).replace(/^<div align="(?:left|center|right|justify)">\n\n([\s\S]*?)\n\n<\/div>$/,'$1');c.view.dispatch({changes:{from:a,to:b,insert:'<div align="'+align+'">\n\n'+t+'\n\n</div>'},annotations:isolateHistory.of('full'),userEvent:'input.toolbar'});},true,'single');
for(const [id,property,label] of [['change-font-color','color','Text color'],['change-background-color','background-color','Highlight color']] as const)add(id,label,'palette',c=>{applyColor(c.view,property,property==='color'?'#1971c2':'#fff3bf');});
add('format-eraser','Clear formatting','eraser',async c=>{const m=await import('./formatCleanup');return isContextCurrent(c)?m.clearFormatting(c):{status:'cancelled'};});
let brush:Awaited<ReturnType<typeof import('./formatBrush')['captureFormat']>>=null;
let brushContext:ToolbarContext|null=null,brushSticky=false;
export function cancelBrush(){brush=null;brushContext=null;brushSticky=false;if(typeof window!=='undefined')window.dispatchEvent(new Event('toolbar-brush-change'));}
export async function stickyBrush(c:ToolbarContext){const m=await import('./formatBrush');if(!isContextCurrent(c))return;brush=m.captureFormat(c);brushContext=c;brushSticky=true;}
export async function applyBrush(view:EditorView){if(!brush||!brushContext)return;if(brushContext.view!==view||!isContextCurrent(brushContext)){cancelBrush();return;}const format=brush,target=captureContext(view);if(!brushSticky)cancelBrush();const m=await import('./formatBrush');if(!isContextCurrent(target)||view.state.readOnly){cancelBrush();return;}m.applyFormat({view},format);if(brushSticky)brushContext=captureContext(view);}
add('toggle-format-brush','Format brush','paintbrush',async c=>{const m=await import('./formatBrush');if(!isContextCurrent(c))return {status:'cancelled'};brush=m.captureFormat(c);brushContext=c;brushSticky=false;services.notify(brush?"Select text to apply formatting. Escape cancels.":uiText("webobsidian.select-a-formatted-source-first-8dac14"));},false);
const textIds=['get-plain-text','smart-symbols','insert-blank-lines','remove-blank-lines','split-lines','merge-lines','dedupe-lines','add-wrap','number-lines','remove-whitespace-trim','remove-whitespace-compress','remove-whitespace-all','list-to-table','table-to-list','extract-between'];
const textLabels=['Get plain text','Full / half width','Insert blank lines','Remove blank lines','Split lines','Merge lines','Deduplicate lines','Prefix / suffix','Number lines','Trim line ends','Compress spaces','Remove whitespace','List to table','Table to list','Extract between'];
for(let i=0;i<textIds.length;i++){const id=textIds[i];add(id,textLabels[i],'type',async c=>{const input=c.doc.sliceString(c.selection.main.from,c.selection.main.to);const fields:DialogField[]=id==='add-wrap'?[{key:'prefix',get label() {return uiText("webobsidian.prefix-90eceb");},value:''},{key:'suffix',get label() {return uiText("webobsidian.suffix-885db9");},value:''}]:id==='number-lines'?[{key:'start',get label() {return uiText("webobsidian.start-952f37");},value:'1'},{key:'step',get label() {return uiText("webobsidian.step-dc416e");},value:'1'},{key:'sep',get label() {return uiText("webobsidian.separator-b4b289");},value:'. '}]:id==='extract-between'?[{key:'start',get label() {return uiText("webobsidian.start-string-988405");},value:'['},{key:'end',get label() {return uiText("webobsidian.end-string-0a6e9b");},value:']'}]:id==='merge-lines'?[{key:'sep',get label() {return uiText("webobsidian.separator-b4b289");},value:' '}]:[];
const params=fields.length?await services.prompt(textLabels[i],fields,input.length<100000?p=>transformText(id,input,p).output:undefined,c):{};if(!params||!isContextCurrent(c))return {status:'cancelled'};const result=input.length>100000&&typeof Worker!=='undefined'?await new Promise<ReturnType<typeof transformText>>((resolve,reject)=>{const worker=new Worker(new URL('./textTools.worker.ts',import.meta.url),{type:'module'});const timer=setTimeout(()=>{worker.terminate();reject(Error(uiText("webobsidian.text-operation-timed-out-47384c")));},10000);worker.onmessage=e=>{clearTimeout(timer);worker.terminate();resolve(e.data);};worker.onerror=()=>{clearTimeout(timer);worker.terminate();reject(Error(uiText("webobsidian.text-operation-failed-748567")));};worker.postMessage({id,input,params});}):transformText(id,input,params);if(!isContextCurrent(c))return {status:'cancelled'};if(id==='get-plain-text'){try{await navigator.clipboard.writeText(result.output);}catch{await services.prompt(uiText("webobsidian.plain-text-copy-manually-55027b"),[{key:'text',get label() {return uiText("webobsidian.plain-text-9580fc");},value:result.output}]);}}else replaceSelection(c,result.output);for(const w of result.warnings)services.notify(w);
},id!=='get-plain-text','explicit');}
for(const [id,label] of [['fullscreen-focus','Focus editor'],['workplace-fullscreen-focus','Fullscreen workspace']])add(id,label,'maximize',async()=>{document.body.classList.toggle(id);if(id==='workplace-fullscreen-focus')try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{services.notify(uiText("webobsidian.browser-fullscreen-unavailable-workspace-focus-e-583683"));}},false);
export function registerTemplate(id:string,label:string,prefix:string,suffix:string){const found=commands.findIndex(x=>x.id===id);if(found>=0)commands.splice(found,1);add(id,label,'type',c=>{c.view.dispatch(c.view.state.changeByRange(r=>({changes:{from:r.from,to:r.to,insert:prefix+c.doc.sliceString(r.from,r.to)+suffix},range:EditorSelection.range(r.from+prefix.length,r.to+prefix.length)})),{annotations:isolateHistory.of('full'),userEvent:'input.toolbar'});},true,'inline',false);}



for(const id of ['show-toolbar','hide-toolbar','toggle-toolbar','toggle-top','toggle-following','toggle-fixed'])add(id,id.replaceAll('-',' '),'menu',()=>{window.dispatchEvent(new CustomEvent('toolbar-layout-action',{detail:id}));},false);
if(typeof document!=='undefined')document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement)document.body.classList.remove('workplace-fullscreen-focus');});
