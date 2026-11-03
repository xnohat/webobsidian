import { EditorState, EditorSelection, Prec, countColumn, type StateCommand } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap, type DecorationSet } from '@codemirror/view';
import { indentLess, indentMore, insertTab } from '@codemirror/commands';
import { codeFolding, foldable, foldEffect, unfoldEffect, forceParsing, foldKeymap, foldNodeProp, foldService, foldedRanges, indentUnit, syntaxTree } from '@codemirror/language';

// Obsidian uses heading/indent services rather than generic Markdown node folds.
export const outlineMarkdown = {props:[foldNodeProp.add(()=>()=>null)]};

class FoldIndicator extends WidgetType {
  constructor(readonly collapsed:boolean){super();}
  eq(other:FoldIndicator){return this.collapsed===other.collapsed;}
  toDOM(view:EditorView){
    const wrap=document.createElement('span');wrap.className='cm-fold-indicator'+(this.collapsed?' is-collapsed':'');
    wrap.append('\u200b');
    const button=document.createElement('button');button.className='cm-outline-collapse';
    button.type='button';button.setAttribute('aria-label',this.collapsed?'Expand section':'Collapse section');
    button.setAttribute('aria-expanded',String(!this.collapsed));button.title=this.collapsed?'Expand section':'Collapse section';
    button.textContent=this.collapsed?'▸':'▾';wrap.append(button);
    button.addEventListener('mousedown',e=>e.preventDefault());
    button.addEventListener('click',e=>{
      e.preventDefault();e.stopPropagation();
      const line=view.state.doc.lineAt(view.posAtDOM(wrap));let current:{from:number;to:number}|undefined;
      foldedRanges(view.state).between(line.from,line.to,(from,to)=>{if(!current)current={from,to};});
      const range=current??foldable(view.state,line.from,line.to);
      if(range)view.dispatch({effects:(current?unfoldEffect:foldEffect).of(range)});
    });return wrap;
  }
  ignoreEvent(){return false;}
}
function indicators(view:EditorView):DecorationSet {
  const ranges=[];
  for(const line of view.viewportLineBlocks){
    let collapsed=false;foldedRanges(view.state).between(line.from,line.to,()=>{collapsed=true;});
    if(collapsed||foldable(view.state,line.from,line.to)){
      const start=line.from+(view.state.doc.lineAt(line.from).text.match(/^[\t ]*/)?.[0].length??0);
      ranges.push(Decoration.widget({widget:new FoldIndicator(collapsed),side:-1}).range(start));
    }
  }return Decoration.set(ranges,true);
}
const inlineFolding=ViewPlugin.fromClass(class {
  decorations:DecorationSet;
  constructor(view:EditorView){this.decorations=indicators(view);}
  update(u:import('@codemirror/view').ViewUpdate){
    if(u.docChanged||u.viewportChanged||foldedRanges(u.startState)!==foldedRanges(u.state)||syntaxTree(u.startState)!==syntaxTree(u.state))this.decorations=indicators(u.view);
  }
},{decorations:p=>p.decorations});

function fingerprint(state:EditorState){
  let hash=2166136261;const text=state.doc.toString();
  for(let n=0;n<text.length;n++)hash=Math.imul(hash^text.charCodeAt(n),16777619);
  return text.length+':'+(hash>>>0).toString(16);
}
/** Browser/vault scoped view state only; Markdown and draft contents are untouched. */
export function persistentFolding(scope:string,path:string){
  if(!scope||!path)return [];
  const key='webobsidian-folds-v1:'+JSON.stringify([scope,path]);
  return ViewPlugin.fromClass(class {
    timer:ReturnType<typeof setTimeout>|undefined;restore:ReturnType<typeof setTimeout>;ready=false;
    constructor(readonly view:EditorView){
      this.restore=setTimeout(()=>this.load(),0);
    }
    load(){
        const {view}=this;
        try{
          const saved=JSON.parse(localStorage.getItem(key)??'null');
          if(saved?.hash!==fingerprint(view.state)||!Array.isArray(saved.folds)){this.ready=true;return;}
          const valid=saved.folds.filter((row:{line:number})=>Number.isInteger(row.line)&&row.line>=1&&row.line<=view.state.doc.lines);
          // Heading folding needs the section after its header as well. Parse
          // the complete saved document before asking for structural ranges.
          const upto=valid.length?view.state.doc.length:0;
          if(!forceParsing(view,upto,50)){this.restore=setTimeout(()=>this.load(),50);return;}
          const effects=[];
          for(const row of valid){
            const line=view.state.doc.line(row.line),range=foldable(view.state,line.from,line.to);
            if(range)effects.push(foldEffect.of(range));
          }
          this.ready=true;
          if(effects.length)view.dispatch({effects});
        }catch{this.ready=true;/* Storage is optional; folding remains usable. */}
    }
    save(){
      clearTimeout(this.timer);
      const folds:{line:number}[]=[];
      foldedRanges(this.view.state).between(0,this.view.state.doc.length,from=>{folds.push({line:this.view.state.doc.lineAt(from).number});});
      try{localStorage.setItem(key,JSON.stringify({hash:fingerprint(this.view.state),folds}));}catch{}
    }
    update(u:import('@codemirror/view').ViewUpdate){
      if(u.docChanged||foldedRanges(u.startState)!==foldedRanges(u.state)){
        this.ready=true;clearTimeout(this.restore);
        clearTimeout(this.timer);this.timer=setTimeout(()=>this.save(),200);
      }
    }
    destroy(){clearTimeout(this.restore);if(this.ready)this.save();}
  });
}

