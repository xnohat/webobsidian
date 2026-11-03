import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EditorState, EditorSelection} from '@codemirror/state';
import {captureContext, executeCommand, commands,setToolbarServices,isContextCurrent} from '../src/lib/toolbar/registry';
import {setActiveEditor} from '../src/lib/activeEditor';
import {useStore} from '../src/lib/store';
import {getVaultPreferences,defaultVaultPreferences} from '../src/lib/vaultPreferences';
function editor(text:string,from=0,to=text.length,readonly=false) {
 const v={state:EditorState.create({doc:text,selection:EditorSelection.range(from,to),extensions:[EditorState.readOnly.of(readonly)]}),destroyed:false,focus(){},dispatch(tr: Parameters<EditorState['update']>[0]){this.state=this.state.update(tr).state;}};
 return v as unknown as import('@codemirror/view').EditorView;
}
test('registry rejects stale contexts and readonly writes',async()=>{
 const v=editor('hello');const c=captureContext(v);v.dispatch({changes:{from:0,insert:'x'}});
 assert.equal((await executeCommand('editing-toolbar:toggle-bold',c)).status,'cancelled');
 const r=editor('hello',0,5,true);assert.equal((await executeCommand('editing-toolbar:toggle-bold',captureContext(r))).status,'unavailable');assert.equal(r.state.doc.toString(),'hello');
});
test('pane focus cancels old contexts but allows fresh commands after returning',async()=>{
 const main=editor('text');const split=editor('code',0,4,true);setActiveEditor(main);const old=captureContext(main);
 setActiveEditor(split);assert.equal(isContextCurrent(old),false);setActiveEditor(main);
 assert.equal(isContextCurrent(old),false);const fresh=captureContext(main);assert.equal(isContextCurrent(fresh),true);
 assert.equal((await executeCommand('underline',fresh)).status,'applied');assert.equal(main.state.doc.toString(),'<u>text</u>');setActiveEditor(null);
});

test('headings replace markers and exclude unselected following line',async()=>{
 const v=editor('### title\nsecond',0,10);await executeCommand('editing-toolbar:header2-text',captureContext(v));assert.equal(v.state.doc.toString(),'## title\nsecond');
});
test('list conversions preserve indentation and text',async()=>{
 const v=editor('  - [x] first\n  - second');await executeCommand('editing-toolbar:toggle-numbered-list',captureContext(v));assert.equal(v.state.doc.toString(),'  1. first\n  2. second');
});
test('HTML toggles preserve selection content',async()=>{const v=editor('text');await executeCommand('editing-toolbar:underline',captureContext(v));assert.equal(v.state.doc.toString(),'<u>text</u>');});
test('all 64 standard inventory commands registered',()=>{assert.ok(commands.length>=64);assert.equal(new Set(commands.map(x=>x.id)).size,commands.length);});
test('block changes preserve inner selected text',async()=>{const v=editor('hello',1,4);await executeCommand('header2-text',captureContext(v));assert.equal(v.state.sliceDoc(v.state.selection.main.from,v.state.selection.main.to),'ell');});
test('HTML toggle unwraps its own insertion and superscript replaces subscript',async()=>{const v=editor('text');await executeCommand('underline',captureContext(v));await executeCommand('underline',captureContext(v));assert.equal(v.state.doc.toString(),'text');const w=editor('<sub>text</sub>',5,9);await executeCommand('superscript',captureContext(w));assert.equal(w.state.doc.toString(),'<sup>text</sup>');});
test('partial superscript splits subscript and alignment protects fenced code',async()=>{const v=editor('<sub>long text</sub>',10,14);await executeCommand('superscript',captureContext(v));assert.equal(v.state.doc.toString(),'<sub>long </sub><sup>text</sup>');const w=editor('```md\nexample\n```',6,13);assert.equal((await executeCommand('center',captureContext(w))).status,'unavailable');assert.equal(w.state.doc.toString(),'```md\nexample\n```');});
test('internal toolbar commands honor syntax/path preferences and resolve note extensions before formatting',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({values:{...defaultVaultPreferences,useMarkdownLinks:true,newLinkFormat:'relative'},sources:{},warnings:[],vaultPath:'/fixture'});
 try{
  await getVaultPreferences();useStore.setState({activePath:'Notes/Source.md',tree:{name:'',path:'',type:'folder',children:[{name:'Target.md',path:'Deep/Target.md',type:'file'},{name:'Target.md',path:'Else/Target.md',type:'file'}]}});
  setToolbarServices({prompt:async()=>({target:'Deep/Target'})});
  const v=editor('',0,0);await executeCommand('editor:insert-wikilink',captureContext(v));assert.equal(v.state.doc.toString(),'[Target](../Deep/Target.md)');
  const e=editor('',0,0);await executeCommand('editor:insert-embed',captureContext(e));assert.equal(e.state.doc.toString(),'![](../Deep/Target.md)');
  const stale=editor('',0,0);setToolbarServices({prompt:async()=>{useStore.setState({activePath:'Other.md'});return {target:'Deep/Target'};}});assert.equal((await executeCommand('editor:insert-wikilink',captureContext(stale))).status,'cancelled');assert.equal(stale.state.doc.toString(),'');
 }finally{globalThis.fetch=original;setToolbarServices({prompt:async()=>null});}
});
