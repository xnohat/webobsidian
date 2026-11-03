import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { foldable, foldEffect, foldedRanges } from '@codemirror/language';
import { indentFold, editorStructure, tabIndent, outdentOutline, outlineMarkdown } from '../src/lib/editorStructure';

const state = (doc: string, anchor = 0) => EditorState.create({doc, selection:{anchor}, extensions:[markdown({extensions:[outlineMarkdown]}), editorStructure]});
test('fold controls match measured original Obsidian for spaces, tabs and ABAP',()=>{
  const original=JSON.parse(readFileSync(new URL('../../tests/fixtures/rendering/obsidian-folding.json',import.meta.url),'utf8'));
  for(const sample of original.observations){
    const s=state(sample.text),actual=[];
    for(let n=1;n<=s.doc.lines;n++){const line=s.doc.line(n);if(foldable(s,line.from,line.to))actual.push({line:n,offset:line.text.match(/^[\t ]*/)![0].length});}
    assert.deepEqual(actual,sample.indicators.map((row:{line:number;offset:number})=>({line:row.line,offset:row.offset})),sample.name);
    assert.equal(s.doc.toString(),sample.text,'folding does not normalize pasted whitespace');
  }
});
test('indent folding stops at siblings and keeps intervening blank lines', () => {
  const s=state('parent\n\tchild\n\n\t\tgrandchild\nsibling');
  assert.deepEqual(indentFold(s,0,s.doc.line(1).to),{from:6,to:s.doc.line(4).to});
  assert.deepEqual(indentFold(s,s.doc.line(2).from,s.doc.line(2).to),{from:s.doc.line(2).to,to:s.doc.line(4).to});
  assert.equal(indentFold(s,s.doc.line(5).from,s.doc.line(5).to),null);
});
test('changing indent on a folded parent moves its hidden descendants and preserves the fold',()=>{
  let s=state('- parent\n\t- child\nnext');
  s=s.update({effects:foldEffect.of({from:8,to:s.doc.line(2).to})}).state;
  const target={get state(){return s;},dispatch:(tr:ReturnType<EditorState['update']>)=>{s=tr.state;}};
  tabIndent(target);assert.equal(s.doc.toString(),'\t- parent\n\t\t- child\nnext');
  assert.equal(foldedRanges(s).size,1);
  outdentOutline(target);assert.equal(s.doc.toString(),'- parent\n\t- child\nnext');
  assert.equal(foldedRanges(s).size,1);
});
test('tabs use four columns and spaces may form nested text too',()=>{
  const s=state('parent\n    child\n\t\tgrandchild\n    sibling\nnext');
  assert.equal(s.tabSize,4);
  assert.equal(indentFold(s,s.doc.line(2).from,s.doc.line(2).to)?.to,s.doc.line(3).to);
});
test('Obsidian folds headings and indentation without extra whole-code or paragraph folds',()=>{
  const s=state('# Title\nbody\n## Child\nchild body\n# Next\n```abap\nparent\n\tchild\n```');
  assert.equal(foldable(s,0,s.doc.line(1).to)?.to,s.doc.line(4).to);
  assert.equal(foldable(s,s.doc.line(6).from,s.doc.line(6).to),null);
  const plain=state('first line\nsecond line');assert.equal(foldable(plain,0,plain.doc.line(1).to),null);
  assert.deepEqual(indentFold(s,s.doc.line(7).from,s.doc.line(7).to),{from:s.doc.line(7).to,to:s.doc.line(8).to});
});
test('ABAP call continuation folds independently of the next call and the enclosing code fence',()=>{
  const s=state('```abap\nZCL_3409_BADI_PRP-GET_INSURED_INFO\n\tzcl_3409_helper=>convert_date( EXPORTING iv_date = start_dt\n\t\tIMPORTING ev_date = begin ).\n\n\tzcl_3409_helper=>convert_date( EXPORTING iv_date = finish_dt\n\t\tIMPORTING ev_date = end ).\n```\n\toutside');
  assert.deepEqual(indentFold(s,s.doc.line(3).from,s.doc.line(3).to),{from:s.doc.line(3).to,to:s.doc.line(4).to});
  assert.deepEqual(indentFold(s,s.doc.line(6).from,s.doc.line(6).to),{from:s.doc.line(6).to,to:s.doc.line(7).to});
  assert.deepEqual(indentFold(s,s.doc.line(2).from,s.doc.line(2).to),{from:s.doc.line(2).to,to:s.doc.line(7).to});
  assert.equal(indentFold(s,s.doc.line(8).from,s.doc.line(8).to),null);
});
test('nested code folding treats heading/list-looking text literally and cannot consume an indented closing fence',()=>{
  const s=state('  ~~~text\n# literal heading\n\tchild\n- literal list\n\tchild\n  ~~~\n\toutside');
  assert.deepEqual(indentFold(s,s.doc.line(2).from,s.doc.line(2).to),{from:s.doc.line(2).to,to:s.doc.line(3).to});
  assert.deepEqual(indentFold(s,s.doc.line(4).from,s.doc.line(4).to),{from:s.doc.line(4).to,to:s.doc.line(5).to});
});
test('Tab inserts a tab at a text caret and indents a list item; readonly text cannot change',()=>{
  let s=state('ab',1);
  const target=()=>({state:s,dispatch:(tr:ReturnType<EditorState['update']>)=>{s=tr.state;}});
  tabIndent(target());assert.equal(s.doc.toString(),'a\tb');
  s=state('- parent\n- child',16);
  tabIndent(target());assert.equal(s.doc.toString(),'- parent\n\t- child');
  s=EditorState.create({doc:'text',extensions:[editorStructure,EditorState.readOnly.of(true)]});
  assert.equal(tabIndent(target()),false);assert.equal(s.doc.toString(),'text');
});
