import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveExternalEmbed as browserResolve} from '../src/lib/embeds';
import {resolveExternalEmbed as serverResolve} from '../../server/src/services/embeds';

for(const [name,resolve] of [['browser',browserResolve],['server',serverResolve]] as const){
 test(`${name}: YouTube privacy embeds keep their validated privacy origin`,()=>{
  assert.equal(resolve('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1')?.src,'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  for(const url of ['https://youtube-nocookie.com.evil.invalid/embed/dQw4w9WgXcQ','https://youtube-nocookie.com/not-an-embed/dQw4w9WgXcQ','https://youtube-nocookie.com/embed/not-an-id','https://user:password@youtube-nocookie.com/embed/dQw4w9WgXcQ'])assert.equal(resolve(url),null,url);
 });
}
