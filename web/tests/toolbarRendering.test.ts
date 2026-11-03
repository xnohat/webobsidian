import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderMarkdown} from '../src/lib/markdown';
test('toolbar HTML alpha colors and alignment survive shared sanitizer',async()=>{
 const html=await renderMarkdown('<div align="center">\n\n**Bold** <sup>2</sup> <sub>x</sub> <span style="color:#12345678">alpha</span>\n\n</div>',{rawUrl:p=>p});
 assert.match(html,/align="center"/); assert.match(html,/<strong>Bold<\/strong>/);assert.match(html,/<sup>2<\/sup>/);assert.match(html,/color:#12345678/);
 const hostile=await renderMarkdown('<div align="evil" onclick="alert(1)"><span style="background:url(x)">safe</span></div>',{rawUrl:p=>p});assert.doesNotMatch(hostile,/onclick|background:url|align="evil"/);
});