function shiftOutline(target: Parameters<StateCommand>[0], less: boolean): boolean {
  const {state}=target;
  if(state.readOnly)return false;
  let expanded=false;
  const ranges=state.selection.ranges.map(range=>{
    let end=range.to;
    const last=state.doc.lineAt(range.to);
    const lineEnd=!range.empty&&range.to===last.from?range.to-1:last.to;
    foldedRanges(state).between(state.doc.lineAt(range.from).from,lineEnd,(from,to)=>{
      if(state.doc.lineAt(from).from<=lineEnd){end=Math.max(end,to);expanded=true;}
    });
    return EditorSelection.range(range.from,end);
  });
  const command=less?indentLess:indentMore;
  if(!expanded)return command(target);
  const selected=state.update({selection:EditorSelection.create(ranges)}).state;
  return command({state:selected,dispatch:tr=>target.dispatch(state.update({
    changes:tr.changes,selection:state.selection.map(tr.changes),userEvent:'indent',scrollIntoView:true,
  }))});
}
export const outdentOutline: StateCommand = target=>shiftOutline(target,true);

function codeBlockAt(state: EditorState, pos: number) {
  const line=state.doc.lineAt(pos);
  const contentStart=line.from+(line.text.match(/^[\t ]*/)?.[0].length??0);
  for(let node=syntaxTree(state).resolve(contentStart,1);node;node=node.parent!) {
    if(node.name==='FencedCode'||node.name==='CodeBlock')return node;
  }
  return null;
}
const inCode=(state:EditorState,pos:number)=>codeBlockAt(state,pos)!==null;

/** Fold indentation both in prose and code, bounded by the enclosing code block. */
export function indentFold(state: EditorState, start: number, end: number): {from:number;to:number}|null {
  const line=state.doc.lineAt(start);
  const code=codeBlockAt(state,start);
  if(!line.text.trim()||(!code&&/^\s*#{1,6}\s/.test(line.text)))return null;
  let lastLine=state.doc.lines;
  if(code){
    lastLine=state.doc.lineAt(code.to).number;
    if(code.name==='FencedCode'){
      const marks=code.getChildren('CodeMark');
      if(marks.some(mark=>state.doc.lineAt(mark.from).number===line.number))return null;
      const closing=marks.length>1?marks[marks.length-1]:null;
      if(closing)lastLine=state.doc.lineAt(closing.from).number-1;
    }
  }
  const depth=countColumn(line.text.match(/^[\t ]*/)?.[0]??'',state.tabSize);
  let to=end;
  for(let n=line.number+1;n<=lastLine;n++) {
    const child=state.doc.line(n);
    if(!child.text.trim())continue;
    const indent=countColumn(child.text.match(/^[\t ]*/)?.[0]??'',state.tabSize);
    if(indent<=depth)break;
    to=child.to;
  }
  return to>end?{from:end,to}:null;
}

/** A caret inserts a literal tab; list items and selections move by one level. */
export const tabIndent: StateCommand = target => {
  if(target.state.readOnly)return false;
  const list=target.state.selection.ranges.some(range=>{
    const line=target.state.doc.lineAt(range.head);
    return !inCode(target.state,line.from)&&/^[\t ]*(?:[-*+]|\d+[.)])\s/.test(line.text);
  });
  let folded=false;
  for(const range of target.state.selection.ranges)foldedRanges(target.state).between(target.state.doc.lineAt(range.head).from,target.state.doc.lineAt(range.head).to,()=>{folded=true;});
  return list||folded||target.state.selection.ranges.some(r=>!r.empty)?shiftOutline(target,false):insertTab(target);
};

function guides(view: EditorView): DecorationSet {
  const ranges=[];
  const seen=new Set<number>();
  for(const visible of view.visibleRanges) {
    for(let n=view.state.doc.lineAt(visible.from).number;n<=view.state.doc.lines;n++) {
      const line=view.state.doc.line(n);
      if(line.from>visible.to)break;
      if(seen.has(n))continue;seen.add(n);
      // Live Preview already owns guides on lists and indented code. Add the
      // guides inside fenced blocks, where language syntax must remain literal.
      const ws=line.text.match(/^[\t ]+/)?.[0];
      let fenced=false;
      for(let node=syntaxTree(view.state).resolve(line.from,1);node;node=node.parent!)if(node.name==='FencedCode')fenced=true;
      if(ws&&fenced)ranges.push(Decoration.mark({class:'cm-code-indent-guide'}).range(line.from,line.from+ws.length));
    }
  }
  return Decoration.set(ranges,true);
}
const codeGuides=ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView){this.decorations=guides(view);}
  update(update: import('@codemirror/view').ViewUpdate){
    if(update.docChanged||update.viewportChanged||syntaxTree(update.startState)!==syntaxTree(update.state))this.decorations=guides(update.view);
  }
},{decorations:plugin=>plugin.decorations});

export const editorStructure = [
  EditorState.tabSize.of(4),indentUnit.of('\t'),
  Prec.high(foldService.of(indentFold)),
  codeFolding(),inlineFolding,
  Prec.high(keymap.of([{key:'Tab',run:tabIndent,shift:outdentOutline},...foldKeymap])),
  codeGuides,
];
