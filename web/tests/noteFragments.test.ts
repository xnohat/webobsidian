import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as context from '../../server/src/services/markdownContext';
import {renderNoteEmbed} from '../src/lib/markdown';

test('block embeds preserve native list item, task, quote and callout structure',async()=>{
 const content='- [x] Task **bold** ^task\n\n> [!warning] Title\n> Callout body ^callout\n\n> Quote body ^quote';
 const opts={rawUrl:(p:string)=>p,resolveEmbed:async()=>({path:'Target.md',content})};
 const task=await renderNoteEmbed('Target#^task',opts);assert.match(task!.html,/<li[^>]*data-task="x"/);assert.match(task!.html,/<input[^>]*checked/);
 const callout=await renderNoteEmbed('Target#^callout',opts);assert.match(callout!.html,/data-callout="warning"/);assert.match(callout!.html,/Callout body/);
 const quote=await renderNoteEmbed('Target#^quote',opts);assert.match(quote!.html,/<blockquote>/);assert.doesNotMatch(quote!.html,/Task|Callout/);
});

test('note fragment ranges point into the original source without matching literals or comments',()=>{
 const range=(context as any).noteFragmentRange;assert.equal(typeof range,'function');
 const source='---\ntitle: Section\n---\n\n%%\n## Section\nIgnored ^block\n%%\n\n```text\n## Section\nIgnored ^block\n```\n\n## Parent\n\n### **Section**\n\n- [x] Selected ^block\n\n## Other';
 const section=range(source,'Parent#Section');assert.equal(source.slice(section.from,section.from+15),'### **Section**');
 const block=range(source,'^block');assert.equal(source.slice(block.from,block.to),'- [x] Selected ^block');
 assert.equal(range(source,'^missing'),null);assert.equal(range(source,'Missing'),null);
});
