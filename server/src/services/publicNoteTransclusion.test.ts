import {expect,it} from 'vitest';
import {renderNoteHtml} from './renderhtml.js';

it('SSR renders the same heading transclusion and nested source paths as the browser',async()=>{
 const seen:unknown[]=[],files:unknown[]=[];
 const html=await renderNoteHtml('![[Child#Part]]',(p,from)=>{files.push({p,from});return '/file/'+encodeURIComponent(p)},{
  sourcePath:'Folder/Host.md',
  resolveEmbed:async(target:string,from?:string,kind?:string)=>{seen.push({target,from,kind});return {path:'Other/Child.md',content:'# Child\n\n## Part\n\nPUBLISHED_BODY\n\n![](inside.pdf#page=2)\n\n## Other\n\nUNWANTED_BODY'}},
 } as any);
 expect(html).toContain('PUBLISHED_BODY');expect(html).not.toContain('UNWANTED_BODY');
 expect(html).toContain('class="pdf-embed"');expect(html).toContain('#page=2');
 expect(seen).toEqual([{target:'Child',from:'Folder/Host.md',kind:'wiki'}]);
 expect(files).toEqual([{p:'inside.pdf',from:'Other/Child.md'}]);
});

it('SSR note embeds leave literal code and escaped/commented references untouched',async()=>{
 const targets:string[]=[];
 const html=await renderNoteHtml('`![[Literal]]`\n\n%%![[Hidden]]%%\n\n\\![[Escaped]]\n\n![](Public%20Note.md)',p=>p,{
  sourcePath:'Host.md',resolveEmbed:async(target:string)=>{targets.push(target);return {path:'Public Note.md',content:'VISIBLE_CHILD'}},
 } as any);
 expect(targets).toEqual(['Public%20Note.md']);expect(html).toContain('VISIBLE_CHILD');
});


it('retains invisible block anchors on paragraph, list, table and code bodies',async()=>{
 const html=await renderNoteHtml('Paragraph **bold** ^para\n\n- One\n- Two\n\n^list\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n^table\n\n```text\nCode body\n```\n\n^code',p=>p);
 expect(html).toMatch(/<p[^>]*data-block-id="para"[^>]*>Paragraph <strong>bold<\/strong><\/p>/);
 expect(html).toMatch(/<ul[^>]*data-block-id="list"/);expect(html).toMatch(/<table[^>]*data-block-id="table"/);expect(html).toMatch(/<pre[^>]*data-block-id="code"/);
 expect(html).not.toMatch(/\^(para|list|table|code)/);
});

it('block metadata ignores escaped, inline-code, fenced-code, HTML and comment identifiers',async()=>{
 const html=await renderNoteHtml('Escaped \\^escaped\n\n`Inline ^inline`\n\n```text\nFenced ^fenced\n```\n\n<div>HTML ^html</div>\n\n%%Hidden ^comment%%\n\nValid ^valid',p=>p);
 expect(html.match(/data-block-id="[^"]+"/g)).toEqual(['data-block-id="valid"']);
 expect(html).toContain('^escaped');expect(html).toContain('^inline');expect(html).toContain('^fenced');
});


it('keeps targets on task-list items and callouts after their structural transforms',async()=>{
 const html=await renderNoteHtml('- [x] Task body ^task\n\n> [!note] Title\n> Callout body\n\n^callout',p=>p);
 expect(html).toMatch(/<li[^>]*data-block-id="task"/);expect(html).toMatch(/<div[^>]*data-block-id="callout"/);
 expect(html).toContain('data-task="x"');expect(html).toContain('data-callout="note"');
});


it('does not accept raw HTML block metadata or expose inline callout identifiers',async()=>{
 const html=await renderNoteHtml('<div data-block-id="target">Wrong</div>\n\nCorrect ^target\n\n> [!note] Title\n> Callout body ^callout',p=>p);
 expect(html.match(/data-block-id="target"/g)).toHaveLength(1);expect(html).toMatch(/<p data-block-id="target">Correct<\/p>/);
 expect(html).not.toContain('^callout');expect(html).toMatch(/<div[^>]*data-block-id="callout"/);
});


it('preserves CRLF block targets, ordered lists and quotes without leaking between renders',async()=>{
 const html=await renderNoteHtml('1. First ^item\r\n2. Second\r\n\r\n^ordered\r\n\r\n> Quoted body ^quote\r\n\r\n## Heading\r\n\r\n^heading',p=>p);
 expect(html).toMatch(/<ol[^>]*data-block-id="ordered"/);expect(html).toMatch(/<li[^>]*data-block-id="item"/);expect(html).toMatch(/<blockquote[^>]*data-block-id="quote"/);expect(html).toMatch(/<h2[^>]*data-block-id="heading"/);
 expect(await renderNoteHtml('Normal paragraph',p=>p)).not.toContain('data-block-id');
});


it('preserves inert inline HTML styles and legacy font color from native notes',async()=>{
 const html=await renderNoteHtml('<span style="color: #e63946; font-weight: bold;">Red</span>\n\n<span style="color: #2a9d8f; background-color: #264653; padding: 2px 6px; border-radius: 4px;">Green</span>\n\n<font color="royalblue">Blue</font>\n\n<mark style="background: #ffbe0b; color: #000;">Marked</mark>',p=>p);
 expect(html).toContain('font-weight: bold');expect(html).toContain('padding: 2px 6px');expect(html).toContain('border-radius: 4px');expect(html).toContain('royalblue');expect(html).toContain('#ffbe0b');expect(html).toContain('#e63946');
});

it('keeps safe declarations without retaining layout injection, resource URLs or handlers',async()=>{
 const html=await renderNoteHtml('<span style="color: red; position: fixed; z-index: 99999; background: url(https://invalid.example/x); padding: 99999px; border-radius: expression(alert(1))" onclick="alert(1)">Safe</span>\n\n<font color="url(https://invalid.example/x)" onmouseover="alert(1)">Bad</font>',p=>p);
 expect(html).toContain('color: red');expect(html).not.toMatch(/position:|z-index:|url\(|expression\(|99999|onclick|onmouseover/);
});

it('does not turn CSS escapes, variables, comments or important overrides into trusted inline styles',async()=>{
 const html=await renderNoteHtml('<span style="color:var(--private); background: u\\72l(https://invalid.example/x); font-weight:bold !important; padding:calc(1px + 2px); border-radius:4px/**/">Untrusted</span>\n\n<span style="color:rgb(42, 157, 143);background:rgba(10,20,30,.5);font-style:italic;padding:0 .25em;border-radius:0 4px">Safe</span>',p=>p);
 expect(html).not.toMatch(/var\(|private|invalid.example|!important|calc\(|\/\*\*\//);
 expect(html).toContain('color: rgb(42, 157, 143)');expect(html).toContain('background-color: rgba(10,20,30,.5)');expect(html).toContain('font-style: italic');expect(html).toContain('border-radius: 0 4px');
});
