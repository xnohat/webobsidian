import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderMarkdown} from '../src/lib/markdown';
import {markdownImages} from '../../server/src/services/markdownContext';

test('Markdown definitions use the first visible definition and normalized identifiers',()=>{
 assert.equal(markdownImages('![a][ID]\n\n[id]: one.png\n[id]: two.png')[0]?.url,'one.png');
 assert.equal(markdownImages('![a][ a   B ]\n\n[A B]: one.png')[0]?.url,'one.png');
});
test('commented Markdown definitions never activate embeds or authorize files',()=>{
 assert.deepEqual(markdownImages('%%\n\n[id]: private.png\n\n%%\n\n![a][id]'),[]);
 assert.equal(markdownImages('%%\n\n[id]: private.png\n\n%%\n\n![a][id]\n\n[id]: visible.png')[0]?.url,'visible.png');
});

const opts={sourcePath:'Notes/Host.md',rawUrl:(p:string,from?:string)=>'/file?'+new URLSearchParams({path:p,...(from?{from}:{})})};

test('Markdown PDF uses a viewer link and keeps decoded filename separate from its fragment',async()=>{
 const html=await renderMarkdown('![Report](files/report%20%231.pdf#page=2&height=300 "caption")',opts);
 assert.match(html,/class="pdf-embed"/);assert.match(html,/data-link-kind="markdown"/);
 const href=html.match(/\shref="([^"]+)"/)![1].replace(/&#x26;|&amp;/g,'&');const url=new URL(href,'https://fixture');
 assert.equal(url.searchParams.get('path'),'files/report #1.pdf');assert.equal(url.hash,'#page=2&height=300');
 assert.doesNotMatch(html,/<img/);
});
test('Markdown audio and video keep dimensions, controls, title parsing and media fragments',async()=>{
 const html=await renderMarkdown('![clip|320x180](clip.mp4#t=1,3 "Video")\n\n![](sound%20one.mp3)',opts);
 assert.match(html,/<video[^>]+width="320" height="180"/);assert.match(html,/#t=1,3/);
 assert.match(html,/<audio[^>]+controlslist="nodownload"/);assert.doesNotMatch(html,/<img/);
});
test('Markdown note transclusion resolves with Markdown semantics and preserves literal percent and hash filenames',async()=>{
 const seen:unknown[]=[];
 const html=await renderMarkdown('![Note](child%2520%23one.md#Part)',{...opts,resolveEmbed:async(target,from,kind)=>{
  seen.push({target,from,kind});return {path:'Notes/child%20#one.md',content:'# Child\n\n## Part\n\nSelected body\n\n## Other\n\nUnwanted body'};
 }});
 assert.deepEqual(seen,[{target:'child%2520%23one.md',from:'Notes/Host.md',kind:'markdown'}]);
 assert.match(html,/Selected body/);assert.doesNotMatch(html,/Unwanted body|<img/);
 assert.match(html,/data-embed-kind="markdown"/);assert.match(html,/data-embed-target="\/Notes\/child%2520%23one.md#Part"/);
});
test('Markdown reference embeds and balanced/angle destinations use the same type dispatch',async()=>{
 const html=await renderMarkdown('![pdf][doc]\n\n![voice]\n\n![](<a (b).pdf>)\n\n[doc]: files/report.pdf#page=2\n[voice]: voice.wav',opts);
 assert.equal((html.match(/class="pdf-embed"/g)??[]).length,2);assert.match(html,/<audio/);
 assert.doesNotMatch(html,/<img|\[doc\]:/);
});
test('Markdown image paths preserve spaces and parentheses without touching code or escaped embeds',async()=>{
 const html=await renderMarkdown('![image|120](<my image (1).png>)\n\n`![](code.pdf)`\n\n\\![](escaped.pdf)',opts);
 assert.match(html,/<img[^>]+width="120"/);assert.match(html,/my\+image\+%281%29.png/);
 assert.doesNotMatch(html,/class="pdf-embed"/);
});
test('Markdown Canvas and generic files are cards, not images or note-byte transclusions',async()=>{
 const html=await renderMarkdown('![](Board.canvas)\n\n![](config.yaml)',{...opts,resolveEmbed:async()=>{throw Error('must not read file bytes as Markdown')}});
 assert.match(html,/class="canvas-embed"/);assert.match(html,/file-embed mod-generic/);assert.doesNotMatch(html,/<img/);
});
