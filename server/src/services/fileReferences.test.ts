import {describe,it,expect} from 'vitest';
import {parseFileReferences,resolveReference} from './fileReferences.js';
describe('file reference identity',()=>{
 it('resolves only fragment-only links to an existing source identity',()=>{
  const files=['Тесты/Polygon.md','Target.md'];
  expect(resolveReference('#^quote','Тесты/Polygon.md',files,'wiki')).toBe('Тесты/Polygon.md');
  expect(resolveReference('#11. Heading','Тесты/Polygon.md',files,'markdown')).toBe('Тесты/Polygon.md');
  expect(resolveReference('#^quote','Missing.md',files,'wiki')).toBeNull();
  expect(resolveReference('','Тесты/Polygon.md',files,'wiki')).toBeNull();
 });
 it('resolves encoded punctuation once and leaves encoded hash in filename',()=>{const refs=parseFileReferences('![](Media/shot%20%231%20%28a%29.png)');expect(refs).toHaveLength(1);expect(resolveReference(refs[0].target,'note.md',['Media/shot #1 (a).png'])).toBe('Media/shot #1 (a).png');});
 it('ignores code and keeps exact target positions',()=>{const text='`[[ignored]]`\n```\n[x](ignored.md)\n```\n[[target#H|Alias]] ![x](<a%20b.png>)';const refs=parseFileReferences(text);expect(refs.map(r=>text.slice(r.from,r.to))).toEqual(['target#H','a%20b.png']);});
 it('prefers source-local identities for duplicate basenames',()=>{expect(resolveReference('target','b/source.md',['a/target.md','b/target.md'])).toBe('b/target.md');});
 it('recognizes canvas file nodes',()=>{expect(parseFileReferences('{"nodes":[{"file":"Media/a.png"}]}',true)[0].target).toBe('Media/a.png');});
});

it('tracks literal percent wiki and HTML image identities',()=>{const paths=['image%.png','image%20.png','image .png'];expect(resolveReference('image%.png','x.md',paths,'wiki')).toBe('image%.png');expect(resolveReference('image%20.png','x.md',paths,'wiki')).toBe('image%20.png');expect(parseFileReferences('<img src="image%20.png">')[0].target).toBe('image%20.png');});
