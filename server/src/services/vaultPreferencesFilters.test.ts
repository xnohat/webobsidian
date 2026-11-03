import { describe, expect, it, vi } from 'vitest';
import { isUserIgnored, filterGraph } from './vaultPreferencesFilters.js';
const {filters}=vi.hoisted(()=>({filters:['Archive']}));
vi.mock('./vaultPreferences.js',()=>({getVaultPreferences:async()=>({values:{userIgnoreFilters:filters}})}));
vi.mock('./settings.js',()=>({getSettings:async()=>({search:{fuzzy:0,prefix:true}})}));

describe('Obsidian 1.14.5 exclusion fixtures',()=>{
 it('uses literal prefix or case insensitive slash-delimited regex, not globs',()=>{
  expect(isUserIgnored('Archives.md',[' archive '])).toBe(true);
  expect(isUserIgnored('Other/Archive.md',['Archive'])).toBe(false);
  expect(isUserIgnored('Notes/Draft.md',['/draft\\.md$/'])).toBe(true);
  expect(isUserIgnored('Notes/a.md',['*.md','/[/'])).toBe(false);
 });
 it('removes excluded graph nodes and connected edges without changing its source',()=>{
  const graph={nodes:[{id:'Archive/a.md',label:'a',kind:'note' as const,tags:[]},{id:'b.md',label:'b',kind:'note' as const,tags:[]}],edges:[{source:'b.md',target:'Archive/a.md'}]};
  expect(filterGraph(graph,['Archive'])).toEqual({nodes:[graph.nodes[1]],edges:[]});
  expect(graph.nodes).toHaveLength(2);
 });
 it('filters search before applying limit and retains the full index',async()=>{
  const {QmdEngine}=await import('./search.js');
  const {parseNote}=await import('./markdown.js');
  const qmd=new QmdEngine();
  qmd.applyParsed('Archive/first.md',parseNote('Archive/first.md','# quartz quartz quartz\nquartz'));
  qmd.applyParsed('second.md',parseNote('second.md','# quartz'));
  expect((await qmd.search('quartz',1,filters)).map(h=>h.path)).toEqual(['second.md']);
  expect(qmd.documentCount).toBe(2);
 });
});
